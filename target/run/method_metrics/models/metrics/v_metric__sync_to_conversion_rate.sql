

  create or replace view `project-for-method-dw`.`revenue`.`v_metric__sync_to_conversion_rate`
  OPTIONS(
      description="""Monthly Sync-to-Conversion Rate \u2014 conversions divided by syncs that\nmonth, at account-grain. Measures how well synced accounts progress\nto paying customers. Both numerator and denominator are account/event\ncounts (see Conversions #56 and Syncs #55). Use for funnel-stage\nanalysis, not as a clean \"% of unique sync cohort that converted.\"\n""",
    
      labels=[('metric_id', '301'), ('layer', 'metrics'), ('type', 'ratio'), ('status', 'live'), ('verified_at', '2026-05-14'), ('source_table', ''), ('source_measure_safe', ''), ('depends_on', '56-55')]
    )
  as 

-- Canonical metric: "Sync-to-Conversion Rate" (#301)
-- Type: ratio (cross-model)
-- Formula: SAFE_DIVIDE(conversions, syncs) per period

SELECT
  COALESCE(c.period, s.period) AS period,
  SAFE_DIVIDE(c.value, s.value) AS value
FROM `project-for-method-dw`.`revenue`.`v_metric__conversions` c
FULL OUTER JOIN `project-for-method-dw`.`revenue`.`v_metric__syncs` s
  ON c.period = s.period
ORDER BY 1;

