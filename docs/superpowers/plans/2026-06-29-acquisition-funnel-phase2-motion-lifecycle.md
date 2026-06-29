# Acquisition Funnel Phase 2 — Motion + Lifecycle (Data Layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the dbt data layer for the motion + lifecycle funnel — three intermediate models and one aggregated view — so the existing acquisition funnel can fork on "talked to us vs self-serve" and extend past conversion into customization and a multi-horizon retention curve.

**Architecture:** Three new `revenue`-schema intermediates — `int_customer_proserv` (PS/customization), `int_presale_touches` (demo/free booked+attended), `int_motion_funnel` (per-customer assembly over the existing spine + survival logic) — feed one aggregated, `directional`-status view `v_motion_funnel` that the chart reads. Everything keys on `EntityRecordID` and reuses the shipped `int_customers` / `int_customer_mrr` / `int_trials` / `int_syncs` models. No retention engine is rebuilt; retention horizons are computed per-entity from `int_customer_mrr` using the same first-pay anchor `int_customer_survival` already uses.

**Tech Stack:** dbt (BigQuery), dbt unit tests + singular schema tests (no `dbt_utils` — not installed), Python parity scripts (`google-cloud-bigquery`).

**Scope note — why data-layer only:** the spec ([`2026-06-29-acquisition-funnel-phase2-motion-lifecycle-design.md`](../specs/2026-06-29-acquisition-funnel-phase2-motion-lifecycle-design.md)) covers two subsystems (warehouse + frontend). Per writing-plans guidance, they split. This plan delivers the queryable `v_motion_funnel` — independently valuable and testable. The frontend extension to `funnelDrill` is a **separate follow-on plan**, outlined in Phase B, written once this view lands and its real distributions are visible.

## Global Constraints

- Grain is **entity** (`EntityRecordID`) everywhere. One customer can own multiple accounts; never key on `CompanyAccount`.
- **Activity date = `DueDateStart`.** Never `CreatedDate` (NULL on ~93% of rows).
- **Demo attended** = `ActivityType ∈ {'Demo','Pre-sales Demo'}`. **Demo booked** = `{'Demo booked','Phone Call Demo Booked'}`. **Free attended** = `'Free Consulting Session'`. **Free booked** = `'Free Consulting Booked'`. Missed/follow-up types are excluded.
- **Customization** = any `TransLineFlattened` line with `InvoiceGrouping = 'PS'` AND `PSBeforeDiscount > 0`. Use `PSBeforeDiscount` (gross), never `PSAmount` (net landmine).
- **Project-hours magnitude is OUT of scope** — `revenue.TimeTracking` is empty in BQ (0 rows). V2.
- **Prepay** = entity ever had a SaaS subscription line (`InvoiceGrouping='SaaS'`) with `SaaSPayType='Prepay'` and `SaaSAmount != 0`. Measured on the subscription, NOT the DEP line.
- **DEP** reuses `int_customers.HasDEP` (rolled to entity with `LOGICAL_OR`).
- **Industry** = `v7_classification.v_entity_primary_label` (entity grain, `customer_record_id` = `EntityRecordID`), already a declared source.
- **Retention horizons: 1, 3, 6, 12 months** from the convert anchor (`t0` = first month with `StartMRR > 0`). Each horizon carries a numerator (`retained_Kmo`) and an eligibility flag (`eligible_Kmo` = `t0 + K <= censor_month`) so rates use the mature denominator.
- **Cohort gate: signup month >= 2020-01-01 for the spine; the motion fork is only valid for 2024+ cohorts** (Activity tracking start) — the model carries all cohorts; the fork's validity gate is enforced where motion is consumed (carried as a column `motion_trackable`).
- **Placement:** all four models live in `revenue` (NOT `revenue_metrics`). `v_motion_funnel` carries `status: directional` in its labels. Never `v_metric__*`.
- **Public repo:** no dollar figures / ratios / account names in committed SQL comments, docs, or test fixtures (synthetic fixture values are fine).
- dbt commands: use the `dbt:running-dbt-commands` skill to choose the executable (the repo uses `/Users/nicolas/.local/bin/dbt` with `DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1`).

---

### Task 1: Declare the `Activity` source

**Files:**
- Modify: `models/_sources.yml` (add one table under the `revenue` source)

**Interfaces:**
- Produces: `source('revenue','Activity')` resolvable for Tasks 3.

- [ ] **Step 1: Add the table to `_sources.yml`**

Under the `revenue` source's `tables:` list (after `TransLineFlattened`), add:

```yaml
      - name: Activity
        description: One row per CRM activity (demo, free-consulting session, call, etc.). EntityRecordID maps to a customer. ActivityType is the kind of touch; DueDateStart is the activity date (CreatedDate is NULL on most rows). Demo/free-consulting tracking effectively starts 2024.
```

- [ ] **Step 2: Verify it parses**

Run: `DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1 /Users/nicolas/.local/bin/dbt parse`
Expected: parses with no error.

- [ ] **Step 3: Commit**

```bash
git add models/_sources.yml
git commit -m "feat(motion-funnel): declare revenue.Activity source"
```

---

### Task 2: `int_customer_proserv` model + tests

