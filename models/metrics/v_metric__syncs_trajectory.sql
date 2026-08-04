{{ config(materialized='view') }}

-- Canonical metric: "Syncs Trajectory" (#295)
-- Type: derived (single-period projection)
--
-- Month-end projection of the in-progress month. Same divisor convention
-- as v_metric__conversions_trajectory (day_of_month, counting through
-- yesterday) — the two are divided by each other to produce the Sync
-- Conversion Rate Trajectory, so they must agree on convention.
--
-- Returns exactly ONE row, keyed to the first of the current month.

WITH mtd AS (
  SELECT COUNT(*) AS syncs
  FROM {{ ref('int_syncs') }}
  WHERE SyncDate >= DATE_TRUNC(CURRENT_DATE(), MONTH)
    AND SyncDate < CURRENT_DATE()
)
SELECT
  DATE_TRUNC(CURRENT_DATE(), MONTH) AS period,
  SAFE_DIVIDE(
    mtd.syncs,
    EXTRACT(DAY FROM CURRENT_DATE())
  ) * EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE(), MONTH)) AS value
FROM mtd
