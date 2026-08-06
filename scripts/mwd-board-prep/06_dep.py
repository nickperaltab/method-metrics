#!/usr/bin/env python3
"""
Task 6: DEP attach rate for new customers, by industry (V7 L1), CEO Q4.

Windows: new customers in H1'26 (Jan-Jun'26) and Jul-Dec'25 (Jul 2026 excluded
everywhere per the global plan constraint). Grain: L1 only, UNCLASSIFIABLE
folded into 'Unclassified'.

Two DEP measures are computed (mandatory per the tenure caveat -- Jul-Dec'25
cohorts have had more months to attach DEP than H1'26 cohorts, so a naive
"ever attached" comparison would look like a fake trend):
  - ever_dep:   LOGICAL_OR(HasDEP) over the whole window to date (< 2026-07-01)
  - first_month_dep: HasDEP in the customer's first paying month only

Step 2 robustness cross-check: ever_had_dep by industry_l1 from
int_motion_funnel, converted 2025+ cohorts (independent entity population --
trial-anchored, not int_customers-anchored -- should tell the same story).

Step 3 verification: per-window totals must equal each other across the two
measure queries (same new_cust CTE) and H1'26 total must equal 592.

Writes scripts/mwd-board-prep/out/06_dep.json. Read-only against BigQuery.
PUBLIC REPO: no MRR or customer-name-bearing data leaves this script.
"""
import json
from pathlib import Path

from common import run_query

OUT_DIR = Path(__file__).parent / "out"

out = {}

# ---------------------------------------------------------------------------
# Step 1a: ever-attached-to-date DEP rate by window x L1
# ---------------------------------------------------------------------------
ever_sql = """
WITH new_cust AS (
  SELECT EntityRecordID, MIN(Month) AS first_month
  FROM `project-for-method-dw.revenue.int_customers`
  WHERE IsNew GROUP BY EntityRecordID
),
dep_ever AS (
  SELECT EntityRecordID, LOGICAL_OR(HasDEP) AS ever_dep
  FROM `project-for-method-dw.revenue.int_customers`
  WHERE Month < '2026-07-01'
  GROUP BY EntityRecordID
)
SELECT
  CASE WHEN n.first_month >= '2026-01-01' THEN 'H1-2026' ELSE 'Jul-Dec-2025' END AS cohort_window,
  COALESCE(NULLIF(l.l1,'UNCLASSIFIABLE'),'Unclassified') AS l1,
  COUNT(*) AS new_customers,
  COUNTIF(d.ever_dep) AS with_dep
FROM new_cust n
JOIN dep_ever d USING (EntityRecordID)
LEFT JOIN `project-for-method-dw.v7_classification.v_entity_primary_label` l
  ON l.customer_record_id = n.EntityRecordID
WHERE n.first_month >= '2025-07-01' AND n.first_month < '2026-07-01'
GROUP BY cohort_window, l1 ORDER BY cohort_window, l1
"""

ever_rows_raw = run_query(ever_sql)
ever_rows = []
for r in ever_rows_raw:
    ever_rows.append({
        "window": r["cohort_window"],
        "l1": r["l1"],
        "new_customers": int(r["new_customers"]),
        "with_dep": int(r["with_dep"]),
        "attach_pct": round(int(r["with_dep"]) / int(r["new_customers"]) * 100, 1) if int(r["new_customers"]) else None,
    })

out["ever_attached_to_date"] = ever_rows

# ---------------------------------------------------------------------------
# Step 1b: attached-in-first-paying-month DEP rate by window x L1
# (tenure-neutral measure -- same window/cohort/eligibility, but HasDEP is
# read at Month = first_month instead of ever within the window to date)
# ---------------------------------------------------------------------------
first_month_sql = """
WITH new_cust AS (
  SELECT EntityRecordID, MIN(Month) AS first_month
  FROM `project-for-method-dw.revenue.int_customers`
  WHERE IsNew GROUP BY EntityRecordID
)
SELECT
  CASE WHEN n.first_month >= '2026-01-01' THEN 'H1-2026' ELSE 'Jul-Dec-2025' END AS cohort_window,
  COALESCE(NULLIF(l.l1,'UNCLASSIFIABLE'),'Unclassified') AS l1,
  COUNT(*) AS new_customers,
  COUNTIF(ic.HasDEP) AS with_dep
FROM new_cust n
JOIN `project-for-method-dw.revenue.int_customers` ic
  ON ic.EntityRecordID = n.EntityRecordID AND ic.Month = n.first_month
LEFT JOIN `project-for-method-dw.v7_classification.v_entity_primary_label` l
  ON l.customer_record_id = n.EntityRecordID
WHERE n.first_month >= '2025-07-01' AND n.first_month < '2026-07-01'
GROUP BY cohort_window, l1 ORDER BY cohort_window, l1
"""

first_month_rows_raw = run_query(first_month_sql)
first_month_rows = []
for r in first_month_rows_raw:
    first_month_rows.append({
        "window": r["cohort_window"],
        "l1": r["l1"],
        "new_customers": int(r["new_customers"]),
        "with_dep": int(r["with_dep"]),
        "attach_pct": round(int(r["with_dep"]) / int(r["new_customers"]) * 100, 1) if int(r["new_customers"]) else None,
    })

out["first_paying_month"] = first_month_rows

