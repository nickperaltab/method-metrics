
SELECT FORMAT_DATE('%Y-%m-%d', FirstSaaSInvoiceTxnDate) period, COUNT(*) value
FROM `project-for-method-dw.revenue.int_conversions`
WHERE FirstSaaSInvoiceTxnDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 2 MONTH), MONTH)
  AND FirstSaaSInvoiceTxnDate <= CURRENT_DATE()
GROUP BY 1 ORDER BY 1