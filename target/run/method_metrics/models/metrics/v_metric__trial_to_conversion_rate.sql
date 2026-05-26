

  create or replace view `project-for-method-dw`.`revenue`.`v_metric__trial_to_conversion_rate`
  OPTIONS(
      description="""Monthly Trial-to-Conversion Rate \u2014 conversions divided by trials\nthat month, at account-grain. Measures how well trial accounts\nprogress to paying customers. Both numerator and denominator are\naccount-grain counts (see Conversions #56 and Trials #54). Use for\nfunnel-stage analysis. Note: the numerator (conversions) and\ndenominator (trials) for the same month don't share a cohort \u2014\nmost conversions in a given month come from trials in earlier\nmonths. For cohort-locked conversion rate, a different metric\nwould be needed.\n""",
    
      labels=[('metric_id', '302'), ('layer', 'metrics'), ('type', 'ratio'), ('status', 'live'), ('verified_at', '2026-05-14'), ('source_table', ''), ('source_measure_safe', ''), ('depends_on', '56-54')]
    )
  as 

-- Canonical metric: "Trial-to-Conversion Rate" (#302)
-- Type: ratio (cross-model)
-- Formula: SAFE_DIVIDE(conversions, trials) per period

SELECT
  COALESCE(c.period, t.period) AS period,
  SAFE_DIVIDE(c.value, t.value) AS value
FROM `project-for-method-dw`.`revenue`.`v_metric__conversions` c
FULL OUTER JOIN `project-for-method-dw`.`revenue`.`v_metric__trials` t
  ON c.period = t.period
ORDER BY 1;

