#!/usr/bin/env python3
"""
Task 5: trial->paid conversion rate for MWD vs others, maturity-matched.

Uses instrument B (legacy self-reported int_trials.Vertical) rather than V7
industry_l1, because V7 labels on trialers are converter-biased (labels exist
mostly for those who became customers, inflating labeled-industry conversion).
Self-reported Vertical is fixed at signup, so it's unbiased for this cut.

Fixed 90-day (<=3 month) conversion window, applied per signup half so cohorts
are maturity-matched. H1'26 is cut to Jan-Mar signups only (not the full
Jan-Jun half) so every trialer in the comparison has had a full 90-day window
to convert as of the script run date (2026-07-22) -- cutting the cohort
instead of fudging the window, per the plan's instruction.

Grain: int_motion_funnel is entity grain (one row per trialer, keyed on
EntityRecordID) -- this avoids the account-grain fan-out of int_trials
(~1.22 rows/EntityRecordID, see knowledge/routes + CLAUDE.md dedup note).
Vertical is attached from int_trials, deduped to one row per EntityRecordID
via LOGICAL_OR / COUNTIF-based aggregation (an entity might have >1 trial
row; if any of them is MWD, or all of them are blank/unusable, that's what
segments the entity).

Writes scripts/mwd-board-prep/out/05_conversion.json. Read-only against BigQuery.
"""
import json
from pathlib import Path

from common import run_query, MWD_LEGACY, MWD_L1

OUT_DIR = Path(__file__).parent / "out"

out = {}

# ---------------------------------------------------------------------------
# Half definitions. H1'26 is intentionally cut to Jan-Mar (not Jan-Jun) --
# see module docstring. Boundaries are inclusive; signup_month values are
# always the 1st of the month (DATE_TRUNC(..., MONTH) upstream in
# int_motion_funnel), so a BETWEEN against the last day of the month is safe.
# ---------------------------------------------------------------------------
HALVES = [
    ("H1'24", "2024-01-01", "2024-06-30", False),
    ("H2'24", "2024-07-01", "2024-12-31", False),
    ("H1'25", "2025-01-01", "2025-06-30", False),
    ("H2'25", "2025-07-01", "2025-12-31", False),
    ("H1'26-partial", "2026-01-01", "2026-03-31", True),
]

legacy_in = ", ".join(f"'{v}'" for v in MWD_LEGACY)

half_case = "\n      ".join(
    f"WHEN f.signup_month BETWEEN '{start}' AND '{end}' THEN \"{label}\""
    for label, start, end, _ in HALVES
)

# ---------------------------------------------------------------------------
# Step 1: half x segment conversion table
# ---------------------------------------------------------------------------
conversion_sql = f"""
WITH trial_vert AS (
  SELECT EntityRecordID,
         LOGICAL_OR(Vertical IN ({legacy_in})) AS is_mwd_legacy,
         COUNTIF(Vertical IS NULL OR Vertical IN ('', 'Unknown', 'Other')) = COUNT(*) AS vert_unusable
  FROM `project-for-method-dw.revenue.int_trials`
  GROUP BY EntityRecordID
),
halved AS (
  SELECT
    f.EntityRecordID,
    f.signup_month,
    f.converted,
    f.convert_month,
    CASE
      {half_case}
      ELSE NULL
    END AS half
  FROM `project-for-method-dw.revenue.int_motion_funnel` f
)
SELECT
  h.half,
  CASE WHEN v.vert_unusable THEN 'No vertical' WHEN v.is_mwd_legacy THEN 'MWD' ELSE 'Non-MWD' END AS seg,
  COUNT(*) AS trialers,
  COUNTIF(h.converted AND DATE_DIFF(h.convert_month, h.signup_month, MONTH) <= 3) AS converted_90d
FROM halved h
JOIN trial_vert v USING (EntityRecordID)
WHERE h.half IS NOT NULL
GROUP BY h.half, seg
ORDER BY h.half, seg
"""

rows = run_query(conversion_sql)

by_half = {}
for r in rows:
    half = r["half"]
    seg = r["seg"]
    trialers = int(r["trialers"])
    converted_90d = int(r["converted_90d"])
    rate = round(converted_90d / trialers * 100, 2) if trialers else None
    by_half.setdefault(half, {})[seg] = {
        "trialers": trialers,
        "converted_90d": converted_90d,
        "conv_rate_pct": rate,
    }

half_order = [h[0] for h in HALVES]
pre_change_halves = {"H1'24", "H2'24"}  # legacy-MWD share level-shift at 2024/2025 boundary (Task 1)

