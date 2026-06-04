# Annual MRR-Movement Decomposition — Phase 3a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and validate `int_annual_mrr_movement_decomposed` — the annual-cohort seats/apps/price decomposition — so the bridge-v2 UI can drill annual Expansion/Downgrades into seats/apps/price, reconciling to the validated annual metrics.

**Architecture:** The annual decomposition is the validated monthly model (`int_mrr_movement_decomposed`) with the month-pairing offset changed from 1 month to **12 months** (matching `int_customer_annual_mrr`, which is `int_customer_mrr` with the same 12-month offset). Same feeder (`int_customer_mrr_lines`), same price–volume–mix logic, same churn (full-outer `tot`), same Prepay-Expiry exclusion, same in-progress guard — only the interval and the output lower-bound change. Built + validated in staging (`revenue_validation`); **prod cutover held for explicit user approval** (Phase-1 discipline).

**Tech Stack:** dbt-bigquery, BigQuery views, Python parity scripts (`google-cloud-bigquery`), Vitest not involved (data layer).

**Spec:** `docs/superpowers/specs/2026-06-04-annual-mrr-decomposition-design.md`
**Monthly sibling (the template):** `models/intermediate/int_mrr_movement_decomposed.sql`
**Annual cohort reference:** `int_customer_annual_mrr` (prod view; 12-month offset; output ≥ 2023-01)

**Gate before prod:** identity parity + reconciliation parity vs `v_metric__annual_*` both green; dbt tests pass; then HOLD for user approval (build on a branch `validation/annual-decomposition`, do not merge/promote).

---

## Established facts (verified before writing this plan)

- `int_customer_annual_mrr` columns: `Month, EntityRecordID, Company, p1_saas, p2_saas, StartMRR, Cancellations, Downgrades, Expansions, NewMRR, Segment, UserTier, HasDEP, AttributionChannel, SignupCountry, Vertical, SyncType`.
- Its pairing: `p1` = the customer's book 12 months before `Month` (`DATE_SUB(p2.Month, INTERVAL 12 MONTH)`); synthesized churn rows at `DATE_ADD(p1.Month, INTERVAL 12 MONTH)`; output filtered `month_str >= '2023-01'` and `< current month`.
- PE exclusion: zero StartMRR/Cancellations when prior book entirely Prepay-Expiry (`p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines`).
- The monthly decomposition (`int_mrr_movement_decomposed`) already encodes: full-outer `tot` (catches full churn), PE reclassification of all-PE cancellations to `flat`, in-progress-month guard, and the seat/app/price PVM split — all validated Phase 1 (identity + reconciliation $0.00).
- Validated annual parity targets: `v_metric__annual_downgrades_mrr`, `v_metric__annual_expansions_mrr`, `v_metric__annual_cancellations_mrr`.

---

## Branch setup (Task 0 — do first)

- [ ] Create the work branch off main:
```bash
cd /Users/nicolas/Desktop/method-metrics
git checkout main && git pull --ff-only 2>/dev/null; git checkout -b validation/annual-decomposition
git branch --show-current   # expect validation/annual-decomposition
```
All Phase-3a commits land on this branch. Nothing merges to main or promotes to prod without user approval.

---

## File Structure

**New:**
- `models/intermediate/int_annual_mrr_movement_decomposed.sql` — the annual decomposition model.
- `scripts/parity_annual_decomposition_identity.py` — identity gate (seat+app+price = p2−p1, annual).
- `scripts/parity_annual_decomposition_vs_metrics.py` — reconciliation vs `v_metric__annual_*`.

**Modified:**
- `models/intermediate/_mrr_decomposition.yml` — add `int_annual_mrr_movement_decomposed` model entry + tests.
- `docs/metric-definitions.md` — append annual seats/apps/price entries (mirror the monthly §4c entries).

---

## Task 1: Create the annual decomposition model (clone monthly with 12-month offset)

**Files:**
- Create: `models/intermediate/int_annual_mrr_movement_decomposed.sql`

- [ ] **Step 1: Read the monthly template** `models/intermediate/int_mrr_movement_decomposed.sql` in full. The annual model is that file with these exact changes:
  1. `tot` CTE: `b.month = date_sub(a.month, interval 1 month)` → `interval 12 month`.
  2. `paired` CTE: `c.month = date_add(p.month, interval 1 month)` → `interval 12 month` (both the join condition AND the `coalesce(c.month, date_add(p.month, interval 1 month))` synthesized-month expression).
  3. `pe_flag` join in the final SELECT: `pe.month = date_sub(t.month, interval 1 month)` → `interval 12 month`.
  4. In-progress guard in `tot` stays `where month < date_trunc(current_date(), month)` AND add a lower bound `and month >= '2023-01-01'` to match `int_customer_annual_mrr`'s output range.
  5. Header comment updated to describe the annual-cohort (12-month) window.

