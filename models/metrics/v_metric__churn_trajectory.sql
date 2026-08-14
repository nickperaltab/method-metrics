{{ config(materialized='view') }}

-- Canonical metric: "Churn Trajectory"
-- Type: derived (single-period projection)
--
-- Month-end projection from COMPLETE days only:
--   churn_mtd / (day_of_month - 1) * days_in_month
--
-- Matches Looker's Method Monday page: 27 / 9 * 31 = 93.0, shown as 93 on
-- 2026-08-10. NULL on the 1st, when there are no complete days to project from.

SELECT period, churn_trajectory AS value
FROM {{ ref('int_method_monday') }}
