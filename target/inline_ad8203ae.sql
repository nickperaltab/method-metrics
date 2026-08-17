
SELECT
 (SELECT value FROM `project-for-method-dw.revenue_metrics.v_metric__trials_mtd`) trials,
 (SELECT value FROM `project-for-method-dw.revenue_metrics.v_metric__syncs_mtd`) syncs,
 (SELECT value FROM `project-for-method-dw.revenue_metrics.v_metric__conversions_mtd`) conv,
 (SELECT value FROM `project-for-method-dw.revenue_metrics.v_metric__churn_mtd`) churn