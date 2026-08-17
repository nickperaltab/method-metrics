{{ config(materialized='view') }}

-- Intermediate model: one row per (TxnDate, CompanyAccount) invoice line
-- that counts toward the "beginning of month" customer base.
--
-- Reproduces revenue.v_bom_customers EXACTLY (DDL pulled from
-- INFORMATION_SCHEMA.VIEWS on 2026-08-17). That hand-written view is NOT
-- being replaced or dropped by this model -- Nic's action, separately.
--
-- Row-level, matching the source view: a CompanyAccount can appear more
-- than once for the same TxnDate/month if its invoice has multiple line
-- items. Consumers must COUNT(DISTINCT CompanyAccount) per period, exactly
-- like every existing consumer of v_bom_customers already does (see
-- scripts/bq_views_backup_20260514.sql:1222-1224). This model does not
-- pre-aggregate, so it stays a byte-for-byte behavioral mirror.
--
-- Grain confirmed 2026-08-17: TransLineFlattened is line-level (one row per
-- invoice line), not CompanyAccount-level -- the source view's own grain is
-- (TxnDate, CompanyAccount), duplicated across line items. This is
-- unrelated to the Account table's ~1.22-rows-per-EntityRecordID issue
-- (knowledge/account-mapping.md) since this model never reads Account.

SELECT
  TxnDate,
  CompanyAccount
FROM {{ source('revenue', 'TransLineFlattened') }}
WHERE BOMCustomerGrouping = 'Customer'
  AND IsNewPayerThisMonth = FALSE
  AND IsConversionException = FALSE
  AND Partner != 'Method Integration'
