-- Invariants for the two trajectory metric views.
-- A projection of an in-progress month must:
--   1. return exactly one row
--   2. be keyed to the current month
--   3. be >= the actual month-to-date count (it scales up, never down)
-- Returns offending rows; empty result = pass.

WITH conv AS (
  SELECT 'conversions' AS metric, period, value
  FROM {{ ref('v_metric__conversions_trajectory') }}
),
syncs AS (
  SELECT 'syncs' AS metric, period, value
  FROM {{ ref('v_metric__syncs_trajectory') }}
),
combined AS (
  SELECT * FROM conv UNION ALL SELECT * FROM syncs
),
actuals AS (
  SELECT 'conversions' AS metric, COUNT(*) AS mtd
  FROM {{ source('revenue', 'int_conversions') }}
  WHERE FirstSaaSInvoiceTxnDate >= DATE_TRUNC(CURRENT_DATE(), MONTH)
    AND FirstSaaSInvoiceTxnDate < CURRENT_DATE()
  UNION ALL
  SELECT 'syncs' AS metric, COUNT(*) AS mtd
  FROM {{ ref('int_syncs') }}
  WHERE SyncDate >= DATE_TRUNC(CURRENT_DATE(), MONTH)
    AND SyncDate < CURRENT_DATE()
),
row_counts AS (
  SELECT metric, COUNT(*) AS n FROM combined GROUP BY 1
)
SELECT c.metric, c.period, c.value, 'wrong_period' AS violation
FROM combined c
WHERE c.period != DATE_TRUNC(CURRENT_DATE(), MONTH)

UNION ALL
SELECT r.metric, NULL AS period, CAST(r.n AS FLOAT64) AS value, 'not_exactly_one_row'
FROM row_counts r
WHERE r.n != 1

UNION ALL
SELECT c.metric, c.period, c.value, 'projection_below_actual'
FROM combined c
JOIN actuals a USING (metric)
WHERE c.value < a.mtd