- [ ] **Step 2: Write the model**

```sql
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

tot as (   -- current + prior-YEAR (M-12) total, full-outer so annually-churned entities get a cur=0 row
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

paired as (   -- item-level current vs prior-YEAR month (full outer = catches add/drop over the year)
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
```

- [ ] **Step 3: Compile** `dbt compile --select int_annual_mrr_movement_decomposed`. Expected: PASS=1.
- [ ] **Step 4: Build in staging** `dbt run --select int_annual_mrr_movement_decomposed --target staging`. Expected: 1 success, model at `project-for-method-dw.revenue_validation.int_annual_mrr_movement_decomposed`.
- [ ] **Step 5: Commit**
```bash
git add models/intermediate/int_annual_mrr_movement_decomposed.sql
git commit -m "feat(annual-decomp): annual-cohort seats/apps/price model (12-month offset clone)"
```

---

## Task 2: Identity parity (seat+app+price = annual net movement)

**Files:**
- Create: `scripts/parity_annual_decomposition_identity.py`

- [ ] **Step 1: Adapt the monthly identity script.** Copy `scripts/parity_mrr_decomposition_identity.py` and change the FQN to `project-for-method-dw.revenue_validation.int_annual_mrr_movement_decomposed`. The check is unchanged: `app_mrr + seat_mrr + price_mrr == (p2_saas − COALESCE(p1_saas,0))` per (month, entity_record_id) within $0.01; the WHERE window can drop the trailing-24-month clause or keep `month >= '2023-01-01'`.

```python
# scripts/parity_annual_decomposition_identity.py
"""Verify int_annual_mrr_movement_decomposed identity within $0.01 per (month, entity)."""
import sys
from google.cloud import bigquery
TOLERANCE = 0.01
SQL = """
SELECT month, entity_record_id, movement_kind, p1_saas, p2_saas, app_mrr, seat_mrr, price_mrr,
  ABS((p2_saas - COALESCE(p1_saas,0)) - (app_mrr + seat_mrr + price_mrr)) AS abs_diff
FROM `project-for-method-dw.revenue_validation.int_annual_mrr_movement_decomposed`
WHERE ABS((p2_saas - COALESCE(p1_saas,0)) - (app_mrr + seat_mrr + price_mrr)) > 0.01
ORDER BY abs_diff DESC LIMIT 200
"""
def main():
    rows = list(bigquery.Client(project="project-for-method-dw").query(SQL).result())
    if not rows:
        print("OK Annual identity holds within 0.01 on all rows"); sys.exit(0)
    print(f"FAIL {len(rows)} rows violate identity:")
    for r in rows[:25]:
        print(f"  {r.month} | {r.entity_record_id} | {r.movement_kind} | diff={r.abs_diff:.4f}")
    sys.exit(1)
if __name__ == "__main__": main()
```

- [ ] **Step 2: Run** `python scripts/parity_annual_decomposition_identity.py`. Expected: `OK`, exit 0. (Holds by construction — `price` is the residual — same as the monthly model. If it fails, the clone introduced a typo; fix before continuing.)
- [ ] **Step 3: Commit**
```bash
git add scripts/parity_annual_decomposition_identity.py
git commit -m "test(annual-decomp): identity parity (seat+app+price = annual net)"
```

---

## Task 3: Reconciliation parity vs validated annual metrics

**Files:**
- Create: `scripts/parity_annual_decomposition_vs_metrics.py`

The annual decomposition's per-(month, movement_kind) totals must reconcile to the validated annual metric views.

- [ ] **Step 1: Confirm the annual metric views' shape** (one-time inspection):
```bash
for v in v_metric__annual_downgrades_mrr v_metric__annual_expansions_mrr v_metric__annual_cancellations_mrr; do
  echo "=== $v ==="; bq show --format=prettyjson "project-for-method-dw:revenue_metrics.$v" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print([f['name'] for f in d['schema']['fields']])"
done
```
Note the period column + value column names (likely `period`/`month` + a `value` or named measure). Adapt the SQL below to the actual columns.