**Files:**
- Create: `models/intermediate/int_customer_proserv.sql`
- Create: `models/intermediate/_int_customer_proserv.yml`

**Interfaces:**
- Consumes: `source('revenue','TransLineFlattened')` columns `EntityRecordID` (INT64), `InvoiceGrouping` (STRING), `PSBeforeDiscount` (FLOAT64), `TxnDate` (DATE).
- Produces: view `revenue.int_customer_proserv`, grain one row per `EntityRecordID` that bought PS. Columns: `EntityRecordID INT64`, `ps_gross NUMERIC`, `first_ps_date DATE`, `is_customized BOOL` (always TRUE — presence = customized; consumers LEFT JOIN and COALESCE to FALSE).

- [ ] **Step 1: Write the failing unit test**

Create `models/intermediate/_int_customer_proserv.yml`:

```yaml
version: 2

unit_tests:
  - name: proserv_only_positive_ps_lines
    model: int_customer_proserv
    given:
      - input: source('revenue', 'TransLineFlattened')
        rows:
          - { EntityRecordID: 1, InvoiceGrouping: 'PS',   PSBeforeDiscount: 100, TxnDate: '2024-02-10' }
          - { EntityRecordID: 1, InvoiceGrouping: 'PS',   PSBeforeDiscount: 50,  TxnDate: '2024-03-10' }
          - { EntityRecordID: 2, InvoiceGrouping: 'PS',   PSBeforeDiscount: 0,   TxnDate: '2024-01-10' }
          - { EntityRecordID: 3, InvoiceGrouping: 'SaaS', PSBeforeDiscount: 0,   TxnDate: '2024-01-10' }
    expect:
      rows:
        - { EntityRecordID: 1, ps_gross: 150, first_ps_date: '2024-02-10', is_customized: true }
```

Hand-check: entity 1 has two positive PS lines → ps_gross 150, first date 2024-02-10. Entity 2's PS line is 0 (not customized). Entity 3 is SaaS. Only entity 1 appears.

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1 /Users/nicolas/.local/bin/dbt test --select int_customer_proserv`
Expected: FAIL — model `int_customer_proserv` not found.

- [ ] **Step 3: Write the model**

Create `models/intermediate/int_customer_proserv.sql`:

```sql
{{ config(materialized='view') }}

-- First professional-services / "customization" signal in dbt. Entity grain.
-- Customization = the customer bought project hours = any PS-grouped billing line
-- with positive gross. Uses PSBeforeDiscount (gross); PSAmount is net-of-discount
-- and drifts. Project-HOURS magnitude is intentionally absent here — revenue.TimeTracking
-- is empty in BQ (deferred to V2). is_customized is always TRUE in this view (presence
-- = customized); downstream LEFT JOINs and COALESCE the flag to FALSE for everyone else.

SELECT
  EntityRecordID,
  CAST(SUM(PSBeforeDiscount) AS NUMERIC) AS ps_gross,
  MIN(TxnDate) AS first_ps_date,
  TRUE AS is_customized
FROM {{ source('revenue', 'TransLineFlattened') }}
WHERE InvoiceGrouping = 'PS'
  AND PSBeforeDiscount > 0
GROUP BY 1
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1 /Users/nicolas/.local/bin/dbt test --select int_customer_proserv`
Expected: PASS. If NUMERIC formatting trips equality (`150` vs `150.0`), adjust the fixture's expected value to dbt's rendered form — do not change the model.

- [ ] **Step 5: Add description + invariant test to the YAML**

Append to `models/intermediate/_int_customer_proserv.yml`:

```yaml
models:
  - name: int_customer_proserv
    description: >
      Professional-services / customization signal, entity grain. One row per
      customer that bought project hours (any PS-grouped billing line with positive
      gross). ps_gross = total PSBeforeDiscount; first_ps_date = earliest such line.
      Project-hours magnitude (delivered time) is NOT here — revenue.TimeTracking is
      empty in BQ. Directional input to the motion funnel.
    columns:
      - name: EntityRecordID
        tests: [not_null, unique]
      - name: ps_gross
        tests: [not_null]
      - name: is_customized
        tests: [not_null]
```

- [ ] **Step 6: Build + test against BigQuery**

Run: `DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1 /Users/nicolas/.local/bin/dbt build --select int_customer_proserv`
Expected: view materializes to `revenue.int_customer_proserv`; unit test + `not_null`/`unique` tests PASS.

- [ ] **Step 7: Commit**

```bash
git add models/intermediate/int_customer_proserv.sql models/intermediate/_int_customer_proserv.yml
git commit -m "feat(motion-funnel): int_customer_proserv (PS/customization signal, first PS revenue in dbt)"
```

---

### Task 3: `int_presale_touches` model + tests

**Files:**
- Create: `models/intermediate/int_presale_touches.sql`
- Create: `models/intermediate/_int_presale_touches.yml`

**Interfaces:**
- Consumes: `source('revenue','Activity')` columns `EntityRecordID` (INT64), `ActivityType` (STRING), `DueDateStart` (DATE), `IsDeleted` (BOOL).
- Produces: view `revenue.int_presale_touches`, grain one row per `EntityRecordID` with any activity. Columns: `EntityRecordID INT64`, `demo_booked BOOL`, `demo_attended BOOL`, `demo_first_date DATE`, `free_booked BOOL`, `free_attended BOOL`, `free_first_date DATE`, `attended_any BOOL`, `first_attended_date DATE`.

- [ ] **Step 1: Write the failing unit test**

Create `models/intermediate/_int_presale_touches.yml`:

```yaml
version: 2

