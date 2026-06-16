#!/usr/bin/env python3
"""
Retail GRR diagnostic — is the "Retail starts high then drops" trend real, noise,
or an age-mix artifact?

Mirrors builder/src/lib/grrIndustrySql.js exactly:
  - source: revenue.int_customer_annual_mrr  (Month = annual cohort anchor)
  - labels: v7_classification.account_labels, deduped highest-confidence per company_account
  - GRR = (StartMRR - Cancellations - Downgrades) / StartMRR   (canc/down are +magnitudes)

Outputs JSON to scripts/audit/retail-grr-diagnostic.json and prints a readable summary.
Read-only.
"""
import json, statistics
from pathlib import Path
from google.cloud import bigquery

PROJECT = "project-for-method-dw"
END = "2026-05-01"          # right edge of the chart
START = "2025-06-01"        # left edge of the chart (12 monthly cohort points)
c = bigquery.Client(project=PROJECT)

LABELS = """
labels AS (
  SELECT company_account, l1, confidence, classified_at
  FROM `project-for-method-dw.v7_classification.account_labels`
  WHERE company_account IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY company_account
                             ORDER BY confidence DESC, classified_at DESC) = 1
)"""

def q(sql):
    return [dict(r) for r in c.query(sql).result()]

out = {}

# ---- 1. Trend: per L1 per cohort month — GRR, N customers, start $ -----------
trend = q(f"""
WITH {LABELS}
SELECT FORMAT_DATE('%Y-%m', a.Month) AS month,
       COALESCE(lb.l1,'Unclassified') AS l1,
       COUNT(DISTINCT IF(a.StartMRR>0, a.Company, NULL)) AS customers,
       ROUND(SUM(a.StartMRR),0) AS start_mrr,
       ROUND(SUM(a.Cancellations),0) AS churn_mrr,
       ROUND(SUM(a.Downgrades),0) AS downgrade_mrr,
       ROUND(SAFE_DIVIDE(SUM(a.StartMRR)-SUM(a.Cancellations)-SUM(a.Downgrades),
                         SUM(a.StartMRR))*100, 2) AS grr_pct
FROM `{PROJECT}.revenue.int_customer_annual_mrr` a
LEFT JOIN labels lb ON lb.company_account = a.Company
WHERE a.Month BETWEEN DATE '{START}' AND DATE '{END}'
GROUP BY month, l1
HAVING SUM(a.StartMRR) > 0
ORDER BY month, start_mrr DESC
""")
out["trend"] = trend

# ---- 2. Per-L1 significance summary: mean/std/range of GRR, median N & $ ------
by_l1 = {}
for r in trend:
    by_l1.setdefault(r["l1"], []).append(r)
summary = []
for l1, rows in by_l1.items():
    g = [x["grr_pct"] for x in rows]
    n = [x["customers"] for x in rows]
    s = [x["start_mrr"] for x in rows]
    summary.append({
        "l1": l1,
        "months": len(rows),
        "grr_mean": round(statistics.mean(g), 2),
        "grr_std": round(statistics.pstdev(g), 2),
        "grr_min": min(g), "grr_max": max(g), "grr_range": round(max(g)-min(g), 2),
        "median_customers": int(statistics.median(n)),
        "median_start_mrr": int(statistics.median(s)),
        # 1 percentage point of GRR for this segment, in dollars (median month)
        "one_pp_dollars": int(float(statistics.median(s)) * 0.01),
    })
summary.sort(key=lambda x: -x["median_start_mrr"])
out["l1_summary"] = summary

