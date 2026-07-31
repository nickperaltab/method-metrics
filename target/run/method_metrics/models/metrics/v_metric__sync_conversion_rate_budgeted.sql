

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__sync_conversion_rate_budgeted`
  OPTIONS(
      description="""Budgeted sync conversion rate by month \u2014 budgeted conversions divided\nby budgeted sync events, summing daily allocations before dividing.\nDERIVED, not published: method_forecast carries a pre-computed\ntrials-based Budgeted_Conversion_Rate but no sync equivalent. Emits a\ndecimal rate, not a percentage.\n""",
    
      labels=[('metric_id', '401'), ('layer', 'metrics'), ('type', 'derived'), ('status', 'queued'), ('source_table', 'method_forecast'), ('source_measure_safe', ''), ('depends_on', '')]
    )
  as 

-- Canonical metric: "Budgeted Sync Conversion Rate"
-- Type: derived ratio
-- Formula: SUM(Budgeted_Conversion) / SUM(Budgeted_Syncs) per month
--
-- DERIVED, NOT PUBLISHED. method_forecast stores Budgeted_Conversion_Rate
-- as a pre-computed TRIALS rate. There is no stored sync equivalent, so
-- this divides the two budgeted counts. Justin owns revenue methodology
-- and has to confirm the derivation before this goes leadership-facing.
--
-- Sum the daily allocations, THEN divide. Averaging daily ratios would
-- weight a low-volume day the same as a high-volume one.
--
-- Emits a decimal rate (0.25), not a percentage (25.0).

SELECT
  DATE_TRUNC(Date, MONTH) AS period,
  SAFE_DIVIDE(
    SUM(Budgeted_Conversion),
    SUM(Budgeted_Syncs)
  ) AS value
FROM `project-for-method-dw`.`revenue`.`method_forecast`
WHERE Date IS NOT NULL
GROUP BY 1
ORDER BY 1;

