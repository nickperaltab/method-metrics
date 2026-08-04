
SELECT
  (SELECT value FROM `project-for-method-dw.revenue_metrics.v_metric__conversions` WHERE period = DATE_TRUNC(CURRENT_DATE(),MONTH)) AS conv_56,
  (SELECT value FROM `project-for-method-dw.revenue_metrics.v_metric__syncs` WHERE period = DATE_TRUNC(CURRENT_DATE(),MONTH)) AS syncs_55,
  (SELECT SAFE_DIVIDE(c.value,s.value)*100 FROM `project-for-method-dw.revenue_metrics.v_metric__conversions` c JOIN `project-for-method-dw.revenue_metrics.v_metric__syncs` s USING(period) WHERE period=DATE_TRUNC(CURRENT_DATE(),MONTH)) AS m301_supabase_formula,
  (SELECT value FROM `project-for-method-dw.revenue_metrics.v_metric__sync_to_conversion_rate` WHERE period=DATE_TRUNC(CURRENT_DATE(),MONTH)) AS m301_dbt_view,
  (SELECT value FROM `project-for-method-dw.revenue_metrics.v_metric__sync_conversion_rate_forecasted` WHERE period=DATE_TRUNC(CURRENT_DATE(),MONTH)) AS m402,
  (SELECT MAX(period) FROM `project-for-method-dw.revenue_metrics.v_metric__sync_conversion_rate_forecasted`) AS forecast_max_period
