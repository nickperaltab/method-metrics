
SELECT
 (SELECT ROUND(value,2) FROM `project-for-method-dw.revenue_metrics.v_metric__trials_trajectory`) trials,
 (SELECT ROUND(value,2) FROM `project-for-method-dw.revenue_metrics.v_metric__syncs_trajectory`) syncs,
 (SELECT ROUND(value,2) FROM `project-for-method-dw.revenue_metrics.v_metric__conversions_trajectory`) conv,
 (SELECT ROUND(value,2) FROM `project-for-method-dw.revenue_metrics.v_metric__churn_trajectory`) churn