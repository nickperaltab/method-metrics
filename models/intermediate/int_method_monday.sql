{{ config(materialized='view') }}

-- Method Monday MTD + trajectory building block. ONE row, always the CURRENT
-- month — `period` is `DATE_TRUNC(CURRENT_DATE(), MONTH)` by construction, so
-- this view cannot answer for any other month.
--
-- Feeds twelve v_metric__* views: trials/syncs/conversions/churn × mtd and
-- trajectory, plus sync_rate_mtd, churn_rate_mtd, churn_rate_trajectory and the
-- two *_forecast_mtd views.
--
-- Adopted into dbt 2026-09-02. It was previously hand-written in the BigQuery
-- console and existed nowhere in version control, while being the shared
-- upstream for 15 of the 19 unmanaged views in `revenue_metrics`. The SQL below
-- is that view's DDL, unchanged apart from ref()/source() substitution — the
-- only behavioural change (the trajectory floor) was applied to the BQ view
-- first and verified before this model was written. See
-- knowledge/snapshots/2026-09-01-under-review-metrics-baseline.md.
--
-- MTD convention: every *_mtd figure EXCLUDES today. `elapsed_days` is
-- complete days only, matching int_channel_funnel_trajectory.

WITH bounds AS (
  SELECT
    DATE_TRUNC(CURRENT_DATE(), MONTH)                     AS period,
    EXTRACT(DAY FROM CURRENT_DATE()) - 1                  AS elapsed_days,
    EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE(), MONTH))     AS days_in_month,
    -- WHY TRAJECTORY IS BLANK EARLY IN THE MONTH (added 2026-09-02)
    --
    -- Trajectory is a calendar-day linear run-rate: MTD / elapsed_days *
    -- days_in_month. With only a day or two elapsed that extrapolates a
    -- single day across the whole month, and trials/syncs have a strong
    -- day-of-week shape -- a month opening on a weekend projects far too
    -- low, one opening on a Monday far too high. On 2026-09-02 the
    -- unguarded formula read 450 trials against an August actual of 440,
    -- off one day's data.
    --
    -- Seven days is the floor because it is the shortest window that
    -- contains every weekday exactly once, so day-of-week effects cancel
    -- instead of dominating. Below it we return NULL rather than a
    -- plausible-looking wrong number: consumers should show MTD and the
    -- prior month instead, and a blank cell reads as "too early to say".
    --
    -- This makes the family consistent with int_channel_funnel_trajectory,
    -- which uses the same complete-days convention (anchored to a dated
    -- Looker PDF: 14.5 / 8 * 31 = 56.19). Note this deliberately does NOT
    -- match Looker's own Method Monday page, whose trajectory divides by
    -- day-of-month while its MTD excludes today -- an inconsistent pairing
    -- that understates by day/(day-1).
    7                                                     AS min_trajectory_days
),
actuals AS (
  SELECT
    (SELECT COUNT(*) FROM {{ ref('int_trials') }} t, bounds b
     WHERE DATE_TRUNC(t.SignupDate, MONTH) = b.period
       AND t.SignupDate < CURRENT_DATE())                                    AS trials_mtd,
    (SELECT COUNT(*) FROM {{ ref('int_syncs') }} s, bounds b
     WHERE DATE_TRUNC(s.SyncDate, MONTH) = b.period
       AND s.SyncDate < CURRENT_DATE())                                      AS syncs_mtd,
    (SELECT COUNT(*) FROM {{ source('revenue', 'int_conversions') }} c, bounds b
     WHERE DATE_TRUNC(c.FirstSaaSInvoiceTxnDate, MONTH) = b.period
       AND c.FirstSaaSInvoiceTxnDate < CURRENT_DATE())                       AS conversions_mtd,
    -- Churn is counted at CompanyAccount grain, matching metric 344's basis.
    (SELECT COUNT(DISTINCT x.CompanyAccount)
     FROM {{ source('revenue', 'int_cancellations') }} x, bounds b
     WHERE DATE_TRUNC(x.CancellationDate, MONTH) = b.period
       AND x.CancellationDate < CURRENT_DATE())                              AS churn_mtd,
    -- Beginning-of-month customer base, CompanyAccount grain. This is the Churn
    -- Rate denominator's BOM term; it does NOT scale with elapsed days, unlike
    -- every other *_mtd figure above -- see the churn-rate section below.
    --
    -- BUG FIX 2026-08-17: the CURRENT month's own row is NOT used. It derives
    -- from billing transactions that land throughout the month (July settled at
    -- 3,788; August read 2,171 mid-month), so it understates the real base and
    -- inflates the rate by ~75% if used directly. Metric 344's own pre-existing
    -- chart_sql already knew this -- its `bom_curr` CTE reads
    -- `DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)`, i.e. the PRIOR (settled)
    -- month's row, specifically because the current month's isn't done
    -- accumulating. This reproduces that exact behaviour: always read the most
    -- recently SETTLED month's BOM row, one month back from `period`.
    (SELECT COUNT(DISTINCT bc.CompanyAccount)
     FROM {{ source('revenue', 'int_bom_customers') }} bc, bounds b
     WHERE DATE_TRUNC(bc.TxnDate, MONTH) = DATE_SUB(b.period, INTERVAL 1 MONTH)) AS bom_customers
),
forecast AS (
  SELECT
    SUM(f.Forecasted_Trials)     AS trials_forecast,
    SUM(f.Forecasted_Syncs)      AS syncs_forecast,
    SUM(f.Forecasted_Conversion) AS conversions_forecast,
    SUM(f.Forecasted_Churn)      AS churn_forecast
  FROM {{ source('revenue', 'method_forecast') }} f, bounds b
  WHERE f.Date IS NOT NULL
    AND DATE_TRUNC(f.Date, MONTH) = b.period
),
computed AS (
  SELECT
    b.period,
    b.elapsed_days,
    b.days_in_month,
    b.min_trajectory_days,

    a.trials_mtd,
    a.syncs_mtd,
    a.conversions_mtd,
    a.churn_mtd,
    a.bom_customers,

    f.trials_forecast,
    f.syncs_forecast,
    f.conversions_forecast,
    f.churn_forecast,

    -- Suppressed below min_trajectory_days -- see the bounds CTE comment.
    IF(b.elapsed_days >= b.min_trajectory_days,
       SAFE_DIVIDE(a.trials_mtd,      b.elapsed_days) * b.days_in_month, NULL) AS trials_trajectory,
    IF(b.elapsed_days >= b.min_trajectory_days,
       SAFE_DIVIDE(a.syncs_mtd,       b.elapsed_days) * b.days_in_month, NULL) AS syncs_trajectory,
    IF(b.elapsed_days >= b.min_trajectory_days,
       SAFE_DIVIDE(a.conversions_mtd, b.elapsed_days) * b.days_in_month, NULL) AS conversions_trajectory,
    IF(b.elapsed_days >= b.min_trajectory_days,
       SAFE_DIVIDE(a.churn_mtd,       b.elapsed_days) * b.days_in_month, NULL) AS churn_trajectory,

    -- Forecast prorated to the same elapsed window, so the MTD bars compare
    -- like with like. Looker's Conversions and Churn cards do this.
    -- NOT suppressed early: these restate the forecast over the elapsed window
    -- rather than extrapolating a small sample, so they carry no day-of-week risk.
    SAFE_DIVIDE(f.conversions_forecast * b.elapsed_days, b.days_in_month) AS conversions_forecast_mtd,
    SAFE_DIVIDE(f.churn_forecast       * b.elapsed_days, b.days_in_month) AS churn_forecast_mtd
  FROM bounds b, actuals a, forecast f
)
SELECT
  c.*,

  -- Churn Rate: churn / (BOM + conversions), on the same complete-days
  -- convention as everything else here. BOM does NOT scale with elapsed days --
  -- unlike the sync conversion rate, actual and trajectory are genuinely
  -- different numbers, not one value twice.
  --
  -- Denominator choice (BOM + conversions, not BOM alone) is empirically
  -- settled: verified against Looker on 2026-08-04, Apr 2026 = 2.41% and
  -- Jun 2026 = 2.70%, both exact only with conversions included.
  -- bom_customers is already the PRIOR (settled) month's BOM row -- see that
  -- column's own comment above for why.
  --
  -- We divide by the real (settled) base. Looker's Churn Rate Trajectory
  -- divides by the FORECAST's implied base instead (Forecasted_Churn /
  -- Forecasted_Churn_Rate__ = 99 / 0.025 = 3960), which is why its reading
  -- (3.61% as of 2026-08-17) differs from ours (3.73%) -- an intentional,
  -- documented divergence, not a parity failure.
  --
  -- churn_rate_trajectory inherits the early-month suppression for free:
  -- churn_trajectory and conversions_trajectory are NULL below
  -- min_trajectory_days, so this is NULL too.
  SAFE_DIVIDE(c.churn_mtd, c.bom_customers + c.conversions_mtd) * 100 AS churn_rate_mtd,
  SAFE_DIVIDE(c.churn_trajectory, c.bom_customers + c.conversions_trajectory) * 100 AS churn_rate_trajectory
FROM computed c
