

  create or replace view `project-for-method-dw`.`revenue`.`v_metric__sync_rate`
  OPTIONS(
      description="""Monthly Sync Rate \u2014 sync milestone events divided by trial signups\nthat month, at account-grain. Today's typical range is 50-65%. Not\na clean \"% of customers who synced\" \u2014 both numerator and denominator\nare account/event counts. For exact \"fraction of unique trial cohort\nthat synced,\" a different metric would be needed.\n""",
    
      labels=[('metric_id', '300'), ('layer', 'metrics'), ('type', 'ratio'), ('status', 'live'), ('verified_at', ''), ('source_table', ''), ('source_measure_safe', ''), ('depends_on', '55-54')]
    )
  as 

-- Canonical metric: "Sync Rate" (#300)
-- Type: ratio (cross-model: numerator from v_syncs, denominator from v_trials)
-- Formula: SAFE_DIVIDE(syncs.value, trials.value) per period
-- Materialization: rolling 24 months ending at the current day.
-- Description and BQ labels come from v_metric__sync_rate.yml — at `dbt run`
-- time, dbt-bigquery wraps this SELECT with CREATE OR REPLACE VIEW ...
-- OPTIONS(description, labels) automatically.

SELECT
  COALESCE(s.period, t.period) AS period,
  SAFE_DIVIDE(s.value, t.value) AS value
FROM `project-for-method-dw`.`revenue`.`v_metric__syncs` s
FULL OUTER JOIN `project-for-method-dw`.`revenue`.`v_metric__trials` t
  ON s.period = t.period
ORDER BY 1;

