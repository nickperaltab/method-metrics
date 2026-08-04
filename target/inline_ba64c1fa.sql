WITH monthly_conversions AS (
  SELECT DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS month, COUNT(*) AS conversions
  FROM `project-for-method-dw.revenue.int_conversions` GROUP BY 1
),
monthly_trials AS (
  SELECT DATE_TRUNC(SignupDate, MONTH) AS month, COUNT(*) AS trials
  FROM `project-for-method-dw.revenue.int_trials` GROUP BY 1
),
trials_with_lag AS (
  SELECT month, LAG(trials) OVER (ORDER BY month) AS last_month_trials FROM monthly_trials
),
forecasted AS (
  SELECT DATE_TRUNC(forecast_date, MONTH) AS month, ROUND(SUM(forecast_value), 0) AS forecasted_trials
  FROM `project-for-method-dw.revenue.int_trials_forecast_channel` WHERE forecast_date IS NOT NULL GROUP BY 1
)
SELECT FORMAT_DATE('%Y-%m', c.month) AS period,
  ROUND(SAFE_DIVIDE(c.conversions, (t.last_month_trials + f.forecasted_trials) / 2), 4) AS value
FROM monthly_conversions c
JOIN trials_with_lag t ON c.month = t.month
JOIN forecasted f ON c.month = f.month
ORDER BY 1