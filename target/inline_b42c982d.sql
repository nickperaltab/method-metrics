
SELECT FORMAT_DATE('%Y-%m',DATE_TRUNC(Date,MONTH)) m, ROUND(SUM(Budgeted_Conversion),1) budgeted_conv
FROM `project-for-method-dw.revenue.method_forecast` WHERE Date IS NOT NULL
GROUP BY 1 ORDER BY 1