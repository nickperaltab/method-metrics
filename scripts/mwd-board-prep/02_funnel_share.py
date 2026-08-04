#!/usr/bin/env python3
"""
Task 2: MWD share of trials and syncs over time (CEO Q1a).

Instrument B (legacy self-report, trial-side): int_trials.Vertical / int_syncs.Vertical
IN ('Manufacturing (MWD)', 'Wholesale and distribution services (MWD)').

Computes, per quarter (2024Q3..2026Q2) and per half (H1'25, H2'25, H1'26):
  trials_total, trials_mwd_legacy, trials_mwd_share_pct (of total, i.e. denominator
  includes blanks/unclassified — coverage is disclosed separately),
  syncs_total (events), syncs_mwd_legacy (events), syncs_mwd_share_pct,
  syncs_entities_total (DISTINCT EntityRecordID), syncs_entities_mwd,
  syncs_entities_mwd_share_pct.

Also runs a 2026-Q2-only V7 (instrument A) crosscheck of MWD share among *labeled*
trials, and a parity check of quarterly totals against the canonical
revenue_metrics.v_metric__trials / v_metric__syncs (monthly, summed to quarters).

Writes scripts/mwd-board-prep/out/02_funnel_share.json. Read-only against BigQuery.
"""
import json
from pathlib import Path

from common import run_query, LABELS, MWD_L1, MWD_LEGACY

OUT_DIR = Path(__file__).parent / "out"

legacy_in = ", ".join(f"'{v}'" for v in MWD_LEGACY)

out = {}

# ---------------------------------------------------------------------------
# Step 1: Trials by quarter (instrument B)
# ---------------------------------------------------------------------------
trials_sql = f"""
SELECT DATE_TRUNC(SignupDate, QUARTER) AS q,
       COUNT(*) AS trials,
       COUNTIF(Vertical IN ({legacy_in})) AS mwd
FROM `project-for-method-dw.revenue.int_trials`
WHERE SignupDate >= '2024-07-01' AND SignupDate < '2026-07-01'
GROUP BY q ORDER BY q
"""
trials_rows_raw = run_query(trials_sql)

# ---------------------------------------------------------------------------
# Step 1: Syncs by quarter (instrument B) - events AND distinct entities
# ---------------------------------------------------------------------------
syncs_sql = f"""
SELECT DATE_TRUNC(SyncDate, QUARTER) AS q,
       COUNT(*) AS syncs_events,
       COUNTIF(Vertical IN ({legacy_in})) AS mwd_events,
       COUNT(DISTINCT EntityRecordID) AS syncs_entities,
       COUNT(DISTINCT IF(Vertical IN ({legacy_in}), EntityRecordID, NULL)) AS mwd_entities
FROM `project-for-method-dw.revenue.int_syncs`
WHERE SyncDate >= '2024-07-01' AND SyncDate < '2026-07-01'
GROUP BY q ORDER BY q
"""
syncs_rows_raw = run_query(syncs_sql)


def qstr(q):
    return q.isoformat() if hasattr(q, "isoformat") else str(q)


trials_by_q = {}
for r in trials_rows_raw:
    q = qstr(r["q"])
    trials = int(r["trials"])
    mwd = int(r["mwd"])
    trials_by_q[q] = {
        "quarter": q,
        "trials_total": trials,
        "trials_mwd_legacy": mwd,
        "trials_mwd_share_pct_of_total": round(mwd / trials * 100, 2) if trials else None,
    }

syncs_by_q = {}
for r in syncs_rows_raw:
    q = qstr(r["q"])
    ev_total = int(r["syncs_events"])
    ev_mwd = int(r["mwd_events"])
    ent_total = int(r["syncs_entities"])
    ent_mwd = int(r["mwd_entities"])
    syncs_by_q[q] = {
        "quarter": q,
        "syncs_events_total": ev_total,
        "syncs_events_mwd_legacy": ev_mwd,
        "syncs_events_mwd_share_pct": round(ev_mwd / ev_total * 100, 2) if ev_total else None,
        "syncs_entities_total": ent_total,
        "syncs_entities_mwd_legacy": ent_mwd,
        "syncs_entities_mwd_share_pct": round(ent_mwd / ent_total * 100, 2) if ent_total else None,
    }

quarters_sorted = sorted(set(trials_by_q) | set(syncs_by_q))

