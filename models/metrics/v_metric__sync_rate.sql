{{ config(materialized='view') }}

-- Canonical metric: "Sync Rate" (#300)
-- Type: ratio (cross-model: numerator from v_syncs, denominator from v_trials)
-- Formula: SAFE_DIVIDE(syncs.value, trials.value) per period
-- Materialization: rolling 24 months ending at the current day.
-- Description and BQ labels come from v_metric__sync_rate.yml — at `dbt run`
-- time, dbt-bigquery wraps this SELECT with CREATE OR REPLACE VIEW ...
-- OPTIONS(description, labels) automatically.

SELECT
  COALESCE(s.period, t.period) AS period,
  SAFE_DIVIDE(s.value, t.value) AS value
FROM {{ ref('v_metric__syncs') }} s
FULL OUTER JOIN {{ ref('v_metric__trials') }} t
  ON s.period = t.period
ORDER BY 1
