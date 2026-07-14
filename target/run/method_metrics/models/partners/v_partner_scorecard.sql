

  create or replace view `project-for-method-dw`.`revenue`.`v_partner_scorecard`
  OPTIONS(
      description="""One row per partner: roll-up of int_partner_accounts. AccountsReferred is all-time; ActiveAccounts is a lifecycle count (not cancelled); TotalLicenses and TotalMRR are actual billing for the latest complete month. Active count and TotalMRR intentionally do not reconcile (hard-hold accounts are active but bill $0). Raw partner strings in v1, so a partner with name variants can appear as more than one row (3 partners affected; see spec follow-ups).\n"""
    )
  as 

-- One row per partner: roll-up of int_partner_accounts.
--
-- Raw partner strings (v1): variant names are not yet merged, so a partner with
--   name variants appears as >1 row (only 3 partners affected; see spec).
-- ActiveAccounts is a lifecycle count; TotalMRR / TotalLicenses are the actual
--   billing for the latest complete month. The two intentionally do not
--   reconcile (hard-hold accounts are active but bill $0). Both are correct for
--   their own question. See memory project_hard_hold_billing_state.

SELECT
  Partner,
  COUNT(*)                  AS AccountsReferred,   -- all-time
  COUNTIF(IsActive)         AS ActiveAccounts,     -- lifecycle: not cancelled
  SUM(Licenses)             AS TotalLicenses,      -- billed, latest complete month
  CAST(SUM(MRR) AS NUMERIC) AS TotalMRR            -- billed, latest complete month
FROM `project-for-method-dw`.`revenue`.`int_partner_accounts`
GROUP BY Partner
ORDER BY ActiveAccounts DESC;

