
SELECT FORMAT_DATE('%Y-%m-%d', FirstSaaSInvoiceTxnDate) d, COUNT(*) n
FROM `project-for-method-dw.revenue.int_conversions`
WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 4 DAY)
GROUP BY 1 ORDER BY 1