
SELECT FORMAT_DATE('%b %Y', DATE_TRUNC(t.Date, MONTH)) m,
  ROUND(SUM(o.Forecasted_Trials),1) old_trials, ROUND(SUM(t.Forecasted_Trials),1) new_trials,
  ROUND(SUM(o.Forecasted_Syncs),1) old_syncs,  ROUND(SUM(t.Forecasted_Syncs),1) new_syncs,
  ROUND(SUM(o.Forecasted_Conversion),1) old_cv, ROUND(SUM(t.Forecasted_Conversion),1) new_cv,
  ROUND(SAFE_DIVIDE(SUM(o.Forecasted_Conversion),SUM(o.Forecasted_Syncs))*100,2) old_rate,
  ROUND(SAFE_DIVIDE(SUM(t.Forecasted_Conversion),SUM(t.Forecasted_Syncs))*100,2) new_rate
FROM `project-for-method-dw.revenue.method_forecast_typed` t
JOIN `project-for-method-dw.revenue.method_forecast` o USING (Date)
WHERE t.Date BETWEEN DATE '2025-12-01' AND DATE '2026-07-31'
GROUP BY 1, DATE_TRUNC(t.Date, MONTH) ORDER BY DATE_TRUNC(t.Date, MONTH)