quarterly = []
for q in quarters_sorted:
    row = {"quarter": q}
    row.update({k: v for k, v in trials_by_q.get(q, {}).items() if k != "quarter"})
    row.update({k: v for k, v in syncs_by_q.get(q, {}).items() if k != "quarter"})
    quarterly.append(row)

out["quarterly"] = quarterly
out["instrument_note"] = (
    "All shares below use instrument B (legacy self-report Vertical field, trial-side: "
    "int_trials/int_syncs.Vertical IN ('Manufacturing (MWD)','Wholesale and distribution "
    "services (MWD)')), unless explicitly labeled 'V7 crosscheck'. Legacy-based MWD shares "
    "are understated in LEVEL (V7 finds ~1.54x more MWD customers, per Task 1 "
    "undercount_factor_v7_over_legacy) but usable for TREND. Denominators are the FULL "
    "population of trials/syncs (including blank/unusable Vertical rows) - i.e. 'share of "
    "total', not 'share of classified'. Coverage (non-blank Vertical share) is disclosed "
    "in Task 1's output (scripts/mwd-board-prep/out/01_instruments.json, "
    "blank_share_by_quarter) - roughly 64-71% of trials have a usable Vertical value across "
    "this window, so 'share of classified' would run ~1.4-1.5x higher than 'share of total' "
    "for the same period. Syncs are reported BOTH as events (one row per sync EVENT) and as "
    "DISTINCT EntityRecordID entities, labeled separately - conflating the two was the exact "
    "Syncs #55 trap identified previously."
)

# ---------------------------------------------------------------------------
# Step 2: Halves - H1'25, H2'25, H1'26 (+ coverage of quarters used)
# ---------------------------------------------------------------------------
HALVES = {
    "H1_2025": ["2025-01-01", "2025-04-01"],
    "H2_2025": ["2025-07-01", "2025-10-01"],
    "H1_2026": ["2026-01-01", "2026-04-01"],
}


def sum_half(by_q, half_quarters, keys):
    rows = [by_q[q] for q in half_quarters if q in by_q]
    summed = {}
    for k in keys:
        summed[k] = sum(r[k] for r in rows)
    return summed, [r["quarter"] for r in rows]


halves = {}
for label, qs in HALVES.items():
    t_sum, t_qs = sum_half(trials_by_q, qs, ["trials_total", "trials_mwd_legacy"])
    s_sum, s_qs = sum_half(
        syncs_by_q, qs,
        ["syncs_events_total", "syncs_events_mwd_legacy", "syncs_entities_total", "syncs_entities_mwd_legacy"],
    )
    rec = {
        "quarters_included": t_qs or s_qs,
        "trials_total": t_sum.get("trials_total"),
        "trials_mwd_legacy": t_sum.get("trials_mwd_legacy"),
        "trials_mwd_share_pct_of_total": (
            round(t_sum["trials_mwd_legacy"] / t_sum["trials_total"] * 100, 2)
            if t_sum.get("trials_total") else None
        ),
        "syncs_events_total": s_sum.get("syncs_events_total"),
        "syncs_events_mwd_legacy": s_sum.get("syncs_events_mwd_legacy"),
        "syncs_events_mwd_share_pct": (
            round(s_sum["syncs_events_mwd_legacy"] / s_sum["syncs_events_total"] * 100, 2)
            if s_sum.get("syncs_events_total") else None
        ),
        "syncs_entities_total": s_sum.get("syncs_entities_total"),
        "syncs_entities_mwd_legacy": s_sum.get("syncs_entities_mwd_legacy"),
        "syncs_entities_mwd_share_pct": (
            round(s_sum["syncs_entities_mwd_legacy"] / s_sum["syncs_entities_total"] * 100, 2)
            if s_sum.get("syncs_entities_total") else None
        ),
    }
    halves[label] = rec

out["halves"] = halves

# Deltas: H1'26 vs H1'25 (CEO expects volume down, mix shift up)
h1_25 = halves["H1_2025"]
h1_26 = halves["H1_2026"]
h2_25 = halves["H2_2025"]


