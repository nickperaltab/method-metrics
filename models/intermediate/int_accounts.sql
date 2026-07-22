{{ config(materialized='view') }}

-- Intermediate model: one row per Method account (account grain), keyed on
-- account_record_id. Current-state account attributes for operational lookup
-- (call prep, account views): SaaS run-rate, licenses, health, pay type.
--
-- Grain: account (RecordID). Distinct from int_customers, which is
-- entity/customer grain (EntityRecordID) and a monthly time series. Different
-- key, different purpose -> separate model, not an extension of int_customers.
--
-- Source: revenue.Account (Alocet nightly mirror, one row per account —
-- 146,398 rows, RecordID unique, verified). entity_record_id is retained as
-- the bridge to entity-grain models (int_customers, int_customer_mrr) which
-- key on EntityRecordID.
--
-- Caveats baked into column choices (see _int_accounts.yml for detail):
--   * mrr_run_rate = Account.Custdatlastsaasamount, a nightly snapshot
--     run-rate proxy (excludes prepay discount, portals, overages). NOT
--     recognized revenue — do not use for board MRR. Directional only.
--   * user_licenses can be negative in source (credits/adjustments); any
--     utilization ratio must guard with NULLIF(GREATEST(user_licenses,0),0).
--   * health_score is ~61% null (populated mainly on active accounts).
--
-- PENDING: utilization (active_users_30d / user_licenses) is not built yet.
-- The numerator (Alocet CustDatCountUsersActiveLast30days) is not in the
-- revenue.Account mirror. Once that column is added to the nightly load, add
-- active_users_30d here and the ratio becomes a one-line derivation.

SELECT
  RecordID              AS account_record_id,
  CompanyAccount        AS company_account,
  EntityRecordID        AS entity_record_id,
  IsActive              AS is_active,
  SaaSPayType           AS saas_pay_type,
  Custdatlastsaasamount AS mrr_run_rate,
  LicenseCount          AS user_licenses,
  HealthScore           AS health_score
FROM {{ source('revenue', 'Account') }}
