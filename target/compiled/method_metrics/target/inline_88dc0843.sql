
SELECT 'syncs_traj (#295)' k, FORMAT_DATE('%Y-%m',period) p, ROUND(value,2) v FROM `project-for-method-dw.revenue_metrics.v_metric__syncs_trajectory`
UNION ALL SELECT 'conv_traj (#296)', FORMAT_DATE('%Y-%m',period), ROUND(value,2) FROM `project-for-method-dw.revenue_metrics.v_metric__conversions_trajectory`
UNION ALL SELECT 'sync_rate_traj (#400) %', FORMAT_DATE('%Y-%m',period), ROUND(value*100,2) FROM `project-for-method-dw.revenue_metrics.v_metric__sync_conversion_rate_trajectory`
UNION ALL SELECT 'budgeted (#401) %', FORMAT_DATE('%Y-%m',period), ROUND(value*100,2) FROM `project-for-method-dw.revenue_metrics.v_metric__sync_conversion_rate_budgeted` WHERE period=DATE_TRUNC(CURRENT_DATE(),MONTH)
UNION ALL SELECT 'forecasted (#402) %', FORMAT_DATE('%Y-%m',period), ROUND(value*100,2) FROM `project-for-method-dw.revenue_metrics.v_metric__sync_conversion_rate_forecasted` WHERE period=DATE_TRUNC(CURRENT_DATE(),MONTH)
ORDER BY 1