unit_tests:
  - name: presale_touch_states
    model: int_presale_touches
    given:
      - input: source('revenue', 'Activity')
        rows:
          # entity 1: booked then attended a demo
          - { EntityRecordID: 1, ActivityType: 'Demo booked',            DueDateStart: '2024-05-01', IsDeleted: false }
          - { EntityRecordID: 1, ActivityType: 'Demo',                   DueDateStart: '2024-05-08', IsDeleted: false }
          # entity 2: booked a free hour, never showed (no attended row)
          - { EntityRecordID: 2, ActivityType: 'Free Consulting Booked', DueDateStart: '2024-06-01', IsDeleted: false }
          # entity 3: attended free hour only
          - { EntityRecordID: 3, ActivityType: 'Free Consulting Session',DueDateStart: '2024-07-02', IsDeleted: false }
          # deleted row must be ignored
          - { EntityRecordID: 4, ActivityType: 'Demo',                   DueDateStart: '2024-01-01', IsDeleted: true }
    expect:
      rows:
        - { EntityRecordID: 1, demo_booked: true,  demo_attended: true,  demo_first_date: '2024-05-08', free_booked: false, free_attended: false, free_first_date: null, attended_any: true,  first_attended_date: '2024-05-08' }
        - { EntityRecordID: 2, demo_booked: false, demo_attended: false, demo_first_date: null,         free_booked: true,  free_attended: false, free_first_date: null, attended_any: false, first_attended_date: null }
        - { EntityRecordID: 3, demo_booked: false, demo_attended: false, demo_first_date: null,         free_booked: false, free_attended: true,  free_first_date: '2024-07-02', attended_any: true, first_attended_date: '2024-07-02' }
```

(Entity 4 has only a deleted row → produces no output row.)

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1 /Users/nicolas/.local/bin/dbt test --select int_presale_touches`
Expected: FAIL — model not found.

- [ ] **Step 3: Write the model**

Create `models/intermediate/int_presale_touches.sql`:

```sql
{{ config(materialized='view') }}

-- Pre-sale human-touch signals per entity, from the Activity table.
-- Date = DueDateStart (CreatedDate is NULL on ~93% of rows). Attended types only
-- set the *_attended flags; booked/missed are tracked separately for show-rate.
-- Tracking effectively starts 2024 — older cohorts read as untouched.

WITH acts AS (
  SELECT EntityRecordID, ActivityType, DueDateStart
  FROM {{ source('revenue', 'Activity') }}
  WHERE COALESCE(IsDeleted, FALSE) = FALSE
    AND EntityRecordID IS NOT NULL
)
SELECT
  EntityRecordID,
  LOGICAL_OR(ActivityType IN ('Demo booked', 'Phone Call Demo Booked'))            AS demo_booked,
  LOGICAL_OR(ActivityType IN ('Demo', 'Pre-sales Demo'))                           AS demo_attended,
  MIN(IF(ActivityType IN ('Demo', 'Pre-sales Demo'), DueDateStart, NULL))          AS demo_first_date,
  LOGICAL_OR(ActivityType = 'Free Consulting Booked')                              AS free_booked,
  LOGICAL_OR(ActivityType = 'Free Consulting Session')                             AS free_attended,
  MIN(IF(ActivityType = 'Free Consulting Session', DueDateStart, NULL))            AS free_first_date,
  LOGICAL_OR(ActivityType IN ('Demo', 'Pre-sales Demo', 'Free Consulting Session')) AS attended_any,
  MIN(IF(ActivityType IN ('Demo', 'Pre-sales Demo', 'Free Consulting Session'), DueDateStart, NULL)) AS first_attended_date
FROM acts
GROUP BY 1
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1 /Users/nicolas/.local/bin/dbt test --select int_presale_touches`
Expected: PASS.

- [ ] **Step 5: Add description + tests to the YAML**

Append to `models/intermediate/_int_presale_touches.yml`:

```yaml
models:
  - name: int_presale_touches
    description: >
      Pre-sale human-touch signals per customer (entity grain), from the Activity
      table. Demo and free-consulting booked/attended states + first attended dates.
      attended_any drives the funnel's talked-to-us fork. Date is DueDateStart;
      tracking effectively starts 2024 (older cohorts read as untouched).
    columns:
      - name: EntityRecordID
        tests: [not_null, unique]
      - name: attended_any
        tests: [not_null]
```

- [ ] **Step 6: Build + test**

