
SELECT column_name, data_type FROM `project-for-method-dw.revenue`.INFORMATION_SCHEMA.COLUMNS
WHERE table_name='Account' AND column_name IN ('FirstSaaSInvoiceTxnDate','SignupDate','CustDatLastRefreshed')
ORDER BY column_name