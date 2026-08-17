{{ config(materialized='view') }}

-- Intermediate model: one row for the current month carrying every quantity
-- the Method Monday scorecard needs.
--
-- Why one wide model instead of one model per tile: the elapsed-days
-- arithmetic below is the whole substance of this page. Repeating it across
-- sixteen thin models invites exactly the drift that cost a day of debugging
-- on 2026-08-10, when a trajectory divided a different window than the tile
-- beside it. It lives here once.
--
-- CONVENTION (see the spec): every actual counts through YESTERDAY, and every
-- trajectory divides by COMPLETE days only:
--
--   trajectory = mtd / (day_of_month - 1) * days_in_month
--
-- Looker's Method Monday page already does this. Its Sales page instead counts
-- through today and divides by day_of_month, which treats a part-finished day
-- as whole and reads low until that day's data lands.
--
-- On the 1st of the month elapsed_days is 0 and every trajectory is NULL.
-- SAFE_DIVIDE returns NULL rather than raising, which is the behaviour we want:
-- a projection from zero complete days is undefined, not zero.

WITH bounds AS (
  SELECT
    DATE_TRUNC(CURRENT_DATE(), MONTH)                     AS period,
    EXTRACT(DAY FROM CURRENT_DATE()) - 1                  AS elapsed_days,
    EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE(), MONTH))     AS days_in_month
),
actuals AS (
  SELECT
    (SELECT COUNT(*) FROM {{ ref('int_trials') }} t, bounds b
     WHERE DATE_TRUNC(t.SignupDate, MONTH) = b.period
       AND t.SignupDate < CURRENT_DATE())                                    AS trials_mtd,
    (SELECT COUNT(*) FROM {{ ref('int_syncs') }} s, bounds b
     WHERE DATE_TRUNC(s.SyncDate, MONTH) = b.period
       AND s.SyncDate < CURRENT_DATE())                                      AS syncs_mtd,
    (SELECT COUNT(*) FROM {{ source('revenue','int_conversions') }} c, bounds b
     WHERE DATE_TRUNC(c.FirstSaaSInvoiceTxnDate, MONTH) = b.period
       AND c.FirstSaaSInvoiceTxnDate < CURRENT_DATE())                       AS conversions_mtd,
    -- Churn is counted at CompanyAccount grain, matching metric 344's basis.
    (SELECT COUNT(DISTINCT x.CompanyAccount)
     FROM {{ source('revenue','int_cancellations') }} x, bounds b
     WHERE DATE_TRUNC(x.CancellationDate, MONTH) = b.period
       AND x.CancellationDate < CURRENT_DATE())                              AS churn_mtd,
    -- Beginning-of-month customer base, CompanyAccount grain, from
    -- int_bom_customers (mirrors revenue.v_bom_customers -- see that
    -- model's header). This is the Churn Rate denominator's BOM term; it
    -- does NOT scale with elapsed days, unlike every other *_mtd figure
    -- above -- see the churn-rate section below.
    --
    -- BUG FIX 2026-08-17: the CURRENT month's own row is NOT used. It
    -- derives from billing transactions that land throughout the month
    -- (July settled at 3,788; August read 2,171 mid-month), so it
    -- understates the real base and inflates the rate by ~75% if used
    -- directly. Metric 344's own pre-existing chart_sql already knew this
    -- -- its `bom_curr` CTE reads `DATE_SUB(CURRENT_DATE(), INTERVAL 1
    -- MONTH)`, i.e. the PRIOR (settled) month's row, specifically because
    -- the current month's isn't done accumulating. This reproduces that
    -- exact behaviour: always read the most recently SETTLED month's BOM
    -- row, one month back from `period`. Historical (non-current) months
    -- are unaffected by this -- only ever queried against their own,
    -- already-settled row.
    (SELECT COUNT(DISTINCT bc.CompanyAccount)
     FROM {{ ref('int_bom_customers') }} bc, bounds b
     WHERE DATE_TRUNC(bc.TxnDate, MONTH) = DATE_SUB(b.period, INTERVAL 1 MONTH)) AS bom_customers
),
forecast AS (
  SELECT
    SUM(f.Forecasted_Trials)     AS trials_forecast,
    SUM(f.Forecasted_Syncs)      AS syncs_forecast,
    SUM(f.Forecasted_Conversion) AS conversions_forecast,
    SUM(f.Forecasted_Churn)      AS churn_forecast
  FROM {{ source('revenue','method_forecast') }} f, bounds b
  WHERE f.Date IS NOT NULL
    AND DATE_TRUNC(f.Date, MONTH) = b.period
),
computed AS (
  SELECT
    b.period,
    b.elapsed_days,
    b.days_in_month,

    a.trials_mtd,
    a.syncs_mtd,
    a.conversions_mtd,
    a.churn_mtd,
    a.bom_customers,

    f.trials_forecast,
    f.syncs_forecast,
    f.conversions_forecast,
    f.churn_forecast,

    SAFE_DIVIDE(a.trials_mtd,      b.elapsed_days) * b.days_in_month AS trials_trajectory,
    SAFE_DIVIDE(a.syncs_mtd,       b.elapsed_days) * b.days_in_month AS syncs_trajectory,
    SAFE_DIVIDE(a.conversions_mtd, b.elapsed_days) * b.days_in_month AS conversions_trajectory,
    SAFE_DIVIDE(a.churn_mtd,       b.elapsed_days) * b.days_in_month AS churn_trajectory,

    -- Forecast prorated to the same elapsed window, so the MTD bars compare
    -- like with like. Looker's Conversions and Churn cards do this.
    SAFE_DIVIDE(f.conversions_forecast * b.elapsed_days, b.days_in_month) AS conversions_forecast_mtd,
    SAFE_DIVIDE(f.churn_forecast       * b.elapsed_days, b.days_in_month) AS churn_forecast_mtd
  FROM bounds b, actuals a, forecast f
)
SELECT
  c.*,

  -- Churn Rate: churn / (BOM + conversions), on the same complete-days
  -- convention as everything else on this page. BOM does NOT scale with
  -- elapsed days -- unlike the sync conversion rate, actual and trajectory
  -- are genuinely different numbers here, not one value twice (see design
  -- doc, "Churn Rate is deferred, not dropped").
  --
  -- Denominator choice (BOM + conversions, not BOM alone) is empirically
  -- settled: verified against Looker on 2026-08-04, Apr 2026 = 2.41% and
  -- Jun 2026 = 2.70%, both exact only with conversions included. See
  -- churn-rate-report.md. bom_customers itself is already the PRIOR
  -- (settled) month's BOM row, not the current month's -- see that
  -- column's own comment above for why.
  --
  -- We divide by the real (settled) base. Looker's Churn Rate Trajectory
  -- divides by the FORECAST's implied base instead (Forecasted_Churn /
  -- Forecasted_Churn_Rate__ = 99 / 0.025 = 3960), which is why its reading
  -- (3.61% as of 2026-08-17) differs from ours (3.73%) -- this is an
  -- intentional, documented divergence, not a parity failure. See
  -- v_metric__churn_rate_trajectory.yml's caveats.
  --
  -- Reuses churn_mtd / conversions_mtd and the already-computed
  -- churn_trajectory / conversions_trajectory from `computed` above --
  -- the elapsed-days arithmetic is not repeated here.
  --
  -- Trajectory is a SAFE_DIVIDE over two already-SAFE_DIVIDE'd quantities,
  -- so it is NULL (not 0, not an error) on day 1, matching the rest of the
  -- trajectory family -- NOT the *_forecast_mtd family's day-1-returns-0
  -- behaviour, which is a documented asymmetry, not something to copy here.
  SAFE_DIVIDE(c.churn_mtd, c.bom_customers + c.conversions_mtd) * 100 AS churn_rate_mtd,
  SAFE_DIVIDE(c.churn_trajectory, c.bom_customers + c.conversions_trajectory) * 100 AS churn_rate_trajectory
FROM computed c
