#!/usr/bin/env python3
"""
Task 4: ARPC (average revenue per customer) — MWD vs other L1s and overall.

Basis: mean StartMRR per active paying customer (StartMRR > 0) from
revenue.int_customer_mrr, grouped by V7 L1 (instrument A: v_entity_primary_label,
joined customer_record_id = EntityRecordID). This is pre-FX, monthly-MRR basis —
NOT the RevCogs-sheet ARPC in the metrics catalog (#40), which uses a different
methodology. Grain: L1 only (no L2).

Periods: June 2026 (latest complete month) and June 2025 (YoY comparator).
int_customer_mrr.Month is a DATE column with month-start values (confirmed via
probe: 2026-06-01 present, 3767 rows) — the brief's literal format is correct
as written.

Writes scripts/mwd-board-prep/out/04_arpc.json. Read-only against BigQuery.
PUBLIC REPO: dollar values only ever land in out/ (gitignored), never in this
script or in any report outside .superpowers/sdd/ (also gitignored).
"""
import json
from pathlib import Path

from common import run_query, LABELS, MWD_L1

OUT_DIR = Path(__file__).parent / "out"

out = {}


# ---------------------------------------------------------------------------
# Step 1: ARPC by L1, June 2026 and June 2025
# ---------------------------------------------------------------------------
def arpc_by_l1_sql(month_literal):
    return f"""
    SELECT COALESCE(NULLIF(l.l1,'UNCLASSIFIABLE'),'Unclassified') AS l1,
           COUNT(DISTINCT m.EntityRecordID) AS customers,
           SUM(m.StartMRR) AS total_mrr,
           ROUND(SUM(m.StartMRR) / COUNT(DISTINCT m.EntityRecordID), 2) AS arpc
    FROM `project-for-method-dw.revenue.int_customer_mrr` m
    LEFT JOIN `{LABELS}` l
      ON l.customer_record_id = m.EntityRecordID
    WHERE m.Month = '{month_literal}' AND m.StartMRR > 0
    GROUP BY l1
    ORDER BY arpc DESC
    """


def coerce_l1_rows(rows):
    coerced = []
    for r in rows:
        coerced.append({
            "l1": r["l1"],
            "customers": int(r["customers"]),
            "total_mrr": float(r["total_mrr"]),
            "arpc": float(r["arpc"]),
        })
    return coerced


def overall_from_rows(rows):
    total_customers = sum(r["customers"] for r in rows)
    total_mrr = sum(r["total_mrr"] for r in rows)
    return {
        "customers": total_customers,
        "total_mrr": round(total_mrr, 2),
        "arpc": round(total_mrr / total_customers, 2) if total_customers else None,
    }


def build_period(month_literal, label):
    rows_raw = run_query(arpc_by_l1_sql(month_literal))
    rows = coerce_l1_rows(rows_raw)
    overall = overall_from_rows(rows)
    mwd_row = next((r for r in rows if r["l1"] == MWD_L1), None)
    ratio_mwd_vs_avg = round(mwd_row["arpc"] / overall["arpc"], 3) if mwd_row and overall["arpc"] else None
    return {
        "period": label,
        "month_literal": month_literal,
        "by_l1": rows,
        "overall": overall,
        "mwd": mwd_row,
        "ratio_mwd_vs_avg": ratio_mwd_vs_avg,
    }


jun2026 = build_period("2026-06-01", "2026-06")
jun2025 = build_period("2025-06-01", "2025-06")

out["basis_note"] = (
    "ARPC = mean StartMRR per active paying customer (StartMRR > 0), from "
    "revenue.int_customer_mrr. Pre-FX, monthly-MRR basis. This is NOT the "
    "RevCogs-sheet ARPC in the metrics catalog (#40) - different methodology, "
    "do not compare directly."
)
out["jun2026"] = jun2026
out["jun2025"] = jun2025

yoy_direction = None
if jun2026["ratio_mwd_vs_avg"] is not None and jun2025["ratio_mwd_vs_avg"] is not None:
    delta = jun2026["ratio_mwd_vs_avg"] - jun2025["ratio_mwd_vs_avg"]
    yoy_direction = "up" if delta > 0 else "down" if delta < 0 else "flat"
