{{ config(materialized='view') }}

-- Canonical metric: "Sync Conversion Rate (weekly)"
-- Type: ratio (cross-model), ISO week grain
-- Formula: SAFE_DIVIDE(conversions in week, syncs in week)
--
-- Same-month convention taken down to the week: no lag, no forecast join.
-- Contrast with the trials weekly rate, which shifts SignupDate +1 month
-- and averages against Forecasted_Trials.
--
-- Week starts MONDAY, matching every other weekly series on the Sales
-- Scorecard. 24-month rolling window, matching the metrics-layer
-- convention.
--
-- Emits a decimal rate (0.28), not a percentage (28.0). The scorecard's
-- valueFormat handles display.

WITH conversions AS (
  SELECT
    DATE_TRUNC(FirstSaaSInvoiceTxnDate, WEEK(MONDAY)) AS week,
    COUNT(*) AS conversions
  FROM {{ source('revenue', 'int_conversions') }}
  WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  GROUP BY 1
),
syncs AS (
  SELECT
    DATE_TRUNC(SyncDate, WEEK(MONDAY)) AS week,
    COUNT(*) AS syncs
  FROM {{ ref('int_syncs') }}
  WHERE SyncDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  GROUP BY 1
)
SELECT
  COALESCE(c.week, s.week) AS period,
  SAFE_DIVIDE(c.conversions, s.syncs) AS value
FROM conversions c
FULL OUTER JOIN syncs s
  ON c.week = s.week
ORDER BY 1
