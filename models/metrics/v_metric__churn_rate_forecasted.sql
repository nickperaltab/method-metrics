{{ config(materialized='view') }}

-- Canonical metric: "Forecasted Accounts Churned Rate"
-- Type: derived
--
-- Reads Forecasted_Churn_Rate__ directly from the forecast sheet -- unlike
-- Forecasted Conversion Rate (#319), which derives its rate from summing
-- two absolute forecast columns, method_forecast already carries a
-- pre-computed churn-rate column. Confirmed (2026-08-17) constant within
-- a month -- COUNT(DISTINCT Forecasted_Churn_Rate__) = 1 for every month
-- checked -- so AVG is a safe monthly reduction (equivalent to picking any
-- single day's value, not a sum that would inflate by days_in_month).
--
-- Emits a decimal rate (0.025), not a percentage (2.5) -- the source
-- column's own scale. This is the denominator for Accounts Churned Rate
-- Attainment, which rescales it to match the percentage-scale trajectory
-- (see the *100 in that formula metric).

SELECT
  DATE_TRUNC(Date, MONTH) AS period,
  AVG(Forecasted_Churn_Rate__) AS value
FROM {{ source('revenue', 'method_forecast') }}
WHERE Date IS NOT NULL
GROUP BY 1
ORDER BY 1
