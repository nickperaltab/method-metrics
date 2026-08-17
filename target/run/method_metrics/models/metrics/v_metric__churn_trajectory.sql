

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__churn_trajectory`
  OPTIONS(
      description="""Month-end projection of accounts churned for the in-progress month.\nDivides churn_mtd (counted through yesterday, CompanyAccount /\nbilling-account grain) by complete days so far, and scales to the\nfull month. NULL on the 1st, when there are no complete days to\nproject from.\n""",
    
      labels=[('metric_id', '411'), ('layer', 'metrics'), ('type', 'derived'), ('status', 'queued'), ('source_table', 'int_method_monday'), ('source_measure_safe', ''), ('depends_on', '59')]
    )
  as 

-- Canonical metric: "Churn Trajectory"
-- Type: derived (single-period projection)
--
-- Month-end projection from COMPLETE days only:
--   churn_mtd / (day_of_month - 1) * days_in_month
--
-- Matches Looker's Method Monday page: 27 / 9 * 31 = 93.0, shown as 93 on
-- 2026-08-10. NULL on the 1st, when there are no complete days to project from.

SELECT period, churn_trajectory AS value
FROM `project-for-method-dw`.`revenue`.`int_method_monday`;

