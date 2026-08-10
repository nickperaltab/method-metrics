
SELECT ROUND((SELECT value FROM `project-for-method-dw.revenue_metrics.v_metric__conversions_trajectory`),2) conv_traj_ours,
       65.1 AS looker,
       ROUND((SELECT value FROM `project-for-method-dw.revenue_metrics.v_metric__syncs_trajectory`),2) syncs_traj,
       ROUND((SELECT value FROM `project-for-method-dw.revenue_metrics.v_metric__sync_conversion_rate_trajectory`)*100,2) sync_rate_traj_pct