
SELECT period, ROUND(value,4) AS rate FROM `project-for-method-dw.revenue_metrics.v_metric__trial_conversion_rate_lagged` ORDER BY period DESC