
WITH t AS (SELECT DATE_ADD(DATE_TRUNC(SignupDate,MONTH),INTERVAL 1 MONTH) p, COUNT(*) pt FROM `project-for-method-dw.revenue.int_trials` GROUP BY 1),
f AS (SELECT DATE_TRUNC(Date,MONTH) p, SUM(Forecasted_Trials) ft FROM `project-for-method-dw.revenue.method_forecast` WHERE Date IS NOT NULL GROUP BY 1)
SELECT t.pt prior_trials, f.ft forecast, ROUND((t.pt+f.ft)/2.0,1) denom,
  ROUND(65.1/((t.pt+f.ft)/2.0)*100,2) traj_rate_pct
FROM t JOIN f USING(p) WHERE t.p=DATE_TRUNC(CURRENT_DATE(),MONTH)