Run: `DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1 /Users/nicolas/.local/bin/dbt build --select int_presale_touches`
Expected: materializes to `revenue.int_presale_touches`; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add models/intermediate/int_presale_touches.sql models/intermediate/_int_presale_touches.yml
git commit -m "feat(motion-funnel): int_presale_touches (demo/free booked+attended, entity grain)"
```

---

### Task 4: `int_motion_funnel` model + tests + parity vs shipped funnel

**Files:**
- Create: `models/intermediate/int_motion_funnel.sql`
- Create: `models/intermediate/_int_motion_funnel.yml`
- Create: `scripts/parity_int_motion_funnel.py`

**Interfaces:**
- Consumes: `ref('int_trials')` (`EntityRecordID`, `SignupDate`), `ref('int_syncs')` (`EntityRecordID`, `SyncDate`), `ref('int_customer_mrr')` (`EntityRecordID`, `Month`, `StartMRR`), `ref('int_customers')` (`EntityRecordID`, `HasDEP`), `ref('int_presale_touches')`, `ref('int_customer_proserv')`, `source('revenue','TransLineFlattened')` (prepay), `source('v7_classification','v_entity_primary_label')` (`customer_record_id`, `l1`).
- Produces: table `revenue.int_motion_funnel`, grain one row per trialer `EntityRecordID`. Columns: `EntityRecordID INT64`, `signup_month DATE`, `synced BOOL`, `converted BOOL`, `convert_month DATE`, `mrr0 NUMERIC`, `motion STRING` ('talked'|'self_serve'), `motion_trackable BOOL` (signup_month >= 2024-01-01), `demo_booked BOOL`, `demo_attended BOOL`, `free_booked BOOL`, `free_attended BOOL`, `is_customized BOOL`, `ps_gross NUMERIC`, `has_dep BOOL`, `is_prepay BOOL`, `industry_l1 STRING`, `retained_1mo BOOL`, `eligible_1mo BOOL`, `retained_3mo BOOL`, `eligible_3mo BOOL`, `retained_6mo BOOL`, `eligible_6mo BOOL`, `retained_12mo BOOL`, `eligible_12mo BOOL`.

- [ ] **Step 1: Write the failing unit test**

Create `models/intermediate/_int_motion_funnel.yml`. Fixture pins the censor month so eligibility is deterministic, and exercises one talked + one self-serve entity with a 1-month retention check.

```yaml
version: 2

unit_tests:
  - name: motion_assignment_and_retention
    model: int_motion_funnel
    overrides:
      vars:
        motion_censor_month: '2024-12-01'
    given:
      - input: ref('int_trials')
        rows:
          - { EntityRecordID: 1, SignupDate: '2024-01-15' }
          - { EntityRecordID: 2, SignupDate: '2024-02-20' }
      - input: ref('int_syncs')
        rows:
          - { EntityRecordID: 1, SyncDate: '2024-01-20' }
          - { EntityRecordID: 2, SyncDate: '2024-02-25' }
      - input: ref('int_customer_mrr')
        rows:
          - { EntityRecordID: 1, Month: '2024-02-01', StartMRR: 100 }  # converts Feb
          - { EntityRecordID: 1, Month: '2024-03-01', StartMRR: 100 }  # alive at +1mo
          - { EntityRecordID: 2, Month: '2024-03-01', StartMRR: 200 }  # converts Mar
      - input: ref('int_customers')
        rows:
          - { EntityRecordID: 1, HasDEP: true }
          - { EntityRecordID: 2, HasDEP: false }
      - input: ref('int_presale_touches')
        rows:
          # entity 1 attended a demo before converting -> talked
          - { EntityRecordID: 1, demo_booked: true, demo_attended: true, demo_first_date: '2024-01-25', free_booked: false, free_attended: false, free_first_date: null, attended_any: true, first_attended_date: '2024-01-25' }
      - input: ref('int_customer_proserv')
        rows:
          - { EntityRecordID: 1, ps_gross: 500, first_ps_date: '2024-02-15', is_customized: true }
      - input: source('revenue', 'TransLineFlattened')
        rows:
          - { EntityRecordID: 1, InvoiceGrouping: 'SaaS', SaaSPayType: 'Prepay',  SaaSAmount: 100 }
          - { EntityRecordID: 2, InvoiceGrouping: 'SaaS', SaaSPayType: 'Monthly', SaaSAmount: 200 }
      - input: source('v7_classification', 'v_entity_primary_label')
        rows:
          - { customer_record_id: 1, l1: 'Construction' }
    expect:
      rows:
        - { EntityRecordID: 1, signup_month: '2024-01-01', synced: true, converted: true, convert_month: '2024-02-01', motion: 'talked',     motion_trackable: true, is_customized: true,  has_dep: true,  is_prepay: true,  industry_l1: 'Construction', retained_1mo: true,  eligible_1mo: true }
        - { EntityRecordID: 2, signup_month: '2024-02-01', synced: true, converted: true, convert_month: '2024-03-01', motion: 'self_serve', motion_trackable: true, is_customized: false, has_dep: false, is_prepay: false, industry_l1: null,           retained_1mo: false, eligible_1mo: true }
```

(The `expect` lists only the columns asserted; dbt unit tests compare the named columns. If the runner requires all output columns, extend the expected rows to include the remaining `*_mo` flags: entity 1 alive only at +1mo so `retained_3/6/12mo: false`; both entities `eligible_3mo`=false because `convert_month + 3 > 2024-12-01`? — recompute against the censor: Feb+3=May ≤ Dec → eligible_3mo true; recheck and fill exact values during Step 4.)

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1 /Users/nicolas/.local/bin/dbt test --select int_motion_funnel`
Expected: FAIL — model not found.