def delta_block(a, b, total_key, mwd_key, share_key):
    """b vs a (b is 'current')."""
    return {
        f"{total_key}_abs_change": (b[total_key] - a[total_key]) if a.get(total_key) is not None and b.get(total_key) is not None else None,
        f"{total_key}_pct_change": (
            round((b[total_key] - a[total_key]) / a[total_key] * 100, 2)
            if a.get(total_key) else None
        ),
        f"{mwd_key}_abs_change": (b[mwd_key] - a[mwd_key]) if a.get(mwd_key) is not None and b.get(mwd_key) is not None else None,
        f"{share_key}_pts_change": (
            round(b[share_key] - a[share_key], 2)
            if a.get(share_key) is not None and b.get(share_key) is not None else None
        ),
    }


deltas = {
    "h1_26_vs_h1_25": {
        "trials": delta_block(h1_25, h1_26, "trials_total", "trials_mwd_legacy", "trials_mwd_share_pct_of_total"),
        "syncs_events": delta_block(h1_25, h1_26, "syncs_events_total", "syncs_events_mwd_legacy", "syncs_events_mwd_share_pct"),
        "syncs_entities": delta_block(h1_25, h1_26, "syncs_entities_total", "syncs_entities_mwd_legacy", "syncs_entities_mwd_share_pct"),
    },
    "h1_26_vs_h2_25": {
        "trials": delta_block(h2_25, h1_26, "trials_total", "trials_mwd_legacy", "trials_mwd_share_pct_of_total"),
        "syncs_events": delta_block(h2_25, h1_26, "syncs_events_total", "syncs_events_mwd_legacy", "syncs_events_mwd_share_pct"),
        "syncs_entities": delta_block(h2_25, h1_26, "syncs_entities_total", "syncs_entities_mwd_legacy", "syncs_entities_mwd_share_pct"),
    },
}
out["deltas"] = deltas

# Q4'25 baseline vs Q2'26 trend point (both must be present as explicit trend points)
q4_25 = "2025-10-01"
q2_26 = "2026-04-01"
trend = {
    "q4_2025_baseline": {
        "trials": trials_by_q.get(q4_25),
        "syncs": syncs_by_q.get(q4_25),
    },
    "q2_2026_latest_complete_quarter": {
        "trials": trials_by_q.get(q2_26),
        "syncs": syncs_by_q.get(q2_26),
    },
}
if trials_by_q.get(q4_25) and trials_by_q.get(q2_26):
    trend["trials_mwd_share_pts_change_q4_25_to_q2_26"] = round(
        trials_by_q[q2_26]["trials_mwd_share_pct_of_total"] - trials_by_q[q4_25]["trials_mwd_share_pct_of_total"], 2
    )
if syncs_by_q.get(q4_25) and syncs_by_q.get(q2_26):
    trend["syncs_events_mwd_share_pts_change_q4_25_to_q2_26"] = round(
        syncs_by_q[q2_26]["syncs_events_mwd_share_pct"] - syncs_by_q[q4_25]["syncs_events_mwd_share_pct"], 2
    )
    trend["syncs_entities_mwd_share_pts_change_q4_25_to_q2_26"] = round(
        syncs_by_q[q2_26]["syncs_entities_mwd_share_pct"] - syncs_by_q[q4_25]["syncs_entities_mwd_share_pct"], 2
    )
out["trend_q4_2025_vs_q2_2026"] = trend

# ---------------------------------------------------------------------------
# Boundary investigation: monthly legacy-MWD trial share, 2024-10..2025-03
# (Task 1 found a level-shift ~8-10% (2024) -> ~13-14% (2025-Q1 onward) at the
#  2024/2025 boundary. Investigate at MONTHLY grain to see if it's a single
#  sharp jump (form/dropdown change) or gradual (plausibly real).)
# ---------------------------------------------------------------------------
boundary_sql = f"""
SELECT DATE_TRUNC(SignupDate, MONTH) AS m,
       COUNT(*) AS trials,
       COUNTIF(Vertical IN ({legacy_in})) AS mwd
FROM `project-for-method-dw.revenue.int_trials`
WHERE SignupDate >= '2024-10-01' AND SignupDate < '2025-04-01'
GROUP BY m ORDER BY m
"""
boundary_rows_raw = run_query(boundary_sql)
boundary_rows = []
for r in boundary_rows_raw:
    m = qstr(r["m"])
    trials = int(r["trials"])
    mwd = int(r["mwd"])
    boundary_rows.append({
        "month": m,
        "trials": trials,
        "mwd_legacy": mwd,
        "mwd_legacy_share_pct": round(mwd / trials * 100, 2) if trials else None,
    })

