-- models/intermediate/int_annual_mrr_movement_decomposed.sql
--
-- Annual-cohort decomposition of each customer's MRR movement into APP / SEAT / PRICE.
-- Identical to int_mrr_movement_decomposed but pairs month M against month M-12
-- (annual cohort), matching int_customer_annual_mrr. Grain: one row per (month, entity)
-- where `month` is the END of the 12-month window. Output from 2023-01.
--   app   = a module (Service ItemFullName) added or dropped entirely over the year
--   seat  = same module, change in Qty (users)        -> Δqty * prior unit-rate
--   price = same module, change in unit-rate (residual) + any Discount-line change
-- Validation: scripts/parity_annual_decomposition_identity.py + _vs_metrics.py.

{{ config(materialized='view') }}

with lines as (
    select * from {{ ref('int_customer_mrr_lines') }}
),

pe_entity_monthly as (
    select
        date_trunc(TxnDate, month) as month,
        EntityRecordID             as entity_record_id,
        countif(SaaSAmount != 0)   as saas_lines,
        countif(SaaSAmount != 0 and AccountFullName like '%Prepay Expiry Income%') as expiry_lines
    from {{ source('revenue', 'TransLineFlattened') }}
    where TxnDate >= '2021-12-01'
      and format_date('%Y-%m', TxnDate) < format_date('%Y-%m', current_date())
      and CompanyAccount not like 'm11%'
      and CompanyAccount not like 'm18%'
    group by 1, 2
),

pe_flag as (
    select month, entity_record_id,
        (expiry_lines > 0 and expiry_lines = saas_lines) as is_all_pe
    from pe_entity_monthly
),

em as (
    select month, entity_record_id, sum(saas) as cur
    from lines group by 1, 2
),

tot as (
    select * from (
        select
            coalesce(a.month, date_add(b.month, interval 12 month)) as month,
            coalesce(a.entity_record_id, b.entity_record_id)        as entity_record_id,
            ifnull(a.cur, 0) as cur,
            b.cur            as prv
        from em a
        full outer join em b
          on a.entity_record_id = b.entity_record_id
         and b.month = date_sub(a.month, interval 12 month)
    )
    where month < date_trunc(current_date(), month)
      and month >= '2023-01-01'
),

paired as (
    select
        coalesce(c.entity_record_id, p.entity_record_id)         as entity_record_id,
        coalesce(c.month, date_add(p.month, interval 12 month))  as month,
        coalesce(c.is_discount, p.is_discount)                   as is_discount,
        ifnull(c.qty, 0)  as cq, ifnull(p.qty, 0)  as pq,
        ifnull(c.saas, 0) as cs, ifnull(p.saas, 0) as ps
    from lines c
    full outer join lines p
      on  c.entity_record_id = p.entity_record_id
      and c.item  = p.item
      and c.month = date_add(p.month, interval 12 month)
),

eff as (
    select entity_record_id, month,
        case when not is_discount and (cs = 0 or ps = 0)
             then cs - ps else 0 end as app,
        case when not is_discount and cs <> 0 and ps <> 0
             then (cq - pq) * safe_divide(ps, pq) else 0 end as seat,
        case when not is_discount and cs <> 0 and ps <> 0
             then (cs - ps) - (cq - pq) * safe_divide(ps, pq)
             when is_discount then cs - ps
             else 0 end as price
    from paired
)

select
    t.month,
    t.entity_record_id,
    t.prv as p1_saas,
    t.cur as p2_saas,
    case
        when t.prv > 0 and t.cur > 0 and t.cur < t.prv then 'downgrade'
        when t.prv > 0 and t.cur > 0 and t.cur > t.prv then 'expansion'
        when t.prv > 0 and t.cur = 0 and coalesce(pe.is_all_pe, false) then 'flat'
        when t.prv > 0 and t.cur = 0                   then 'cancellation'
        when (t.prv is null or t.prv = 0) and t.cur > 0 then 'new'
        else 'flat'
    end as movement_kind,
    round(sum(e.app),   2) as app_mrr,
    round(sum(e.seat),  2) as seat_mrr,
    round(sum(e.price), 2) as price_mrr
from tot t
join eff e
  on e.entity_record_id = t.entity_record_id and e.month = t.month
left join pe_flag pe
  on pe.entity_record_id = t.entity_record_id
 and pe.month = date_sub(t.month, interval 12 month)
group by 1, 2, 3, 4, 5