- [ ] **Step 3: Write the model**

Create `models/intermediate/int_motion_funnel.sql`:

```sql
{{ config(materialized='table') }}

-- Per-customer motion + lifecycle funnel row. ENTITY grain — one row per trialer.
-- Assembles the shipped spine (int_trials → int_syncs → int_customer_mrr) with the
-- talked-to-us fork (int_presale_touches), customization (int_customer_proserv),
-- DEP/prepay/industry lenses, and a multi-horizon retention curve computed per-entity
-- from int_customer_mrr (same first-pay anchor int_customer_survival uses; no engine
-- rebuilt). Directional: Activity-based motion is only trustworthy for 2024+ cohorts
-- (motion_trackable). See docs/superpowers/specs/2026-06-29-acquisition-funnel-phase2-motion-lifecycle-design.md.

{% set censor = var('motion_censor_month', none) %}

WITH trials AS (
  SELECT EntityRecordID, DATE_TRUNC(MIN(SignupDate), MONTH) AS signup_month
  FROM {{ ref('int_trials') }}
  GROUP BY 1
),
syncs AS (
  SELECT EntityRecordID, MIN(SyncDate) AS sync_date
  FROM {{ ref('int_syncs') }}
  GROUP BY 1
),
mrr AS (
  SELECT EntityRecordID, Month, SUM(StartMRR) AS m
  FROM {{ ref('int_customer_mrr') }}
  GROUP BY 1, 2
),
conv AS (  -- first paying month = convert anchor t0
  SELECT EntityRecordID, MIN(Month) AS convert_month
  FROM mrr
  WHERE m > 0
  GROUP BY 1
),
conv_mrr AS (
  SELECT c.EntityRecordID, c.convert_month, mr.m AS mrr0
  FROM conv c JOIN mrr mr
    ON mr.EntityRecordID = c.EntityRecordID AND mr.Month = c.convert_month
),
dep AS (
  SELECT EntityRecordID, LOGICAL_OR(HasDEP) AS has_dep
  FROM {{ ref('int_customers') }}
  GROUP BY 1
),
prepay AS (
  SELECT EntityRecordID,
    LOGICAL_OR(InvoiceGrouping = 'SaaS' AND SaaSPayType = 'Prepay' AND SaaSAmount != 0) AS is_prepay
  FROM {{ source('revenue', 'TransLineFlattened') }}
  GROUP BY 1
),
censor AS (
  SELECT
    {% if censor %}DATE('{{ censor }}'){% else %}DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH){% endif %} AS censor_month
)
SELECT
  t.EntityRecordID,
  t.signup_month,
  s.sync_date IS NOT NULL                          AS synced,
  cm.convert_month IS NOT NULL                     AS converted,
  cm.convert_month,
  CAST(cm.mrr0 AS NUMERIC)                         AS mrr0,
  -- talked = attended a demo/free session on or before the convert month
  -- (or any time, if never converted). Else self_serve.
  CASE
    WHEN COALESCE(pt.attended_any, FALSE)
      AND (cm.convert_month IS NULL
           OR pt.first_attended_date < DATE_ADD(cm.convert_month, INTERVAL 1 MONTH))
    THEN 'talked' ELSE 'self_serve'
  END                                              AS motion,
  t.signup_month >= DATE('2024-01-01')             AS motion_trackable,
  COALESCE(pt.demo_booked, FALSE)                  AS demo_booked,
  COALESCE(pt.demo_attended, FALSE)                AS demo_attended,
  COALESCE(pt.free_booked, FALSE)                  AS free_booked,
  COALESCE(pt.free_attended, FALSE)                AS free_attended,
  COALESCE(ps.is_customized, FALSE)                AS is_customized,
  COALESCE(ps.ps_gross, 0)                         AS ps_gross,
  COALESCE(d.has_dep, FALSE)                        AS has_dep,
  COALESCE(pp.is_prepay, FALSE)                     AS is_prepay,
  ind.l1                                            AS industry_l1,
  -- retention horizons (numerator = alive at t0+K; eligible = t0+K observable)
  COALESCE(r1.m, 0) > 0                             AS retained_1mo,
  DATE_ADD(cm.convert_month, INTERVAL 1 MONTH)  <= c.censor_month AS eligible_1mo,
  COALESCE(r3.m, 0) > 0                             AS retained_3mo,
  DATE_ADD(cm.convert_month, INTERVAL 3 MONTH)  <= c.censor_month AS eligible_3mo,
  COALESCE(r6.m, 0) > 0                             AS retained_6mo,
  DATE_ADD(cm.convert_month, INTERVAL 6 MONTH)  <= c.censor_month AS eligible_6mo,
  COALESCE(r12.m, 0) > 0                            AS retained_12mo,
  DATE_ADD(cm.convert_month, INTERVAL 12 MONTH) <= c.censor_month AS eligible_12mo
FROM trials t
CROSS JOIN censor c
LEFT JOIN syncs s        ON s.EntityRecordID = t.EntityRecordID
LEFT JOIN conv_mrr cm    ON cm.EntityRecordID = t.EntityRecordID
LEFT JOIN {{ ref('int_presale_touches') }} pt ON pt.EntityRecordID = t.EntityRecordID
LEFT JOIN {{ ref('int_customer_proserv') }} ps ON ps.EntityRecordID = t.EntityRecordID
LEFT JOIN dep d          ON d.EntityRecordID = t.EntityRecordID
LEFT JOIN prepay pp      ON pp.EntityRecordID = t.EntityRecordID
LEFT JOIN {{ source('v7_classification', 'v_entity_primary_label') }} ind
                         ON ind.customer_record_id = t.EntityRecordID
LEFT JOIN mrr r1  ON r1.EntityRecordID = t.EntityRecordID  AND r1.Month  = DATE_ADD(cm.convert_month, INTERVAL 1 MONTH)
LEFT JOIN mrr r3  ON r3.EntityRecordID = t.EntityRecordID  AND r3.Month  = DATE_ADD(cm.convert_month, INTERVAL 3 MONTH)
LEFT JOIN mrr r6  ON r6.EntityRecordID = t.EntityRecordID  AND r6.Month  = DATE_ADD(cm.convert_month, INTERVAL 6 MONTH)
LEFT JOIN mrr r12 ON r12.EntityRecordID = t.EntityRecordID AND r12.Month = DATE_ADD(cm.convert_month, INTERVAL 12 MONTH)
WHERE t.signup_month >= DATE('2020-01-01')
```

