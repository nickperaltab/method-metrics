#!/usr/bin/env python3
"""
Task 7: ADVERSARIAL VERIFICATION of the MWD board-prep headline numbers.

Independently re-derives the headline figures from Tasks 1-6 via DIFFERENT
source paths where possible, and runs the gotcha checklist. Read-only against
BigQuery. Writes scripts/mwd-board-prep/out/07_verify.json.

Re-derivations:
  (a) H1 MWD trial share from revenue.Funnel (EventType='Trial') instead of int_trials.
  (b) H1'26 MWD new-customer share via int_customer_mrr.NewMRR>0 instead of int_customers.IsNew.
  (c) June'26 overall ARPC + MWD ratio, recomputed fresh from int_customer_mrr.
  (d) H1'26-partial 90-day conversion (MWD / Non-MWD) recomputed in one query.
  (e) Per-half trial ENTITY counts: int_trials distinct entities vs int_motion_funnel rows.

Plus fan-out / grain gotcha probes.
"""
import json
from pathlib import Path

from common import run_query, LABELS, MWD_L1, MWD_LEGACY

OUT_DIR = Path(__file__).parent / "out"
legacy_in = ", ".join(f"'{v}'" for v in MWD_LEGACY)

out = {}


def num(x):
    return float(x) if x is not None else None


# ===========================================================================
# (a) Trials from revenue.Funnel, EventType='Trial'
# ===========================================================================
funnel_sql = f"""
SELECT DATE_TRUNC(Date, QUARTER) AS q,
       COUNT(*) AS trials,
       COUNTIF(Vertical IN ({legacy_in})) AS mwd
FROM `project-for-method-dw.revenue.Funnel`
WHERE EventType = 'Trial' AND Date >= '2025-01-01' AND Date < '2026-07-01'
GROUP BY q ORDER BY q
"""
frows = run_query(funnel_sql)
fby = {str(r["q"]): (int(r["trials"]), int(r["mwd"])) for r in frows}

h1_25_tr = fby["2025-01-01"][0] + fby["2025-04-01"][0]
h1_25_mwd = fby["2025-01-01"][1] + fby["2025-04-01"][1]
h1_26_tr = fby["2026-01-01"][0] + fby["2026-04-01"][0]
h1_26_mwd = fby["2026-01-01"][1] + fby["2026-04-01"][1]

a_h1_25_share = round(h1_25_mwd / h1_25_tr * 100, 2)
a_h1_26_share = round(h1_26_mwd / h1_26_tr * 100, 2)
a_vol_change = round((h1_26_tr - h1_25_tr) / h1_25_tr * 100, 2)

out["a_trials_from_funnel"] = {
    "source": "revenue.Funnel WHERE EventType='Trial' (int_trials sources from revenue.Account — independent path)",
    "h1_2025": {"trials": h1_25_tr, "mwd": h1_25_mwd, "share_pct": a_h1_25_share},
    "h1_2026": {"trials": h1_26_tr, "mwd": h1_26_mwd, "share_pct": a_h1_26_share},
    "volume_pct_change": a_vol_change,
    "headline": {"h1_25_share": 13.32, "h1_26_share": 13.45, "vol_change": -24.09,
                 "h1_25_trials": 4729, "h1_26_trials": 3590},
    "verdict_share": "CONFIRMED" if abs(a_h1_25_share - 13.32) <= 0.5 and abs(a_h1_26_share - 13.45) <= 0.5 else "DISCREPANT",
    "verdict_volume": "CONFIRMED" if abs(a_vol_change - (-24.09)) <= 1.0 else "DISCREPANT",
    "exact_count_match": h1_25_tr == 4729 and h1_26_tr == 3590,
}

# ===========================================================================
# (b) H1'26 MWD new-customer share via int_customer_mrr.NewMRR>0
# ===========================================================================
newmrr_sql = f"""
WITH new_ent AS (
  SELECT DISTINCT EntityRecordID
  FROM `project-for-method-dw.revenue.int_customer_mrr`
  WHERE Month >= '2026-01-01' AND Month < '2026-07-01' AND NewMRR > 0
)
SELECT COUNT(*) AS total,
       COUNTIF(l.l1 IS NOT NULL AND l.l1 != 'UNCLASSIFIABLE') AS labeled,
       COUNTIF(l.l1 = '{MWD_L1}') AS mwd
FROM new_ent n
LEFT JOIN `{LABELS}` l ON l.customer_record_id = n.EntityRecordID
"""
b = run_query(newmrr_sql)[0]
b_total, b_labeled, b_mwd = int(b["total"]), int(b["labeled"]), int(b["mwd"])
b_share_total = round(b_mwd / b_total * 100, 2)
b_share_labeled = round(b_mwd / b_labeled * 100, 2)

