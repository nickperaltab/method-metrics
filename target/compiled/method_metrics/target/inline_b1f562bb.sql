
SELECT
 (SELECT ROUND(value,2) FROM `project-for-method-dw.revenue_metrics.v_metric__conversions_trajectory`) conv_traj_before,
 (SELECT ROUND(value,2) FROM `project-for-method-dw.revenue_metrics.v_metric__syncs_trajectory`) syncs_traj_before