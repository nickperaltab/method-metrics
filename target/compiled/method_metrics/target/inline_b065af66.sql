
WITH j AS (
  SELECT IF(SignupDate < DATE '2019-01-01', 'pre-2019', '2019+') AS era,
         DATE_DIFF(CustDatFirstSyncCompleted, CAST(SignupDate AS DATE), DAY) AS lag_days
  FROM `project-for-method-dw.revenue.Funnel`
  WHERE EventType = 'Sync' AND CustDatFirstSyncCompleted != DATE '0001-01-01'
)
SELECT era, COUNT(*) AS n, COUNTIF(lag_days <= 0) AS on_or_before_signup,
       COUNTIF(lag_days > 30) AS over_30d, COUNTIF(lag_days > 60) AS over_60d
FROM j GROUP BY era
UNION ALL
SELECT 'ALL', COUNT(*), COUNTIF(lag_days <= 0), COUNTIF(lag_days > 30), COUNTIF(lag_days > 60)
FROM j
ORDER BY era