table = []
for half in half_order:
    segs = by_half.get(half, {})
    overall_trialers = sum(s["trialers"] for s in segs.values())
    overall_converted = sum(s["converted_90d"] for s in segs.values())
    overall_rate = round(overall_converted / overall_trialers * 100, 2) if overall_trialers else None

    mwd = segs.get("MWD", {"trialers": 0, "converted_90d": 0, "conv_rate_pct": None})
    non_mwd = segs.get("Non-MWD", {"trialers": 0, "converted_90d": 0, "conv_rate_pct": None})
    no_vert = segs.get("No vertical", {"trialers": 0, "converted_90d": 0, "conv_rate_pct": None})

    gap_pts = (
        round(mwd["conv_rate_pct"] - non_mwd["conv_rate_pct"], 2)
        if mwd["conv_rate_pct"] is not None and non_mwd["conv_rate_pct"] is not None
        else None
    )

    table.append({
        "half": half,
        "pre_change_period": half in pre_change_halves,
        "MWD": mwd,
        "Non-MWD": non_mwd,
        "No vertical": no_vert,
        "overall": {
            "trialers": overall_trialers,
            "converted_90d": overall_converted,
            "conv_rate_pct": overall_rate,
        },
        "mwd_minus_nonmwd_gap_pts": gap_pts,
    })

out["conversion_by_half_segment"] = table

# Gap trend (only over halves with both MWD and Non-MWD data)
gap_series = [(t["half"], t["mwd_minus_nonmwd_gap_pts"]) for t in table if t["mwd_minus_nonmwd_gap_pts"] is not None]
out["gap_trend"] = {
    "series": [{"half": h, "gap_pts": g} for h, g in gap_series],
    "note": (
        "gap = MWD conv_rate_pct - Non-MWD conv_rate_pct. Positive = MWD converts better. "
        "2024 halves are pre-form-change (see caveats) -- read the 2024->2025 step with that "
        "in mind, not as a clean trend point."
    ),
}

# ---------------------------------------------------------------------------
# Step 2: L2 color, directional only -- 2026 (Jan-Mar, same maturity cut) MWD
# trialers with a V7 label, broken out by L2. account_labels deduped per
# Global Constraints (QUALIFY ROW_NUMBER() PARTITION BY company_account).
# Coverage-biased: V7 labels exist disproportionately for converters, so this
# is NOT a clean unbiased read the way Step 1 is -- shown only as directional
# color on where within MWD the (biased) signal concentrates.
# ---------------------------------------------------------------------------
l2_sql = f"""
WITH labels AS (
  SELECT company_account, l1, l2, confidence, classified_at
  FROM `project-for-method-dw.v7_classification.account_labels`
  WHERE company_account IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY company_account ORDER BY confidence DESC, classified_at DESC) = 1
),
ent_map AS (
  SELECT company_account, customer_record_id
  FROM `project-for-method-dw.v7_classification.account_entity_map`
),
mwd_2026 AS (
  SELECT f.EntityRecordID, f.converted, f.convert_month, f.signup_month
  FROM `project-for-method-dw.revenue.int_motion_funnel` f
  WHERE f.signup_month BETWEEN '2026-01-01' AND '2026-03-31'
)
SELECT
  lb.l2,
  COUNT(*) AS trialers,
  COUNTIF(m.converted AND DATE_DIFF(m.convert_month, m.signup_month, MONTH) <= 3) AS converted_90d
FROM mwd_2026 m
JOIN ent_map em ON em.customer_record_id = m.EntityRecordID
JOIN labels lb ON lb.company_account = em.company_account
WHERE lb.l1 = '{MWD_L1}'
GROUP BY lb.l2
ORDER BY trialers DESC
"""

l2_rows = run_query(l2_sql)
l2_out = []
for r in l2_rows:
    trialers = int(r["trialers"])
    converted_90d = int(r["converted_90d"])
    rate = round(converted_90d / trialers * 100, 2) if trialers else None
    l2_out.append({
        "l2": r["l2"],
        "trialers": trialers,
        "converted_90d": converted_90d,
        "conv_rate_pct": rate,
    })

