-- v_customer_segments: Entity-level customer segmentation by license tier × DEP status
-- One row per entity (customer) per month.
--
-- Customer = EntityRecordID (groups multiple accounts under one entity)
-- TotalUsers = SUM(UserPaidCount) across all accounts in the entity (historical, changes monthly)
-- HasDEP = TRUE if ANY account in the entity had a non-zero DEP line item that month
--   - Accounts with +$325 and -$325 refund → still DEP (individual lines are non-zero)
--   - Accounts with a single $0 DEP line → NOT DEP (effectively paused/cancelled)
-- Segment = mutually exclusive: Team AI Plus > 4+ no DEP > 2-3 no DEP > Solo no DEP
--
-- IMPORTANT: Does NOT filter IsConversionException. Migrated accounts (QBDT→QBO)
-- are real paying customers. IsConversionException only applies to funnel metrics.
--
-- Verified 2026-04-17 against Looker dashboard (exact match all months):
--   Dec 2025: 298 DEP ✓
--   Jan 2026: 308 DEP ✓
--   Feb 2026: 313 DEP ✓
--   Mar 2026: 316 DEP ✓

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_customer_segments` AS
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
JOIN `project-for-method-dw.revenue.Entity` e ON em.EntityRecordID = e.RecordID;
