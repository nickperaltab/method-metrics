
WITH conv AS (SELECT DATE_TRUNC(FirstSaaSInvoiceTxnDate,MONTH) p, COUNT(*) c FROM `project-for-method-dw.revenue.int_conversions` GROUP BY 1),
tr AS (SELECT DATE_ADD(DATE_TRUNC(SignupDate,MONTH), INTERVAL 1 MONTH) p, COUNT(*) prior_trials FROM `project-for-method-dw.revenue.int_trials` GROUP BY 1),
fc AS (SELECT DATE_TRUNC(Date,MONTH) p, SUM(Forecasted_Trials) fct FROM `project-for-method-dw.revenue.method_forecast` WHERE Date IS NOT NULL GROUP BY 1)
SELECT FORMAT_DATE('%b',conv.p) m, conv.c, tr.prior_trials, fc.fct,
  ROUND((tr.prior_trials+fc.fct)/2.0,1) denom,
  ROUND(conv.c/((tr.prior_trials+fc.fct)/2.0)*100,2) ours,
  ROUND(conv.c/tr.prior_trials*100,2) if_prior_only,
  ROUND(conv.c/fc.fct*100,2) if_fcst_only
FROM conv JOIN tr USING(p) JOIN fc USING(p)
WHERE conv.p BETWEEN DATE '2026-05-01' AND DATE '2026-07-01' ORDER BY conv.p