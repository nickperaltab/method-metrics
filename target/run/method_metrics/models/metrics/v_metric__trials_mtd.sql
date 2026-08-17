

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__trials_mtd`
  OPTIONS(
      description="""Trials with a SignupDate in the current month, strictly before today.\nPairs with the complete-days trajectory. Distinct from Trials (#54),\nwhich is the full-month total and stays that way.\n""",
    
      labels=[('metric_id', '406'), ('layer', 'metrics'), ('type', 'simple'), ('status', 'queued'), ('source_table', 'int_method_monday'), ('source_measure_safe', ''), ('depends_on', '54')]
    )
  as 

-- Canonical metric: "Trials MTD (through yesterday)"
-- Type: simple (windowed count)
--
-- Trials so far this month, excluding today. Pairs with
-- v_metric__trials_trajectory, which divides this same count by complete days.
-- A tile showing a through-today figure beside a through-yesterday trajectory
-- is the inconsistency this convention exists to prevent.
--
-- Distinct from Trials #54, which is the full-month total and must stay that
-- way — it feeds Marketing, the AI chart builder and 19 dbt consumers.

SELECT period, CAST(trials_mtd AS FLOAT64) AS value
FROM `project-for-method-dw`.`revenue`.`int_method_monday`;

