
SELECT FORMAT_DATE('%Y-%m', period) AS period, value
FROM `project-for-method-dw.revenue_metrics.v_metric__sync_to_conversion_rate`
WHERE period >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
ORDER BY 1 DESC
