

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__sync_conversion_rate_trajectory`
  OPTIONS(
      description="""Month-end projection of the sync conversion rate for the in-progress\nmonth \u2014 projected conversions divided by projected sync events. Both\nsides use the same day_of_month projection, so the ratio is stable\nthrough the month. Same-month, no lag, matching Sync-to-Conversion\nRate (#301). Emits a decimal rate, not a percentage.\n""",
    
      labels=[('metric_id', '400'), ('layer', 'metrics'), ('type', 'ratio'), ('status', 'live'), ('verified_at', '2026-08-04'), ('source_table', ''), ('source_measure_safe', ''), ('depends_on', '296-295')]
    )
  as 

-- Canonical metric: "Sync Conversion Rate Trajectory"
-- Type: ratio (cross-model)
-- Formula: SAFE_DIVIDE(conversions trajectory, syncs trajectory)
--
-- Same-month, no lag — matching v_metric__sync_to_conversion_rate. Both
-- inputs project the in-progress month to month-end using the same
-- day_of_month divisor, so the ratio is internally consistent.
--
-- Emits a decimal rate (0.28), not a percentage (28.0).

SELECT
  COALESCE(c.period, s.period) AS period,
  SAFE_DIVIDE(c.value, s.value) AS value
FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__conversions_trajectory` c
FULL OUTER JOIN `project-for-method-dw`.`revenue_metrics`.`v_metric__syncs_trajectory` s
  ON c.period = s.period
ORDER BY 1;

