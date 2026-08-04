
SELECT 'conversions_trajectory' v, CAST(COUNT(*) AS STRING) n, CAST(ROUND(MAX(value),4) AS STRING) val FROM `project-for-method-dw.revenue_metrics.v_metric__conversions_trajectory`
UNION ALL SELECT 'syncs_trajectory', CAST(COUNT(*) AS STRING), CAST(ROUND(MAX(value),4) AS STRING) FROM `project-for-method-dw.revenue_metrics.v_metric__syncs_trajectory`
UNION ALL SELECT 'sync_conv_rate_trajectory', CAST(COUNT(*) AS STRING), CAST(ROUND(MAX(value),4) AS STRING) FROM `project-for-method-dw.revenue_metrics.v_metric__sync_conversion_rate_trajectory`
UNION ALL SELECT 'sync_conv_rate_weekly', CAST(COUNT(*) AS STRING), CAST(ROUND(MAX(value),4) AS STRING) FROM `project-for-method-dw.revenue_metrics.v_metric__sync_conversion_rate_weekly`
UNION ALL SELECT 'sync_conv_rate_budgeted', CAST(COUNT(*) AS STRING), CAST(ROUND(MAX(value),4) AS STRING) FROM `project-for-method-dw.revenue_metrics.v_metric__sync_conversion_rate_budgeted`
UNION ALL SELECT 'sync_conv_rate_forecasted', CAST(COUNT(*) AS STRING), CAST(ROUND(MAX(value),4) AS STRING) FROM `project-for-method-dw.revenue_metrics.v_metric__sync_conversion_rate_forecasted`
UNION ALL SELECT 'trial_conv_rate_lagged', CAST(COUNT(*) AS STRING), CAST(ROUND(MAX(value),4) AS STRING) FROM `project-for-method-dw.revenue_metrics.v_metric__trial_conversion_rate_lagged`
ORDER BY 1