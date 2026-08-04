
SELECT
  DATE_TRUNC(Date, MONTH) AS period,
  SUM(Budgeted_Conversion)  AS budg_conv,
  SUM(Budgeted_Syncs)       AS budg_syncs,
  SUM(Forecasted_Conversion) AS fc_conv,
  SUM(Forecasted_Syncs)      AS fc_syncs
FROM `project-for-method-dw.revenue.method_forecast`
GROUP BY 1 ORDER BY 1