# ---- 3. Concentration / jackknife: at Retail's peak and trough month, how much
#         does removing the single largest leaker move GRR? -----------------------
retail_rows = sorted(by_l1.get("Retail & Consumer", []), key=lambda x: x["grr_pct"])
jack = {}
if retail_rows:
    trough_m = retail_rows[0]["month"]
    peak_m   = retail_rows[-1]["month"]
    for tag, m in [("peak", peak_m), ("trough", trough_m)]:
        accts = q(f"""
        WITH {LABELS}
        SELECT a.Company,
               ROUND(SUM(a.StartMRR),0) AS start_mrr,
               ROUND(SUM(a.Cancellations),0) AS churn,
               ROUND(SUM(a.Downgrades),0) AS downgrade,
               ROUND(SUM(a.Cancellations)+SUM(a.Downgrades),0) AS lost
        FROM `{PROJECT}.revenue.int_customer_annual_mrr` a
        JOIN labels lb ON lb.company_account = a.Company AND lb.l1 = 'Retail & Consumer'
        WHERE a.Month = DATE '{m}-01'
        GROUP BY a.Company HAVING SUM(a.StartMRR) > 0
        ORDER BY lost DESC LIMIT 15
        """)
        tot = q(f"""
        WITH {LABELS}
        SELECT ROUND(SUM(a.StartMRR),0) s, ROUND(SUM(a.Cancellations),0) ch,
               ROUND(SUM(a.Downgrades),0) dn,
               COUNT(DISTINCT a.Company) n
        FROM `{PROJECT}.revenue.int_customer_annual_mrr` a
        JOIN labels lb ON lb.company_account = a.Company AND lb.l1 = 'Retail & Consumer'
        WHERE a.Month = DATE '{m}-01' AND a.StartMRR > 0
        """)[0]
        grr_all = (tot["s"]-tot["ch"]-tot["dn"])/tot["s"]*100
        top = accts[0] if accts else None
        if top:
            s2 = tot["s"]-top["start_mrr"]
            grr_ex = (s2-(tot["ch"]-top["churn"])-(tot["dn"]-top["downgrade"]))/s2*100 if s2>0 else None
        jack[tag] = {
            "month": m, "customers": tot["n"], "start_mrr": tot["s"],
            "grr_pct": round(grr_all,2),
            "grr_excl_top_leaker": round(grr_ex,2) if top and grr_ex is not None else None,
            "pp_swing_from_one_account": round(grr_ex-grr_all,2) if top and grr_ex is not None else None,
            "top_leakers": accts[:8],
        }
out["jackknife"] = jack

# ---- 4. Age decomposition: is "Retail > Manufacturing" really an age-mix gap? ---
# Tenure = months between first active month (int_customer_mrr) and cohort month.
FIRSTPAY = f"""
firstpay AS (
  SELECT EntityRecordID, MIN(Month) AS first_month
  FROM `{PROJECT}.revenue.int_customer_mrr`
  WHERE StartMRR > 0 OR NewMRR > 0
  GROUP BY EntityRecordID
)"""

def age_cut(month):
    return q(f"""
    WITH {LABELS},
    {FIRSTPAY}
    SELECT COALESCE(lb.l1,'Unclassified') AS l1,
      CASE
        WHEN DATE_DIFF(a.Month, fp.first_month, MONTH) < 12 THEN '1_first_year'
        WHEN DATE_DIFF(a.Month, fp.first_month, MONTH) < 24 THEN '2_year2'
        WHEN DATE_DIFF(a.Month, fp.first_month, MONTH) < 36 THEN '3_year3'
        ELSE '4_year4plus' END AS age_band,
      COUNT(DISTINCT a.Company) AS customers,
      ROUND(SUM(a.StartMRR),0) AS start_mrr,
      ROUND(SUM(a.Cancellations),0) AS churn,
      ROUND(SUM(a.Downgrades),0) AS downgrade,
      ROUND(SAFE_DIVIDE(SUM(a.StartMRR)-SUM(a.Cancellations)-SUM(a.Downgrades),
                        SUM(a.StartMRR))*100,2) AS grr_pct
    FROM `{PROJECT}.revenue.int_customer_annual_mrr` a
    LEFT JOIN labels lb ON lb.company_account = a.Company
    LEFT JOIN firstpay fp ON fp.EntityRecordID = a.EntityRecordID
    WHERE a.Month = DATE '{month}-01' AND a.StartMRR > 0
      AND COALESCE(lb.l1,'Unclassified') IN ('Retail & Consumer','Manufacturing & Distribution')
    GROUP BY l1, age_band
    ORDER BY l1, age_band
    """)

# overall band rates (all industries) at END, for standardization
band_overall = q(f"""
WITH {LABELS},
{FIRSTPAY}
SELECT CASE
    WHEN DATE_DIFF(a.Month, fp.first_month, MONTH) < 12 THEN '1_first_year'
    WHEN DATE_DIFF(a.Month, fp.first_month, MONTH) < 24 THEN '2_year2'
    WHEN DATE_DIFF(a.Month, fp.first_month, MONTH) < 36 THEN '3_year3'
    ELSE '4_year4plus' END AS age_band,
  ROUND(SAFE_DIVIDE(SUM(a.StartMRR)-SUM(a.Cancellations)-SUM(a.Downgrades),
                    SUM(a.StartMRR))*100,2) AS grr_pct
FROM `{PROJECT}.revenue.int_customer_annual_mrr` a
LEFT JOIN firstpay fp ON fp.EntityRecordID = a.EntityRecordID
WHERE a.Month = DATE '{END}' AND a.StartMRR > 0
GROUP BY age_band ORDER BY age_band
""")
out["age_band_overall_rates"] = band_overall

