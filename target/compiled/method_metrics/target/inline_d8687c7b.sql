
SELECT DATE_TRUNC(Date, MONTH) AS m, COUNT(*) AS day_rows, MIN(Date) AS first_day, MAX(Date) AS last_day,
       SUM(Forecasted_Trials) AS fc_trials, SUM(Forecasted_Syncs) AS fc_syncs, SUM(Budgeted_Syncs) AS bd_syncs
FROM `project-for-method-dw.revenue.method_forecast`
WHERE Date IS NOT NULL GROUP BY 1 ORDER BY 1