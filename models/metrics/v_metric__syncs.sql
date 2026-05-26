{{ config(materialized='view') }}

-- Canonical metric: "Syncs" (#55)
-- Type: simple aggregation of v_syncs.SyncDate (COUNT(*) per month)
-- Materialization: rolling 24 months ending at the current day.
-- Description and BQ labels come from v_metric__syncs.yml — at `dbt run`
-- time, dbt-bigquery wraps this SELECT with CREATE OR REPLACE VIEW ...
-- OPTIONS(description, labels) automatically.

SELECT
  DATE_TRUNC(SyncDate, MONTH) AS period,
  COUNT(*) AS value
FROM {{ ref('int_syncs') }}
WHERE SyncDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1