out["age_end"] = age_cut("2026-05")
out["age_start"] = age_cut("2025-06")

# Oaxaca-style mix vs rate split of (Retail - Mfg) GRR gap at END, using overall band rates for the mix term
def mix_rate_split(age_rows):
    ref = {b["age_band"]: b["grr_pct"] for b in band_overall}
    ind = {}
    for r in age_rows:
        ind.setdefault(r["l1"], {})[r["age_band"]] = r
    def weights(name):
        tot = sum(x["start_mrr"] for x in ind.get(name,{}).values()) or 1
        return {b: x["start_mrr"]/tot for b,x in ind.get(name,{}).items()}
    def grr(name):
        s=sum(x["start_mrr"] for x in ind.get(name,{}).values())
        ch=sum(x["churn"] for x in ind.get(name,{}).values())
        dn=sum(x["downgrade"] for x in ind.get(name,{}).values())
        return (s-ch-dn)/s*100 if s else None
    wR, wM = weights("Retail & Consumer"), weights("Manufacturing & Distribution")
    bands = sorted(set(list(wR)+list(wM)+list(ref)))
    mix = sum((wR.get(b,0)-wM.get(b,0))*ref.get(b,0) for b in bands)
    gR, gM = grr("Retail & Consumer"), grr("Manufacturing & Distribution")
    gap = (gR-gM) if (gR is not None and gM is not None) else None
    return {"grr_retail":round(gR,2) if gR else None,
            "grr_mfg":round(gM,2) if gM else None,
            "actual_gap":round(gap,2) if gap is not None else None,
            "mix_effect_pp":round(mix,2),
            "rate_effect_pp":round(gap-mix,2) if gap is not None else None,
            "retail_age_weights":{b:round(v,3) for b,v in wR.items()},
            "mfg_age_weights":{b:round(v,3) for b,v in wM.items()}}
out["mix_rate_split_end"] = mix_rate_split(out["age_end"])

# ---- write + print -----------------------------------------------------------
p = Path("scripts/audit/retail-grr-diagnostic.json")
p.write_text(json.dumps(out, indent=2, default=str))

def line(s=""): print(s)
line("="*72); line("RETAIL GRR DIAGNOSTIC"); line("="*72)
line("\n[1] Per-industry significance summary (12 cohort months 2025-06..2026-05)")
line(f"{'industry':<34}{'GRR μ':>7}{'σ':>6}{'range':>7}{'~N/mo':>7}{'$/mo':>11}{'1pp=$':>8}")
for s in summary:
    line(f"{s['l1'][:33]:<34}{s['grr_mean']:>7}{s['grr_std']:>6}{s['grr_range']:>7}"
         f"{s['median_customers']:>7}{s['median_start_mrr']:>11,}{s['one_pp_dollars']:>8,}")
line("\n[3] Concentration check — Retail peak vs trough, swing from ONE account")
for tag,d in jack.items():
    line(f"  {tag.upper():6} {d['month']}  GRR={d['grr_pct']}%  N={d['customers']}  "
         f"start=${d['start_mrr']:,}")
    line(f"         excl top leaker → {d['grr_excl_top_leaker']}%  "
         f"(one account = {d['pp_swing_from_one_account']}pp)")
    for a in d["top_leakers"][:3]:
        line(f"           - {a['Company'][:40]:<40} lost ${a['lost']:,} "
             f"(churn ${a['churn']:,} / down ${a['downgrade']:,})")
line("\n[4] Age-mix decomposition of Retail − Manufacturing GRR gap (2026-05)")
mr = out["mix_rate_split_end"]
line(f"  Retail GRR {mr['grr_retail']}%  vs  Mfg GRR {mr['grr_mfg']}%  → gap {mr['actual_gap']}pp")
line(f"  explained by AGE MIX: {mr['mix_effect_pp']}pp   |   by RATE (true industry): {mr['rate_effect_pp']}pp")
line(f"  Retail age weights: {mr['retail_age_weights']}")
line(f"  Mfg    age weights: {mr['mfg_age_weights']}")
line("\n  overall GRR by age band (all industries, 2026-05):")
for b in band_overall: line(f"    {b['age_band']:<14} {b['grr_pct']}%")
line(f"\nWrote {p}")