- [ ] **Step 4: Run the unit test; fill exact expected flags; verify it passes**

Run: `DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1 /Users/nicolas/.local/bin/dbt test --select int_motion_funnel`
Expected: PASS. If the runner demands every output column in `expect`, compute the remaining `retained_*`/`eligible_*` against `motion_censor_month='2024-12-01'` and fill them, then re-run. (e.g. entity 1 convert Feb: +3=May, +6=Aug, +12=Feb-2025 → eligible_12mo FALSE; retained_3/6/12mo FALSE because no mrr rows past March.) Do not change the model to fit — fix the fixture.

- [ ] **Step 5: Add description + singular invariant test**

Append to `models/intermediate/_int_motion_funnel.yml`:

```yaml
models:
  - name: int_motion_funnel
    description: >
      Per-customer motion + lifecycle funnel, entity grain — one row per trialer.
      Spine (trial/sync/convert) + talked-to-us fork (demo or free consulting,
      attended, pre-convert) + customization + DEP/prepay/industry lenses + a
      1/3/6/12-month retention curve (numerator retained_Kmo, denominator eligible_Kmo).
      Directional: motion is only trustworthy for 2024+ cohorts (motion_trackable).
      Status directional; lives in revenue, not revenue_metrics.
    columns:
      - name: EntityRecordID
        tests: [not_null, unique]
      - name: signup_month
        tests: [not_null]
      - name: motion
        tests:
          - not_null
          - accepted_values: { values: ['talked', 'self_serve'] }
```

Create `tests/assert_motion_funnel_invariants.sql` (offending rows = failure):

```sql
-- A converted customer must have a convert_month; an unconverted one must not.
-- A retained_Kmo can only be TRUE when eligible_Kmo is TRUE.
SELECT EntityRecordID
FROM {{ ref('int_motion_funnel') }}
WHERE (converted AND convert_month IS NULL)
   OR (NOT converted AND convert_month IS NOT NULL)
   OR (retained_1mo  AND NOT eligible_1mo)
   OR (retained_3mo  AND NOT eligible_3mo)
   OR (retained_6mo  AND NOT eligible_6mo)
   OR (retained_12mo AND NOT eligible_12mo)
```

- [ ] **Step 6: Build + test against BigQuery**

Run: `DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1 /Users/nicolas/.local/bin/dbt build --select int_motion_funnel`
Expected: table materializes; unit test + schema tests + invariant test PASS.

- [ ] **Step 7: Write the parity script (spine matches the shipped funnel)**

The shipped funnel counts Trial/Sync/Convert from `revenue.Funnel`; this model derives them from `int_trials`/`int_syncs`/`int_customer_mrr`. They use different sources, so they may differ — this script measures the gap and forces an explicit decision rather than silent drift. Create `scripts/parity_int_motion_funnel.py`:

```python
#!/usr/bin/env python3
"""Parity: int_motion_funnel spine (trial/sync/convert counts by signup month)
vs the shipped Funnel-based spine. Different sources -> report the delta; a small
stable delta is acceptable and gets documented, a large/structural one stops the build.
"""
import sys
from google.cloud import bigquery

client = bigquery.Client(project='project-for-method-dw')

rows = client.query("""
WITH motion AS (
  SELECT FORMAT_DATE('%Y-%m', signup_month) AS m,
         COUNT(*) AS trials,
         COUNTIF(synced) AS synced,
         COUNTIF(converted) AS converted
  FROM `project-for-method-dw.revenue.int_motion_funnel`
  WHERE signup_month >= '2024-01-01'
  GROUP BY 1
),
funnel AS (
  SELECT FORMAT_DATE('%Y-%m', DATE_TRUNC(MIN_trial, MONTH)) AS m, COUNT(*) AS trials
  FROM (
    SELECT EntityRecordID, MIN(IF(EventType='Trial', Date, NULL)) AS MIN_trial
    FROM `project-for-method-dw.revenue.Funnel`
    GROUP BY 1
  )
  WHERE MIN_trial >= '2024-01-01'
  GROUP BY 1
)
SELECT motion.m, motion.trials AS motion_trials, funnel.trials AS funnel_trials,
       motion.trials - funnel.trials AS delta
FROM motion LEFT JOIN funnel USING (m)
ORDER BY motion.m
""").result()

worst = 0.0
for r in rows:
    ft = r['funnel_trials'] or 0
    pct = (abs(r['delta']) / ft * 100) if ft else 0
    worst = max(worst, pct)
    print(f"  {r['m']}  motion={r['motion_trials']:<6} funnel={ft:<6} delta={r['delta']:<6} ({pct:.1f}%)")

print(f"\nWorst monthly trial-count delta: {worst:.1f}%")
if worst > 5.0:
    print("FAIL: >5% spine divergence — int_trials vs Funnel disagree. Investigate source choice before proceeding.")
    sys.exit(1)
print("PASS: spine within 5% of the shipped Funnel-based counts (document the residual in metric-definitions).")
```