# Classify: find the largest month-over-month jump in share_pct
jumps = []
for i in range(1, len(boundary_rows)):
    prev = boundary_rows[i - 1]["mwd_legacy_share_pct"]
    cur = boundary_rows[i]["mwd_legacy_share_pct"]
    if prev is not None and cur is not None:
        jumps.append({"from_month": boundary_rows[i - 1]["month"], "to_month": boundary_rows[i]["month"], "pts_change": round(cur - prev, 2)})

max_jump = max(jumps, key=lambda j: abs(j["pts_change"])) if jumps else None
total_move = (
    round(boundary_rows[-1]["mwd_legacy_share_pct"] - boundary_rows[0]["mwd_legacy_share_pct"], 2)
    if boundary_rows and boundary_rows[0]["mwd_legacy_share_pct"] is not None and boundary_rows[-1]["mwd_legacy_share_pct"] is not None
    else None
)
# "single sharp month" heuristic: one month's jump accounts for >= 60% of the total move
single_sharp = None
if max_jump is not None and total_move not in (None, 0):
    single_sharp = abs(max_jump["pts_change"]) >= 0.6 * abs(total_move)

boundary_investigation = {
    "monthly": boundary_rows,
    "largest_single_month_jump": max_jump,
    "total_move_pts_oct24_to_mar25": total_move,
    "single_sharp_month": single_sharp,
    "verdict": (
        "SINGLE SHARP MONTH - likely a form/dropdown change at that point; 2024 legacy-MWD "
        "trial-share data points should be treated as pre-change and not directly comparable "
        "to 2025+."
        if single_sharp
        else "GRADUAL - move is spread across multiple months; plausibly a real mix shift "
        "rather than a single instrumentation change, though a form change still cannot be "
        "ruled out without engineering confirmation."
        if single_sharp is False
        else "UNKNOWN - insufficient monthly data to classify."
    ),
}
out["boundary_investigation_oct2024_mar2025"] = boundary_investigation

# ---------------------------------------------------------------------------
# Step 3: V7 crosscheck, 2026 Q2 only - MWD share of LABELED trials
# ---------------------------------------------------------------------------
v7_crosscheck_sql = f"""
SELECT
  COUNT(*) AS total_trials,
  COUNTIF(l.customer_record_id IS NOT NULL) AS joined_any,
  COUNTIF(l.customer_record_id IS NOT NULL AND l.l1 != 'UNCLASSIFIABLE') AS labeled_trials,
  COUNTIF(l.l1 = '{MWD_L1}') AS v7_mwd_trials
FROM `project-for-method-dw.revenue.int_trials` t
LEFT JOIN `{LABELS}` l
  ON l.customer_record_id = t.EntityRecordID
WHERE t.SignupDate >= '2026-04-01' AND t.SignupDate < '2026-07-01'
"""
v7_rows = run_query(v7_crosscheck_sql)
v7_row = v7_rows[0]
v7_total_trials = int(v7_row["total_trials"])
joined_any = int(v7_row["joined_any"])
labeled_trials = int(v7_row["labeled_trials"])
v7_mwd_trials = int(v7_row["v7_mwd_trials"])
v7_share = round(v7_mwd_trials / labeled_trials * 100, 2) if labeled_trials else None

q2_26_total_trials = trials_by_q.get(q2_26, {}).get("trials_total")
q2_26_legacy_share = trials_by_q.get(q2_26, {}).get("trials_mwd_share_pct_of_total")
# "coverage" as cited in the plan (~64.6%) = trials that join to ANY V7 label row
# (including UNCLASSIFIABLE), not just non-UNCLASSIFIABLE. Confirmed by direct query:
# joined_any/total_trials ~= 64.9%, matching the plan's cited 64.6% (small variance is
# expected - the plan figure was computed at a slightly different point in time given the
# rolling nature of int_trials/labels). joined_classified is the stricter denominator
# actually used for the share calc above.
coverage_pct = round(joined_any / v7_total_trials * 100, 2) if v7_total_trials else None
coverage_pct_classified_only = round(labeled_trials / v7_total_trials * 100, 2) if v7_total_trials else None

disagreement_pts = (
    round(v7_share - q2_26_legacy_share, 2)
    if v7_share is not None and q2_26_legacy_share is not None else None
)
wild_disagreement = (abs(disagreement_pts) > 10) if disagreement_pts is not None else None

