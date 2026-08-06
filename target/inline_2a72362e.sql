
WITH months AS (
  SELECT DATE_TRUNC(m, MONTH) AS period
  FROM UNNEST(GENERATE_DATE_ARRAY(
    DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 12 MONTH),
    DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH),
    INTERVAL 1 MONTH)) AS m
),
events AS (
  SELECT DATE_TRUNC(SyncDate, MONTH) AS period, COUNT(*) AS sync_events
  FROM `project-for-method-dw.revenue.int_syncs`
  GROUP BY 1
),
sync_dated AS (
  SELECT DATE_TRUNC(CustDatFirstSyncCompleted, MONTH) AS period,
         COUNT(*) AS accounts_sync_dated
  FROM `project-for-method-dw.revenue.Funnel`
  WHERE EventType = 'Sync'
    AND CustDatFirstSyncCompleted != DATE '0001-01-01'
  GROUP BY 1
),
conversions AS (
  SELECT DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS period,
         COUNT(*) AS conversions
  FROM `project-for-method-dw.revenue.int_conversions`
  GROUP BY 1
)
SELECT
  SUM(COALESCE(ev.sync_events,0)) AS tot_events,
  SUM(COALESCE(sd.accounts_sync_dated,0)) AS tot_sync_dated,
  SUM(COALESCE(cv.conversions,0)) AS tot_conversions
FROM months m
LEFT JOIN events ev USING (period)
LEFT JOIN sync_dated sd USING (period)
LEFT JOIN conversions cv USING (period)
