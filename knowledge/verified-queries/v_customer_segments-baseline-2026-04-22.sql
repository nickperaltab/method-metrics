-- Baseline int_customer_segments captured 2026-04-22 (before int_customers refactor).
-- Task 7 artifact — reference for parity gate (Task 9) and rollback (Task 15 reversal).

WITH monthly_accounts AS (
  SELECT
    t.EntityRecordID,
    DATE_TRUNC(t.TxnDate, MONTH) AS Month,
    t.CompanyAccount,
    MAX(t.UserPaidCount) AS UserPaidCount,
    MAX(CASE WHEN (t.AccountFullName LIKE '%Premium App%' OR t.AccountFullName LIKE '%Enhancement Plan%') AND t.SaaSAmount != 0 THEN 1 ELSE 0 END) AS has_dep_txn
  FROM `project-for-method-dw.revenue.TransLineFlattened` t
  WHERE t.Partner != 'Method Integration'
    AND t.TxnDate >= '2024-01-01'
  GROUP BY 1, 2, 3
),
entity_monthly AS (
  SELECT
    EntityRecordID,
    Month,
    COUNT(DISTINCT CompanyAccount) AS AccountCount,
    SUM(UserPaidCount) AS TotalUsers,
    MAX(has_dep_txn) AS HasDEP
  FROM monthly_accounts
  GROUP BY 1, 2
)
SELECT
  em.Month,
  em.EntityRecordID,
  e.EntityFullName,
  em.AccountCount,
  em.TotalUsers,
  em.HasDEP = 1 AS HasDEP,
  CASE
    WHEN em.HasDEP = 1 THEN 'Team AI Plus'
    WHEN em.TotalUsers >= 4 THEN '4+ no DEP'
    WHEN em.TotalUsers >= 2 THEN '2-3 no DEP'
    ELSE 'Solo no DEP'
  END AS Segment
FROM entity_monthly em
JOIN `project-for-method-dw.revenue.Entity` e ON em.EntityRecordID = e.RecordID