# coverage stat: how many of the H1'26-partial legacy-MWD trialers actually
# have a V7 label at all (denominator for the coverage-bias caveat)
coverage_sql = f"""
WITH trial_vert AS (
  SELECT EntityRecordID,
         LOGICAL_OR(Vertical IN ({legacy_in})) AS is_mwd_legacy
  FROM `project-for-method-dw.revenue.int_trials`
  GROUP BY EntityRecordID
),
mwd_2026 AS (
  SELECT f.EntityRecordID
  FROM `project-for-method-dw.revenue.int_motion_funnel` f
  JOIN trial_vert v USING (EntityRecordID)
  WHERE f.signup_month BETWEEN '2026-01-01' AND '2026-03-31'
    AND v.is_mwd_legacy
),
labels AS (
  SELECT company_account, l1
  FROM `project-for-method-dw.v7_classification.account_labels`
  WHERE company_account IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY company_account ORDER BY confidence DESC, classified_at DESC) = 1
),
ent_map AS (
  SELECT company_account, customer_record_id
  FROM `project-for-method-dw.v7_classification.account_entity_map`
)
SELECT
  COUNT(*) AS legacy_mwd_trialers,
  COUNTIF(lb.l1 IS NOT NULL) AS with_any_v7_label,
  COUNTIF(lb.l1 = '{MWD_L1}') AS with_v7_mwd_label
FROM mwd_2026 m
LEFT JOIN ent_map em ON em.customer_record_id = m.EntityRecordID
LEFT JOIN labels lb ON lb.company_account = em.company_account
"""
coverage_rows = run_query(coverage_sql)
coverage = {k: int(v) for k, v in coverage_rows[0].items()}
coverage["v7_label_coverage_pct"] = (
    round(coverage["with_any_v7_label"] / coverage["legacy_mwd_trialers"] * 100, 1)
    if coverage["legacy_mwd_trialers"] else None
)

out["l2_directional_2026"] = {
    "scope": "H1'26-partial (signup 2026-01-01..2026-03-31), legacy-MWD trialers only, same 90-day/3-month window as Step 1",
    "label": "DIRECTIONAL ONLY -- 2026 only, coverage-biased (V7 labels concentrate on converters, see module docstring)",
    "coverage": coverage,
    "by_l2": l2_out,
}

# ---------------------------------------------------------------------------
# Step 3a: plausibility vs v_metric__trial_to_conversion_rate
# (different window definition -- period-ratio, not cohort-tracked -- so we
# expect same order of magnitude, not identical values)
# ---------------------------------------------------------------------------
metric_sql = """
SELECT period, value
FROM `project-for-method-dw.revenue_metrics.v_metric__trial_to_conversion_rate`
WHERE period >= '2024-01-01' AND period < '2026-07-01'
ORDER BY period
"""
metric_rows = run_query(metric_sql)
metric_vals = []
for r in metric_rows:
    v = r["value"]
    if v is not None:
        metric_vals.append(float(v))
period_labels = [str(r["period"]) for r in metric_rows]

avg_metric_rate_pct = round(sum(metric_vals) / len(metric_vals) * 100, 2) if metric_vals else None

# our own weighted-average 90-day rate across all non-partial halves + the
# partial half, for the same overall comparison
all_trialers = sum(t["overall"]["trialers"] for t in table)
all_converted = sum(t["overall"]["converted_90d"] for t in table)
our_overall_rate_pct = round(all_converted / all_trialers * 100, 2) if all_trialers else None

ratio = (our_overall_rate_pct / avg_metric_rate_pct) if avg_metric_rate_pct else None
plausible = (0.33 <= ratio <= 3.0) if ratio else None

out["verification"] = {
    "plausibility_vs_v_metric_trial_to_conversion_rate": {
        "metric_periods_checked": len(period_labels),
        "avg_monthly_period_ratio_metric_pct": avg_metric_rate_pct,
        "our_overall_90d_cohort_rate_pct": our_overall_rate_pct,
        "ratio_ours_over_metric": round(ratio, 2) if ratio else None,
        "within_3x_band": plausible,
        "note": (
            "v_metric__trial_to_conversion_rate is a same-calendar-period ratio "
            "(conversions in month M / trials in month M, account-grain int_trials, "
            "int_conversions) -- NOT cohort-tracked. Ours is a maturity-matched 90-day "
            "cohort rate at entity grain (int_motion_funnel). Expect same order of "
            "magnitude, not a match. Flag if off by >3x."
        ),
    },
}

# ---------------------------------------------------------------------------
# Step 3b: trialer-count cross check -- direct int_trials entity count per
# half (Task 2 may still be running, so this is computed independently here
# rather than diffed against Task 2's output file).
# ---------------------------------------------------------------------------
direct_count_sql = f"""
WITH first_trial AS (
  SELECT EntityRecordID, MIN(SignupDate) AS first_signup
  FROM `project-for-method-dw.revenue.int_trials`
  GROUP BY EntityRecordID
),
halved AS (
  SELECT
    EntityRecordID,
    CASE
      {half_case.replace('f.signup_month', 'first_signup')}
      ELSE NULL
    END AS half
  FROM first_trial
)
SELECT half, COUNT(*) AS trialers
FROM halved
WHERE half IS NOT NULL
GROUP BY half
ORDER BY half
"""
direct_rows = run_query(direct_count_sql)
direct_counts = {r["half"]: int(r["trialers"]) for r in direct_rows}

cross_check = []
all_match = True
for half in half_order:
    ours = table[half_order.index(half)]["overall"]["trialers"]
    direct = direct_counts.get(half, 0)
    diff = ours - direct
    match = diff == 0
    all_match = all_match and match
    cross_check.append({
        "half": half,
        "our_int_motion_funnel_entity_count": ours,
        "direct_int_trials_first_signup_entity_count": direct,
        "diff": diff,
        "exact_match": match,
    })