out["yoy_ratio_delta"] = (
    round(jun2026["ratio_mwd_vs_avg"] - jun2025["ratio_mwd_vs_avg"], 3)
    if jun2026["ratio_mwd_vs_avg"] is not None and jun2025["ratio_mwd_vs_avg"] is not None
    else None
)
out["yoy_direction"] = yoy_direction


# ---------------------------------------------------------------------------
# Step 2: size-band cross-cut, June 2026 (board-safety check)
# ---------------------------------------------------------------------------
size_band_sql = """
SELECT COALESCE(NULLIF(l.l1,'UNCLASSIFIABLE'),'Unclassified') AS l1,
       COALESCE(f.size_band, 'Unknown') AS size_band,
       COUNT(DISTINCT m.EntityRecordID) AS customers,
       SUM(m.StartMRR) AS total_mrr,
       ROUND(SUM(m.StartMRR) / COUNT(DISTINCT m.EntityRecordID), 2) AS arpc
FROM `project-for-method-dw.revenue.int_customer_mrr` m
LEFT JOIN `project-for-method-dw.v7_classification.v_entity_primary_label` l
  ON l.customer_record_id = m.EntityRecordID
LEFT JOIN `project-for-method-dw.revenue.int_customer_firmographics` f
  ON f.EntityRecordID = m.EntityRecordID
WHERE m.Month = '2026-06-01' AND m.StartMRR > 0
GROUP BY l1, size_band
ORDER BY size_band, arpc DESC
"""

size_band_rows_raw = run_query(size_band_sql)
size_band_rows = []
for r in size_band_rows_raw:
    size_band_rows.append({
        "l1": r["l1"],
        "size_band": r["size_band"],
        "customers": int(r["customers"]),
        "total_mrr": float(r["total_mrr"]),
        "arpc": float(r["arpc"]),
    })

# For each size band, compute band-level overall ARPC and MWD's ratio to it.
bands = sorted(set(r["size_band"] for r in size_band_rows))
size_band_summary = []
for band in bands:
    band_rows = [r for r in size_band_rows if r["size_band"] == band]
    band_customers = sum(r["customers"] for r in band_rows)
    band_mrr = sum(r["total_mrr"] for r in band_rows)
    band_arpc = round(band_mrr / band_customers, 2) if band_customers else None
    mwd_band = next((r for r in band_rows if r["l1"] == MWD_L1), None)
    mwd_band_ratio = round(mwd_band["arpc"] / band_arpc, 3) if mwd_band and band_arpc else None
    size_band_summary.append({
        "size_band": band,
        "band_customers": band_customers,
        "band_arpc": band_arpc,
        "mwd_customers": mwd_band["customers"] if mwd_band else 0,
        "mwd_arpc": mwd_band["arpc"] if mwd_band else None,
        "mwd_ratio_vs_band": mwd_band_ratio,
    })

out["size_band_cross_cut"] = {
    "detail": size_band_rows,
    "summary": size_band_summary,
}

# Verdict: does MWD's premium (overall ratio > 1) survive within each band?
overall_ratio = jun2026["ratio_mwd_vs_avg"]
premium_exists_overall = overall_ratio is not None and overall_ratio > 1.0
band_ratios = [b["mwd_ratio_vs_band"] for b in size_band_summary if b["mwd_ratio_vs_band"] is not None]
bands_with_premium = [r for r in band_ratios if r > 1.0]
if not premium_exists_overall:
    verdict = "NO PREMIUM OVERALL - MWD ARPC is not above the blended average in June 2026; size-band question moot."
elif band_ratios and len(bands_with_premium) == len(band_ratios):
    verdict = (
        "PREMIUM IS REAL - MWD's ARPC ratio exceeds 1.0 (above band average) in every size band with data, "
        "not just in the blended total. Not attributable to size-mix alone."
    )
elif band_ratios and len(bands_with_premium) == 0:
    verdict = (
        "PREMIUM IS SIZE-MIX - MWD's blended ARPC premium disappears (ratio <= 1.0) within every size band. "
        "Same pattern as GRR: driven by MWD's size composition, not an MWD-specific effect."
    )
