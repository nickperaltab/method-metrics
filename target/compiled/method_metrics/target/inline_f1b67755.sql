
SELECT
  (SELECT COUNT(*) FROM `project-for-method-dw.revenue.int_conversions` WHERE DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) = DATE('2026-07-01')) AS conversions,
  (SELECT COUNT(*) FROM `project-for-method-dw.revenue.int_syncs` WHERE DATE_TRUNC(SyncDate, MONTH) = DATE('2026-07-01')) AS syncs