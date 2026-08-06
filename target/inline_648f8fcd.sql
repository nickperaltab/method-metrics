
SELECT FORMAT_DATE('%b %Y', DATE_TRUNC(m.Date, MONTH)) mo,
  ROUND(SUM(m.Forecasted_Trials),1) mf_trials, ROUND(SUM(t.Forecasted_Trials),1) typed_trials,
  ROUND(SUM(m.Forecasted_Syncs),1) mf_syncs,   ROUND(SUM(t.Forecasted_Syncs),1) typed_syncs,
  ROUND(SUM(m.Forecasted_Conversion),1) mf_cv, ROUND(SUM(t.Forecasted_Conversion),1) typed_cv,
  IF(SUM(m.Forecasted_Trials)=SUM(t.Forecasted_Trials)
     AND SUM(m.Forecasted_Syncs)=SUM(t.Forecasted_Syncs)
     AND SUM(m.Forecasted_Conversion)=SUM(t.Forecasted_Conversion), 'MATCH', 'DIFF') verdict
FROM `project-for-method-dw.revenue.method_forecast` m
JOIN `project-for-method-dw.revenue.method_forecast_typed` t USING (Date)
WHERE m.Date BETWEEN DATE '2025-12-01' AND DATE '2026-07-31'
GROUP BY 1, DATE_TRUNC(m.Date, MONTH) ORDER BY DATE_TRUNC(m.Date, MONTH)