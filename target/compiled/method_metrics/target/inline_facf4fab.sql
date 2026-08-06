
SELECT t.period,
       ROUND(t.value, 4) AS traj_400,
       ROUND(f.value, 4) AS fcst_402,
       ROUND((t.value - f.value) * 100, 2) AS kpi_404_pp,
       ROUND(SAFE_DIVIDE(t.value, f.value) * 100, 2) AS kpi_405_pct
FROM `project-for-method-dw.revenue_metrics.v_metric__sync_conversion_rate_trajectory` t
JOIN `project-for-method-dw.revenue_metrics.v_metric__sync_conversion_rate_forecasted` f
  USING (period)