# overlap reconciliation between the two "new customer" populations
overlap_sql = """
WITH isnew AS (
  SELECT EntityRecordID FROM (
    SELECT EntityRecordID, MIN(Month) mn FROM `project-for-method-dw.revenue.int_customers`
    WHERE IsNew GROUP BY EntityRecordID
  ) WHERE mn >= '2026-01-01' AND mn < '2026-07-01'
),
newmrr AS (
  SELECT DISTINCT EntityRecordID FROM `project-for-method-dw.revenue.int_customer_mrr`
  WHERE Month >= '2026-01-01' AND Month < '2026-07-01' AND NewMRR > 0
)
SELECT
  (SELECT COUNT(*) FROM isnew) AS isnew_total,
  (SELECT COUNT(*) FROM newmrr) AS newmrr_total,
  (SELECT COUNT(*) FROM isnew i JOIN newmrr n USING(EntityRecordID)) AS both,
  (SELECT COUNT(*) FROM isnew i WHERE NOT EXISTS (SELECT 1 FROM newmrr n WHERE n.EntityRecordID=i.EntityRecordID)) AS isnew_only,
  (SELECT COUNT(*) FROM newmrr n WHERE NOT EXISTS (SELECT 1 FROM isnew i WHERE i.EntityRecordID=n.EntityRecordID)) AS newmrr_only
"""
ov = run_query(overlap_sql)[0]

out["b_new_customers_via_newmrr"] = {
    "method": "distinct EntityRecordID with NewMRR>0 in H1'26 (int_customer_mrr) vs Task-3 IsNew (int_customers)",
    "newmrr_total": b_total, "newmrr_labeled": b_labeled, "newmrr_mwd": b_mwd,
    "newmrr_share_of_total_pct": b_share_total, "newmrr_share_of_labeled_pct": b_share_labeled,
    "task3_isnew_total": 592, "task3_isnew_mwd": 158,
    "task3_share_of_total": 26.69, "task3_share_of_labeled": 30.44,
    "count_gap_newmrr_minus_isnew": b_total - 592,
    "share_of_total_gap_pts": round(b_share_total - 26.69, 2),
    "share_of_labeled_gap_pts": round(b_share_labeled - 30.44, 2),
    "population_overlap": {k: int(v) for k, v in ov.items()},
    "note": ("NOT a subset relationship: the two 'new customer' populations overlap on only "
             f"{int(ov['both'])} of {int(ov['isnew_total'])}/{int(ov['newmrr_total'])}. IsNew = first-ever "
             "active paying month (int_customers, conventional net-new logo). NewMRR>0 = 0->positive MRR "
             "transition at company grain (includes reactivations/re-starts; excludes m11%/m18% accounts and "
             "PE-only starts). Different questions -> different answers by design."),
    "verdict": ("DEFINITION-DEPENDENT (Task-3 IsNew number is correctly computed for its definition; the "
                "NewMRR alternative reports a HIGHER MWD share, so the headline is conservative, but the two "
                "do NOT tie within 1pt -- the deliverable MUST state the definition used)"),
}

# ===========================================================================
# (c) June'26 ARPC — fresh independent recompute + fan-out probe
# ===========================================================================
# grain check: is int_customer_mrr exactly 1 row per (Month, EntityRecordID)?
grain_sql = """
SELECT COUNT(*) AS n_rows, COUNT(DISTINCT FORMAT('%t|%t', Month, EntityRecordID)) AS distinct_keys
FROM `project-for-method-dw.revenue.int_customer_mrr`
WHERE Month = '2026-06-01'
"""
g = run_query(grain_sql)[0]
mrr_rows, mrr_keys = int(g["n_rows"]), int(g["distinct_keys"])

