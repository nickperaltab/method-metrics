

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__sync_conversion_rate_trajectory`
  OPTIONS(
      description="""The sync conversion rate for the in-progress month \u2014 signup-cohort\nsyncs (see Syncs #55) divided into conversions, both counted through\nyesterday over the same complete-days (day_of_month - 1) window.\nDespite the model name, this is NOT a projection: because both sides\nscale by the identical divisor, it reduces algebraically to the\nplain through-yesterday ratio (conversions_mtd / syncs_mtd) \u2014 it\ncarries no forward-looking information beyond what's already in the\nMTD actuals. Same-month, no lag, matching Sync-to-Conversion Rate\n(#301). Emits a decimal rate, not a percentage.\n""",
    
      labels=[('metric_id', '400'), ('layer', 'metrics'), ('type', 'ratio'), ('status', 'queued'), ('source_table', ''), ('source_measure_safe', ''), ('depends_on', '296-295')]
    )
  as 

-- Canonical metric: "Sync Conversion Rate Trajectory"
-- Type: ratio (cross-model)
-- Formula: SAFE_DIVIDE(conversions trajectory, syncs trajectory)
--
-- Same-month, no lag — matching v_metric__sync_to_conversion_rate. Both
-- inputs project the in-progress month to month-end using the same
-- complete-days (day_of_month - 1) divisor and through-yesterday numerator,
-- so the ratio is internally consistent.
--
-- Emits a decimal rate (0.28), not a percentage (28.0).

SELECT
  COALESCE(c.period, s.period) AS period,
  SAFE_DIVIDE(c.value, s.value) AS value
FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__conversions_trajectory` c
FULL OUTER JOIN `project-for-method-dw`.`revenue_metrics`.`v_metric__syncs_trajectory` s
  ON c.period = s.period
ORDER BY 1;

