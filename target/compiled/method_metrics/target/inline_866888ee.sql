
WITH conversions AS (
  SELECT
    DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS period,
    COUNT(*) AS conversions
  FROM `project-for-method-dw`.`revenue`.`int_conversions`
  WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
  GROUP BY 1
),
trials_lagged AS (
  SELECT
    DATE_ADD(DATE_TRUNC(SignupDate, MONTH), INTERVAL 1 MONTH) AS period,
    COUNT(*) AS prior_month_trials
  FROM `project-for-method-dw`.`revenue`.`int_trials`
  WHERE SignupDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 25 MONTH)
  GROUP BY 1
),
forecast_old AS (
  SELECT DATE_TRUNC(Date, MONTH) AS period, SUM(Forecasted_Trials) AS forecasted_trials
  FROM `project-for-method-dw`.`revenue`.`method_forecast`
  GROUP BY 1
),
forecast_new AS (
  SELECT DATE_TRUNC(Date, MONTH) AS period, SUM(Forecasted_Trials) AS forecasted_trials
  FROM `project-for-method-dw`.`revenue`.`method_forecast_typed`
  GROUP BY 1
)
SELECT c.period, c.conversions, t.prior_month_trials,
  fo.forecasted_trials AS forecast_old, fn.forecasted_trials AS forecast_new,
  SAFE_DIVIDE(c.conversions, (t.prior_month_trials + fo.forecasted_trials)/2.0) AS value_old,
  SAFE_DIVIDE(c.conversions, (t.prior_month_trials + fn.forecasted_trials)/2.0) AS value_new
FROM conversions c
LEFT JOIN trials_lagged t USING(period)
LEFT JOIN forecast_old fo USING(period)
LEFT JOIN forecast_new fn USING(period)
WHERE c.period BETWEEN '2026-04-01' AND '2026-07-01'
ORDER BY 1