{{ config(materialized='view') }}

-- Canonical metric: "Forecasted Sync Conversion Rate"
-- Type: derived ratio
-- Formula: SUM(Forecasted_Conversion) / SUM(Forecasted_Syncs) per month
--
-- DERIVED, NOT PUBLISHED — same caveat as the budgeted twin. See
-- v_metric__sync_conversion_rate_budgeted.sql for the full reasoning on
-- why this sums before dividing.
--
-- Emits a decimal rate (0.25), not a percentage (25.0).

SELECT
  DATE_TRUNC(Date, MONTH) AS period,
  SAFE_DIVIDE(
    SUM(Forecasted_Conversion),
    SUM(Forecasted_Syncs)
  ) AS value
FROM {{ source('revenue', 'method_forecast_typed') }}
WHERE Date IS NOT NULL
GROUP BY 1
ORDER BY 1
