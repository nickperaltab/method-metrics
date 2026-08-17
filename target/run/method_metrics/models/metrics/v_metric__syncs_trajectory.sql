

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__syncs_trajectory`
  OPTIONS(
      description="""Month-end projection of signup-cohort syncs for the in-progress\nmonth \u2014 accounts whose SyncDate (the same column as SignupDate, see\nSyncs #55) falls in the current month and that have hit the sync\nmilestone. Counts through yesterday, divides by COMPLETE days\n(day_of_month - 1), and scales to the full month. Same divisor\nconvention as Conversions Trajectory (#296) so the two can be\ndivided into a rate. Returns exactly one row for the current month.\n""",
    
      labels=[('metric_id', '295'), ('layer', 'metrics'), ('type', 'derived'), ('status', 'queued'), ('source_table', 'int_method_monday'), ('source_measure_safe', ''), ('depends_on', '55')]
    )
  as 

-- Canonical metric: "Syncs Trajectory" (#295)
-- Type: derived (single-period projection)
--
-- CONVENTION CHANGED 2026-08-10. Was: syncs through today divided by
-- day_of_month. Now: syncs through YESTERDAY divided by COMPLETE days:
--
--   syncs_mtd / (day_of_month - 1) * days_in_month
--
-- Why: the previous convention divided by day_of_month while its numerator
-- held only part of that day, so it read low until the day's data landed. It
-- also disagreed with Looker's Method Monday page, which already divides by
-- complete days. We unify on the Method Monday convention. Same divisor
-- convention as v_metric__conversions_trajectory — the two are divided by
-- each other to produce the Sync Conversion Rate Trajectory, so they must
-- agree on convention.
--
-- NULL on the 1st of the month.

SELECT period, syncs_trajectory AS value
FROM `project-for-method-dw`.`revenue`.`int_method_monday`;

