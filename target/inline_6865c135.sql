
SELECT
  COUNT(*) AS mtd_conversions,
  EXTRACT(DAY FROM CURRENT_DATE()) AS day_of_month,
  EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE(), MONTH)) AS days_in_month
FROM `project-for-method-dw.revenue.int_conversions`
WHERE FirstSaaSInvoiceTxnDate >= DATE_TRUNC(CURRENT_DATE(), MONTH)
  AND FirstSaaSInvoiceTxnDate < CURRENT_DATE()
