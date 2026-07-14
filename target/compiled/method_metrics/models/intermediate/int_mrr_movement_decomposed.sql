-- VALIDATED 2026-06-03. Decomposes each customer-entity's month-over-month MRR
-- change into APP / SEAT / PRICE via a price–volume–mix split. Grain: one row per (month, entity).
-- Validation evidence (see _mrr_decomposition.yml):
--   identity seat+app+price = p2_saas-p1_saas holds within $0.01
--   reconciles to int_customer_mrr movement totals at $0.00 across 96 (month,kind) pairs
--   churn detection + symmetric Prepay-Expiry exclusion + in-progress-month guard applied
--   app   = a module (Service ItemFullName) added or dropped entirely
--   seat  = same module, change in Qty (users)        -> Δqty * prior unit-rate
--   price = same module, change in unit-rate (residual) + any Discount-line change



with lines as (
    select * from `project-for-method-dw`.`revenue`.`int_customer_mrr_lines`
),

-- Per-(entity, month) Prepay-Expiry line counts, computed with the IDENTICAL
-- filter + COUNTIF logic as int_customer_mrr's `entity_monthly` CTE so the
-- exclusion condition matches to the penny. A customer-month is PE-excluded
-- when its prior book was ENTIRELY Prepay-Expiry Income (every non-zero-SaaS
-- line was a PE line). int_customer_mrr zeroes such a month's StartMRR AND
-- Cancellations; the decomposition feeder has no PE awareness, so without this
-- the decomposition over-counts these phantom PE books as real cancellations.
pe_entity_monthly as (
    select
        date_trunc(TxnDate, month) as month,
        EntityRecordID             as entity_record_id,
        countif(SaaSAmount != 0)   as saas_lines,
        countif(SaaSAmount != 0 and AccountFullName like '%Prepay Expiry Income%') as expiry_lines
    from `project-for-method-dw`.`revenue`.`TransLineFlattened`
    where TxnDate >= '2021-12-01'
      and format_date('%Y-%m', TxnDate) < format_date('%Y-%m', current_date())
      and CompanyAccount not like 'm11%'
      and CompanyAccount not like 'm18%'
    group by 1, 2
),

-- Flag: was this (entity, month) book ENTIRELY Prepay-Expiry?
-- Mirrors int_customer_mrr's condition: p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines.
pe_flag as (
    select month, entity_record_id,
        (expiry_lines > 0 and expiry_lines = saas_lines) as is_all_pe
    from pe_entity_monthly
),

em as (
    select month, entity_record_id, sum(saas) as cur
    from lines group by 1, 2
),

tot as (   -- current + prior calendar month, full-outer so churned entities (prior-only) get a cur=0 row
    select * from (
        select
            coalesce(a.month, date_add(b.month, interval 1 month)) as month,
            coalesce(a.entity_record_id, b.entity_record_id)       as entity_record_id,
            ifnull(a.cur, 0) as cur,
            b.cur            as prv
        from em a
        full outer join em b
          on a.entity_record_id = b.entity_record_id
         and b.month = date_sub(a.month, interval 1 month)
    )
    -- Don't synthesize a churn row for the in-progress month: a prior-only entity
    -- last booked in month M-1 would otherwise appear as a cur=0 cancellation in the
    -- current (incomplete) month. int_customer_mrr guards the same way (its entity_paired
    -- UNION ALL excludes synthesizing months >= current). Without this the model carries
    -- phantom in-progress churn that any consumer must remember to filter.
    where month < date_trunc(current_date(), month)
),

paired as (   -- item-level current vs prior month (full outer = catches add/drop)
    select
        coalesce(c.entity_record_id, p.entity_record_id)        as entity_record_id,
        coalesce(c.month, date_add(p.month, interval 1 month))  as month,
        coalesce(c.is_discount, p.is_discount)                  as is_discount,
        ifnull(c.qty, 0)  as cq, ifnull(p.qty, 0)  as pq,
        ifnull(c.saas, 0) as cs, ifnull(p.saas, 0) as ps
    from lines c
    full outer join lines p
      on  c.entity_record_id = p.entity_record_id
      and c.item  = p.item
      and c.month = date_add(p.month, interval 1 month)
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
        -- PE-excluded: prior book (month M-1) was entirely Prepay-Expiry, so
        -- int_customer_mrr zeroes this cancellation. Reclassify to 'flat' so it
        -- drops out of the cancellation bucket (and the reconciliation gate,
        -- which excludes 'flat'). Components / p1_saas / p2_saas are untouched,
        -- so the seat+app+price = p2_saas-p1_saas identity still holds.
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
 and pe.month = date_sub(t.month, interval 1 month)
group by 1, 2, 3, 4, 5