
SELECT 'int_conversions MTD' AS what, COUNT(*) AS star, COUNT(DISTINCT CompanyAccount) AS distinct_ca
FROM `project-for-method-dw.revenue.int_conversions`
WHERE FirstSaaSInvoiceTxnDate >= DATE_TRUNC(CURRENT_DATE(),MONTH) AND FirstSaaSInvoiceTxnDate < CURRENT_DATE()
UNION ALL
SELECT 'int_syncs MTD', COUNT(*), COUNT(DISTINCT CompanyAccount)
FROM `project-for-method-dw.revenue.int_syncs`
WHERE SyncDate >= DATE_TRUNC(CURRENT_DATE(),MONTH) AND SyncDate < CURRENT_DATE()
UNION ALL
SELECT 'int_conversions 24mo', COUNT(*), COUNT(DISTINCT CompanyAccount)
FROM `project-for-method-dw.revenue.int_conversions`
WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
