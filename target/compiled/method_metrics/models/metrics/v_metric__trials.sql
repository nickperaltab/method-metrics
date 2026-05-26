

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
ORDER BY 1