-- Sanity invariants for the sync conversion rate views.
-- A rate built from counts must be non-negative. For CLOSED periods it
-- must also be <= 1 — more conversions than syncs in a settled week would
-- mean the denominator is wrong, not that conversion beat 100%.
-- The current (partial) week and month are exempt: a conversion can land
-- before its sync is recorded within the same partial period.
--
-- A closed period with conversions but a NULL rate means the sync
-- denominator is missing entirely for that period — that's the same
-- "denominator is wrong" failure mode as rate_above_one, just hidden
-- behind NULL propagation instead of a number. A closed period with zero
-- conversions AND zero syncs is legitimately empty and is not flagged.
-- Returns offending rows; empty result = pass.

WITH weekly AS (
  SELECT 'weekly' AS grain, period, value
  FROM {{ ref('v_metric__sync_conversion_rate_weekly') }}
  WHERE period < DATE_TRUNC(CURRENT_DATE(), WEEK(MONDAY))
),
monthly AS (
  SELECT 'monthly' AS grain, period, value
  FROM {{ ref('v_metric__sync_to_conversion_rate') }}
  WHERE period < DATE_TRUNC(CURRENT_DATE(), MONTH)
),
combined AS (
  SELECT * FROM weekly UNION ALL SELECT * FROM monthly
),
weekly_conversions AS (
  SELECT
    'weekly' AS grain,
    DATE_TRUNC(FirstSaaSInvoiceTxnDate, WEEK(MONDAY)) AS period,
    COUNT(*) AS conversions
  FROM {{ source('revenue', 'int_conversions') }}
  WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  GROUP BY 1, 2
),
monthly_conversions AS (
  SELECT
    'monthly' AS grain,
    DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS period,
    COUNT(*) AS conversions
  FROM {{ source('revenue', 'int_conversions') }}
  WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  GROUP BY 1, 2
),
conversions AS (
  SELECT * FROM weekly_conversions
  UNION ALL
  SELECT * FROM monthly_conversions
)
SELECT grain, period, value,
       IF(value < 0, 'negative_rate', 'rate_above_one') AS violation
FROM combined
WHERE value < 0 OR value > 1

UNION ALL

SELECT c.grain, c.period, c.value, 'null_rate_with_conversions' AS violation
FROM combined c
JOIN conversions n USING (grain, period)
WHERE c.value IS NULL AND n.conversions > 0
