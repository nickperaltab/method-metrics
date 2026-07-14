
  
    

    create or replace table `project-for-method-dw`.`revenue`.`int_customer_mrr_lines`
      
    
    

    
    OPTIONS(
      description="""Monthly line composition per customer-entity (month, entity, item) with qty (seats proxy), saas, and an is_discount flag. Mirrors int_customer_mrr's raw monthly book but keeps line detail. Validated 2026-06-03: rolls up bit-exact to int_customer_mrr's customer-month SaaS total (scripts/parity_customer_mrr_lines.py).\n"""
    )
    as (
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



select
    date_trunc(TxnDate, month)   as month,
    EntityRecordID               as entity_record_id,
    ItemFullName                 as item,
    ItemType = 'Discount'        as is_discount,
    sum(Qty)                     as qty,    -- proxy for seats / paid users on the line
    max(UserPaidCount)           as user_paid_count,  -- per-line paid-user count; MAX in group = account paid users
    sum(SaaSAmount)              as saas
from `project-for-method-dw`.`revenue`.`TransLineFlattened`
where TxnDate >= '2021-12-01'
  and format_date('%Y-%m', TxnDate) < format_date('%Y-%m', current_date())  -- exclude in-progress month
  and CompanyAccount not like 'm11%'   -- exclude internal Method accounts (matches int_customer_mrr)
  and CompanyAccount not like 'm18%'
group by 1, 2, 3, 4
    );
  