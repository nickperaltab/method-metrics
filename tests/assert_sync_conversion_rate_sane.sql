-- Sanity invariants for the sync conversion rate views.
-- A rate built from counts must be non-negative. For CLOSED periods it
-- must also be <= 1 — more conversions than syncs in a settled week would
-- mean the denominator is wrong, not that conversion beat 100%.
-- The current (partial) week and month are exempt: a conversion can land
-- before its sync is recorded within the same partial period.
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
)
SELECT grain, period, value,
       IF(value < 0, 'negative_rate', 'rate_above_one') AS violation
FROM combined
WHERE value < 0 OR value > 1
