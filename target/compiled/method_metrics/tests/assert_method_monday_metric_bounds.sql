-- Column-level sanity invariants for the twelve Method Monday v_metric__*
-- views (#406-#414, #295, #296, #400), which shipped with zero tests --
-- see the dbt-infrastructure audit, Finding F / Investigation 4.4.
--
-- Two checks, chosen to be real regression catchers rather than a copy of
-- the model's own arithmetic (which would pass by construction -- see the
-- audit's Investigation 4.2 on why `trajectory_below_actual` in
-- assert_trajectory_invariants.sql never fires under any divisor, correct
-- or regressed, and should NOT be used as a template here):
--
--   1. NON-NEGATIVE. Every one of these twelve views is a count, a
--      count-derived trajectory/forecast, or a ratio of two such counts.
--      None can legitimately go negative. A sign-flip, a bad subtraction,
--      or a swapped operand in a future edit would show up here.
--
--   2. MTD <= THROUGH-TODAY. The four *_mtd actuals (#406-#409) are defined
--      as "this month, strictly before today." Recomputed independently
--      from the same upstream int_* / source tables but INCLUDING today,
--      the through-today count can only be >= the MTD figure (adding a day
--      never removes rows). This is a genuine wiring check: it fires if the
--      view's date filter drifts (e.g. `<=` instead of `<`, or the wrong
--      column), the same class of bug elapsed_days_mismatch guards against
--      for the trajectory divisor.
--
--   3. FORECAST MTD <= FULL-MONTH FORECAST. Conversions/Churn Forecast MTD
--      (#412/#413) are the full-month forecast prorated to the elapsed
--      window. Recomputed independently from method_forecast, the
--      full-month total can only be >= the prorated figure. Real wiring
--      check for the same reason as #2 -- it would catch e.g. Churn
--      Forecast MTD accidentally reading Forecasted_Conversion.
--
-- Returns offending rows; empty result = pass.

WITH metric_values AS (
  SELECT 'trials_mtd' AS metric, period, value FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__trials_mtd`
  UNION ALL
  SELECT 'syncs_mtd', period, value FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__syncs_mtd`
  UNION ALL
  SELECT 'conversions_mtd', period, value FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__conversions_mtd`
  UNION ALL
  SELECT 'churn_mtd', period, value FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__churn_mtd`
  UNION ALL
  SELECT 'sync_rate_mtd', period, value FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__sync_rate_mtd`
  UNION ALL
  SELECT 'trials_trajectory', period, value FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__trials_trajectory`
  UNION ALL
  SELECT 'syncs_trajectory', period, value FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__syncs_trajectory`
  UNION ALL
  SELECT 'conversions_trajectory', period, value FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__conversions_trajectory`
  UNION ALL
  SELECT 'churn_trajectory', period, value FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__churn_trajectory`
  UNION ALL
  SELECT 'conversions_forecast_mtd', period, value FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__conversions_forecast_mtd`
  UNION ALL
  SELECT 'churn_forecast_mtd', period, value FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__churn_forecast_mtd`
  UNION ALL
  SELECT 'sync_conversion_rate_trajectory', period, value FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__sync_conversion_rate_trajectory`
),

-- Through-TODAY (inclusive) recomputations, independent of int_method_monday,
-- for the four MTD actuals (which are defined as strictly-before-today).
through_today AS (
  SELECT
    'trials_mtd' AS metric,
    (SELECT COUNT(*) FROM `project-for-method-dw`.`revenue`.`int_trials`
     WHERE DATE_TRUNC(SignupDate, MONTH) = DATE_TRUNC(CURRENT_DATE(), MONTH)
       AND SignupDate <= CURRENT_DATE()) AS value_through_today
  UNION ALL
  SELECT
    'syncs_mtd',
    (SELECT COUNT(*) FROM `project-for-method-dw`.`revenue`.`int_syncs`
     WHERE DATE_TRUNC(SyncDate, MONTH) = DATE_TRUNC(CURRENT_DATE(), MONTH)
       AND SyncDate <= CURRENT_DATE())
  UNION ALL
  SELECT
    'conversions_mtd',
    (SELECT COUNT(*) FROM `project-for-method-dw`.`revenue`.`int_conversions`
     WHERE DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) = DATE_TRUNC(CURRENT_DATE(), MONTH)
       AND FirstSaaSInvoiceTxnDate <= CURRENT_DATE())
  UNION ALL
  SELECT
    'churn_mtd',
    (SELECT COUNT(DISTINCT CompanyAccount) FROM `project-for-method-dw`.`revenue`.`int_cancellations`
     WHERE DATE_TRUNC(CancellationDate, MONTH) = DATE_TRUNC(CURRENT_DATE(), MONTH)
       AND CancellationDate <= CURRENT_DATE())
),

-- Full-month forecast totals, independent of int_method_monday, for the two
-- forecast MTD metrics (which prorate a full-month forecast to the elapsed
-- window and so can only be <= it).
full_month_forecast AS (
  SELECT
    'conversions_forecast_mtd' AS metric,
    (SELECT SUM(Forecasted_Conversion) FROM `project-for-method-dw`.`revenue`.`method_forecast`
     WHERE Date IS NOT NULL
       AND DATE_TRUNC(Date, MONTH) = DATE_TRUNC(CURRENT_DATE(), MONTH)) AS full_month_value
  UNION ALL
  SELECT
    'churn_forecast_mtd',
    (SELECT SUM(Forecasted_Churn) FROM `project-for-method-dw`.`revenue`.`method_forecast`
     WHERE Date IS NOT NULL
       AND DATE_TRUNC(Date, MONTH) = DATE_TRUNC(CURRENT_DATE(), MONTH))
)

-- Check 1: non-negative.
SELECT metric, period, value, 'negative_value' AS violation
FROM metric_values
WHERE value < 0

UNION ALL

-- Check 2: MTD (strictly before today) must not exceed the same count
-- recomputed through today (inclusive).
SELECT m.metric, m.period, m.value, 'mtd_exceeds_through_today' AS violation
FROM metric_values m
JOIN through_today t USING (metric)
WHERE m.value > t.value_through_today

UNION ALL

-- Check 3: a prorated forecast must not exceed its full-month total.
SELECT m.metric, m.period, m.value, 'forecast_mtd_exceeds_full_month' AS violation
FROM metric_values m
JOIN full_month_forecast f USING (metric)
WHERE m.value > f.full_month_value