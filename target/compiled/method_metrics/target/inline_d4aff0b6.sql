
SELECT FORMAT_DATE('%b %Y', DATE_TRUNC(Date, MONTH)) m,
  COUNT(*) day_rows,
  ROUND(SUM(Forecasted_Trials),2) sum_trials,
  ROUND(MAX(Forecasted_Trials),4) per_day,
  ROUND(MAX(Forecasted_Trials)*COUNT(*),2) implied
FROM `project-for-method-dw.revenue.method_forecast`
WHERE Date BETWEEN DATE '2026-05-01' AND DATE '2026-07-31'
GROUP BY 1, DATE_TRUNC(Date, MONTH) ORDER BY DATE_TRUNC(Date, MONTH)