# ---------------------------------------------------------------------------
# Overall (all L1 combined) per window, both measures -- MWD vs overall
# ---------------------------------------------------------------------------
def summarize(rows):
    by_window = {}
    for r in rows:
        w = by_window.setdefault(r["window"], {"new_customers": 0, "with_dep": 0, "mwd": None})
        w["new_customers"] += r["new_customers"]
        w["with_dep"] += r["with_dep"]
        if r["l1"] == "Manufacturing & Distribution":
            w["mwd"] = r
    summary = {}
    for window, agg in by_window.items():
        overall_pct = round(agg["with_dep"] / agg["new_customers"] * 100, 1) if agg["new_customers"] else None
        summary[window] = {
            "overall_new_customers": agg["new_customers"],
            "overall_with_dep": agg["with_dep"],
            "overall_attach_pct": overall_pct,
            "mwd": agg["mwd"],
        }
    return summary

out["summary_ever_attached"] = summarize(ever_rows)
out["summary_first_paying_month"] = summarize(first_month_rows)

# ---------------------------------------------------------------------------
# Step 2: robustness cross-check -- ever_had_dep by industry_l1 from
# int_motion_funnel, converted 2025+ cohorts (Jul 2026 excluded).
# Independent population: trial-anchored (motion funnel), not
# int_customers-anchored. Bucketed into the same two windows for comparability.
#
# NOTE: the models/intermediate/int_motion_funnel.sql source (as of commit
# 732b4652, 2026-07-14) names this column `ever_had_dep`, but the deployed
# BigQuery table (project-for-method-dw.revenue.int_motion_funnel) still has
# the pre-rename column `has_dep` per INFORMATION_SCHEMA.COLUMNS checked
# 2026-07-22 -- the model was renamed in source but not re-run (`dbt run`)
# since. Querying against the actually-deployed column; flagged as a concern
# in the report.
# ---------------------------------------------------------------------------
motion_sql = """
SELECT
  CASE WHEN convert_month >= '2026-01-01' THEN 'H1-2026' ELSE 'Jul-Dec-2025' END AS cohort_window,
  COALESCE(NULLIF(industry_l1, 'UNCLASSIFIABLE'), 'Unclassified') AS l1,
  COUNT(*) AS converted_customers,
  COUNTIF(has_dep) AS with_dep
FROM `project-for-method-dw.revenue.int_motion_funnel`
WHERE converted
  AND convert_month >= '2025-07-01' AND convert_month < '2026-07-01'
GROUP BY cohort_window, l1 ORDER BY cohort_window, l1
"""

motion_rows_raw = None
motion_error = None
try:
    motion_rows_raw = run_query(motion_sql)
except Exception as e:
    motion_error = str(e)

motion_rows = []
if motion_rows_raw is not None:
    for r in motion_rows_raw:
        n = int(r["converted_customers"])
        d = int(r["with_dep"])
        motion_rows.append({
            "window": r["cohort_window"],
            "l1": r["l1"],
            "converted_customers": n,
            "with_dep": d,
            "attach_pct": round(d / n * 100, 1) if n else None,
        })

out["robustness_motion_funnel"] = {"rows": motion_rows, "query_error": motion_error, "sql_used": motion_sql}

motion_summary = summarize([
    {"window": r["window"], "l1": r["l1"], "new_customers": r["converted_customers"], "with_dep": r["with_dep"]}
    for r in motion_rows
]) if motion_rows else {}
out["robustness_motion_funnel_summary"] = motion_summary

# ---------------------------------------------------------------------------
# Step 3: verification
# ---------------------------------------------------------------------------
verification = {}

ever_totals = {w: v["overall_new_customers"] for w, v in out["summary_ever_attached"].items()}
fm_totals = {w: v["overall_new_customers"] for w, v in out["summary_first_paying_month"].items()}

verification["ever_attached_window_totals"] = ever_totals
verification["first_paying_month_window_totals"] = fm_totals
verification["totals_agree_across_measures"] = (ever_totals == fm_totals)

h1_2026_total = ever_totals.get("H1-2026")
verification["h1_2026_total"] = h1_2026_total
verification["h1_2026_equals_592"] = (h1_2026_total == 592)

verification["verdict"] = (
    "PASS" if verification["totals_agree_across_measures"] and verification["h1_2026_equals_592"]
    else "FAIL - see totals above"
)

out["verification"] = verification

# ---------------------------------------------------------------------------
# write
# ---------------------------------------------------------------------------
OUT_DIR.mkdir(parents=True, exist_ok=True)
out_path = OUT_DIR / "06_dep.json"
out_path.write_text(json.dumps(out, indent=2, default=str))

print("=" * 72)
print("DEP ATTACH RATE -- NEW CUSTOMERS BY INDUSTRY (V7 L1)")
print("=" * 72)

print("\n--- Ever attached to date ---")
for w, v in out["summary_ever_attached"].items():
    print(f"{w}: overall {v['overall_attach_pct']}% ({v['overall_with_dep']}/{v['overall_new_customers']})"
          f"  MWD: {v['mwd']}")

print("\n--- Attached in first paying month ---")
for w, v in out["summary_first_paying_month"].items():
    print(f"{w}: overall {v['overall_attach_pct']}% ({v['overall_with_dep']}/{v['overall_new_customers']})"
          f"  MWD: {v['mwd']}")

print("\n--- Robustness cross-check (int_motion_funnel, converted 2025+) ---")
if motion_error:
    print(f"  QUERY ERROR: {motion_error}")
else:
    for w, v in motion_summary.items():
        print(f"{w}: overall {v['overall_attach_pct']}%  MWD: {v['mwd']}")

print("\n--- Verification ---")
print(f"  Ever-attached window totals:        {ever_totals}")
print(f"  First-paying-month window totals:   {fm_totals}")
print(f"  Totals agree across measures:        {verification['totals_agree_across_measures']}")
print(f"  H1'26 total:                         {h1_2026_total} (expect 592)")
print(f"  Verdict:                             {verification['verdict']}")

print(f"\nWrote {out_path}")
