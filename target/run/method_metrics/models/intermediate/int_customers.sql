
  
    

    create or replace table `project-for-method-dw`.`revenue`.`int_customers`
      
    
    

    
    OPTIONS(
      description=""""""
    )
    as (
      -- Migrated from the orphaned BQ view of the same name.
-- Original DDL captured in knowledge/verified-queries/int_customers-pre-migration-ddl.sql.
--
-- Grain: one row per (Month, EntityRecordID) for active paying customers.
--
-- DETERMINISM FIX (2026-06-04, branch validation/int-customers-dedup):
--   The original view's dim columns (AttributionChannel / SignupCountry /
--   Vertical / SyncType) FLICKERED run-to-run. There are no duplicate output
--   rows — the row count per (EntityRecordID, Month) is already exactly 1. The
--   non-determinism lived INSIDE entity_monthly: each dim is picked via
--   ARRAY_AGG(... ORDER BY ad.FirstSaaSInvoiceTxnDate LIMIT 1). When a customer
--   owns >1 CompanyAccount sharing the SAME MIN(FirstSaaSInvoiceTxnDate), that
--   ORDER BY ties and BigQuery picks an arbitrary tied row per execution.
--   ~260 customer-months had differing dims among tied accounts (the flicker).
--
--   Tiebreaker chosen: append `, ad.CompanyAccount ASC` to every dim ORDER BY.
--   Rationale:
--     - CompanyAccount is unique within an (EntityRecordID, Month) group, so it
--       fully resolves every tie — zero ambiguity remains.
--     - It preserves the original semantics: FirstSaaSInvoiceTxnDate ASC stays
--       the primary key, so the "founding account" still wins; CompanyAccount
--       only decides among exact date ties. Non-tied rows are unchanged vs prod.
--     - CompanyAccount ASC mirrors int_customer_mrr's own first-company logic
--       (ARRAY_AGG(CompanyAccount ORDER BY SaaSAmount DESC, CompanyAccount ASC
--       LIMIT 1)), keeping the two models' tiebreak sense consistent.



WITH monthly_accounts AS (
  SELECT
    t.EntityRecordID, DATE_TRUNC(t.TxnDate, MONTH) AS Month, t.CompanyAccount,
    MAX(t.UserPaidCount) AS UserPaidCount,
    MAX(CASE WHEN (t.AccountFullName LIKE '%Premium App%' OR t.AccountFullName LIKE '%Enhancement Plan%') AND t.SaaSAmount != 0 THEN 1 ELSE 0 END) AS has_dep_txn
  FROM `project-for-method-dw`.`revenue`.`TransLineFlattened` t
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
  FROM `project-for-method-dw`.`revenue`.`Account` a
  WHERE a.IsConversionException = FALSE AND a.Partner != 'Method Integration'
),
entity_monthly AS (
  SELECT
    ma.EntityRecordID, ma.Month,
    COUNT(DISTINCT ma.CompanyAccount) AS AccountCount,
    SUM(ma.UserPaidCount) AS TotalUsers,
    MAX(ma.has_dep_txn) AS HasDEP,
    -- Deterministic dim pick: founding account (earliest FirstSaaSInvoiceTxnDate),
    -- ties broken by CompanyAccount ASC (unique within the group) so no run-to-run flicker.
    ARRAY_AGG(ad.AttributionChannel IGNORE NULLS ORDER BY ad.FirstSaaSInvoiceTxnDate, ad.CompanyAccount ASC LIMIT 1)[SAFE_OFFSET(0)] AS AttributionChannel,
    ARRAY_AGG(ad.SignupCountry      IGNORE NULLS ORDER BY ad.FirstSaaSInvoiceTxnDate, ad.CompanyAccount ASC LIMIT 1)[SAFE_OFFSET(0)] AS SignupCountry,
    ARRAY_AGG(ad.Vertical           IGNORE NULLS ORDER BY ad.FirstSaaSInvoiceTxnDate, ad.CompanyAccount ASC LIMIT 1)[SAFE_OFFSET(0)] AS Vertical,
    ARRAY_AGG(ad.SyncType           IGNORE NULLS ORDER BY ad.FirstSaaSInvoiceTxnDate, ad.CompanyAccount ASC LIMIT 1)[SAFE_OFFSET(0)] AS SyncType
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
JOIN `project-for-method-dw`.`revenue`.`Entity` e ON em.EntityRecordID = e.RecordID
    );
  