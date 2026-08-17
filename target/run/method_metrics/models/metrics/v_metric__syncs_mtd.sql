

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__syncs_mtd`
  OPTIONS(
      description="""Signup-cohort syncs, strictly before today: accounts whose SyncDate\n(the same column as SignupDate \u2014 see Syncs #55) falls in the current\nmonth and that have hit the sync milestone. Pairs with the\ncomplete-days trajectory. Distinct from Syncs (#55), which is the\nfull-month total and stays that way.\n""",
    
      labels=[('metric_id', '407'), ('layer', 'metrics'), ('type', 'simple'), ('status', 'queued'), ('source_table', 'int_method_monday'), ('source_measure_safe', ''), ('depends_on', '55')]
    )
  as 

-- Canonical metric: "Syncs MTD (through yesterday)"
-- Type: simple (windowed count)
--
-- Syncs so far this month, excluding today. Pairs with
-- v_metric__syncs_trajectory, which divides this same count by complete days.
-- A tile showing a through-today figure beside a through-yesterday trajectory
-- is the inconsistency this convention exists to prevent.
--
-- Distinct from Syncs #55, which is the full-month total and must stay that
-- way — it feeds Marketing, the AI chart builder and 19 dbt consumers.

SELECT period, CAST(syncs_mtd AS FLOAT64) AS value
FROM `project-for-method-dw`.`revenue`.`int_method_monday`;