out["verification"]["trialer_count_cross_check"] = {
    "method": "COUNT(*) of int_motion_funnel entities per half (Step 1 'overall') vs COUNT(*) of "
              "distinct EntityRecordID keyed on MIN(SignupDate) per entity from int_trials directly, "
              "same half boundaries. Both are entity-grain and should match near-exactly since "
              "int_motion_funnel's trials CTE is itself MIN(SignupDate) grouped by EntityRecordID off int_trials.",
    "by_half": cross_check,
    "all_halves_exact_match": all_match,
}

out["caveats"] = [
    "Instrument choice: legacy self-reported Vertical (int_trials), not V7 industry_l1 -- V7 labels on "
    "trialers are converter-biased (labels exist mostly for those who became customers), which would "
    "mechanically inflate labeled-industry conversion. Self-reported Vertical is fixed at signup and "
    "unbiased for this cut. This means the MWD segment here is the *legacy* instrument's MWD, which "
    "(per Task 1) undercounts true V7 Manufacturing & Distribution customers.",
    "H1'24 and H2'24 are PRE the 2024/2025 form-change level shift found in Task 1 (legacy-MWD share of "
    "trials moved from ~8-10% to ~13-14% at that boundary, likely a form change, not a real demand shift). "
    "Do not read the 2024->2025 conversion-mix change as a real trend without this caveat -- the "
    "population being labeled 'MWD' literally changed composition across that boundary.",
    "~1/3 of trials have blank/unusable Vertical in every period (structural, not a data-quality bug in "
    "any one half). 'No vertical' is kept as its own segment and never folded into Non-MWD.",
    "H1'26 is cut to Jan-Mar signups only (not the full Jan-Jun half) so every cohort member has had a "
    "full 90-day window to convert as of this script's run date (2026-07-22). Apr-Jun 2026 signups are "
    "excluded from this table entirely -- not mechanically penalized with an unmatured window.",
    "L2 color (Step 2) is directional only: 2026-only, and biased toward whichever L2s within MWD "
    "happen to have V7 label coverage (which itself concentrates on converters). Do not present L2 "
    "splits as if they carry the same evidentiary weight as the L1 MWD-vs-Non-MWD table.",
    "July 2026 is excluded throughout (incomplete month).",
]

# ---------------------------------------------------------------------------
# write
# ---------------------------------------------------------------------------
OUT_DIR.mkdir(parents=True, exist_ok=True)
out_path = OUT_DIR / "05_conversion.json"
out_path.write_text(json.dumps(out, indent=2, default=str))

print("=" * 72)
print("MWD TRIAL -> PAID CONVERSION (90-day, maturity-matched, legacy instrument)")
print("=" * 72)
for t in table:
    tag = " [PRE-CHANGE]" if t["pre_change_period"] else ""
    print(f"\n{t['half']}{tag}")
    for seg in ("MWD", "Non-MWD", "No vertical"):
        s = t[seg]
        print(f"  {seg:<12} trialers={s['trialers']:>6}  converted_90d={s['converted_90d']:>5}  rate={s['conv_rate_pct']}%")
    print(f"  {'overall':<12} trialers={t['overall']['trialers']:>6}  converted_90d={t['overall']['converted_90d']:>5}  rate={t['overall']['conv_rate_pct']}%")
    print(f"  gap (MWD - Non-MWD): {t['mwd_minus_nonmwd_gap_pts']} pts")

print("\nGap trend:")
for pt in out["gap_trend"]["series"]:
    print(f"  {pt['half']}: {pt['gap_pts']} pts")

print("\nL2 directional color (2026 Jan-Mar, MWD legacy, V7-labeled only):")
print(f"  coverage: {coverage}")
for r in l2_out:
    print(f"  {r['l2']:<40} trialers={r['trialers']:>4}  rate={r['conv_rate_pct']}%")

print("\nVerification:")
v = out["verification"]["plausibility_vs_v_metric_trial_to_conversion_rate"]
print(f"  v_metric avg monthly rate: {v['avg_monthly_period_ratio_metric_pct']}%   ours (cohort 90d): {v['our_overall_90d_cohort_rate_pct']}%   ratio={v['ratio_ours_over_metric']}   within_3x_band={v['within_3x_band']}")
print(f"  trialer count cross-check, all halves exact match: {all_match}")
for c in cross_check:
    flag = "OK" if c["exact_match"] else "MISMATCH"
    print(f"    {c['half']:<15} ours={c['our_int_motion_funnel_entity_count']:>6}  direct={c['direct_int_trials_first_signup_entity_count']:>6}  diff={c['diff']:>4}  {flag}")

print(f"\nWrote {out_path}")
