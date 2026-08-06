
SELECT DATE_TRUNC(CAST(SignupDate AS DATE), MONTH) AS signup_month,
       COUNT(*) AS sync_rows,
       SAFE_DIVIDE(COUNTIF(CustDatFirstSyncCompleted != DATE '0001-01-01'
             AND CustDatFirstSyncCompleted > LAST_DAY(CAST(SignupDate AS DATE), MONTH)),
             COUNT(*)) AS filled_after_month_end,
       SAFE_DIVIDE(COUNTIF(CustDatFirstSyncCompleted != DATE '0001-01-01'
             AND CustDatFirstSyncCompleted
                 > DATE_ADD(LAST_DAY(CAST(SignupDate AS DATE), MONTH), INTERVAL 30 DAY)),
             COUNT(*)) AS filled_after_month_end_plus_30d
FROM `project-for-method-dw.revenue.Funnel`
WHERE EventType = 'Sync'
  AND SignupDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 15 MONTH)
  AND SignupDate <  DATE_TRUNC(CURRENT_DATE(), MONTH)
GROUP BY 1 ORDER BY 1
