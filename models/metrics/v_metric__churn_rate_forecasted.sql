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
-- Emits a PERCENTAGE (2.5), not the source column's own decimal scale
-- (0.025) -- deliberately rescaled here with *100, so this metric shares
-- one scale with its two siblings, v_metric__churn_rate_mtd (1.939) and
-- v_metric__churn_rate_trajectory (3.73). This is the same trap that left
-- #319 (Forecasted Conversion Rate) emitting a decimal while its sibling
-- ratios emit percentages: the attainment formula built on top had to
-- compensate with an extra *100, which reads as a mistake to the next
-- person who touches it and eventually gets "fixed" into a 100x error (see
-- #322/#323 on the Sales Scorecard). Do NOT remove this *100 to "match the
-- source sheet" -- the sheet's own decimal scale is not this metric's
-- contract; matching its two siblings is.

SELECT
  DATE_TRUNC(Date, MONTH) AS period,
  AVG(Forecasted_Churn_Rate__) * 100 AS value
FROM {{ source('revenue', 'method_forecast') }}
WHERE Date IS NOT NULL
GROUP BY 1
ORDER BY 1
