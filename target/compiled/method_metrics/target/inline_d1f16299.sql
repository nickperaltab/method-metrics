
SELECT table_name, option_value AS labels
FROM `project-for-method-dw.revenue_metrics.INFORMATION_SCHEMA.TABLE_OPTIONS`
WHERE option_name = 'labels'
  AND table_name IN ('v_metric__sync_conversion_rate_trajectory','v_metric__sync_conversion_rate_budgeted','v_metric__sync_conversion_rate_forecasted','v_metric__sync_conversion_rate_weekly')
ORDER BY 1