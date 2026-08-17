

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__trials_trajectory`
  OPTIONS(
      description="""Month-end projection of trials for the in-progress month. Divides\ntrials_mtd (counted through yesterday) by complete days so far, and\nscales to the full month. NULL on the 1st, when there are no complete\ndays to project from.\n""",
    
      labels=[('metric_id', '410'), ('layer', 'metrics'), ('type', 'derived'), ('status', 'queued'), ('source_table', 'int_method_monday'), ('source_measure_safe', ''), ('depends_on', '54')]
    )
  as 

-- Canonical metric: "Trials Trajectory"
-- Type: derived (single-period projection)
--
-- Month-end projection from COMPLETE days only:
--   trials_mtd / (day_of_month - 1) * days_in_month
--
-- Matches Looker's Method Monday page: 132 / 9 * 31 = 454.67, shown as 455 on
-- 2026-08-10. NULL on the 1st, when there are no complete days to project from.

SELECT period, trials_trajectory AS value
FROM `project-for-method-dw`.`revenue`.`int_method_monday`;

