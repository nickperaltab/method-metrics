
WITH conv AS (SELECT DATE_TRUNC(FirstSaaSInvoiceTxnDate,MONTH) p, COUNT(*) c FROM `project-for-method-dw.revenue.int_conversions` GROUP BY 1),
tr AS (SELECT DATE_ADD(DATE_TRUNC(SignupDate,MONTH), INTERVAL 1 MONTH) p, COUNT(*) pt FROM `project-for-method-dw.revenue.int_trials` GROUP BY 1),
o AS (SELECT DATE_TRUNC(Date,MONTH) p, SUM(Forecasted_Trials) f FROM `project-for-method-dw.revenue.method_forecast` WHERE Date IS NOT NULL GROUP BY 1),
n AS (SELECT DATE_TRUNC(Date,MONTH) p, SUM(Forecasted_Trials) f FROM `project-for-method-dw.revenue.method_forecast_typed` WHERE Date IS NOT NULL GROUP BY 1)
SELECT FORMAT_DATE('%b %Y',conv.p) m,
  ROUND(conv.c/((tr.pt+o.f)/2.0)*100,2) ours_now,
  ROUND(conv.c/((tr.pt+n.f)/2.0)*100,2) ours_fixed
FROM conv JOIN tr USING(p) JOIN o USING(p) JOIN n USING(p)
WHERE conv.p BETWEEN DATE '2026-04-01' AND DATE '2026-07-01' ORDER BY conv.p