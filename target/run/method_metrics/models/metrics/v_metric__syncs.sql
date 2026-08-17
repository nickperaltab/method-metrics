

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__syncs`
  OPTIONS(
      description="""Monthly count of Method accounts that hit a sync milestone, per\nrevenue.Funnel's Sync branch. Account-grain \u2014 one row per account,\nnever per event: Funnel is a UNION ALL view over Account, not an\nevent log, so there is no such thing as a repeat sync event in this\ndata. Foundation for Sync Rate (#300).\n""",
    
      labels=[('metric_id', '55'), ('layer', 'metrics'), ('type', 'simple'), ('status', 'live'), ('verified_at', '2026-04-07'), ('source_table', 'v_syncs'), ('source_measure_safe', 'count_star'), ('depends_on', '')]
    )
  as 

-- Canonical metric: "Syncs" (#55)
-- Type: simple aggregation of v_syncs.SyncDate (COUNT(*) per month)
-- Materialization: rolling 24 months ending at the current day.
-- Description and BQ labels come from v_metric__syncs.yml — at `dbt run`
-- time, dbt-bigquery wraps this SELECT with CREATE OR REPLACE VIEW ...
-- OPTIONS(description, labels) automatically.

SELECT
  DATE_TRUNC(SyncDate, MONTH) AS period,
  COUNT(*) AS value
FROM `project-for-method-dw`.`revenue`.`int_syncs`
WHERE SyncDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1;