# label-join fan-out probe
label_dup_sql = f"""
SELECT COUNT(*) AS n_rows, COUNT(DISTINCT customer_record_id) AS distinct_ids
FROM `{LABELS}`
"""
ld = run_query(label_dup_sql)[0]
label_rows, label_ids = int(ld["n_rows"]), int(ld["distinct_ids"])

arpc_sql = f"""
SELECT
  COUNT(DISTINCT m.EntityRecordID) AS overall_customers,
  SUM(m.StartMRR) AS overall_mrr,
  COUNT(DISTINCT IF(l.l1 = '{MWD_L1}', m.EntityRecordID, NULL)) AS mwd_customers,
  SUM(IF(l.l1 = '{MWD_L1}', m.StartMRR, 0)) AS mwd_mrr
FROM `project-for-method-dw.revenue.int_customer_mrr` m
LEFT JOIN `{LABELS}` l ON l.customer_record_id = m.EntityRecordID
WHERE m.Month = '2026-06-01' AND m.StartMRR > 0
"""
c = run_query(arpc_sql)[0]
c_overall_cust = int(c["overall_customers"])
c_overall_mrr = num(c["overall_mrr"])
c_mwd_cust = int(c["mwd_customers"])
c_mwd_mrr = num(c["mwd_mrr"])
c_overall_arpc = round(c_overall_mrr / c_overall_cust, 2)
c_mwd_arpc = round(c_mwd_mrr / c_mwd_cust, 2)
c_ratio = round(c_mwd_arpc / c_overall_arpc, 3)

out["c_arpc_june2026_independent"] = {
    "overall_customers": c_overall_cust, "overall_arpc": c_overall_arpc,
    "mwd_customers": c_mwd_cust, "mwd_arpc": c_mwd_arpc,
    "ratio_mwd_vs_overall": c_ratio,
    "task4_ratio": 1.164, "task4_overall_customers": 3216, "task4_overall_arpc": 257.9,
    "ratio_pct_diff_vs_task4": round(abs(c_ratio - 1.164) / 1.164 * 100, 2),
    "grain_probe_int_customer_mrr_jun2026": {"rows": mrr_rows, "distinct_month_entity_keys": mrr_keys,
                                             "no_fanout": mrr_rows == mrr_keys},
    "label_join_probe": {"label_rows": label_rows, "distinct_customer_record_id": label_ids,
                         "no_fanout": label_rows == label_ids},
    "verdict": "CONFIRMED" if abs(c_ratio - 1.164) / 1.164 * 100 <= 1.0 else "DISCREPANT",
}

# ===========================================================================
# (d) H1'26-partial 90-day conversion recompute (single query, own logic)
# ===========================================================================
conv_sql = f"""
WITH trial_vert AS (
  SELECT EntityRecordID,
         LOGICAL_OR(Vertical IN ({legacy_in})) AS is_mwd,
         COUNTIF(Vertical IS NULL OR Vertical IN ('','Unknown','Other')) = COUNT(*) AS unusable
  FROM `project-for-method-dw.revenue.int_trials`
  GROUP BY EntityRecordID
)
SELECT
  CASE WHEN v.unusable THEN 'No vertical' WHEN v.is_mwd THEN 'MWD' ELSE 'Non-MWD' END AS seg,
  COUNT(*) AS trialers,
  COUNTIF(f.converted AND DATE_DIFF(f.convert_month, f.signup_month, MONTH) <= 3) AS conv90
FROM `project-for-method-dw.revenue.int_motion_funnel` f
JOIN trial_vert v USING (EntityRecordID)
WHERE f.signup_month BETWEEN '2026-01-01' AND '2026-03-31'
GROUP BY seg ORDER BY seg
"""
d = run_query(conv_sql)
d_by = {r["seg"]: (int(r["trialers"]), int(r["conv90"])) for r in d}
d_mwd = round(d_by["MWD"][1] / d_by["MWD"][0] * 100, 2) if "MWD" in d_by else None
d_non = round(d_by["Non-MWD"][1] / d_by["Non-MWD"][0] * 100, 2) if "Non-MWD" in d_by else None

