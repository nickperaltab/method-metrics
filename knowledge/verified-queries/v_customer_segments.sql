-- v_customer_segments: Entity-level customer segmentation by license tier × DEP status
-- One row per entity (customer) per month.
--
-- Customer = EntityRecordID (groups multiple accounts under one entity)
-- TotalUsers = SUM(UserPaidCount) across all accounts in the entity (historical, changes monthly)
-- HasDEP = TRUE if ANY account in the entity had a DEP transaction that month
-- Segment = mutually exclusive: Team AI Plus > 4+ no DEP > 2-3 no DEP > Solo no DEP
--
-- Verified 2026-04-16:
--   Mar 2026: 3,695 total entities (vs 4,018 accounts)
--   Solo no DEP: 1,173 | 2-3 no DEP: 1,121 | 4+ no DEP: 1,085 | Team AI Plus: 316
--   Segments sum to total ✓

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_customer_segments` AS
WITH monthly_accounts AS (
  SELECT
    t.EntityRecordID,
    DATE_TRUNC(t.TxnDate, MONTH) AS Month,
    t.CompanyAccount,
    MAX(t.UserPaidCount) AS UserPaidCount,
    MAX(CASE WHEN t.AccountFullName LIKE '%Premium App%' OR t.AccountFullName LIKE '%Enhancement Plan%' THEN 1 ELSE 0 END) AS has_dep_txn
  FROM `project-for-method-dw.revenue.TransLineFlattened` t
  WHERE t.IsConversionException = FALSE
    AND t.Partner != 'Method Integration'
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
JOIN `project-for-method-dw.revenue.Entity` e ON em.EntityRecordID = e.RecordID;
