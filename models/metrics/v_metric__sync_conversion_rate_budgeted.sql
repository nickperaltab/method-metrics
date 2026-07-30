{{ config(materialized='view') }}

-- Canonical metric: "Budgeted Sync Conversion Rate"
-- Type: derived ratio
-- Formula: SUM(Budgeted_Conversion) / SUM(Budgeted_Syncs) per month
--
-- DERIVED, NOT PUBLISHED. method_forecast stores Budgeted_Conversion_Rate
-- as a pre-computed TRIALS rate. There is no stored sync equivalent, so
-- this divides the two budgeted counts. Justin owns revenue methodology
-- and has to confirm the derivation before this goes leadership-facing.
--
-- Sum the daily allocations, THEN divide. Averaging daily ratios would
-- weight a low-volume day the same as a high-volume one.
--
-- Emits a decimal rate (0.25), not a percentage (25.0).

SELECT
  DATE_TRUNC(Date, MONTH) AS period,
  SAFE_DIVIDE(
    SUM(Budgeted_Conversion),
    SUM(Budgeted_Syncs)
  ) AS value
FROM {{ source('revenue', 'method_forecast') }}
GROUP BY 1
ORDER BY 1
