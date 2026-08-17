
SELECT
 (SELECT ROUND(value,2) FROM `project-for-method-dw.revenue_metrics.v_metric__conversions_forecast_mtd`) conv_fc_mtd,
 (SELECT ROUND(value,2) FROM `project-for-method-dw.revenue_metrics.v_metric__churn_forecast_mtd`) churn_fc_mtd,
 (SELECT ROUND(value,2) FROM `project-for-method-dw.revenue_metrics.v_metric__sync_rate_mtd`) sync_rate_mtd