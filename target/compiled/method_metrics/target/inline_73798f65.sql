
SELECT REPLACE(table_name,'v_metric__','') m,
  (SELECT option_value FROM `project-for-method-dw.revenue_metrics`.INFORMATION_SCHEMA.TABLE_OPTIONS o
   WHERE o.table_name=t.table_name AND o.option_name='labels') lbl
FROM `project-for-method-dw.revenue_metrics`.INFORMATION_SCHEMA.TABLES t
WHERE table_name IN ('v_metric__conversions_trajectory','v_metric__syncs_trajectory','v_metric__sync_conversion_rate_trajectory','v_metric__sync_conversion_rate_budgeted','v_metric__sync_conversion_rate_forecasted','v_metric__sync_conversion_rate_weekly','v_metric__trial_conversion_rate_lagged')
ORDER BY 1