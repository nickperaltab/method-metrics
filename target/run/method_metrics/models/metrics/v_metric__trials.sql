

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__trials`
  OPTIONS(
      description="""Monthly count of Method accounts that began a trial. Account-grain \u2014\na customer with 2 trial accounts contributes 2 trials, by design.\nExcludes test accounts, internal Method Integration partner rows,\nand the '0001-01-01' sentinel value. For unique-customer counts,\nuse Customers (#373).\n""",
    
      labels=[('metric_id', '54'), ('layer', 'metrics'), ('type', 'simple'), ('status', 'live'), ('verified_at', '2026-04-07'), ('source_table', 'v_trials'), ('source_measure_safe', 'count_star'), ('depends_on', '')]
    )
  as 

-- Canonical metric: "Trials" (#54)
-- Type: simple aggregation of v_trials.SignupDate (COUNT(*) per month)
-- Materialization: rolling 24 months ending at the current day.
-- Description and BQ labels come from v_metric__trials.yml — at `dbt run`
-- time, dbt-bigquery wraps this SELECT with CREATE OR REPLACE VIEW ...
-- OPTIONS(description, labels) automatically.

SELECT
  DATE_TRUNC(SignupDate, MONTH) AS period,
  COUNT(*) AS value
FROM `project-for-method-dw`.`revenue`.`int_trials`
WHERE SignupDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1;

