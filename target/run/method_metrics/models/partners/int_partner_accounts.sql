
  
    

    create or replace table `project-for-method-dw`.`revenue`.`int_partner_accounts`
      
    
    

    
    OPTIONS(
      description="""One row per (Partner, CompanyAccount) \u2014 the accounts a referring partner brought in. Partner = raw revenue.Account.Partner string (no normalization in v1). IsActive is a lifecycle flag (FirstSaaSInvoiceTxnDate set AND no CancellationDate), matching the partner CRM \"Active?\" view (SBS: 47/47). MRR and Licenses are point-in-time billing for the latest complete month; they are 0 for accounts that did not bill that month \u2014 including hard-hold accounts that are still lifecycle-active. Excludes the internal \"Method Integration\" partner and m11/m18 test accounts. Account is deduped to one row per CompanyAccount. See spec docs/superpowers/specs/2026-06-25-partner-referral-views-design.md.\n"""
    )
    as (
      

-- One row per (Partner, CompanyAccount): the accounts a partner referred.
--
-- Partner = revenue.Account.Partner (raw string; NO normalization in v1, so
--   variant names like "Outdoor Living Brands, Inc" vs "...Inc" stay separate —
--   see spec follow-ups).
-- IsActive uses the LIFECYCLE definition (first paid + not cancelled). It matches
--   the partner CRM "Active?" view exactly (SBS: 47/47) and is the first
--   account-grain active definition in the project (int_customers is
--   customer-grain). MRR/Licenses are POINT-IN-TIME (latest complete month).
-- IsActive and MRR intentionally do not reconcile: an account on a hard hold has
--   no CancellationDate (IsActive = true) but bills $0 (MRR = 0), which is the
--   financially correct figure. See memory project_hard_hold_billing_state and
--   spec docs/superpowers/specs/2026-06-25-partner-referral-views-design.md.

WITH latest_month AS (
  -- Latest COMPLETE month, so the in-progress month never shows false zeros.
  SELECT DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH) AS m
),
accounts AS (
  -- revenue.Account fans out (~1.22 rows per EntityRecordID); dedup to one row
  -- per CompanyAccount. See memory account_table_dedup.
  SELECT
    Partner,
    CompanyAccount,
    EntityRecordID,
    FirstSaaSInvoiceTxnDate AS SignupDate,
    NULLIF(CancellationDate, DATE '0001-01-01') AS CancellationDate
  FROM (
    SELECT
      a.Partner, a.CompanyAccount, a.EntityRecordID,
      a.FirstSaaSInvoiceTxnDate, a.CancellationDate,
      ROW_NUMBER() OVER (PARTITION BY a.CompanyAccount ORDER BY a.RecordID DESC) AS rn
    FROM `project-for-method-dw`.`revenue`.`Account` a
    WHERE a.Partner IS NOT NULL
      AND a.Partner != ''
      AND a.Partner != 'Method Integration'          -- internal partner
      AND a.CompanyAccount NOT LIKE 'm11%'            -- test accounts
      AND a.CompanyAccount NOT LIKE 'm18%'
  )
  WHERE rn = 1
),
billing AS (
  -- Point-in-time billing for the latest complete month, account grain.
  SELECT
    t.CompanyAccount,
    SUM(t.SaaSAmount) AS MRR,
    MAX(t.UserPaidCount) AS Licenses
  FROM `project-for-method-dw`.`revenue`.`TransLineFlattened` t, latest_month
  WHERE DATE_TRUNC(t.TxnDate, MONTH) = latest_month.m
    AND t.CompanyAccount NOT LIKE 'm11%'
    AND t.CompanyAccount NOT LIKE 'm18%'
  GROUP BY 1
)
SELECT
  ac.Partner,
  ac.CompanyAccount,
  ac.EntityRecordID,
  ac.SignupDate,
  ac.CancellationDate,
  (ac.SignupDate IS NOT NULL AND ac.CancellationDate IS NULL) AS IsActive,
  CAST(COALESCE(b.MRR, 0) AS NUMERIC) AS MRR,
  COALESCE(b.Licenses, 0) AS Licenses
FROM accounts ac
LEFT JOIN billing b ON ac.CompanyAccount = b.CompanyAccount
    );
  