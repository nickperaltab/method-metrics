
SELECT FORMAT_DATE('%b %Y', DATE_TRUNC(Date, MONTH)) m,
  MAX(Forecasted_Trials) t_day, SUM(Forecasted_Trials) t_sum,
  MAX(Forecasted_Syncs) s_day, SUM(Forecasted_Syncs) s_sum,
  MAX(Forecasted_Conversion) c_day, SUM(Forecasted_Conversion) c_sum,
  ROUND(SAFE_DIVIDE(SUM(Forecasted_Conversion), SUM(Forecasted_Syncs))*100, 2) fcst_sync_rate
FROM `project-for-method-dw.revenue.method_forecast`
WHERE Date BETWEEN DATE '2025-12-01' AND DATE '2026-07-31'
GROUP BY 1, DATE_TRUNC(Date, MONTH) ORDER BY DATE_TRUNC(Date, MONTH)