
SELECT 'fcst_sync_rate' k, FORMAT_DATE('%Y-%m',period) p, ROUND(value*100,4) v FROM `project-for-method-dw.revenue_metrics.v_metric__sync_conversion_rate_forecasted` WHERE period>=DATE '2025-12-01'
UNION ALL SELECT 'budg_sync_rate', FORMAT_DATE('%Y-%m',period), ROUND(value*100,4) FROM `project-for-method-dw.revenue_metrics.v_metric__sync_conversion_rate_budgeted` WHERE period>=DATE '2025-12-01'
UNION ALL SELECT 'trial_rate_357', FORMAT_DATE('%Y-%m',period), ROUND(value*100,4) FROM `project-for-method-dw.revenue_metrics.v_metric__trial_conversion_rate_lagged` WHERE period>=DATE '2025-12-01'
ORDER BY 1,2