- [ ] **Step 8: Run parity**

Run: `python scripts/parity_int_motion_funnel.py`
Expected: prints per-month deltas + `PASS`. If `FAIL` (>5%), stop — decide whether the motion funnel should source its spine from `revenue.Funnel` (to match the shipped funnel exactly) instead of `int_trials`/`int_syncs`, and reconcile before continuing. Record the decision.

- [ ] **Step 9: Commit**

```bash
git add models/intermediate/int_motion_funnel.sql models/intermediate/_int_motion_funnel.yml tests/assert_motion_funnel_invariants.sql scripts/parity_int_motion_funnel.py
git commit -m "feat(motion-funnel): int_motion_funnel per-customer assembly + invariants + spine parity"
```

---

### Task 5: `v_motion_funnel` aggregated view (the chart's read surface)

**Files:**
- Create: `models/marketing/v_motion_funnel.sql`
- Create: `models/marketing/_v_motion_funnel.yml`

(Placed in `models/marketing/` alongside the other `directional` `revenue`-schema views like `v_channel_arr`; confirm that dir's `+schema` resolves to `revenue`, not `revenue_metrics`. If marketing models land in `revenue_metrics`, place under `models/intermediate/` instead.)

**Interfaces:**
- Consumes: `ref('int_motion_funnel')`.
- Produces: view `revenue.v_motion_funnel`, grain one row per `(signup_month, motion)`. Columns: `signup_month DATE`, `motion STRING`, plus stage counts `trials`, `synced`, `demo_booked`, `demo_attended`, `free_booked`, `free_attended`, `converted`, `customized` (INT64), and retention numerator/denominator pairs `retained_Kmo`/`eligible_Kmo` (INT64) for K ∈ {1,3,6,12}. The chart computes every rate; the view ships only counts.

- [ ] **Step 1: Write the model**

Create `models/marketing/v_motion_funnel.sql`:

```sql
{{ config(materialized='view', schema='') }}

-- Aggregated motion + lifecycle funnel for the chart. One row per (signup_month, motion).
-- Ships COUNTS only — the frontend computes conversion %, show rate, and retention rate
-- (retained_Kmo / eligible_Kmo). status: directional (see labels); lives in `revenue`.
-- The chart filters to motion_trackable cohorts (2024+) for the fork.

SELECT
  signup_month,
  motion,
  COUNT(*)                                          AS trials,
  COUNTIF(synced)                                   AS synced,
  COUNTIF(demo_booked)                              AS demo_booked,
  COUNTIF(demo_attended)                            AS demo_attended,
  COUNTIF(free_booked)                              AS free_booked,
  COUNTIF(free_attended)                            AS free_attended,
  COUNTIF(converted)                                AS converted,
  COUNTIF(converted AND is_customized)              AS customized,
  COUNTIF(converted AND eligible_1mo)               AS eligible_1mo,
  COUNTIF(converted AND eligible_1mo AND retained_1mo)   AS retained_1mo,
  COUNTIF(converted AND eligible_3mo)               AS eligible_3mo,
  COUNTIF(converted AND eligible_3mo AND retained_3mo)   AS retained_3mo,
  COUNTIF(converted AND eligible_6mo)               AS eligible_6mo,
  COUNTIF(converted AND eligible_6mo AND retained_6mo)   AS retained_6mo,
  COUNTIF(converted AND eligible_12mo)              AS eligible_12mo,
  COUNTIF(converted AND eligible_12mo AND retained_12mo) AS retained_12mo
FROM {{ ref('int_motion_funnel') }}
GROUP BY 1, 2
ORDER BY 1, 2
```

(If `schema=''` is invalid, drop the `schema` arg — the default profile schema is `revenue`. The point is: NOT `revenue_metrics`.)

- [ ] **Step 2: Add description + directional labels**

Create `models/marketing/_v_motion_funnel.yml`:

```yaml
version: 2

models:
  - name: v_motion_funnel
    description: >
      Motion + lifecycle acquisition funnel, aggregated to (signup_month, motion).
      Counts only: trials → synced → demo booked/attended → converted → customized →
      retained at 1/3/6/12 months (each with an eligibility denominator for maturity).
      The talked-to-us fork is only valid for 2024+ cohorts. Directional — inputs
      (Activity, V7) are partial; not a verified metric.
    config:
      labels:
        layer: intermediate
        status: directional
        source_table: int_motion_funnel
    columns:
      - name: signup_month
        tests: [not_null]
      - name: motion
        tests: [not_null]
```

- [ ] **Step 3: Build + sanity-check**

Run: `DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1 /Users/nicolas/.local/bin/dbt build --select v_motion_funnel`
Then sanity-check with `bq` or a quick query: for recent 2024+ cohorts, `retained_Kmo <= eligible_Kmo <= converted <= synced <= trials` holds per row, and the two motions per month sum to that month's full trial count. Confirm it materialized in `revenue` (NOT `revenue_metrics`): `bq show project-for-method-dw:revenue.v_motion_funnel`.

- [ ] **Step 4: Commit**

```bash
git add models/marketing/v_motion_funnel.sql models/marketing/_v_motion_funnel.yml
git commit -m "feat(motion-funnel): v_motion_funnel aggregated read surface (directional, in revenue)"
```

---

### Task 6: Methodology doc + warehouse map

**Files:**
- Modify: `docs/metric-definitions.md`
- Modify: `knowledge/bigquery-map.md` (regenerate)

- [ ] **Step 1: Add a metric-definitions entry** (no $ figures — public repo)

Append an entry covering the motion funnel: what it answers, entity grain, the talked-to-us definition + the 2024+ trackability gate, customization = PS billing (hours deferred), DEP/prepay independence, retention numerator/denominator method, status `directional`, and the spine-parity residual from Task 4 Step 8. Follow the template at the top of `docs/metric-definitions.md`.

- [ ] **Step 2: Regenerate the warehouse map**

Run: `python3 scripts/build_bigquery_map.py`
Expected: the new `revenue.int_customer_proserv` / `int_presale_touches` / `int_motion_funnel` / `v_motion_funnel` appear with their descriptions in `knowledge/bigquery-map.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/metric-definitions.md knowledge/bigquery-map.md
git commit -m "docs(motion-funnel): metric definition + warehouse map for the motion funnel models"
```

---

## Phase B — Frontend (separate follow-on plan, outlined)

Written as its own plan once Phase A lands and `v_motion_funnel`'s real distributions are visible. Expected tasks (extending the shipped `funnelDrill`, not forking it):

- **B1.** `motionFunnelSql.js` + `motionFunnelTransform.js` (+ vitest) — read `v_motion_funnel`; compute conversion %, show rate (customer grain), retention rate (`retained/eligible`); per-horizon maturity null-out.
- **B2.** Extend `funnelTransform.STAGE_DEFS` / a motion-aware variant to render two paths side by side with the demo sub-funnel and retention tail.
- **B3.** Lens selector (industry / DEP / prepay / customization) — query `int_motion_funnel` grouped by the chosen lens, mirroring the existing `segExpr`/`segJoin` pattern.
- **B4.** Motion-funnel scorecard config (`labs: true`, `status: 'beta'`, `renderer: 'funnelDrill'` or a new `motionFunnelDrill`), 2024+ cohort gate + the demo-tracking and enrichment-coverage caveats in the UI.
- **B5.** Build (`cd builder && npm run build`), preview-verify against live BQ, commit `dist/`, user-gated deploy (GitHub Pages only; never `vercel`).

---

## Self-Review

**Spec coverage (Phase A):**
- Talked-to-us fork (demo OR free, attended, pre-convert) → `int_presale_touches` (Task 3) + motion logic in `int_motion_funnel` (Task 4). ✓
- Demo show-rate states (booked/attended) → `int_presale_touches` + `v_motion_funnel` counts (Tasks 3, 5). ✓
- Customization = PS billing, gross, hours deferred → `int_customer_proserv` (Task 2) + Global Constraints. ✓
- DEP & prepay independent, prepay on subscription → `int_motion_funnel` `has_dep`/`is_prepay` (Task 4). ✓
- Industry lens, entity grain → `v_entity_primary_label` join (Task 4). ✓
- Multi-horizon retention 1/3/6/12 with maturity → `retained_Kmo`/`eligible_Kmo` (Tasks 4, 5). ✓
- 2024+ fork gate → `motion_trackable` (Task 4). ✓
- Directional placement in `revenue`, not `revenue_metrics` → Task 5 + Global Constraints. ✓
- Spine consistency with shipped funnel → parity script (Task 4 Steps 7–8). ✓
- Methodology doc + map → Task 6. ✓
- Frontend → Phase B (separate plan). ✓ (deliberately out of this plan's scope)

**Placeholder scan:** Task 4 Step 1/Step 4 leaves some `expect` retention flags to be filled at run time — this is deliberate (exact values depend on the censor arithmetic and the runner's all-columns requirement) and Step 4 gives the formula + worked example to fill them. No other TBDs.

**Type consistency:** `EntityRecordID` INT64 PK across all four models; `int_motion_funnel` output columns consumed verbatim by `v_motion_funnel` (Task 5) and the parity script (Task 4); `motion ∈ {talked, self_serve}` consistent across Tasks 4–5; `retained_Kmo`/`eligible_Kmo` naming consistent Tasks 4–5. ✓