out["v7_crosscheck_q2_2026"] = {
    "total_trials": v7_total_trials,
    "joined_to_any_v7_label": joined_any,
    "v7_trial_coverage_pct_of_q2_total": coverage_pct,
    "labeled_trials_excl_unclassifiable": labeled_trials,
    "v7_trial_coverage_pct_of_q2_total_classified_only": coverage_pct_classified_only,
    "v7_mwd_trials": v7_mwd_trials,
    "v7_mwd_share_pct_of_labeled": v7_share,
    "instrument_b_q2_2026_share_pct_of_total_trials": q2_26_legacy_share,
    "instrument_b_q2_2026_total_trials": q2_26_total_trials,
    "disagreement_pts_v7_minus_legacy": disagreement_pts,
    "wild_disagreement_gt_10pts": wild_disagreement,
    "note": (
        "v7_trial_coverage_pct_of_q2_total (joined_to_any_v7_label / total_trials) ~= "
        f"{coverage_pct}%, matching the plan's cited 'V7 trial coverage is 64.6%' for Q2 2026 "
        "(small variance expected given the rolling nature of the underlying tables). "
        "v7_mwd_share_pct_of_labeled uses the STRICTER denominator (non-UNCLASSIFIABLE only, "
        f"{coverage_pct_classified_only}% of total) since an UNCLASSIFIABLE row can't inform an "
        "MWD/not-MWD split. Instrument B's share above is 'of total trials' (denominator = all "
        "Q2 2026 trials incl. blank Vertical) - a DIFFERENT denominator by design - so this is "
        "a level sanity-check, not an apples-to-apples share recompute. V7 is expected to run "
        "higher given the ~1.54x undercount factor found in Task 1 (V7 finds more MWD "
        "customers than the legacy field surfaces)."
    ),
}

# ---------------------------------------------------------------------------
# Step 4: Parity check vs canonical revenue_metrics.v_metric__trials / v_metric__syncs
# ---------------------------------------------------------------------------
canonical_trials_sql = """
SELECT period, value FROM `project-for-method-dw.revenue_metrics.v_metric__trials`
WHERE period >= '2024-07-01' AND period < '2026-07-01'
ORDER BY period
"""
canonical_syncs_sql = """
SELECT period, value FROM `project-for-method-dw.revenue_metrics.v_metric__syncs`
WHERE period >= '2024-07-01' AND period < '2026-07-01'
ORDER BY period
"""
canon_trials_rows = run_query(canonical_trials_sql)
canon_syncs_rows = run_query(canonical_syncs_sql)


