-- ============================================================================
-- int_customers — PRE-MIGRATION DDL (orphaned BQ view, project-for-method-dw.revenue)
-- Captured: 2026-06-04
-- Reason: Phase 1 net-SaaS validation found NON-DETERMINISTIC dimension labels
--         (Vertical / AttributionChannel / SyncType) flickering run-to-run on
--         ~260 customer-months. int_customer_mrr LEFT JOINs int_customers for its
--         dim columns, so the flicker propagates into the revenue decomposition.
--
-- ROOT CAUSE (confirmed 2026-06-04):
--   There are NOT duplicate rows per (EntityRecordID, Month) — that count is 0.
--   The non-determinism is INTERNAL to this view, in entity_monthly:
--
--       ARRAY_AGG(ad.AttributionChannel IGNORE NULLS
--                 ORDER BY ad.FirstSaaSInvoiceTxnDate LIMIT 1)[SAFE_OFFSET(0)]
--
--   When a customer (EntityRecordID) owns >1 CompanyAccount that share the SAME
--   MIN(FirstSaaSInvoiceTxnDate), the ORDER BY has a TIE with no further
--   tiebreaker. BigQuery's ARRAY_AGG ... LIMIT 1 then picks an arbitrary tied
--   row per execution, so the dim columns flip between runs.
--
--   Evidence: EntityRecordID 113117 owns two near-identical CompanyAccounts
--   ('hickslp' and 'hicklsp' — a transposed-typo duplicate of the same customer),
--   both with FirstSaaSInvoiceTxnDate = 2020-10-30 but DIFFERENT dims
--   (SEO/Field Services vs Direct/Other). Which one wins flips run-to-run.
--
--   Scale: 428 entity-months have a tie on MIN(FirstSaaSInvoiceTxnDate);
--   260 of those have differing dim values among the tied accounts (the
--   flicker-prone population — matches the Phase 1 ~57-194 observed mismatches,
--   each run flipping a random subset).
--
-- FIX (staging, branch validation/int-customers-dedup):
--   Port to dbt model models/intermediate/int_customers.sql with a deterministic
--   final tiebreaker (CompanyAccount ASC) appended to every dim ARRAY_AGG ORDER BY.
-- ============================================================================

WITH monthly_accounts AS (
  SELECT
    t.EntityRecordID, DATE_TRUNC(t.TxnDate, MONTH) AS Month, t.CompanyAccount,
    MAX(t.UserPaidCount) AS UserPaidCount,
    MAX(CASE WHEN (t.AccountFullName LIKE '%Premium App%' OR t.AccountFullName LIKE '%Enhancement Plan%') AND t.SaaSAmount != 0 THEN 1 ELSE 0 END) AS has_dep_txn
  FROM `project-for-method-dw.revenue.TransLineFlattened` t
  WHERE t.Partner != 'Method Integration' AND t.TxnDate >= '2024-01-01'
  GROUP BY 1, 2, 3
),
account_dims AS (
  SELECT
    a.CompanyAccount, a.FirstSaaSInvoiceTxnDate,
    CASE
      WHEN a.Att_SEO = 1 THEN 'SEO' WHEN a.Att_Pay_Per_Click = 1 THEN 'PPC'
      WHEN a.Att_OPN_Other_Peoples_Networks = 1 THEN 'OPN' WHEN a.Att_Social = 1 THEN 'Social'
      WHEN a.Att_Email = 1 THEN 'Email' WHEN a.Att_Referral_Link = 1 THEN 'Referral'
      WHEN a.Att_Direct = 1 THEN 'Direct' WHEN a.Att_Partners = 1 THEN 'Partners'
      WHEN a.Att_Content = 1 THEN 'Content' WHEN a.Att_Remarketing = 1 THEN 'Remarketing'
      WHEN a.Att_Other = 1 THEN 'Other' WHEN a.Att_None = 1 THEN 'None' ELSE 'Unknown' END AS AttributionChannel,
    a.SignupCountry, a.Vertical, a.SyncType
  FROM `project-for-method-dw.revenue.Account` a
  WHERE a.IsConversionException = FALSE AND a.Partner != 'Method Integration'
),
entity_monthly AS (
  SELECT
    ma.EntityRecordID, ma.Month,
    COUNT(DISTINCT ma.CompanyAccount) AS AccountCount,
    SUM(ma.UserPaidCount) AS TotalUsers,
    MAX(ma.has_dep_txn) AS HasDEP,
    ARRAY_AGG(ad.AttributionChannel IGNORE NULLS ORDER BY ad.FirstSaaSInvoiceTxnDate LIMIT 1)[SAFE_OFFSET(0)] AS AttributionChannel,
    ARRAY_AGG(ad.SignupCountry      IGNORE NULLS ORDER BY ad.FirstSaaSInvoiceTxnDate LIMIT 1)[SAFE_OFFSET(0)] AS SignupCountry,
    ARRAY_AGG(ad.Vertical           IGNORE NULLS ORDER BY ad.FirstSaaSInvoiceTxnDate LIMIT 1)[SAFE_OFFSET(0)] AS Vertical,
    ARRAY_AGG(ad.SyncType           IGNORE NULLS ORDER BY ad.FirstSaaSInvoiceTxnDate LIMIT 1)[SAFE_OFFSET(0)] AS SyncType
  FROM monthly_accounts ma LEFT JOIN account_dims ad ON ma.CompanyAccount = ad.CompanyAccount
  GROUP BY 1, 2
),
max_month AS (SELECT MAX(Month) AS m FROM entity_monthly)
SELECT
  em.Month, em.EntityRecordID, e.EntityFullName,
  em.AccountCount, em.TotalUsers, em.HasDEP = 1 AS HasDEP,
  CASE WHEN em.TotalUsers = 1 THEN 'Solo' WHEN em.TotalUsers BETWEEN 2 AND 3 THEN 'Small Team' ELSE 'Team' END AS UserTier,
  CASE WHEN em.HasDEP = 1 THEN 'Team AI Plus' WHEN em.TotalUsers >= 4 THEN '4+ no DEP' WHEN em.TotalUsers >= 2 THEN '2-3 no DEP' ELSE 'Solo no DEP' END AS Segment,
  em.AttributionChannel, em.SignupCountry, em.Vertical, em.SyncType,
  TRUE AS IsActive,
  LAG(em.Month) OVER (PARTITION BY em.EntityRecordID ORDER BY em.Month) IS NULL AS IsNew,
  LEAD(em.Month) OVER (PARTITION BY em.EntityRecordID ORDER BY em.Month) IS NULL AND em.Month < (SELECT m FROM max_month) AS IsChurned
FROM entity_monthly em
JOIN `project-for-method-dw.revenue.Entity` e ON em.EntityRecordID = e.RecordID