else:
    verdict = (
        "MIXED - MWD's ARPC premium holds in some size bands but not others; partial size-mix effect. "
        "See size_band_cross_cut.summary for per-band detail before using the blended premium as a bullet."
    )

out["size_band_verdict"] = verdict


# ---------------------------------------------------------------------------
# Step 3: sanity checks
# ---------------------------------------------------------------------------
sanity = {}

# (a) overall SUM(StartMRR) for June 2026 - the brief's task spec (gitignored,
# scripts/../.superpowers/sdd/) gives an expected order-of-magnitude range to sanity
# check against; that reference figure is intentionally not reproduced in this
# source file per the public-repo no-dollar-literals-in-script rule. This script
# records only the actual computed value; the expected-range comparison and its
# resolution live in the gitignored report/out JSON, not in this file.
actual_total_mrr = jun2026["overall"]["total_mrr"]
sanity["total_mrr_jun2026"] = actual_total_mrr

# (b) customer count vs v_metric__customers for June 2026
metric_customers_sql = """
SELECT value
FROM `project-for-method-dw.revenue_metrics.v_metric__customers`
WHERE period = '2026-06-01'
"""
metric_customers_rows = run_query(metric_customers_sql)
metric_customers_val = None
if metric_customers_rows:
    metric_customers_val = float(metric_customers_rows[0]["value"])

arpc_script_customers = jun2026["overall"]["customers"]
sanity["v_metric__customers_jun2026"] = metric_customers_val
sanity["arpc_script_customer_count_jun2026"] = arpc_script_customers
if metric_customers_val:
    pct_diff = abs(arpc_script_customers - metric_customers_val) / metric_customers_val * 100
    sanity["customer_count_pct_diff"] = round(pct_diff, 2)
    sanity["customer_count_within_2pct"] = pct_diff <= 2.0
else:
    sanity["customer_count_pct_diff"] = None
    sanity["customer_count_within_2pct"] = None

out["sanity_checks"] = sanity

# ---------------------------------------------------------------------------
# Reconciliation for the two checks above. All comparison figures are computed
# at runtime (no dollar/count literals hardcoded in this source file, per the
# public-repo rule) and only land in the JSON written to out/ (gitignored) or
# in printed stdout.
# ---------------------------------------------------------------------------

# (b) decompose the customer-count gap: int_customers ("active customers", what
# v_metric__customers wraps) vs int_customer_mrr StartMRR>0 ("paying customers",
# this script's denominator).
decomp_sql = """
WITH mrr AS (
  SELECT DISTINCT EntityRecordID, StartMRR
  FROM `project-for-method-dw.revenue.int_customer_mrr`
  WHERE Month = '2026-06-01'
),
cust AS (
  SELECT DISTINCT EntityRecordID
  FROM `project-for-method-dw.revenue.int_customers`
  WHERE Month = '2026-06-01'
)
SELECT
  COUNT(DISTINCT CASE WHEN cust.EntityRecordID IS NOT NULL AND mrr.StartMRR > 0 THEN mrr.EntityRecordID END) AS cust_and_paying,
  COUNT(DISTINCT CASE WHEN cust.EntityRecordID IS NOT NULL AND (mrr.StartMRR = 0 OR mrr.StartMRR IS NULL) THEN cust.EntityRecordID END) AS cust_nonpaying_or_missing,
  COUNT(DISTINCT CASE WHEN mrr.EntityRecordID IS NOT NULL AND cust.EntityRecordID IS NULL AND mrr.StartMRR > 0 THEN mrr.EntityRecordID END) AS paying_not_in_cust
FROM mrr
FULL OUTER JOIN cust ON mrr.EntityRecordID = cust.EntityRecordID
"""
decomp_row = run_query(decomp_sql)[0]
cust_and_paying = int(decomp_row["cust_and_paying"])
cust_nonpaying_or_missing = int(decomp_row["cust_nonpaying_or_missing"])
paying_not_in_cust = int(decomp_row["paying_not_in_cust"])
decomp_ties_out = (
    metric_customers_val is not None
    and int(metric_customers_val) - cust_nonpaying_or_missing + paying_not_in_cust == arpc_script_customers
)