def month_to_quarter(d):
    month_num = d.month if hasattr(d, "month") else int(str(d)[5:7])
    year = d.year if hasattr(d, "year") else int(str(d)[:4])
    q_start_month = ((month_num - 1) // 3) * 3 + 1
    return f"{year:04d}-{q_start_month:02d}-01"


def sum_months_to_quarters(rows):
    agg = {}
    for r in rows:
        q = month_to_quarter(r["period"])
        agg[q] = agg.get(q, 0) + int(r["value"])
    return agg


canon_trials_by_q = sum_months_to_quarters(canon_trials_rows)
canon_syncs_by_q = sum_months_to_quarters(canon_syncs_rows)

# The canonical v_metric__* views are WHERE SignupDate/SyncDate >= DATE_SUB(CURRENT_DATE(),
# INTERVAL 24 MONTH) - i.e. relative to the day the view is queried, not a calendar-month
# boundary. That cutoff falls mid-month, so the earliest month in the canonical window is
# PARTIAL (confirmed by direct query: 2024-07 int_trials count = 750, but v_metric__trials
# period=2024-07-01 value = 244, because the cutoff lands on 2026-07-22 -> 2024-07-22).
# Any quarter containing that boundary month cannot be exact-matched and is reported as
# incomplete canonical coverage rather than a mismatch.
cutoff_row = run_query(
    "SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH) AS cutoff"
)[0]
cutoff_date = cutoff_row["cutoff"]
boundary_month = f"{cutoff_date.year:04d}-{cutoff_date.month:02d}-01"
boundary_quarter = month_to_quarter(cutoff_date)
incomplete_canon_quarters = [boundary_quarter] if boundary_quarter in quarters_sorted else []

trials_parity = []
trials_mismatches = []
for q in quarters_sorted:
    script_val = trials_by_q.get(q, {}).get("trials_total")
    canon_val = canon_trials_by_q.get(q)
    is_partial = q in incomplete_canon_quarters
    match = (script_val == canon_val) if (script_val is not None and canon_val is not None and not is_partial) else None
    row = {
        "quarter": q, "script_trials_total": script_val, "canonical_v_metric__trials_sum": canon_val,
        "exact_match": match,
        "partial_canonical_coverage": is_partial or None,
    }
    trials_parity.append(row)
    if match is False:
        trials_mismatches.append(row)

syncs_parity = []
syncs_mismatches = []
for q in quarters_sorted:
    script_val = syncs_by_q.get(q, {}).get("syncs_events_total")
    canon_val = canon_syncs_by_q.get(q)
    is_partial = q in incomplete_canon_quarters
    match = (script_val == canon_val) if (script_val is not None and canon_val is not None and not is_partial) else None
    row = {
        "quarter": q, "script_syncs_events_total": script_val, "canonical_v_metric__syncs_sum": canon_val,
        "exact_match": match,
        "partial_canonical_coverage": is_partial or None,
    }
    syncs_parity.append(row)
    if match is False:
        syncs_mismatches.append(row)

parity_verdict = "EXACT MATCH - all quarters" if (not trials_mismatches and not syncs_mismatches and not incomplete_canon_quarters) else (
    "EXACT MATCH for all quarters with full canonical coverage; the one quarter overlapping "
    "the rolling-24-month cutoff has partial canonical coverage by design (see "
    "incomplete_canonical_quarters) and is excluded from the match/mismatch verdict"
    if (not trials_mismatches and not syncs_mismatches and incomplete_canon_quarters)
    else "MISMATCH FOUND - see trials_mismatches / syncs_mismatches"
)

out["parity_check"] = {
    "method": (
        "revenue_metrics.v_metric__trials and v_metric__syncs are monthly (period, value); "
        "both are COUNT(*) aggregations of int_trials.SignupDate / int_syncs.SyncDate "
        "(same source tables/filters as this script's quarterly totals - confirmed by "
        "reading models/metrics/v_metric__trials.sql and v_metric__syncs.sql). Monthly "
        "values were summed into quarters and compared to this script's trials_total / "
        "syncs_events_total per quarter. Both canonical views are WHERE date >= "
        "DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH) - a rolling window keyed to today's "
        "date (not a calendar-month boundary) - so the single month straddling that cutoff "
        f"(boundary_month={boundary_month}, cutoff_date={cutoff_date.isoformat()}) is "
        "necessarily partial on the canonical side and is reported separately rather than "
        "flagged as a mismatch."
    ),
    "boundary_month": boundary_month,
    "cutoff_date": cutoff_date.isoformat(),
    "incomplete_canonical_quarters": incomplete_canon_quarters,
    "trials_parity_by_quarter": trials_parity,
    "trials_mismatches": trials_mismatches,
    "syncs_parity_by_quarter": syncs_parity,
    "syncs_mismatches": syncs_mismatches,
    "verdict": parity_verdict,
}

# ---------------------------------------------------------------------------
# Caveats
# ---------------------------------------------------------------------------
out["caveats"] = [
    "Legacy-vertical (instrument B) blank/unusable share is STABLE between H1'25 and H1'26 "
    "(Task 1: -2.68pt move) - no drift caveat needed for the H1-vs-H1 comparison in this "
    "output.",
    (
        f"Boundary investigation (monthly, 2024-10..2025-03): {boundary_investigation['verdict']} "
        f"Total move Oct'24->Mar'25 = {total_move}pts; largest single-month jump = "
        f"{max_jump['pts_change'] if max_jump else 'n/a'}pts "
        f"({max_jump['from_month'] + ' -> ' + max_jump['to_month'] if max_jump else ''}). "
        + (
            "2024 legacy-MWD trial-share quarters are flagged 'pre_change_not_comparable' in "
            "the quarterly series (see comparability_flag)."
            if single_sharp
            else "No 'pre_change_not_comparable' flag was applied to the 2024 quarters since "
            "the move is gradual, not a single sharp break - but the CEO should still be told "
            "the 2024 level (~8-10%) is measurably different from 2025+ (~13-14%), whatever "
            "the cause."
        )
    ),
    "Legacy-based (instrument B) MWD shares are understated in LEVEL: V7 (instrument A) finds "
    "~1.54x more MWD customers than the legacy field (Task 1 undercount_factor_v7_over_legacy "
    "= 1.537). Legacy shares remain usable for TREND (direction/magnitude of change over time), "
    "per the same Task 1 finding.",
    "All shares in 'quarterly' and 'halves' are share OF TOTAL trials/syncs (denominator "
    "includes blank/unusable Vertical rows), not share of classified. Share-of-classified "
    "would run higher - see Task 1 output for the blank/unusable share by quarter needed to "
    "rescale.",
    "Syncs are reported as both EVENTS (COUNT(*), matches the canonical v_metric__syncs "
    "definition) and DISTINCT ENTITIES (COUNT(DISTINCT EntityRecordID)) - do not treat these "
    "as interchangeable; a customer can generate multiple sync events.",
    "V7 crosscheck (Q2 2026) uses a different denominator than instrument B's share-of-total: "
    + (f"{coverage_pct}%" if coverage_pct is not None else "unknown %")
    + " of Q2 trials join to any V7 label at all, and of those, "
    + (f"{coverage_pct_classified_only}%" if coverage_pct_classified_only is not None else "unknown %")
    + " of Q2 total trials are non-UNCLASSIFIABLE (the denominator actually used for "
    "v7_mwd_share_pct_of_labeled) - treat the crosscheck as a level sanity-check, not a "
    "like-for-like recomputation.",
]

# Mark 2024 quarters non-comparable in the quarterly series if boundary is a single sharp month
if single_sharp:
    for row in out["quarterly"]:
        if row["quarter"] < "2025-01-01":
            row["comparability_flag"] = "pre_change_not_comparable"

# ---------------------------------------------------------------------------
# write
# ---------------------------------------------------------------------------
OUT_DIR.mkdir(parents=True, exist_ok=True)
out_path = OUT_DIR / "02_funnel_share.json"
out_path.write_text(json.dumps(out, indent=2, default=str))

print("=" * 72)
print("MWD FUNNEL SHARE - TRIALS & SYNCS (instrument B unless noted)")
print("=" * 72)
print("\nQuarterly:")
for row in quarterly:
    flag = f"  [{row.get('comparability_flag')}]" if row.get("comparability_flag") else ""
    print(
        f"  {row['quarter']}  trials={row.get('trials_total')!s:>6} mwd={row.get('trials_mwd_legacy')!s:>4} "
        f"share={row.get('trials_mwd_share_pct_of_total')}%   "
        f"syncs_ev={row.get('syncs_events_total')!s:>6} mwd_ev={row.get('syncs_events_mwd_legacy')!s:>4} "
        f"share_ev={row.get('syncs_events_mwd_share_pct')}%   "
        f"syncs_ent={row.get('syncs_entities_total')!s:>6} share_ent={row.get('syncs_entities_mwd_share_pct')}%{flag}"
    )

print("\nHalves:")
for label, rec in halves.items():
    print(f"  {label}: trials_share={rec['trials_mwd_share_pct_of_total']}%  "
          f"syncs_events_share={rec['syncs_events_mwd_share_pct']}%  "
          f"syncs_entities_share={rec['syncs_entities_mwd_share_pct']}%")

print("\nDeltas H1'26 vs H1'25:")
print(json.dumps(deltas["h1_26_vs_h1_25"], indent=2))

print("\nBoundary investigation (2024-10..2025-03 monthly):")
for r in boundary_rows:
    print(f"  {r['month']}  trials={r['trials']:>5}  mwd={r['mwd_legacy']:>4}  share={r['mwd_legacy_share_pct']}%")
print(f"  Largest single-month jump: {max_jump}")
print(f"  Total move: {total_move}pts -> {boundary_investigation['verdict']}")

print("\nV7 crosscheck (Q2 2026):")
print(json.dumps(out["v7_crosscheck_q2_2026"], indent=2))

print("\nParity check verdict:", parity_verdict)
if trials_mismatches:
    print("  TRIALS MISMATCHES:", trials_mismatches)
if syncs_mismatches:
    print("  SYNCS MISMATCHES:", syncs_mismatches)
if incomplete_canon_quarters:
    print("  Quarters outside canonical rolling window:", incomplete_canon_quarters)

print(f"\nWrote {out_path}")
