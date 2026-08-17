-- Invariants for int_method_monday.
--   1. exactly one row
--   2. keyed to the current month
--   3. elapsed_days is 0 only on the 1st, and then every trajectory is NULL
--   4. a trajectory is never below its own MTD actual (it scales up)
-- Returns offending rows; empty result = pass.

WITH m AS (SELECT * FROM `project-for-method-dw`.`revenue`.`int_method_monday`),
n AS (SELECT COUNT(*) AS c FROM m)

SELECT 'not_exactly_one_row' AS violation, CAST(c AS STRING) AS detail FROM n WHERE c != 1

UNION ALL
SELECT 'wrong_period', CAST(period AS STRING) FROM m
WHERE period != DATE_TRUNC(CURRENT_DATE(), MONTH)

UNION ALL
SELECT 'elapsed_days_mismatch', CAST(elapsed_days AS STRING) FROM m
WHERE elapsed_days != EXTRACT(DAY FROM CURRENT_DATE()) - 1

UNION ALL
-- On the 1st there are no complete days, so a projection is undefined.
SELECT 'day_one_trajectory_not_null', CAST(trials_trajectory AS STRING) FROM m
WHERE elapsed_days = 0
  AND (trials_trajectory IS NOT NULL OR syncs_trajectory IS NOT NULL
    OR conversions_trajectory IS NOT NULL OR churn_trajectory IS NOT NULL)

UNION ALL
SELECT 'trajectory_below_actual', CONCAT('trials ', CAST(trials_trajectory AS STRING)) FROM m
WHERE elapsed_days > 0 AND trials_trajectory < trials_mtd

UNION ALL
SELECT 'trajectory_below_actual', CONCAT('syncs ', CAST(syncs_trajectory AS STRING)) FROM m
WHERE elapsed_days > 0 AND syncs_trajectory < syncs_mtd

UNION ALL
SELECT 'trajectory_below_actual', CONCAT('conversions ', CAST(conversions_trajectory AS STRING)) FROM m
WHERE elapsed_days > 0 AND conversions_trajectory < conversions_mtd

UNION ALL
SELECT 'trajectory_below_actual', CONCAT('churn ', CAST(churn_trajectory AS STRING)) FROM m
WHERE elapsed_days > 0 AND churn_trajectory < churn_mtd