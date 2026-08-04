
SELECT FORMAT_DATE('%b %Y', period) AS month, ROUND(value*100, 2) AS ours_pct
FROM `project-for-method-dw.revenue_metrics.v_metric__trial_conversion_rate_lagged`
WHERE period BETWEEN DATE '2026-04-01' AND DATE '2026-07-01' ORDER BY period