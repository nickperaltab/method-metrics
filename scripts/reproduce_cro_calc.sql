-- Reproduce CRO's NRR & GRR Calculator for Feb 2025 → Feb 2026
-- "Became DEP = Yes" filter: DEPPer1 = 0 AND any DEPPer{2..13} > 0
-- Grain: EntityRecordID × CompanyAccount (matches their GROUP BY)

WITH per_account_periods AS (
  SELECT
    EntityRecordID,
    CompanyAccount,
    -- Period 1 = Feb 2025
    SUM(IF(TxnDate >= '2025-02-01' AND TxnDate < '2025-03-01', SaaSAmount, 0)) AS SaaSPer1,
    SUM(IF(TxnDate >= '2025-02-01' AND TxnDate < '2025-03-01'
           AND (AccountFullName LIKE '%Premium App%' OR AccountFullName LIKE '%Enhancement Plan%'),
           SaaSAmount, 0)) AS DEPPer1,
    SUM(IF(TxnDate >= '2025-02-01' AND TxnDate < '2025-03-01'
           AND BOMCustomerGrouping = 'Lost', SaaSAmount, 0)) AS PrePayExpPer1,
    -- Period 13 = Feb 2026
    SUM(IF(TxnDate >= '2026-02-01' AND TxnDate < '2026-03-01', SaaSAmount, 0)) AS SaaSPer13,
    SUM(IF(TxnDate >= '2026-02-01' AND TxnDate < '2026-03-01'
           AND (AccountFullName LIKE '%Premium App%' OR AccountFullName LIKE '%Enhancement Plan%'),
           SaaSAmount, 0)) AS DEPPer13,
    SUM(IF(TxnDate >= '2026-02-01' AND TxnDate < '2026-03-01'
           AND BOMCustomerGrouping = 'Lost', SaaSAmount, 0)) AS PrePayExpPer13,
    -- Did they have DEP at any point during the 13-month window?
    SUM(IF(TxnDate >= '2025-02-01' AND TxnDate < '2026-03-01'
           AND (AccountFullName LIKE '%Premium App%' OR AccountFullName LIKE '%Enhancement Plan%'),
           SaaSAmount, 0)) AS DEPAny
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE TxnDate >= '2025-02-01' AND TxnDate < '2026-03-01'
    AND CompanyAccount NOT LIKE 'm11%'   -- exclude internal
  GROUP BY EntityRecordID, CompanyAccount
),

-- Apply "Became DEP = Yes" filter: started with $0 DEP AND had DEP at some point
became_dep AS (
  SELECT
    *,
    SaaSPer1  - DEPPer1  - PrePayExpPer1  AS NoDEPPer1,
    SaaSPer13 - DEPPer13 - PrePayExpPer13 AS NoDEPPer13
  FROM per_account_periods
  WHERE DEPPer1 = 0
    AND DEPAny > 0
),

-- Classify each account based on TOTAL SaaS change (not NoDEP — they report NoDEP but classify on total)
classified AS (
  SELECT
    EntityRecordID, CompanyAccount,
    NoDEPPer1, NoDEPPer13, SaaSPer1, SaaSPer13,
    CASE
      WHEN SaaSPer1 = 0 AND SaaSPer13 > 0 THEN 'New ARR'
      WHEN SaaSPer1 > 0 AND SaaSPer13 = 0 THEN 'Churn'
      WHEN SaaSPer1 > 0 AND SaaSPer13 > 0 AND SaaSPer13 < SaaSPer1 THEN 'Downgrade'
      WHEN SaaSPer1 > 0 AND SaaSPer13 > SaaSPer1 THEN 'Upgrade'
      WHEN SaaSPer1 = SaaSPer13 AND SaaSPer1 > 0 THEN 'Unchanged'
      ELSE 'Other'
    END AS RevCat
  FROM became_dep
)

,
-- Final summary: classify by total SaaS, but track NoDEP and Total separately
final AS (
  SELECT
    RevCat,
    COUNT(*) AS account_count,
    ROUND(SUM(NoDEPPer1), 2)  AS noDEP_start,
    ROUND(SUM(NoDEPPer13), 2) AS noDEP_end,
    ROUND(SUM(SaaSPer1), 2)   AS saas_start,
    ROUND(SUM(SaaSPer13), 2)  AS saas_end,
    ROUND(SUM(SaaSPer1) - SUM(SaaSPer13), 2) AS saas_loss
  FROM classified
  GROUP BY RevCat
)

SELECT * FROM final
UNION ALL
SELECT 'TOTAL', SUM(account_count), SUM(noDEP_start), SUM(noDEP_end), SUM(saas_start), SUM(saas_end), SUM(saas_loss)
FROM final
ORDER BY RevCat
