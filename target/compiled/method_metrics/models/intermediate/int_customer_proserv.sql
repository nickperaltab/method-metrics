

-- First professional-services / "customization" signal in dbt. Entity grain.
-- Customization = the customer bought project hours = any PS-grouped billing line
-- with positive gross. Uses PSBeforeDiscount (gross); PSAmount is net-of-discount
-- and drifts. Project-HOURS magnitude is intentionally absent here — revenue.TimeTracking
-- is empty in BQ (deferred to V2). is_customized is always TRUE in this view (presence
-- = customized); downstream LEFT JOINs and COALESCE the flag to FALSE for everyone else.

SELECT
  EntityRecordID,
  CAST(SUM(PSBeforeDiscount) AS NUMERIC) AS ps_gross,
  MIN(TxnDate) AS first_ps_date,
  TRUE AS is_customized
FROM `project-for-method-dw`.`revenue`.`TransLineFlattened`
WHERE InvoiceGrouping = 'PS'
  AND PSBeforeDiscount > 0
GROUP BY 1