- [ ] **Step 2: Write the reconciliation script.** Compare, per period:
  - decomposition `SUM(p2_saas − COALESCE(p1_saas,0))` where `movement_kind='downgrade'` (negative) vs `-v_metric__annual_downgrades_mrr` value;
  - `expansion` vs `+v_metric__annual_expansions_mrr`;
  - `cancellation` vs `-v_metric__annual_cancellations_mrr`.
  Tolerance $1.00 per (period, kind). Mirror the structure of `scripts/parity_mrr_decomposition_vs_customer_mrr.py` (it already does this join+compare for the monthly case) — adapt the source to the annual model + the metric views, and align the period grain (the metric views may key on a `period` DATE that equals the decomposition's `month`).

- [ ] **Step 3: Run** `python scripts/parity_annual_decomposition_vs_metrics.py`. Expected: exit 0, $0.00–within-tolerance across all (period, kind).
  - **If cancellation diverges**, check the PE exclusion alignment (the annual metric applies the same all-PE exclusion; the model's `pe_flag` join must be on M-12 — Task 1 Step 1 change #3). This is the most likely failure point; do not loosen tolerance.
  - **If new/expansion/downgrade diverge**, the annual metric may define New/Downgrade slightly differently than the bridge classification — investigate against `int_customer_annual_mrr` (which the metrics derive from) and reconcile.
- [ ] **Step 4: Commit** (only when green)
```bash
git add scripts/parity_annual_decomposition_vs_metrics.py
git commit -m "test(annual-decomp): reconcile to validated v_metric__annual_* totals"
```

---

## Task 4: dbt schema tests + metric definitions

**Files:**
- Modify: `models/intermediate/_mrr_decomposition.yml`
- Modify: `docs/metric-definitions.md`

- [ ] **Step 1: Add the model to `_mrr_decomposition.yml`** with the same tests as the monthly model: `not_null` on `month`, `entity_record_id`; `not_null` + `accepted_values [new, expansion, downgrade, cancellation, flat]` on `movement_kind`. Description notes it's the annual-cohort sibling, validated against `v_metric__annual_*`.
- [ ] **Step 2: Run** `dbt test --select int_annual_mrr_movement_decomposed --target staging`. Expected: all pass.
- [ ] **Step 3: Append annual seats/apps/price entries to `docs/metric-definitions.md`** mirroring the monthly §4c entries, with grain = annual cohort (month M vs M-12), parity evidence = the two new scripts. Keep the shared-header style.
- [ ] **Step 4: Commit**
```bash
git add models/intermediate/_mrr_decomposition.yml docs/metric-definitions.md
git commit -m "test(annual-decomp): dbt schema tests + metric definitions"
```

---

## Task 5: Promote to prod — HOLD for user approval (do NOT auto-run)

**Files:** none (deploy step)

- [ ] **Step 1: STOP and report.** Do not promote. Summarize for the user: identity result, reconciliation result (per-kind), dbt test result. Present the prod-cutover command for their approval:
```bash
# Only after explicit user approval:
dbt run --select int_annual_mrr_movement_decomposed --target dev   # default target writes to prod `revenue`
```
- [ ] **Step 2: On approval** — run the prod build, snapshot/parity once more against prod, then the branch can merge to main. Until then the model lives only in `revenue_validation` and on the branch.

This mirrors Phase 1 Task 6 and the `int_customers` dedup: the validated-data-model change never hits prod without a human gate.

---

## Self-Review

**Spec coverage** (against `2026-06-04-annual-mrr-decomposition-design.md`):

| Spec requirement | Task |
|---|---|
| `int_annual_mrr_movement_decomposed` with annual-cohort movement + seats/apps/price | Task 1 |
| Window = mirror `int_customer_annual_mrr` (12-month offset, ≥2023-01) | Task 1 (resolved: confirmed 12-month offset) |
| Identity gate | Task 2 |
| Reconciliation vs validated `v_metric__annual_*` | Task 3 |
| PE exclusion + in-progress guard | Task 1 (inherited from monthly clone; PE join on M-12) |
| dbt tests + metric definitions | Task 4 |
| Prod cutover held | Task 5 |

**Resolved open questions from the spec:** §5.1 (window) = 12-month offset, output ≥ 2023-01 (verified from `int_customer_annual_mrr` DDL). §5.2 (mid-year resubscribe) = cohort sees net M-vs-M-12, consistent with the annual metrics by construction (same pairing). §5.3 (mid-window start) = p1=0 → `new`, matches.

**Placeholder scan:** Task 3's SQL is described + pointed at the existing monthly reconciliation script as the concrete template (column names confirmed in Task 3 Step 1 before writing) — this is a real "adapt the working script to confirmed columns" step, not a vague placeholder, because the annual metric views' exact column names must be read first (they live in `revenue_metrics`, not yet inspected).

**Type consistency:** model columns (`month, entity_record_id, p1_saas, p2_saas, movement_kind, app_mrr, seat_mrr, price_mrr`) match the monthly sibling exactly, so the UI's grain-parameterized SQL builders (Phase 3b) consume both identically.
