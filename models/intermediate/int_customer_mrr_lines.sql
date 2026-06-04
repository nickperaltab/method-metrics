-- VALIDATED 2026-06-03. Monthly line composition per customer-entity: one row per
-- (month, entity, item). Mirrors int_customer_mrr's raw monthly book — bit-exact rollup
-- verified via scripts/parity_customer_mrr_lines.py (177,241 (month,entity) pairs, $0.00).
-- Feeds int_mrr_movement_decomposed.
--
-- Monthly line composition per customer-entity: one row per (month, entity, item).
-- Mirrors int_customer_mrr's monthly book — SUM(SaaSAmount) by DATE_TRUNC(month),
-- same filters — but KEEPS line detail so MRR movements can be split into
-- seats (Qty) / apps (ItemFullName) / price (Rate, Discount lines).
-- Feeds int_mrr_movement_decomposed.

{{ config(materialized='table') }}

select
    date_trunc(TxnDate, month)   as month,
    EntityRecordID               as entity_record_id,
    ItemFullName                 as item,
    ItemType = 'Discount'        as is_discount,
    sum(Qty)                     as qty,    -- proxy for seats / paid users on the line
    sum(SaaSAmount)              as saas
from {{ source('revenue', 'TransLineFlattened') }}
where TxnDate >= '2021-12-01'
  and format_date('%Y-%m', TxnDate) < format_date('%Y-%m', current_date())  -- exclude in-progress month
  and CompanyAccount not like 'm11%'   -- exclude internal Method accounts (matches int_customer_mrr)
  and CompanyAccount not like 'm18%'
group by 1, 2, 3, 4
