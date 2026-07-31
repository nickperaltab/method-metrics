
SELECT COUNT(*) AS rows_with_date,
       COUNTIF(CustDatFirstSyncCompleted = CAST(SignupDate AS DATE)) AS equals_signup_date,
       COUNTIF(CustDatFirstSyncCompleted < CAST(SignupDate AS DATE)) AS before_signup_date,
       MIN(DATE_DIFF(CustDatFirstSyncCompleted, CAST(SignupDate AS DATE), DAY)) AS min_lag_days
FROM `project-for-method-dw.revenue.Funnel`
WHERE EventType = 'Sync' AND CustDatFirstSyncCompleted != DATE '0001-01-01'