

-- Canonical metric: "Trials Trajectory"
-- Type: derived (single-period projection)
--
-- Month-end projection from COMPLETE days only:
--   trials_mtd / (day_of_month - 1) * days_in_month
--
-- Matches Looker's Method Monday page: 132 / 9 * 31 = 454.67, shown as 455 on
-- 2026-08-10. NULL on the 1st, when there are no complete days to project from.

SELECT period, trials_trajectory AS value
FROM `project-for-method-dw`.`revenue`.`int_method_monday`