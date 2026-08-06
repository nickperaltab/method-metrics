
WITH s AS (
  SELECT CompanyAccount FROM `project-for-method-dw.revenue.int_syncs`
  WHERE SyncDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
    AND SyncDate <  DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 12 MONTH)
),
conv AS (SELECT DISTINCT CompanyAccount FROM `project-for-method-dw.revenue.int_conversions`),
cohort AS (
  SELECT COUNT(*) AS synced, COUNTIF(conv.CompanyAccount IS NOT NULL) AS converted
  FROM s LEFT JOIN conv USING (CompanyAccount)
),
shipped AS (
  SELECT
    (SELECT COUNT(*) FROM `project-for-method-dw.revenue.int_conversions`
      WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
        AND FirstSaaSInvoiceTxnDate <  DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 12 MONTH)) AS convs,
    (SELECT COUNT(*) FROM `project-for-method-dw.revenue.int_syncs`
      WHERE SyncDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
        AND SyncDate <  DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 12 MONTH)) AS syncs
)
SELECT cohort.synced, cohort.converted,
       SAFE_DIVIDE(cohort.converted, cohort.synced) AS cohort_rate,
       SAFE_DIVIDE(shipped.convs, shipped.syncs) AS shipped_rate
FROM cohort, shipped