out["d_conversion_h1_26_partial"] = {
    "MWD": {"trialers": d_by.get("MWD", (0, 0))[0], "conv90": d_by.get("MWD", (0, 0))[1], "rate_pct": d_mwd},
    "Non-MWD": {"trialers": d_by.get("Non-MWD", (0, 0))[0], "conv90": d_by.get("Non-MWD", (0, 0))[1], "rate_pct": d_non},
    "task5_mwd": 27.49, "task5_non_mwd": 15.86,
    "mwd_gap_pts": round(d_mwd - 27.49, 2) if d_mwd is not None else None,
    "non_mwd_gap_pts": round(d_non - 15.86, 2) if d_non is not None else None,
    "verdict": "CONFIRMED" if d_mwd is not None and abs(d_mwd - 27.49) <= 0.5 and abs(d_non - 15.86) <= 0.5 else "DISCREPANT",
}

# ===========================================================================
# (e) trial ENTITY counts: int_trials distinct entities vs int_motion_funnel rows
# ===========================================================================
ent_sql = """
WITH it AS (
  SELECT EntityRecordID, DATE_TRUNC(MIN(SignupDate), MONTH) AS sm
  FROM `project-for-method-dw.revenue.int_trials`
  GROUP BY EntityRecordID
)
SELECT half, src, COUNT(*) AS n FROM (
  SELECT CASE
    WHEN sm BETWEEN '2025-01-01' AND '2025-06-30' THEN 'H1_25'
    WHEN sm BETWEEN '2026-01-01' AND '2026-06-30' THEN 'H1_26' END AS half,
    'int_trials_distinct_entity' AS src
  FROM it
  UNION ALL
  SELECT CASE
    WHEN signup_month BETWEEN '2025-01-01' AND '2025-06-30' THEN 'H1_25'
    WHEN signup_month BETWEEN '2026-01-01' AND '2026-06-30' THEN 'H1_26' END AS half,
    'int_motion_funnel_rows' AS src
  FROM `project-for-method-dw.revenue.int_motion_funnel`
)
WHERE half IS NOT NULL
GROUP BY half, src ORDER BY half, src
"""
e = run_query(ent_sql)
e_map = {}
for r in e:
    e_map.setdefault(r["half"], {})[r["src"]] = int(r["n"])
e_out = {}
for half, d2 in e_map.items():
    it = d2.get("int_trials_distinct_entity")
    mf = d2.get("int_motion_funnel_rows")
    gap = it - mf if it is not None and mf is not None else None
    e_out[half] = {
        "int_trials_distinct_entity": it, "int_motion_funnel_rows": mf,
        "gap": gap, "gap_pct": round(abs(gap) / it * 100, 3) if it and gap is not None else None,
    }
out["e_trial_entity_counts"] = {
    "by_half": e_out,
    "note": "int_motion_funnel trials CTE = DATE_TRUNC(MIN(SignupDate),MONTH) GROUP BY EntityRecordID off int_trials, "
            "then WHERE signup_month>=2020. int_trials distinct-entity uses same MIN(SignupDate). Expect ~0.",
    "verdict": "CONFIRMED" if all(v["gap_pct"] is not None and v["gap_pct"] < 1.0 for v in e_out.values()) else "DISCREPANT",
}

# ===========================================================================
# Gotcha: syncs total-events volume 2991->2128 sanity (from canonical)
# ===========================================================================
syncs_vol_sql = """
SELECT
  SUM(IF(period BETWEEN '2025-01-01' AND '2025-06-01', CAST(value AS INT64), 0)) AS h1_25,
  SUM(IF(period BETWEEN '2026-01-01' AND '2026-06-01', CAST(value AS INT64), 0)) AS h1_26
FROM `project-for-method-dw.revenue_metrics.v_metric__syncs`
"""
sv = run_query(syncs_vol_sql)[0]
out["gotcha_syncs_volume"] = {
    "canonical_v_metric__syncs_h1_25": int(sv["h1_25"]),
    "canonical_v_metric__syncs_h1_26": int(sv["h1_26"]),
    "task2_syncs_events_total_h1_25": 2991,
    "task2_syncs_events_total_h1_26": 2128,
    "headline_2991_to_2128_is": "TOTAL sync events (not MWD). MWD sync events = 515 -> 380.",
    "match": int(sv["h1_25"]) == 2991 and int(sv["h1_26"]) == 2128,
}

OUT_DIR.mkdir(parents=True, exist_ok=True)
out_path = OUT_DIR / "07_verify.json"
out_path.write_text(json.dumps(out, indent=2, default=str))
print(json.dumps(out, indent=2, default=str))
print(f"\nWrote {out_path}")
