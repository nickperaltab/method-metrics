

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__churn_mtd`
  OPTIONS(
      description="""Cancellations with a CancellationDate in the current month, strictly\nbefore today, counted at CompanyAccount (billing-account) grain,\nmatching metric 344. Pairs with the complete-days trajectory.\nDistinct from Accounts Churned (#59), which is the full-month total\nand stays that way.\n""",
    
      labels=[('metric_id', '409'), ('layer', 'metrics'), ('type', 'simple'), ('status', 'queued'), ('source_table', 'int_method_monday'), ('source_measure_safe', ''), ('depends_on', '59')]
    )
  as 

-- Canonical metric: "Churn MTD (through yesterday)"
-- Type: simple (windowed count)
--
-- Churn so far this month, excluding today. Pairs with
-- v_metric__churn_trajectory, which divides this same count by complete days.
-- A tile showing a through-today figure beside a through-yesterday trajectory
-- is the inconsistency this convention exists to prevent.
--
-- Distinct from Churn #59, which is the full-month total and must stay that
-- way — it feeds Marketing, the AI chart builder and 19 dbt consumers.
--
-- CompanyAccount grain, matching metric 344.

SELECT period, CAST(churn_mtd AS FLOAT64) AS value
FROM `project-for-method-dw`.`revenue`.`int_method_monday`;

