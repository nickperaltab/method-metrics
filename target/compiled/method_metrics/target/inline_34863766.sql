
WITH acct AS (
  SELECT IF(SignupDate < DATE '2019-01-01', 'pre-2019', '2019+') AS era,
         NULLIF(CustDatFirstSyncCompleted, DATE '0001-01-01') AS first_sync,
         NULLIF(SyncTypeRegion, '') AS region
  FROM `project-for-method-dw.revenue.Account`
  WHERE IsConversionException = FALSE AND Partner != 'Method Integration'
)
SELECT era,
       COUNT(*) AS filtered_accounts,
       COUNTIF(region IS NOT NULL) AS in_region_signal,
       COUNTIF(first_sync IS NOT NULL) AS has_completion_date,
       COUNTIF(region IS NOT NULL AND first_sync IS NOT NULL) AS in_both,
       COUNTIF(region IS NOT NULL AND first_sync IS NULL) AS region_only,
       COUNTIF(region IS NULL AND first_sync IS NOT NULL) AS field_only
FROM acct GROUP BY era ORDER BY era