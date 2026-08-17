

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__churn_rate_trajectory`
  OPTIONS(
      description="""Month-end projection of the accounts-churned rate: churn_trajectory /\n(beginning-of-month customers + conversions_trajectory), both divided\nby complete days only. NULL on the 1st of the month, when there are\nno complete days to project from. CompanyAccount (billing-account)\ngrain throughout.\n""",
    
      labels=[('metric_id', '345'), ('layer', 'metrics'), ('type', 'derived'), ('status', 'queued'), ('source_table', 'int_method_monday'), ('source_measure_safe', ''), ('depends_on', '411-59')]
    )
  as 

-- Canonical metric: "Accounts Churned Rate Trajectory (complete days)"
-- Type: derived ratio
--
-- churn_trajectory / (bom_customers + conversions_trajectory). Emits a
-- PERCENTAGE, matching #345's display_format.
--
-- BOM does NOT scale with elapsed days -- unlike the sync conversion rate,
-- this trajectory is a genuinely different number from the MTD actual
-- (v_metric__churn_rate_mtd), not the same value shown twice. NULL on the
-- 1st of the month, when churn_trajectory and conversions_trajectory are
-- both NULL (elapsed_days = 0) -- matching the rest of the trajectory
-- family, NOT the *_forecast_mtd family's day-1-returns-0 behaviour.
--
-- CompanyAccount grain throughout -- inherits churn_trajectory's
-- franchise-fan-out caveat (see v_metric__churn_trajectory.sql / #411).

SELECT period, churn_rate_trajectory AS value
FROM `project-for-method-dw`.`revenue`.`int_method_monday`;