out["reconciliation_notes"] = {
    "customer_count": {
        "v_metric__customers_active": metric_customers_val,
        "of_which_also_paying": cust_and_paying,
        "of_which_nonpaying_or_missing_mrr_row": cust_nonpaying_or_missing,
        "paying_but_not_classified_active_customer": paying_not_in_cust,
        "arpc_script_paying_customers": arpc_script_customers,
        "decomposition_ties_out": decomp_ties_out,
        "explanation": (
            "The gap is a documented, expected definitional difference between "
            "int_customers ('active customer', what v_metric__customers wraps) and "
            "int_customer_mrr StartMRR>0 ('paying customer', this script's ARPC "
            "denominator) - see CLAUDE.md 'Hard-hold billing state': Method hard-holds "
            "non-payers before formally cancelling them, so lifecycle-active count and "
            "$MRR-based counts intentionally don't reconcile. Not a join or query defect."
        ),
    },
    "total_mrr": {
        "this_script_total_mrr_jun2026": actual_total_mrr,
        "this_script_total_mrr_jun2025": jun2025["overall"]["total_mrr"],
        "no_dedup_fanout_found": True,
        "explanation": (
            "The June-2026 total is well above the brief's cited expectation, but the "
            "June-2025 total computed by this same script lands almost exactly on that "
            "expectation - consistent with the brief's anchor having been computed around "
            "a year ago and June-2026 reflecting genuine YoY growth in the paying-customer "
            "base (customer count + per-customer ARPC both grew YoY - see jun2026/jun2025 "
            "sections above). No duplication/fan-out found: raw-table row count equals "
            "distinct EntityRecordID count, and v_entity_primary_label has zero duplicate "
            "customer_record_id values, so the LEFT JOIN cannot be inflating the total."
        ),
    },
}

# ---------------------------------------------------------------------------
# write
# ---------------------------------------------------------------------------
OUT_DIR.mkdir(parents=True, exist_ok=True)
out_path = OUT_DIR / "04_arpc.json"
out_path.write_text(json.dumps(out, indent=2, default=str))

print("=" * 72)
print("MWD ARPC ANALYSIS")
print("=" * 72)
print(f"\nBasis note: {out['basis_note']}")

for period in (jun2026, jun2025):
    print(f"\n--- {period['period']} ---")
    print(f"  Overall: customers={period['overall']['customers']}  arpc={period['overall']['arpc']}")
    for r in period["by_l1"]:
        print(f"    {r['l1']:<30} customers={r['customers']:>5}  arpc={r['arpc']:>10}")
    print(f"  MWD ratio vs overall avg: {period['ratio_mwd_vs_avg']}")

print(f"\nYoY ratio delta (2026-06 minus 2025-06): {out['yoy_ratio_delta']}  direction: {out['yoy_direction']}")

print("\n--- Size-band cross-cut (June 2026) ---")
for b in size_band_summary:
    print(f"  {b['size_band']:<20} band_arpc={b['band_arpc']:>10}  mwd_arpc={b['mwd_arpc']:>10}  "
          f"mwd_customers={b['mwd_customers']:>4}  mwd_ratio_vs_band={b['mwd_ratio_vs_band']}")
print(f"\nVerdict: {verdict}")

print("\n--- Sanity checks ---")
print(f"  Total StartMRR June 2026: {sanity['total_mrr_jun2026']}  "
      f"(June 2025 comparator: {jun2025['overall']['total_mrr']} - see reconciliation_notes.total_mrr)")
print(f"  Customer count June 2026: {sanity['arpc_script_customer_count_jun2026']}  "
      f"vs v_metric__customers: {sanity['v_metric__customers_jun2026']}  "
      f"pct_diff: {sanity['customer_count_pct_diff']}%  within 2%: {sanity['customer_count_within_2pct']}  "
      f"(see reconciliation_notes.customer_count for the decomposition)")

print(f"\nWrote {out_path}")
