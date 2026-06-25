{{ config(materialized='view') }}

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
FROM {{ ref('int_partner_accounts') }}
GROUP BY Partner
ORDER BY ActiveAccounts DESC
