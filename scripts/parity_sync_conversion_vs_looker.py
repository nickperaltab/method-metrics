#!/usr/bin/env python3
"""
Print every KPI in both Sales Scorecard conversion sections, for manual
side-by-side against the live Looker Sales Scorecard.

Output is the parity record. Paste it into the parity_verified block of
each models/metrics/*.yml and into docs/metric-definitions.md.

Read-only. No writes anywhere -- BigQuery or otherwise.

==========================================================================
Adjustments made to the Task 10 brief's draft of this script, and why.

The brief's draft was verified against the live BQ schema before trusting
it (per Task 10 instructions). All eight `revenue_metrics.v_metric__*`
views it references exist with exactly the (period, value) columns it
assumes -- confirmed with `client.get_table()` against project
project-for-method-dw, 2026-07-31. No view/column fix was needed.

Its period selection was also verified, not just assumed:

  - v_metric__conversions, v_metric__trial_conversion_rate_lagged,
    v_metric__sync_to_conversion_rate, v_metric__sync_conversion_rate_budgeted
    and _forecasted are MONTHLY views with one row per period. Each needs
    `WHERE period = DATE_TRUNC(CURRENT_DATE(), MONTH)` to read the row the
    scorecard's `valueSelector: 'current_or_latest'` would show. The
    brief's draft already filtered these five correctly.

  - v_metric__conversions_trajectory, v_metric__syncs_trajectory and
    v_metric__sync_conversion_rate_trajectory are TRAJECTORY views: by
    design they emit exactly one row, always keyed to the current month
    (see each model's .yml). No period filter is needed or correct here --
    adding `WHERE period = ...` on these would be redundant at best. The
    brief's draft already left these three unfiltered.

  So the brief's eight rows were correct as drafted. Running them (see
  module-level comment below) returned a value for all eight -- nothing
  silently NULLs out under today's data.

One addition beyond the brief's eight rows: KPIs 404 (Sync Forecast vs.
Trajectory) and 405 (Sync Forecasted Attainment) are Supabase FORMULA
metrics with no dbt view of their own -- pure arithmetic over 400 and 402,
per scripts/register_sync_conversion_metrics.py. They round out "every
KPI in both sections" (the sync section has seven; the brief's draft
covered five of them) without any new BigQuery access -- computed here in
Python from the same 400/402 values already fetched, using the exact
formulas registered in Supabase:
    404 = ({400} - {402}) * 100
    405 = SAFE_DIVIDE({400}, {402}) * 100
Not added: the trials section's 319/321/322/323. Those are pre-existing
Supabase-side metrics/formulas outside this plan's seven dbt models and
outside metrics 295/296/357's repoint -- the design doc notes they
"recompute automatically once 296 is right" and are not part of the
Task 10 gate.
==========================================================================
"""
from google.cloud import bigquery

PROJECT = "project-for-method-dw"
M = f"{PROJECT}.revenue_metrics"

# (label, view, extra WHERE clause or None, value transform)
# value transform mirrors what the scorecard's `format` prop displays:
#   'number'        -> raw value, no scaling
#   decimal rate     -> * 100 for a human-readable percentage
ROWS = [
    ("trials: Conversion                          (#56,  number)",
     "v_metric__conversions", "period = DATE_TRUNC(CURRENT_DATE(), MONTH)", 1),
    ("trials: Conversion Trajectory                (#296, number)",
     "v_metric__conversions_trajectory", None, 1),
    ("trials: Conversion Rate                      (#357, decimal_rate)",
     "v_metric__trial_conversion_rate_lagged", "period = DATE_TRUNC(CURRENT_DATE(), MONTH)", 100),
    ("sync:   Syncs Trajectory                     (#295, number)",
     "v_metric__syncs_trajectory", None, 1),
    ("sync:   Sync Conversion Rate                 (#301, decimal_rate)",
     "v_metric__sync_to_conversion_rate", "period = DATE_TRUNC(CURRENT_DATE(), MONTH)", 100),
    ("sync:   Sync Conversion Rate Trajectory      (#400, decimal_rate)",
     "v_metric__sync_conversion_rate_trajectory", None, 100),
    ("sync:   Budgeted Sync Conversion Rate        (#401, decimal_rate)",
     "v_metric__sync_conversion_rate_budgeted", "period = DATE_TRUNC(CURRENT_DATE(), MONTH)", 100),
    ("sync:   Forecasted Sync Conversion Rate      (#402, decimal_rate)",
     "v_metric__sync_conversion_rate_forecasted", "period = DATE_TRUNC(CURRENT_DATE(), MONTH)", 100),
]


def fetch_raw(client, view, where):
    """Return the raw (unscaled, unrounded) value for one view, or None."""
    where_clause = f"WHERE {where}" if where else ""
    sql = f"SELECT value FROM `{M}.{view}` {where_clause} ORDER BY period DESC LIMIT 1"
    rows = list(client.query(sql).result())
    return rows[0].value if rows else None


def fmt(value):
    if value is None:
        return "NULL"
    return f"{value:.2f}"


def main():
    client = bigquery.Client(project=PROJECT)

    results = []
    for label, view, where, scale in ROWS:
        raw = fetch_raw(client, view, where)
        scaled = raw * scale if raw is not None else None
        results.append((label, scaled))

    # Pull raw (unscaled) 400/402 once more for the two Supabase formula
    # KPIs that have no dbt view -- 404/405 need the DECIMAL rate, not the
    # *100 display value, per register_sync_conversion_metrics.py's
    # FORMULAS block ("Both inputs are decimal rates, so the formula
    # multiplies by 100 once for display").
    traj_raw = fetch_raw(client, "v_metric__sync_conversion_rate_trajectory", None)
    fcst_raw = fetch_raw(client, "v_metric__sync_conversion_rate_forecasted",
                          "period = DATE_TRUNC(CURRENT_DATE(), MONTH)")

    forecast_vs_trajectory = None
    forecasted_attainment = None
    if traj_raw is not None and fcst_raw is not None:
        forecast_vs_trajectory = (traj_raw - fcst_raw) * 100
        if fcst_raw != 0:
            forecasted_attainment = (traj_raw / fcst_raw) * 100

    results.append(("sync:   Forecast vs. Trajectory              (#404, percent)",
                     forecast_vs_trajectory))
    results.append(("sync:   Forecasted Attainment                 (#405, percent)",
                     forecasted_attainment))

    width = max(len(r[0]) for r in results) + 2
    print(f"{'KPI':<{width}}{'ours':>12}   looker (fill in by hand)")
    print("-" * (width + 12 + 3 + 26))
    for label, value in results:
        print(f"{label:<{width}}{fmt(value):>12}   ______")

    print("\nRead the live Looker Sales Scorecard and fill in the right column.")
    print("Record the read timestamp -- mid-month values move hour to hour.")
    print("\n404/405 have no Looker counterpart (Nelson's section does not exist")
    print("there) -- record them as first-observation values, not matches.")


if __name__ == "__main__":
    main()
