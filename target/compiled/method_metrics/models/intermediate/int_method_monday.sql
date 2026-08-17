

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
    (SELECT COUNT(*) FROM `project-for-method-dw`.`revenue`.`int_trials` t, bounds b
     WHERE DATE_TRUNC(t.SignupDate, MONTH) = b.period
       AND t.SignupDate < CURRENT_DATE())                                    AS trials_mtd,
    (SELECT COUNT(*) FROM `project-for-method-dw`.`revenue`.`int_syncs` s, bounds b
     WHERE DATE_TRUNC(s.SyncDate, MONTH) = b.period
       AND s.SyncDate < CURRENT_DATE())                                      AS syncs_mtd,
    (SELECT COUNT(*) FROM `project-for-method-dw`.`revenue`.`int_conversions` c, bounds b
     WHERE DATE_TRUNC(c.FirstSaaSInvoiceTxnDate, MONTH) = b.period
       AND c.FirstSaaSInvoiceTxnDate < CURRENT_DATE())                       AS conversions_mtd,
    -- Churn is counted at CompanyAccount grain, matching metric 344's basis.
    (SELECT COUNT(DISTINCT x.CompanyAccount)
     FROM `project-for-method-dw`.`revenue`.`int_cancellations` x, bounds b
     WHERE DATE_TRUNC(x.CancellationDate, MONTH) = b.period
       AND x.CancellationDate < CURRENT_DATE())                              AS churn_mtd
),
forecast AS (
  SELECT
    SUM(f.Forecasted_Trials)     AS trials_forecast,
    SUM(f.Forecasted_Syncs)      AS syncs_forecast,
    SUM(f.Forecasted_Conversion) AS conversions_forecast,
    SUM(f.Forecasted_Churn)      AS churn_forecast
  FROM `project-for-method-dw`.`revenue`.`method_forecast` f, bounds b
  WHERE f.Date IS NOT NULL
    AND DATE_TRUNC(f.Date, MONTH) = b.period
)
SELECT
  b.period,
  b.elapsed_days,
  b.days_in_month,

  a.trials_mtd,
  a.syncs_mtd,
  a.conversions_mtd,
  a.churn_mtd,

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