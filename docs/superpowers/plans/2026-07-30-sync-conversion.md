# Sync Conversion Rate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Sync Conversion Rate section to the Sales Scorecard (FirstInvoice ÷ Sync) alongside the existing trials-based section, and fix the two broken metrics inside the section being duplicated.

**Architecture:** Seven new dbt models in `models/metrics/` own the definitions and land in the `revenue_metrics` dataset. Supabase metric rows are thin pointers — a `chart_sql` that selects from the dbt view — so no formula lives in two places. The scorecard config adds one new section that mirrors the existing Conversion Rate section's KPI order, chart types, and colors exactly.

**Tech Stack:** dbt-bigquery (models + tests), BigQuery, Supabase REST (metric registry), React/Vite (`builder/`), vitest (JS unit tests), Python 3 stdlib (parity + reconciliation scripts).

**Spec:** [docs/superpowers/specs/2026-07-30-sync-conversion-design.md](../specs/2026-07-30-sync-conversion-design.md)

## Global Constraints

- **Every new dbt model starts `status: queued`** in its `.yml` labels. Nothing flips to `live` without Nic's explicit approval (Task 10).
- **No metric flips to `live` without an entry in [docs/metric-definitions.md](../../metric-definitions.md).** Non-negotiable fields: what it answers, grain, filters/exclusions with why, methodology source, parity-verified against, known caveats.
- **Snapshot before changing any existing view or metric.** Capture the canonical query result before, apply, re-run, diff row by row. Report exact match or surface differences explicitly. "Looks in range" is not acceptable.
- **dbt binary:** `/Users/nicolas/.local/bin/dbt`. Metric models land in `revenue_metrics` via the `+schema: metrics` config in `dbt_project.yml` — do not override it per-model.
- **`method_forecast` is already a declared source** at [models/_sources.yml:152](../../../models/_sources.yml). Use `{{ source('revenue', 'method_forecast') }}`. Do not add it again.
- **Sync denominator is same-month, no lag.** Conversions in month M ÷ syncs in month M. Do not add a lag to the sync family.
- **Trials denominator keeps its one-month lag.** `(trials in M-1 + forecasted trials in M) / 2`. Do not "fix" this to same-month.
- **Chart-builder philosophy:** no auto-injected columns, series, or computed values. The new section gets exactly the 7 KPIs and 2 charts specified in Task 9, nothing more.
- **Deploy is GitHub Pages only.** `cd builder && npm run build`, commit `dist`, push. Never `vercel --prod`.
- **Colors are fixed.** Weekly: budget `#a3c771`, forecast `#e84393`, actual `#2563eb`. Monthly: budget `#1e3a5f`, forecast `#2563eb`, actual `#9dc3e6`.

## File Structure

**Create — dbt models (7 pairs of `.sql` + `.yml`):**

| File | Responsibility |
|---|---|
| `models/metrics/v_metric__conversions_trajectory.sql` / `.yml` | Month-end projection of in-progress conversions. Fixes #296. |
| `models/metrics/v_metric__syncs_trajectory.sql` / `.yml` | Month-end projection of in-progress syncs. Backs #295. |
| `models/metrics/v_metric__sync_conversion_rate_trajectory.sql` / `.yml` | Ratio of the two trajectories. |
| `models/metrics/v_metric__sync_conversion_rate_budgeted.sql` / `.yml` | `SUM(Budgeted_Conversion) ÷ SUM(Budgeted_Syncs)` by month. |
| `models/metrics/v_metric__sync_conversion_rate_forecasted.sql` / `.yml` | `SUM(Forecasted_Conversion) ÷ SUM(Forecasted_Syncs)` by month. |
| `models/metrics/v_metric__sync_conversion_rate_weekly.sql` / `.yml` | Conversions ÷ syncs by ISO week (Monday). |
| `models/metrics/v_metric__trial_conversion_rate_lagged.sql` / `.yml` | Lagged trials rate. Fixes #357. |

**Create — dbt data tests:**

| File | Responsibility |
|---|---|
| `tests/assert_trajectory_invariants.sql` | One row, current month, projection ≥ actual MTD, for both trajectory models. |
| `tests/assert_sync_conversion_rate_sane.sql` | Weekly + monthly rates non-negative and ≤ 1 for closed periods. |

**Create — scripts:**

| File | Responsibility |
|---|---|
| `scripts/reconcile_sync_denominators.py` | 12-month comparison of three sync definitions. Reconciliation gate. |
| `scripts/register_sync_conversion_metrics.py` | Insert Supabase rows for the new metrics, repoint 295/296/357. Idempotent. |
| `scripts/parity_sync_conversion_vs_looker.py` | Prints both sections' KPIs for manual side-by-side against Looker. |

**Modify:**

| File | Change |
|---|---|
| `builder/src/config/scorecards/sales-scorecard.js` | Add `Sync Conversion Rate` section after `Conversion Rate`. Swap 3 KPI/chart metric wirings in the existing section. |
| `docs/metric-definitions.md` | One entry per new metric (Task 10). |
| `TICKETS.md` | Close tickets 1 and 2, note the corrected `day_of_month` finding. |

**Create — JS test:**

| File | Responsibility |
|---|---|
| `builder/tests/unit/salesScorecardSyncSection.test.js` | Asserts section shape, KPI count/order, chart colors, and parallelism with the trials section. |

Tasks 1, 2, 4, 5, 6 are independent of each other and can run in parallel. Task 3 depends on 1 and 2. Task 8 depends on 1–6. Task 9 depends on 8. Task 10 depends on everything.

---

### Task 1: Conversions Trajectory model

Fixes metric 296. Ours divides by `day_of_month - 1` and reads ~86 where Looker reads 75. Derived from Nelson's 2026-07-22 screenshot: Conversion = 51, Trajectory = 71.86, and `51 ÷ 22 × 31 = 71.86` exactly. So Looker counts conversions through *yesterday* and divides by `EXTRACT(DAY FROM CURRENT_DATE())`.

The TICKETS.md fix candidate guessed `day_of_month + 1`. It is wrong. Do not use it.

**Files:**
- Create: `models/metrics/v_metric__conversions_trajectory.sql`
- Create: `models/metrics/v_metric__conversions_trajectory.yml`
- Create: `tests/assert_trajectory_invariants.sql`

**Interfaces:**
- Consumes: `source('revenue', 'int_conversions')` — one row per Account with `FirstSaaSInvoiceTxnDate` set.
- Produces: view `revenue_metrics.v_metric__conversions_trajectory`, columns `period DATE`, `value FLOAT64`. Exactly one row, `period = DATE_TRUNC(CURRENT_DATE(), MONTH)`. Consumed by Task 3.

- [ ] **Step 1: Snapshot the current metric 296 value**

Run this and save the output to compare against in Step 6:

```bash
/Users/nicolas/.local/bin/dbt show --inline "
SELECT
  COUNT(*) AS mtd_conversions,
  EXTRACT(DAY FROM CURRENT_DATE()) AS day_of_month,
  EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE(), MONTH)) AS days_in_month
FROM \`project-for-method-dw.revenue.int_conversions\`
WHERE FirstSaaSInvoiceTxnDate >= DATE_TRUNC(CURRENT_DATE(), MONTH)
  AND FirstSaaSInvoiceTxnDate < CURRENT_DATE()
"
```

Record all three numbers. Compute `mtd ÷ day_of_month × days_in_month` by hand — that is the expected value of the new model.

- [ ] **Step 2: Write the failing test**

Create `tests/assert_trajectory_invariants.sql`. A dbt singular test passes when it returns **zero rows**.

These models depend on `CURRENT_DATE()`, so a dbt unit test with fixed rows would give a different answer every day. Invariant assertions are the correct tool here.

```sql
-- Invariants for the two trajectory metric views.
-- A projection of an in-progress month must:
--   1. return exactly one row
--   2. be keyed to the current month
--   3. be >= the actual month-to-date count (it scales up, never down)
-- Returns offending rows; empty result = pass.

WITH conv AS (
  SELECT 'conversions' AS metric, period, value
  FROM {{ ref('v_metric__conversions_trajectory') }}
),
syncs AS (
  SELECT 'syncs' AS metric, period, value
  FROM {{ ref('v_metric__syncs_trajectory') }}
),
combined AS (
  SELECT * FROM conv UNION ALL SELECT * FROM syncs
),
actuals AS (
  SELECT 'conversions' AS metric, COUNT(*) AS mtd
  FROM {{ source('revenue', 'int_conversions') }}
  WHERE FirstSaaSInvoiceTxnDate >= DATE_TRUNC(CURRENT_DATE(), MONTH)
    AND FirstSaaSInvoiceTxnDate < CURRENT_DATE()
  UNION ALL
  SELECT 'syncs' AS metric, COUNT(*) AS mtd
  FROM {{ ref('int_syncs') }}
  WHERE SyncDate >= DATE_TRUNC(CURRENT_DATE(), MONTH)
    AND SyncDate < CURRENT_DATE()
),
row_counts AS (
  SELECT metric, COUNT(*) AS n FROM combined GROUP BY 1
)
SELECT c.metric, c.period, c.value, 'wrong_period' AS violation
FROM combined c
WHERE c.period != DATE_TRUNC(CURRENT_DATE(), MONTH)

UNION ALL
SELECT r.metric, NULL AS period, CAST(r.n AS FLOAT64) AS value, 'not_exactly_one_row'
FROM row_counts r
WHERE r.n != 1

UNION ALL
SELECT c.metric, c.period, c.value, 'projection_below_actual'
FROM combined c
JOIN actuals a USING (metric)
WHERE c.value < a.mtd
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
/Users/nicolas/.local/bin/dbt test --select assert_trajectory_invariants
```

Expected: FAIL — `Compilation Error`, model `v_metric__conversions_trajectory` not found. The models don't exist yet.

- [ ] **Step 4: Write the model**

Create `models/metrics/v_metric__conversions_trajectory.sql`:

```sql
{{ config(materialized='view') }}

-- Canonical metric: "Conversions Trajectory" (#296)
-- Type: derived (single-period projection)
--
-- Month-end projection of the in-progress month, Looker-compatible.
-- Formula: conversions through YESTERDAY
--            / EXTRACT(DAY FROM CURRENT_DATE())
--            * days in the current month
--
-- The divisor is day_of_month, NOT day_of_month - 1 (our old Supabase
-- formula, which over-projected) and NOT day_of_month + 1. Derived from a
-- 2026-07-22 Looker read: 51 conversions / 22 * 31 = 71.86, exact.
--
-- Returns exactly ONE row, keyed to the first of the current month.
-- Trajectory is meaningless for a closed month — the actual is the answer
-- there, so no historical rows are emitted.

WITH mtd AS (
  SELECT COUNT(*) AS conversions
  FROM {{ source('revenue', 'int_conversions') }}
  WHERE FirstSaaSInvoiceTxnDate >= DATE_TRUNC(CURRENT_DATE(), MONTH)
    AND FirstSaaSInvoiceTxnDate < CURRENT_DATE()
)
SELECT
  DATE_TRUNC(CURRENT_DATE(), MONTH) AS period,
  SAFE_DIVIDE(
    mtd.conversions,
    EXTRACT(DAY FROM CURRENT_DATE())
  ) * EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE(), MONTH)) AS value
FROM mtd
```

- [ ] **Step 5: Write the yml**

Create `models/metrics/v_metric__conversions_trajectory.yml`:

```yaml
# Canonical metric definition for "Conversions Trajectory" (#296).

models:
  - name: v_metric__conversions_trajectory
    description: |
      Month-end projection of conversions for the in-progress month.
      Counts conversions through yesterday, divides by the current day of
      month, and scales to the full month. Looker-compatible: the divisor
      is day_of_month, not day_of_month - 1. Returns exactly one row for
      the current month — trajectory has no meaning for a closed month.
    config:
      materialized: view
      meta:
        answers: "If the current month continues at its month-to-date pace, how many conversions will it finish with?"
        grain: "Single row, current month. Account-grain numerator (see Conversions #56)."
        filters:
          - rule: "FirstSaaSInvoiceTxnDate >= DATE_TRUNC(CURRENT_DATE(), MONTH)"
            why: "restricts the numerator to the in-progress month"
          - rule: "FirstSaaSInvoiceTxnDate < CURRENT_DATE()"
            why: "excludes today, which is itself incomplete and would drag the pace down"
        methodology_source: "Reverse-engineered from the live Looker Sales Scorecard, 2026-07-22 read: 51 conversions / 22 day-of-month * 31 days = 71.86, exact match to Looker's displayed trajectory."
        parity_verified:
          against: "PENDING — Task 10 records the live Looker side-by-side"
          values: "PENDING"
        caveats:
          - "Divisor is day_of_month, which means the projection is noisy in the first few days of a month. Expect wide swings before roughly the 5th."
          - "Supersedes the old Supabase metric 296 chart_sql, which divided by day_of_month - 1 and over-projected by roughly 5%."
          - "Single-row by design. Do not chart it as a time series."
        used_by:
          - "Sales Scorecard (Conversion Rate section)"
          - "Sync Conversion Rate Trajectory"
      labels:
        metric_id: '296'
        layer: metrics
        type: derived
        status: queued
        source_table: int_conversions
        source_measure_safe: count_star
        depends_on: '56'
```

- [ ] **Step 6: Build the model and verify against the Step 1 snapshot**

```bash
/Users/nicolas/.local/bin/dbt run --select v_metric__conversions_trajectory
```

Then:

```bash
/Users/nicolas/.local/bin/dbt show --select v_metric__conversions_trajectory
```

Expected: one row. `value` must equal the hand-computed number from Step 1. If it does not match exactly, stop and report the discrepancy — do not proceed.

- [ ] **Step 7: Commit**

```bash
git add models/metrics/v_metric__conversions_trajectory.sql \
        models/metrics/v_metric__conversions_trajectory.yml \
        tests/assert_trajectory_invariants.sql
git commit -m "feat(metrics): conversions trajectory model with Looker-compatible divisor"
```

The invariants test still fails at this point — it references `v_metric__syncs_trajectory`, built in Task 2. That is expected.

---

### Task 2: Syncs Trajectory model

Same projection shape as Task 1, over syncs. Backs Supabase metric 295. There is no known divergence in 295 — but it must use the same divisor as 296, or the ratio in Task 3 is inconsistent.

**Files:**
- Create: `models/metrics/v_metric__syncs_trajectory.sql`
- Create: `models/metrics/v_metric__syncs_trajectory.yml`

**Interfaces:**
- Consumes: `ref('int_syncs')` — one row per sync event, date column `SyncDate`.
- Produces: view `revenue_metrics.v_metric__syncs_trajectory`, columns `period DATE`, `value FLOAT64`. Exactly one row, `period = DATE_TRUNC(CURRENT_DATE(), MONTH)`. Consumed by Task 3.

- [ ] **Step 1: Snapshot the expected value**

```bash
/Users/nicolas/.local/bin/dbt show --inline "
SELECT
  COUNT(*) AS mtd_syncs,
  EXTRACT(DAY FROM CURRENT_DATE()) AS day_of_month,
  EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE(), MONTH)) AS days_in_month
FROM \`project-for-method-dw.revenue.int_syncs\`
WHERE SyncDate >= DATE_TRUNC(CURRENT_DATE(), MONTH)
  AND SyncDate < CURRENT_DATE()
"
```

Compute `mtd_syncs ÷ day_of_month × days_in_month` by hand.

- [ ] **Step 2: Write the model**

Create `models/metrics/v_metric__syncs_trajectory.sql`:

```sql
{{ config(materialized='view') }}

-- Canonical metric: "Syncs Trajectory" (#295)
-- Type: derived (single-period projection)
--
-- Month-end projection of the in-progress month. Same divisor convention
-- as v_metric__conversions_trajectory (day_of_month, counting through
-- yesterday) — the two are divided by each other to produce the Sync
-- Conversion Rate Trajectory, so they must agree on convention.
--
-- Returns exactly ONE row, keyed to the first of the current month.

WITH mtd AS (
  SELECT COUNT(*) AS syncs
  FROM {{ ref('int_syncs') }}
  WHERE SyncDate >= DATE_TRUNC(CURRENT_DATE(), MONTH)
    AND SyncDate < CURRENT_DATE()
)
SELECT
  DATE_TRUNC(CURRENT_DATE(), MONTH) AS period,
  SAFE_DIVIDE(
    mtd.syncs,
    EXTRACT(DAY FROM CURRENT_DATE())
  ) * EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE(), MONTH)) AS value
FROM mtd
```

- [ ] **Step 3: Write the yml**

Create `models/metrics/v_metric__syncs_trajectory.yml`:

```yaml
# Canonical metric definition for "Syncs Trajectory" (#295).

models:
  - name: v_metric__syncs_trajectory
    description: |
      Month-end projection of sync events for the in-progress month.
      Counts syncs through yesterday, divides by the current day of month,
      and scales to the full month. Same divisor convention as Conversions
      Trajectory (#296) so the two can be divided into a rate. Returns
      exactly one row for the current month.
    config:
      materialized: view
      meta:
        answers: "If the current month continues at its month-to-date pace, how many sync events will it finish with?"
        grain: "Single row, current month. Event-grain numerator (see Syncs #55)."
        filters:
          - rule: "SyncDate >= DATE_TRUNC(CURRENT_DATE(), MONTH)"
            why: "restricts the numerator to the in-progress month"
          - rule: "SyncDate < CURRENT_DATE()"
            why: "excludes today, which is incomplete"
        methodology_source: "Mirrors the divisor convention derived for Conversions Trajectory (#296) from the 2026-07-22 Looker read."
        parity_verified:
          against: "PENDING — Task 10 records the live Looker side-by-side"
          values: "PENDING"
        caveats:
          - "Inherits the event-grain inflation of Syncs #55 — roughly 9-13% from re-sync events. See scripts/reconcile_sync_denominators.py output."
          - "Noisy in the first few days of a month, same as #296."
          - "Single-row by design. Do not chart it as a time series."
        used_by:
          - "Sales Scorecard (Sync Conversion Rate section)"
          - "Sync Conversion Rate Trajectory"
      labels:
        metric_id: '295'
        layer: metrics
        type: derived
        status: queued
        source_table: int_syncs
        source_measure_safe: count_star
        depends_on: '55'
```

- [ ] **Step 4: Build and verify against the Step 1 snapshot**

```bash
/Users/nicolas/.local/bin/dbt run --select v_metric__syncs_trajectory
/Users/nicolas/.local/bin/dbt show --select v_metric__syncs_trajectory
```

Expected: one row, `value` equal to the hand-computed number from Step 1.

- [ ] **Step 5: Run the invariants test — it should now pass**

```bash
/Users/nicolas/.local/bin/dbt test --select assert_trajectory_invariants
```

Expected: PASS. Both models now exist, both return one current-month row, both project at or above actual MTD.

- [ ] **Step 6: Commit**

```bash
git add models/metrics/v_metric__syncs_trajectory.sql \
        models/metrics/v_metric__syncs_trajectory.yml
git commit -m "feat(metrics): syncs trajectory model, matching #296 divisor convention"
```

---

### Task 3: Sync Conversion Rate Trajectory

Ratio of the two trajectories. Follows the exact pattern of the existing `v_metric__sync_to_conversion_rate` — `FULL OUTER JOIN` on period, `SAFE_DIVIDE`.

**Files:**
- Create: `models/metrics/v_metric__sync_conversion_rate_trajectory.sql`
- Create: `models/metrics/v_metric__sync_conversion_rate_trajectory.yml`

**Interfaces:**
- Consumes: `ref('v_metric__conversions_trajectory')` and `ref('v_metric__syncs_trajectory')`, both `period DATE` / `value FLOAT64`, one row each.
- Produces: view `revenue_metrics.v_metric__sync_conversion_rate_trajectory`, `period DATE`, `value FLOAT64` — a decimal rate, not a percentage. One row.

- [ ] **Step 1: Write the failing unit test**

This model has no `CURRENT_DATE()` of its own — it only joins two refs — so a dbt unit test with mocked inputs is stable and correct here.

Add to `models/metrics/v_metric__sync_conversion_rate_trajectory.yml`:

```yaml
version: 2

unit_tests:
  - name: sync_conversion_rate_trajectory_divides
    model: v_metric__sync_conversion_rate_trajectory
    given:
      - input: ref('v_metric__conversions_trajectory')
        rows:
          - { period: '2026-07-01', value: 71.86 }
      - input: ref('v_metric__syncs_trajectory')
        rows:
          - { period: '2026-07-01', value: 250.0 }
    expect:
      rows:
        - { period: '2026-07-01', value: 0.28744 }

  - name: sync_conversion_rate_trajectory_null_safe_on_zero_syncs
    model: v_metric__sync_conversion_rate_trajectory
    given:
      - input: ref('v_metric__conversions_trajectory')
        rows:
          - { period: '2026-07-01', value: 10.0 }
      - input: ref('v_metric__syncs_trajectory')
        rows:
          - { period: '2026-07-01', value: 0.0 }
    expect:
      rows:
        - { period: '2026-07-01', value: null }
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
/Users/nicolas/.local/bin/dbt test --select v_metric__sync_conversion_rate_trajectory
```

Expected: FAIL — `Compilation Error`, model not found.

- [ ] **Step 3: Write the model**

Create `models/metrics/v_metric__sync_conversion_rate_trajectory.sql`:

```sql
{{ config(materialized='view') }}

-- Canonical metric: "Sync Conversion Rate Trajectory"
-- Type: ratio (cross-model)
-- Formula: SAFE_DIVIDE(conversions trajectory, syncs trajectory)
--
-- Same-month, no lag — matching v_metric__sync_to_conversion_rate. Both
-- inputs project the in-progress month to month-end using the same
-- day_of_month divisor, so the ratio is internally consistent.
--
-- Emits a decimal rate (0.28), not a percentage (28.0).

SELECT
  COALESCE(c.period, s.period) AS period,
  SAFE_DIVIDE(c.value, s.value) AS value
FROM {{ ref('v_metric__conversions_trajectory') }} c
FULL OUTER JOIN {{ ref('v_metric__syncs_trajectory') }} s
  ON c.period = s.period
ORDER BY 1
```

- [ ] **Step 4: Append the model docs to the yml**

Append to `models/metrics/v_metric__sync_conversion_rate_trajectory.yml`, below the `unit_tests:` block:

```yaml
models:
  - name: v_metric__sync_conversion_rate_trajectory
    description: |
      Month-end projection of the sync conversion rate for the in-progress
      month — projected conversions divided by projected sync events. Both
      sides use the same day_of_month projection, so the ratio is stable
      through the month. Same-month, no lag, matching Sync-to-Conversion
      Rate (#301). Emits a decimal rate, not a percentage.
    config:
      materialized: view
      meta:
        answers: "If the current month continues at its month-to-date pace, what sync conversion rate will it finish at?"
        grain: "Single row, current month. Period-level ratio."
        methodology_source: "Ratio of the two trajectory projections, which follow the Looker divisor convention derived 2026-07-22."
        parity_verified:
          against: "PENDING — Task 10 records the live Looker side-by-side"
          values: "PENDING"
        caveats:
          - "Denominator is event-grain syncs, inflated roughly 9-13% by re-syncs. Reads LOW versus a true 'share of synced accounts that converted'."
          - "Not comparable in LEVEL to the trials Conversion Rate Trajectory — that one uses a lagged denominator. Compare trend and attainment, not level."
          - "Single-row by design."
        used_by:
          - "Sales Scorecard (Sync Conversion Rate section)"
      labels:
        metric_id: ''
        layer: metrics
        type: ratio
        status: queued
        source_table: ''
        source_measure_safe: ''
        depends_on: '296-295'
```

`metric_id` is left empty deliberately. Task 8 assigns the Supabase id and this label gets filled in then.

- [ ] **Step 5: Run the test to verify it passes**

```bash
/Users/nicolas/.local/bin/dbt test --select v_metric__sync_conversion_rate_trajectory
```

Expected: PASS, 2 unit tests.

- [ ] **Step 6: Build and eyeball**

```bash
/Users/nicolas/.local/bin/dbt run --select v_metric__sync_conversion_rate_trajectory
/Users/nicolas/.local/bin/dbt show --select v_metric__sync_conversion_rate_trajectory
```

Expected: one row. `value` should land roughly in 0.24–0.33, the band recorded on #301. A value outside that band is not automatically wrong mid-month, but flag it in the commit message.

- [ ] **Step 7: Commit**

```bash
git add models/metrics/v_metric__sync_conversion_rate_trajectory.sql \
        models/metrics/v_metric__sync_conversion_rate_trajectory.yml
git commit -m "feat(metrics): sync conversion rate trajectory"
```

---

### Task 4: Budgeted and Forecasted sync conversion rates

Both read `method_forecast` and have identical shape, so they ship together.

These are **derived ratios Justin never published**. `method_forecast` stores `Budgeted_Conversion_Rate` and `Forecasted_Conversion_Rate` as pre-computed *trials* rates. There is no stored sync equivalent, so we compute `SUM(Budgeted_Conversion) ÷ SUM(Budgeted_Syncs)`.

Sum the daily allocations, then divide. Do not use `MAX()` — that is correct for a pre-computed rate column and wrong for a ratio built from two count columns.

**Files:**
- Create: `models/metrics/v_metric__sync_conversion_rate_budgeted.sql` / `.yml`
- Create: `models/metrics/v_metric__sync_conversion_rate_forecasted.sql` / `.yml`

**Interfaces:**
- Consumes: `source('revenue', 'method_forecast')`, columns `Date DATE`, `Budgeted_Conversion FLOAT64`, `Budgeted_Syncs FLOAT64`, `Forecasted_Conversion INT64`, `Forecasted_Syncs INT64`.
- Produces: two views, each `period DATE`, `value FLOAT64` (decimal rate), one row per month present in the sheet. Consumed by Task 9's KPIs and both charts.

- [ ] **Step 1: Snapshot what the sheet currently holds**

```bash
/Users/nicolas/.local/bin/dbt show --inline "
SELECT
  DATE_TRUNC(Date, MONTH) AS period,
  SUM(Budgeted_Conversion)  AS budg_conv,
  SUM(Budgeted_Syncs)       AS budg_syncs,
  SUM(Forecasted_Conversion) AS fc_conv,
  SUM(Forecasted_Syncs)      AS fc_syncs
FROM \`project-for-method-dw.revenue.method_forecast\`
GROUP BY 1 ORDER BY 1
" --limit 24
```

Save this table. Two checks before continuing: no month has a zero or null sync denominator, and the implied rates are plausible. If any month's implied rate is above 1.0 or below 0.05, stop and report — the sheet columns may not mean what we assume.

- [ ] **Step 2: Write the failing unit tests**

Create `models/metrics/v_metric__sync_conversion_rate_budgeted.yml`:

```yaml
version: 2

unit_tests:
  - name: budgeted_sync_rate_sums_before_dividing
    model: v_metric__sync_conversion_rate_budgeted
    given:
      - input: source('revenue', 'method_forecast')
        rows:
          # Two days in the same month. Summing first gives 5/20 = 0.25.
          # Averaging the daily ratios would give (2/5 + 3/15)/2 = 0.30 — wrong.
          - { Date: '2026-07-01', Budgeted_Conversion: 2.0, Budgeted_Syncs: 5.0 }
          - { Date: '2026-07-02', Budgeted_Conversion: 3.0, Budgeted_Syncs: 15.0 }
          - { Date: '2026-08-01', Budgeted_Conversion: 1.0, Budgeted_Syncs: 4.0 }
    expect:
      rows:
        - { period: '2026-07-01', value: 0.25 }
        - { period: '2026-08-01', value: 0.25 }

  - name: budgeted_sync_rate_null_on_zero_denominator
    model: v_metric__sync_conversion_rate_budgeted
    given:
      - input: source('revenue', 'method_forecast')
        rows:
          - { Date: '2026-09-01', Budgeted_Conversion: 5.0, Budgeted_Syncs: 0.0 }
    expect:
      rows:
        - { period: '2026-09-01', value: null }
```

- [ ] **Step 3: Run to verify it fails**

```bash
/Users/nicolas/.local/bin/dbt test --select v_metric__sync_conversion_rate_budgeted
```

Expected: FAIL — `Compilation Error`, model not found.

- [ ] **Step 4: Write the budgeted model**

Create `models/metrics/v_metric__sync_conversion_rate_budgeted.sql`:

```sql
{{ config(materialized='view') }}

-- Canonical metric: "Budgeted Sync Conversion Rate"
-- Type: derived ratio
-- Formula: SUM(Budgeted_Conversion) / SUM(Budgeted_Syncs) per month
--
-- DERIVED, NOT PUBLISHED. method_forecast stores Budgeted_Conversion_Rate
-- as a pre-computed TRIALS rate. There is no stored sync equivalent, so
-- this divides the two budgeted counts. Justin owns revenue methodology
-- and has to confirm the derivation before this goes leadership-facing.
--
-- Sum the daily allocations, THEN divide. Averaging daily ratios would
-- weight a low-volume day the same as a high-volume one.
--
-- Emits a decimal rate (0.25), not a percentage (25.0).

SELECT
  DATE_TRUNC(Date, MONTH) AS period,
  SAFE_DIVIDE(
    SUM(Budgeted_Conversion),
    SUM(Budgeted_Syncs)
  ) AS value
FROM {{ source('revenue', 'method_forecast') }}
GROUP BY 1
ORDER BY 1
```

- [ ] **Step 5: Append model docs to the budgeted yml**

Append below the `unit_tests:` block:

```yaml
models:
  - name: v_metric__sync_conversion_rate_budgeted
    description: |
      Budgeted sync conversion rate by month — budgeted conversions divided
      by budgeted sync events, summing daily allocations before dividing.
      DERIVED, not published: method_forecast carries a pre-computed
      trials-based Budgeted_Conversion_Rate but no sync equivalent. Emits a
      decimal rate, not a percentage.
    config:
      materialized: view
      meta:
        answers: "What sync conversion rate does the budget imply for each month?"
        grain: "Period-level ratio, one row per month present in the forecast sheet."
        filters:
          - rule: "none"
            why: "the sheet contains only budget-year rows; no date filter needed"
        methodology_source: "Derived by Nic 2026-07-30 as Budgeted_Conversion / Budgeted_Syncs. NOT a Justin-published ratio — pending his confirmation."
        parity_verified:
          against: "PENDING — Justin sign-off plus Looker side-by-side in Task 10"
          values: "PENDING"
        caveats:
          - "DERIVED ratio. Justin has not published a budgeted sync conversion rate; this infers one from two budgeted counts."
          - "Source is revenue.method_forecast, an EXTERNAL table federated over a Google Sheet. A column rename or shifted header row breaks this silently."
          - "Federated-sheet reads need the Drive scope on any service-account path."
        used_by:
          - "Sales Scorecard (Sync Conversion Rate section)"
      labels:
        metric_id: ''
        layer: metrics
        type: derived
        status: queued
        source_table: method_forecast
        source_measure_safe: ''
        depends_on: ''
```

- [ ] **Step 6: Run the budgeted test to verify it passes**

```bash
/Users/nicolas/.local/bin/dbt test --select v_metric__sync_conversion_rate_budgeted
```

Expected: PASS, 2 unit tests.

- [ ] **Step 7: Write the forecasted model**

Create `models/metrics/v_metric__sync_conversion_rate_forecasted.sql`:

```sql
{{ config(materialized='view') }}

-- Canonical metric: "Forecasted Sync Conversion Rate"
-- Type: derived ratio
-- Formula: SUM(Forecasted_Conversion) / SUM(Forecasted_Syncs) per month
--
-- DERIVED, NOT PUBLISHED — same caveat as the budgeted twin. See
-- v_metric__sync_conversion_rate_budgeted.sql for the full reasoning on
-- why this sums before dividing.
--
-- Emits a decimal rate (0.25), not a percentage (25.0).

SELECT
  DATE_TRUNC(Date, MONTH) AS period,
  SAFE_DIVIDE(
    SUM(Forecasted_Conversion),
    SUM(Forecasted_Syncs)
  ) AS value
FROM {{ source('revenue', 'method_forecast') }}
GROUP BY 1
ORDER BY 1
```

- [ ] **Step 8: Write the forecasted yml with its own unit test**

Create `models/metrics/v_metric__sync_conversion_rate_forecasted.yml`:

```yaml
version: 2

unit_tests:
  - name: forecasted_sync_rate_sums_before_dividing
    model: v_metric__sync_conversion_rate_forecasted
    given:
      - input: source('revenue', 'method_forecast')
        rows:
          - { Date: '2026-07-01', Forecasted_Conversion: 2, Forecasted_Syncs: 5 }
          - { Date: '2026-07-02', Forecasted_Conversion: 3, Forecasted_Syncs: 15 }
          - { Date: '2026-08-01', Forecasted_Conversion: 1, Forecasted_Syncs: 4 }
    expect:
      rows:
        - { period: '2026-07-01', value: 0.25 }
        - { period: '2026-08-01', value: 0.25 }

  - name: forecasted_sync_rate_null_on_zero_denominator
    model: v_metric__sync_conversion_rate_forecasted
    given:
      - input: source('revenue', 'method_forecast')
        rows:
          - { Date: '2026-09-01', Forecasted_Conversion: 5, Forecasted_Syncs: 0 }
    expect:
      rows:
        - { period: '2026-09-01', value: null }

models:
  - name: v_metric__sync_conversion_rate_forecasted
    description: |
      Forecasted sync conversion rate by month — forecasted conversions
      divided by forecasted sync events, summing daily allocations before
      dividing. DERIVED, not published: method_forecast carries a
      pre-computed trials-based Forecasted_Conversion_Rate but no sync
      equivalent. Emits a decimal rate, not a percentage.
    config:
      materialized: view
      meta:
        answers: "What sync conversion rate does the forecast imply for each month?"
        grain: "Period-level ratio, one row per month present in the forecast sheet."
        methodology_source: "Derived by Nic 2026-07-30 as Forecasted_Conversion / Forecasted_Syncs. NOT a Justin-published ratio — pending his confirmation."
        parity_verified:
          against: "PENDING — Justin sign-off plus Looker side-by-side in Task 10"
          values: "PENDING"
        caveats:
          - "DERIVED ratio. Justin has not published a forecasted sync conversion rate."
          - "Source is revenue.method_forecast, an EXTERNAL table over a Google Sheet. Fragile to sheet edits."
        used_by:
          - "Sales Scorecard (Sync Conversion Rate section)"
      labels:
        metric_id: ''
        layer: metrics
        type: derived
        status: queued
        source_table: method_forecast
        source_measure_safe: ''
        depends_on: ''
```

- [ ] **Step 9: Build both and compare against the Step 1 snapshot**

```bash
/Users/nicolas/.local/bin/dbt build --select v_metric__sync_conversion_rate_budgeted v_metric__sync_conversion_rate_forecasted
/Users/nicolas/.local/bin/dbt show --select v_metric__sync_conversion_rate_budgeted --limit 24
/Users/nicolas/.local/bin/dbt show --select v_metric__sync_conversion_rate_forecasted --limit 24
```

For every month, divide the Step 1 snapshot's `budg_conv ÷ budg_syncs` by hand and confirm it matches the view's `value` to 4 decimal places. Same for forecasted. Report the full row-by-row comparison in the commit message.

- [ ] **Step 10: Commit**

```bash
git add models/metrics/v_metric__sync_conversion_rate_budgeted.sql \
        models/metrics/v_metric__sync_conversion_rate_budgeted.yml \
        models/metrics/v_metric__sync_conversion_rate_forecasted.sql \
        models/metrics/v_metric__sync_conversion_rate_forecasted.yml
git commit -m "feat(metrics): derived budgeted + forecasted sync conversion rates"
```

---

### Task 5: Weekly sync conversion rate

Backs the Week Over Week chart. Unlike the trials weekly SQL, there is no lag and no `method_forecast` join — just conversions ÷ syncs by ISO week.

**Files:**
- Create: `models/metrics/v_metric__sync_conversion_rate_weekly.sql` / `.yml`
- Create: `tests/assert_sync_conversion_rate_sane.sql`

**Interfaces:**
- Consumes: `source('revenue', 'int_conversions')` (`FirstSaaSInvoiceTxnDate`) and `ref('int_syncs')` (`SyncDate`).
- Produces: view `revenue_metrics.v_metric__sync_conversion_rate_weekly`, `period DATE` (Monday of the ISO week), `value FLOAT64` (decimal rate). Rolling 24 months.

- [ ] **Step 1: Write the failing test**

Create `tests/assert_sync_conversion_rate_sane.sql`. This model depends on `CURRENT_DATE()` for its window, so invariants are the right tool rather than a unit test.

```sql
-- Sanity invariants for the sync conversion rate views.
-- A rate built from counts must be non-negative. For CLOSED periods it
-- must also be <= 1 — more conversions than syncs in a settled week would
-- mean the denominator is wrong, not that conversion beat 100%.
-- The current (partial) week and month are exempt: a conversion can land
-- before its sync is recorded within the same partial period.
-- Returns offending rows; empty result = pass.

WITH weekly AS (
  SELECT 'weekly' AS grain, period, value
  FROM {{ ref('v_metric__sync_conversion_rate_weekly') }}
  WHERE period < DATE_TRUNC(CURRENT_DATE(), WEEK(MONDAY))
),
monthly AS (
  SELECT 'monthly' AS grain, period, value
  FROM {{ ref('v_metric__sync_to_conversion_rate') }}
  WHERE period < DATE_TRUNC(CURRENT_DATE(), MONTH)
),
combined AS (
  SELECT * FROM weekly UNION ALL SELECT * FROM monthly
)
SELECT grain, period, value,
       IF(value < 0, 'negative_rate', 'rate_above_one') AS violation
FROM combined
WHERE value < 0 OR value > 1
```

- [ ] **Step 2: Run to verify it fails**

```bash
/Users/nicolas/.local/bin/dbt test --select assert_sync_conversion_rate_sane
```

Expected: FAIL — `Compilation Error`, `v_metric__sync_conversion_rate_weekly` not found.

- [ ] **Step 3: Write the model**

Create `models/metrics/v_metric__sync_conversion_rate_weekly.sql`:

```sql
{{ config(materialized='view') }}

-- Canonical metric: "Sync Conversion Rate (weekly)"
-- Type: ratio (cross-model), ISO week grain
-- Formula: SAFE_DIVIDE(conversions in week, syncs in week)
--
-- Same-month convention taken down to the week: no lag, no forecast join.
-- Contrast with the trials weekly rate, which shifts SignupDate +1 month
-- and averages against Forecasted_Trials.
--
-- Week starts MONDAY, matching every other weekly series on the Sales
-- Scorecard. 24-month rolling window, matching the metrics-layer
-- convention.
--
-- Emits a decimal rate (0.28), not a percentage (28.0). The scorecard's
-- valueFormat handles display.

WITH conversions AS (
  SELECT
    DATE_TRUNC(FirstSaaSInvoiceTxnDate, WEEK(MONDAY)) AS week,
    COUNT(*) AS conversions
  FROM {{ source('revenue', 'int_conversions') }}
  WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  GROUP BY 1
),
syncs AS (
  SELECT
    DATE_TRUNC(SyncDate, WEEK(MONDAY)) AS week,
    COUNT(*) AS syncs
  FROM {{ ref('int_syncs') }}
  WHERE SyncDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  GROUP BY 1
)
SELECT
  COALESCE(c.week, s.week) AS period,
  SAFE_DIVIDE(c.conversions, s.syncs) AS value
FROM conversions c
FULL OUTER JOIN syncs s
  ON c.week = s.week
ORDER BY 1
```

- [ ] **Step 4: Write the yml**

Create `models/metrics/v_metric__sync_conversion_rate_weekly.yml`:

```yaml
# Canonical metric definition for "Sync Conversion Rate (weekly)".

models:
  - name: v_metric__sync_conversion_rate_weekly
    description: |
      Weekly sync conversion rate — conversions in an ISO week divided by
      sync events in the same week, no lag. Weeks start Monday, matching
      every other weekly series on the Sales Scorecard. Rolling 24 months.
      Emits a decimal rate, not a percentage.
    config:
      materialized: view
      meta:
        answers: "What fraction of sync events converted, week by week?"
        grain: "ISO week (Monday start). Period-level ratio; both sides are event/account counts."
        filters:
          - rule: "rolling 24 months on both sides"
            why: "matches the metrics-layer convention and bounds query cost"
        methodology_source: "Weekly form of Sync-to-Conversion Rate (#301). Same-month/no-lag convention chosen 2026-07-30."
        parity_verified:
          against: "PENDING — Task 10 records the live Looker side-by-side"
          values: "PENDING"
        caveats:
          - "Weekly rates are noisy. The trials equivalent swings between 6% and 17% week to week; expect similar or worse here on a smaller denominator."
          - "Denominator is event-grain syncs, inflated roughly 9-13% by re-syncs."
          - "The current partial week is incomplete on both sides and can read anomalously."
        used_by:
          - "Sales Scorecard (Sync Conversion Rate section, Week Over Week chart)"
      labels:
        metric_id: ''
        layer: metrics
        type: ratio
        status: queued
        source_table: ''
        source_measure_safe: ''
        depends_on: '56-55'
```

- [ ] **Step 5: Build, then run the test to verify it passes**

```bash
/Users/nicolas/.local/bin/dbt run --select v_metric__sync_conversion_rate_weekly
/Users/nicolas/.local/bin/dbt test --select assert_sync_conversion_rate_sane
```

Expected: model builds, test PASSES. A failure here means some closed week has more conversions than syncs — do not suppress it, report it, because it points at the denominator problem Task 7 measures.

- [ ] **Step 6: Eyeball the series**

```bash
/Users/nicolas/.local/bin/dbt show --select v_metric__sync_conversion_rate_weekly --limit 12
```

Expected: 12 recent weeks, values mostly in 0.15–0.45. Wider than the monthly 0.24–0.33 band because weekly is noisier.

- [ ] **Step 7: Commit**

```bash
git add models/metrics/v_metric__sync_conversion_rate_weekly.sql \
        models/metrics/v_metric__sync_conversion_rate_weekly.yml \
        tests/assert_sync_conversion_rate_sane.sql
git commit -m "feat(metrics): weekly sync conversion rate + rate sanity invariants"
```

---

### Task 6: Lagged trials conversion rate

Fixes metric 357, which currently returns empty.

357 is **not** `v_metric__trial_to_conversion_rate` (#302). #302 is same-month and runs 15–20%. The scorecard panel shows 9.60%, because its denominator is lagged and full-month while its numerator is a partial month.

No month-to-date special-casing is needed. The numerator is simply conversions in that month — naturally partial for the current month, complete for closed ones. That partialness is exactly why the panel reads 9.60% on the 22nd and closed months read 12–15%.

**Files:**
- Create: `models/metrics/v_metric__trial_conversion_rate_lagged.sql` / `.yml`

**Interfaces:**
- Consumes: `source('revenue', 'int_conversions')`, `ref('int_trials')` (`SignupDate`), `source('revenue', 'method_forecast')` (`Forecasted_Trials`).
- Produces: view `revenue_metrics.v_metric__trial_conversion_rate_lagged`, `period DATE`, `value FLOAT64` (decimal rate). One row per month with conversions, rolling 24 months.

- [ ] **Step 1: Snapshot what the Looker panel shows**

Open the live Looker Sales Scorecard. Record the Conversion Rate KPI and all four Month Over Month bar values for the light-blue "Conversion Rate" series. Write them down with the date and time of the read.

This is the comparison target for Step 5. Without it there is nothing to verify against.

- [ ] **Step 2: Write the model**

Create `models/metrics/v_metric__trial_conversion_rate_lagged.sql`:

```sql
{{ config(materialized='view') }}

-- Canonical metric: "Conversion Rate" (#357) — the Sales Scorecard flavour
-- Type: derived ratio
--
-- Formula: conversions in M
--            / ((trials in M-1 + forecasted trials in M) / 2)
--
-- This is NOT v_metric__trial_to_conversion_rate (#302). #302 is
-- same-month and runs 15-20%. This one lags the denominator by a month
-- and blends in forecast, which is what the Looker Sales Scorecard shows.
--
-- The one-month lag is deliberate: trials convert roughly a month after
-- signup, so pairing conversions in M against trials in M-1 is closer to
-- a cohort than same-month would be.
--
-- The current month reads LOW (a partial numerator over a full-month
-- denominator). That is not a bug — it is why the panel shows ~9.6%
-- mid-month and ~13% at month end. Do not "fix" it by annualising here;
-- the trajectory metric (#321) is the month-end projection.
--
-- Emits a decimal rate (0.096), not a percentage (9.6).

WITH conversions AS (
  SELECT
    DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS period,
    COUNT(*) AS conversions
  FROM {{ source('revenue', 'int_conversions') }}
  WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
  GROUP BY 1
),
trials_lagged AS (
  -- Trials from month M-1, surfaced under month M.
  SELECT
    DATE_ADD(DATE_TRUNC(SignupDate, MONTH), INTERVAL 1 MONTH) AS period,
    COUNT(*) AS prior_month_trials
  FROM {{ ref('int_trials') }}
  WHERE SignupDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 25 MONTH)
  GROUP BY 1
),
forecast AS (
  SELECT
    DATE_TRUNC(Date, MONTH) AS period,
    SUM(Forecasted_Trials) AS forecasted_trials
  FROM {{ source('revenue', 'method_forecast') }}
  GROUP BY 1
)
SELECT
  c.period AS period,
  SAFE_DIVIDE(
    c.conversions,
    (COALESCE(t.prior_month_trials, 0) + COALESCE(f.forecasted_trials, 0)) / 2.0
  ) AS value
FROM conversions c
LEFT JOIN trials_lagged t USING (period)
LEFT JOIN forecast f USING (period)
ORDER BY 1
```

Note the 25-month window on trials, not 24. The oldest month in the output needs its M-1 trials, which sit one month before the window starts.

- [ ] **Step 3: Write the yml**

Create `models/metrics/v_metric__trial_conversion_rate_lagged.yml`:

```yaml
# Canonical metric definition for "Conversion Rate" (#357).

models:
  - name: v_metric__trial_conversion_rate_lagged
    description: |
      Trials-based conversion rate as shown on the Sales Scorecard —
      conversions in a month divided by the average of the prior month's
      trials and that month's forecasted trials. The one-month lag reflects
      that trials convert roughly a month after signup. Distinct from
      Trial-to-Conversion Rate (#302), which is same-month and runs higher.
      Emits a decimal rate, not a percentage.
    config:
      materialized: view
      meta:
        answers: "What share of the trial pool converted in each month, using the lagged denominator the Sales Scorecard reports on?"
        grain: "Period-level ratio. Account-grain numerator and denominator."
        filters:
          - rule: "conversions rolling 24 months; trials rolling 25 months"
            why: "the oldest output month needs its M-1 trials, which sit one month before the 24-month window"
          - rule: "int_trials excludes IsConversionException, Method Integration partners, and the 0001-01-01 sentinel"
            why: "inherited from the Trials metric (#54)"
        methodology_source: "Matches WEEKLY_CONVERSION_RATE_SQL in builder/src/config/scorecards/sales-scorecard.js, lifted to monthly grain. That SQL replicated the Looker Sales Scorecard panel."
        parity_verified:
          against: "PENDING — Task 10 records the live Looker side-by-side"
          values: "PENDING"
        caveats:
          - "The current month reads LOW by construction: partial numerator over a full-month denominator. Roughly 9.6% on the 22nd versus roughly 13% at month end. Use #321 for the month-end projection."
          - "NOT the same metric as Trial-to-Conversion Rate (#302), which is same-month and runs 15-20%. Two different questions, two different numbers."
          - "Denominator blends actual and forecast, so it moves when the forecast sheet is edited."
          - "Not comparable in LEVEL to the sync conversion rate, which has no lag."
        used_by:
          - "Sales Scorecard (Conversion Rate section)"
      labels:
        metric_id: '357'
        layer: metrics
        type: derived
        status: queued
        source_table: ''
        source_measure_safe: ''
        depends_on: '56-54'
```

- [ ] **Step 4: Build**

```bash
/Users/nicolas/.local/bin/dbt run --select v_metric__trial_conversion_rate_lagged
```

- [ ] **Step 5: Verify against the Step 1 Looker snapshot**

```bash
/Users/nicolas/.local/bin/dbt show --select v_metric__trial_conversion_rate_lagged --limit 6
```

Compare the last 4 closed months plus the current month against the values recorded in Step 1. Multiply the view's decimal by 100 to compare against Looker's percentages.

Expected: closed months match Looker within 0.1 percentage points. The current month may differ slightly if the read times differ — note the gap rather than dismissing it.

If a closed month is off by more than 0.5 points, stop and report. Do not adjust the formula to force a match without understanding why.

- [ ] **Step 6: Commit**

```bash
git add models/metrics/v_metric__trial_conversion_rate_lagged.sql \
        models/metrics/v_metric__trial_conversion_rate_lagged.yml
git commit -m "feat(metrics): lagged trials conversion rate, fixes empty metric 357"
```

---

### Task 7: Sync denominator reconciliation

The gate before any sync number goes leadership-facing.

Two documented biases point opposite ways. Syncs #55 is event-grain and its own yml records roughly 9–13% inflation from re-syncs — 91% of entities have exactly one sync event, 9% have two or more. Separately [models/_sources.yml:141](../../../models/_sources.yml) records that the region-based sync signal undercounts completed syncs and that `CustDatFirstSyncCompleted` is preferred.

Net effect is unmeasured. Leadership will read "conversion on Sync" as *the share of synced accounts that convert*, and an inflated denominator makes that read low.

This task does not have to change the metric. It has to quantify the gap so the caveat is specific instead of hand-waved.

Per the repo convention in CLAUDE.md, data investigations are Python scripts, not ad-hoc MCP calls.

**Files:**
- Create: `scripts/reconcile_sync_denominators.py`

**Interfaces:**
- Consumes: BigQuery via the same auth path as the other `scripts/parity_*.py` files. Read one of them first to copy the client setup.
- Produces: a printed 12-month table and a one-paragraph summary that gets pasted into the Task 10 caveats.

- [ ] **Step 1: Read an existing parity script to copy the BQ client setup**

```bash
sed -n 1,40p scripts/parity_int_customer_survival.py
```

Reuse whatever client construction and auth it uses. Do not invent a new pattern.

- [ ] **Step 2: Write the script**

Create `scripts/reconcile_sync_denominators.py`:

```python
#!/usr/bin/env python3
"""
Reconcile the three candidate sync denominators over 12 months.

Why this exists: the sync conversion rate's denominator is Syncs #55,
which is event-grain. Its own yml records ~9-13% inflation from re-syncs.
Separately models/_sources.yml:141 records that the region-based sync
signal UNDERCOUNTS completed syncs, and that CustDatFirstSyncCompleted is
the preferred completion field. Two biases, opposite directions, net
effect never measured.

Leadership reads "conversion on Sync" as the share of synced accounts that
convert. An inflated denominator makes that read low. This quantifies by
how much.

Output feeds the caveats block on the sync conversion rate metrics.
"""
import sys

# Copy the client construction from scripts/parity_int_customer_survival.py
# rather than inventing a new one.
from google.cloud import bigquery  # noqa: E402

PROJECT = "project-for-method-dw"

SQL = """
WITH months AS (
  SELECT DATE_TRUNC(m, MONTH) AS period
  FROM UNNEST(GENERATE_DATE_ARRAY(
    DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 12 MONTH),
    DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH),
    INTERVAL 1 MONTH)) AS m
),
-- 1. Event-grain: what Syncs #55 counts today.
events AS (
  SELECT DATE_TRUNC(SyncDate, MONTH) AS period, COUNT(*) AS sync_events
  FROM `project-for-method-dw.revenue.int_syncs`
  GROUP BY 1
),
-- 2. Entity-grain: distinct entities that logged a sync that month.
entities AS (
  SELECT DATE_TRUNC(SyncDate, MONTH) AS period,
         COUNT(DISTINCT EntityRecordID) AS sync_entities
  FROM `project-for-method-dw.revenue.int_syncs`
  GROUP BY 1
),
-- 3. Account.CustDatFirstSyncCompleted: the field _sources.yml prefers.
--    Dedup first. revenue.Account averages ~1.22 rows per EntityRecordID
--    and joining without deduping fans counts out.
account_first_sync AS (
  SELECT DATE_TRUNC(first_sync, MONTH) AS period,
         COUNT(*) AS accounts_first_synced
  FROM (
    SELECT RecordID,
           MIN(NULLIF(CustDatFirstSyncCompleted, DATE '0001-01-01')) AS first_sync
    FROM `project-for-method-dw.revenue.Account`
    WHERE IsConversionException = FALSE
      AND Partner != 'Method Integration'
    GROUP BY RecordID
  )
  WHERE first_sync IS NOT NULL
  GROUP BY 1
),
conversions AS (
  SELECT DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS period,
         COUNT(*) AS conversions
  FROM `project-for-method-dw.revenue.int_conversions`
  GROUP BY 1
)
SELECT
  m.period,
  COALESCE(ev.sync_events, 0)            AS sync_events,
  COALESCE(en.sync_entities, 0)          AS sync_entities,
  COALESCE(af.accounts_first_synced, 0)  AS accounts_first_synced,
  COALESCE(cv.conversions, 0)            AS conversions,
  SAFE_DIVIDE(cv.conversions, ev.sync_events)           AS rate_on_events,
  SAFE_DIVIDE(cv.conversions, en.sync_entities)         AS rate_on_entities,
  SAFE_DIVIDE(cv.conversions, af.accounts_first_synced) AS rate_on_account_field
FROM months m
LEFT JOIN events ev              USING (period)
LEFT JOIN entities en            USING (period)
LEFT JOIN account_first_sync af  USING (period)
LEFT JOIN conversions cv         USING (period)
ORDER BY m.period
"""


def main():
    client = bigquery.Client(project=PROJECT)
    rows = list(client.query(SQL).result())
    if not rows:
        sys.exit("no rows returned — check the date window")

    hdr = (f"{'period':<12}{'events':>9}{'entities':>10}{'acct_field':>12}"
           f"{'convs':>8}{'r_event':>9}{'r_entity':>10}{'r_acct':>9}")
    print(hdr)
    print("-" * len(hdr))
    for r in rows:
        print(f"{r.period.isoformat():<12}{r.sync_events:>9}{r.sync_entities:>10}"
              f"{r.accounts_first_synced:>12}{r.conversions:>8}"
              f"{(r.rate_on_events or 0):>9.4f}{(r.rate_on_entities or 0):>10.4f}"
              f"{(r.rate_on_account_field or 0):>9.4f}")

    tot_ev = sum(r.sync_events for r in rows)
    tot_en = sum(r.sync_entities for r in rows)
    tot_af = sum(r.accounts_first_synced for r in rows)
    tot_cv = sum(r.conversions for r in rows)

    print("\n=== 12-month totals ===")
    print(f"  sync events (what #55 counts):      {tot_ev:,}")
    print(f"  distinct entities that synced:      {tot_en:,}")
    print(f"  accounts w/ CustDatFirstSyncCompleted: {tot_af:,}")
    print(f"  conversions:                        {tot_cv:,}")

    print("\n=== implied rates ===")
    print(f"  on event-grain syncs:   {tot_cv / tot_ev:.4f}" if tot_ev else "  on event-grain: n/a")
    print(f"  on entity-grain syncs:  {tot_cv / tot_en:.4f}" if tot_en else "  on entity-grain: n/a")
    print(f"  on Account first-sync:  {tot_cv / tot_af:.4f}" if tot_af else "  on Account field: n/a")

    if tot_ev and tot_en:
        print(f"\n  event-vs-entity inflation: {(tot_ev / tot_en - 1) * 100:.1f}%")
    if tot_en and tot_af:
        print(f"  entity-vs-Account-field gap: {(tot_af / tot_en - 1) * 100:+.1f}%")

    print("\nPaste the two gap percentages into the caveats block on")
    print("v_metric__sync_to_conversion_rate and the new sync rate models.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run it**

```bash
python3 scripts/reconcile_sync_denominators.py
```

Expected: a 12-row table plus totals. The event-vs-entity inflation should land near the 9–13% the #55 yml documents. If it does not, that itself is the finding — report it.

- [ ] **Step 4: Record the finding in the spec**

Add a short subsection to `docs/superpowers/specs/2026-07-30-sync-conversion-design.md` under "Denominator reconciliation gate", stating the three 12-month totals, the two gap percentages, and one sentence on whether the gap changes the recommendation.

- [ ] **Step 5: Commit**

```bash
git add scripts/reconcile_sync_denominators.py \
        docs/superpowers/specs/2026-07-30-sync-conversion-design.md
git commit -m "chore(metrics): reconcile the three sync denominator definitions"
```

---

### Task 8: Register Supabase metrics and repoint 295/296/357

The scorecard resolves KPIs by Supabase metric id. Each new dbt view needs a Supabase row whose `chart_sql` selects from it — a pointer, not a copy of the formula.

Six rows get created: four pointers at dbt views, plus two formula metrics for the Forecast vs. Trajectory and Forecasted Attainment KPIs. Those two get their own ids rather than reusing the trajectory id with a `formulaOverride` — three KPIs sharing one `metricId` breaks the MetricInspector drill-down and duplicates React keys.

Three existing metrics get repointed at their new dbt views: 295, 296, 357. Their formulas move out of `chart_sql` and into dbt, which shrinks the ticket-5 debt rather than growing it.

**Files:**
- Create: `scripts/register_sync_conversion_metrics.py`
- Modify: four `models/metrics/*.yml` files — fill in `metric_id` labels once ids are assigned. The three repointed metrics already carry their ids (295, 296, 357).

**Interfaces:**
- Consumes: the seven built views from Tasks 1–6.
- Produces: six printed metric ids. Task 9 hardcodes them into the scorecard config, so the printed output is the handoff.

- [ ] **Step 1: Read the existing registration script for the exact pattern**

```bash
sed -n 1,50p scripts/register_channel_arr_metrics.py
```

Copy the auth setup verbatim: the anon key is regexed out of `tracker.html`, writes go through the `x-method-email` header for RLS, and the script aborts on the first write error so a rejected auth leaves no partial state.

- [ ] **Step 2: Snapshot the three metrics being repointed**

```bash
python3 - <<'EOF'
import json, re, urllib.request
ANON = re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", open("tracker.html").read()).group(0)
H = {"apikey": ANON, "Authorization": f"Bearer {ANON}"}
url = "https://agkubdpgnpwudzpzcvhs.supabase.co/rest/v1/metrics?id=in.(295,296,357)&select=id,name,status,chart_sql,semantic_table,view_name,formula,depends_on"
r = urllib.request.Request(url, headers=H)
print(json.dumps(json.load(urllib.request.urlopen(r)), indent=2))
EOF
```

Save this output to a file. It is the rollback record — if the repoint goes wrong, this is what restores the prior state.

- [ ] **Step 3: Write the registration script**

Create `scripts/register_sync_conversion_metrics.py`:

```python
#!/usr/bin/env python3
"""
Register the sync conversion rate metric family in Supabase, and repoint
295/296/357 at their new dbt views.

Every new metric is a POINTER: chart_sql selects (period, value) from a
revenue_metrics.v_metric__* view built by dbt. No formula is duplicated
here — dbt owns the definitions.

New metrics land status='queued'. Nothing goes live without Nic's
approval and a docs/metric-definitions.md entry.

Idempotent: skips any metric whose exact name already exists. Aborts on
the first write error so a rejected auth leaves no partial state.
"""
import json
import re
import sys
import urllib.request

ADMIN_EMAIL = "n.peralta-baron@method.me"
SB = "https://agkubdpgnpwudzpzcvhs.supabase.co/rest/v1/metrics"
DS = "project-for-method-dw.revenue_metrics"

with open("tracker.html") as f:
    ANON = re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", f.read()).group(0)

H = {
    "apikey": ANON, "Authorization": f"Bearer {ANON}",
    "x-method-email": ADMIN_EMAIL, "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def req(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, headers=H, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read() or "[]")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def pointer_sql(view):
    """chart_sql that reads a dbt metric view as (period, value) pairs."""
    return (f"SELECT FORMAT_DATE('%Y-%m-%d', period) AS period, value "
            f"FROM `{DS}.{view}` ORDER BY 1")


_, existing = req("GET", f"{SB}?select=id,name,status")
if not isinstance(existing, list):
    sys.exit(f"ABORT reading metrics: {existing}")
by_name = {m["name"]: m for m in existing}

# POINTER metrics: chart_sql reads a dbt view. No formula duplicated here.
POINTERS = [
    ("Sync Conversion Rate Trajectory",
     "v_metric__sync_conversion_rate_trajectory",
     "Month-end projection of the sync conversion rate: projected conversions / projected sync events. Same-month, no lag. Decimal rate. Single row, current month."),
    ("Budgeted Sync Conversion Rate",
     "v_metric__sync_conversion_rate_budgeted",
     "Budgeted conversions / budgeted sync events by month. DERIVED, not published by Finance — pending Justin's confirmation. Decimal rate."),
    ("Forecasted Sync Conversion Rate",
     "v_metric__sync_conversion_rate_forecasted",
     "Forecasted conversions / forecasted sync events by month. DERIVED, not published by Finance — pending Justin's confirmation. Decimal rate."),
    ("Sync Conversion Rate (weekly)",
     "v_metric__sync_conversion_rate_weekly",
     "Conversions / sync events by ISO week (Monday start), no lag. Decimal rate. Noisy by nature."),
]

maxid = max((m["id"] for m in existing if isinstance(m.get("id"), int)), default=0)
next_id = maxid + 1
print(f"max existing id={maxid}; assigning explicit ids from {next_id}")

ids = {}
for name, view, desc in POINTERS:
    if name in by_name:
        ids[name] = by_name[name]["id"]
        print(f"  skip (exists #{ids[name]}): {name}")
        continue
    row = {
        "id": next_id, "name": name, "description": desc,
        "chart_sql": pointer_sql(view), "view_name": view,
        "status": "queued", "stage": "revenue", "depends_on": [],
    }
    st, res = req("POST", SB, row)
    if st not in (200, 201) or not isinstance(res, list):
        sys.exit(f"ABORT pointer '{name}': HTTP {st} {res}")
    ids[name] = res[0]["id"]
    next_id = ids[name] + 1
    print(f"  created #{ids[name]}: {name}")

# FORMULA metrics for the two derived KPIs. These get their own ids rather
# than reusing the trajectory id with a formulaOverride — three KPIs sharing
# one metricId breaks the MetricInspector drill-down and React keys.
#
# Both inputs are decimal rates, so multiply by 100 once for display. This
# differs from the trials section's 322/323, where 321 is already a
# percentage and 319 is a decimal — hence their messier scaling.
traj = ids["Sync Conversion Rate Trajectory"]
fcst = ids["Forecasted Sync Conversion Rate"]

FORMULAS = [
    ("Sync Forecast vs. Trajectory",
     f"({{{traj}}} - {{{fcst}}}) * 100",
     [traj, fcst],
     "Gap between the projected sync conversion rate and the forecast, in percentage points. Positive means pacing ahead of forecast."),
    ("Sync Forecasted Attainment",
     f"SAFE_DIVIDE({{{traj}}}, {{{fcst}}}) * 100",
     [traj, fcst],
     "Projected sync conversion rate as a percentage of the forecast. 100% means exactly on forecast."),
]

for name, formula, deps, desc in FORMULAS:
    if name in by_name:
        ids[name] = by_name[name]["id"]
        print(f"  skip (exists #{ids[name]}): {name}")
        continue
    row = {"id": next_id, "name": name, "formula": formula, "depends_on": deps,
           "description": desc, "status": "queued", "stage": "revenue"}
    st, res = req("POST", SB, row)
    if st not in (200, 201) or not isinstance(res, list):
        sys.exit(f"ABORT formula '{name}': HTTP {st} {res}")
    ids[name] = res[0]["id"]
    next_id = ids[name] + 1
    print(f"  created #{ids[name]}: {name}")

# Repoint the three existing metrics whose formulas now live in dbt.
REPOINT = {
    295: "v_metric__syncs_trajectory",
    296: "v_metric__conversions_trajectory",
    357: "v_metric__trial_conversion_rate_lagged",
}

print("\n=== repointing existing metrics at dbt views ===")
for mid, view in REPOINT.items():
    body = {"chart_sql": pointer_sql(view), "view_name": view}
    st, res = req("PATCH", f"{SB}?id=eq.{mid}", body)
    if st not in (200, 204) or (isinstance(res, list) and not res):
        sys.exit(f"ABORT repoint #{mid}: HTTP {st} {res}")
    print(f"  #{mid} -> {view}")

print("\n=== new metric IDs — hardcode these into sales-scorecard.js ===")
for name in [p[0] for p in POINTERS] + [f[0] for f in FORMULAS]:
    print(f"  {ids[name]:>4}  {name}")
print("\nAlso write each pointer id into the metric_id label in its")
print("models/metrics/*.yml. The two formula metrics have no dbt model —")
print("they are pure Supabase derivations over the pointer metrics.")
```

- [ ] **Step 4: Run it**

```bash
python3 scripts/register_sync_conversion_metrics.py
```

Expected: six `created #NNN` lines (four pointers, then two formula metrics) and three `#NNN -> view` repoint lines. Write down all six ids — Task 9 needs them.

- [ ] **Step 5: Verify the repointed metrics return data**

```bash
python3 - <<'EOF'
import json, re, urllib.request
ANON = re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", open("tracker.html").read()).group(0)
H = {"apikey": ANON, "Authorization": f"Bearer {ANON}"}
url = "https://agkubdpgnpwudzpzcvhs.supabase.co/rest/v1/metrics?id=in.(295,296,357)&select=id,name,chart_sql,view_name"
r = urllib.request.Request(url, headers=H)
for m in json.load(urllib.request.urlopen(r)):
    print(f"#{m['id']} {m['name']}\n  view_name={m['view_name']}\n  {m['chart_sql']}\n")
EOF
```

Expected: all three now carry a `chart_sql` pointing at `revenue_metrics.v_metric__*`. Diff against the Step 2 snapshot and confirm only `chart_sql` and `view_name` changed — name, status, and `depends_on` must be untouched.

- [ ] **Step 6: Fill in the metric_id labels**

For each of the four pointer metrics, open its `models/metrics/*.yml` and replace `metric_id: ''` with the id printed in Step 4. The two formula metrics have no dbt model — they are pure Supabase derivations over the pointers — so there is nothing to fill in for them.

- [ ] **Step 7: Rebuild so the labels land in BigQuery**

Rebuild only the four models whose labels changed. Do **not** run `--select "models/metrics/*"` — that issues `CREATE OR REPLACE VIEW` against all 20+ production metric views, and the Global Constraint requires a snapshot before touching any existing view.

```bash
/Users/nicolas/.local/bin/dbt run --select \
  v_metric__sync_conversion_rate_trajectory \
  v_metric__sync_conversion_rate_budgeted \
  v_metric__sync_conversion_rate_forecasted \
  v_metric__sync_conversion_rate_weekly
```

- [ ] **Step 8: Commit**

```bash
git add scripts/register_sync_conversion_metrics.py models/metrics/
git commit -m "feat(metrics): register sync conversion metrics, repoint 295/296/357 at dbt"
```

---

### Task 9: Sync Conversion Rate scorecard section

**Files:**
- Modify: `builder/src/config/scorecards/sales-scorecard.js`
- Create: `builder/tests/unit/salesScorecardSyncSection.test.js`

**Interfaces:**
- Consumes: the six metric ids printed by Task 8. Substitute them for the `NEW_*` placeholders below — do not leave a placeholder in committed code. The mapping is `NEW_TRAJECTORY` = Sync Conversion Rate Trajectory, `NEW_BUDGETED` = Budgeted Sync Conversion Rate, `NEW_FORECASTED` = Forecasted Sync Conversion Rate, `NEW_FCST_VS_TRAJ` = Sync Forecast vs. Trajectory, `NEW_ATTAINMENT` = Sync Forecasted Attainment. The weekly pointer metric is not referenced here — the chart reads its dbt view directly via `customSql`.
- Produces: a new section in the default-exported config's `sections` array, at index 1.

- [ ] **Step 1: Write the failing test**

Create `builder/tests/unit/salesScorecardSyncSection.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import salesScorecard from '../../src/config/scorecards/sales-scorecard.js';

const byTitle = (t) => salesScorecard.sections.find((s) => s.title === t);

describe('Sync Conversion Rate section', () => {
  it('sits directly after the trials Conversion Rate section', () => {
    const titles = salesScorecard.sections.map((s) => s.title);
    expect(titles[0]).toBe('Conversion Rate');
    expect(titles[1]).toBe('Sync Conversion Rate');
  });

  it('mirrors the trials section KPI count and label order', () => {
    const trials = byTitle('Conversion Rate');
    const sync = byTitle('Sync Conversion Rate');
    expect(sync.kpis).toHaveLength(trials.kpis.length);
    expect(sync.kpis.map((k) => k.label)).toEqual([
      'Conversion',
      'Conversion Trajectory',
      'Forecasted Sync Conversion Rate',
      'Sync Conversion Rate',
      'Sync Conversion Rate Trajectory',
      'Forecast vs. Trajectory',
      'Forecasted Attainment',
    ]);
  });

  it('has two charts using the same types and colors as the trials section', () => {
    const trials = byTitle('Conversion Rate');
    const sync = byTitle('Sync Conversion Rate');
    expect(sync.charts).toHaveLength(2);

    expect(sync.charts[0].chartType).toBe(trials.charts[0].chartType);
    expect(sync.charts[1].chartType).toBe(trials.charts[1].chartType);

    expect(sync.charts[0].metrics.map((m) => m.color))
      .toEqual(trials.charts[0].metrics.map((m) => m.color));
    expect(sync.charts[1].metrics.map((m) => m.color))
      .toEqual(trials.charts[1].metrics.map((m) => m.color));
  });

  it('injects nothing beyond the specified series', () => {
    const sync = byTitle('Sync Conversion Rate');
    expect(sync.charts[0].metrics).toHaveLength(3);
    expect(sync.charts[1].metrics).toHaveLength(3);
  });

  it('carries the level-comparability caveat in the rendered field', () => {
    const sync = byTitle('Sync Conversion Rate');
    // ScorecardSection.jsx renders section.description. A `note` field
    // would silently render nothing.
    expect(sync.description).toMatch(/not comparable in level/i);
  });

  it('gives every KPI its own metric id', () => {
    const sync = byTitle('Sync Conversion Rate');
    const ids = sync.kpis.map((k) => k.metricId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses no placeholder metric ids', () => {
    const sync = byTitle('Sync Conversion Rate');
    const ids = [
      ...sync.kpis.map((k) => k.metricId),
      ...sync.charts.flatMap((c) => c.metrics.map((m) => m.id)),
    ];
    for (const id of ids) {
      expect(String(id)).not.toMatch(/NEW_/);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd builder && npm run test:unit -- salesScorecardSyncSection
```

Expected: FAIL — `titles[1]` is `'New Net SaaS'`, not `'Sync Conversion Rate'`.

- [ ] **Step 3: Add the section to the config**

In `builder/src/config/scorecards/sales-scorecard.js`, insert this immediately after the closing brace of the `Conversion Rate` section object (currently ends at line 176) and before the `// ── 2. New Net SaaS` comment.

Replace each `NEW_*` with the matching id printed by Task 8.

```javascript
    // ── 1b. Sync Conversion Rate ─────────────────────────────
    // Leadership ask via Nelson (2026-07-30): report conversion on Sync
    // alongside conversion on Trials. The trials section above is
    // preserved unchanged.
    //
    // Same-month, no lag — unlike the trials rate, which divides by
    // (prior-month trials + forecasted trials) / 2. Both sides of this
    // ratio are partial for the current month, so it stays stable
    // through the month where the trials panel drifts upward.
    {
      title: 'Sync Conversion Rate',
      layout: 'scorecard-row',
      // `description` is the field ScorecardSection.jsx renders (line 63).
      // There is no `note` prop — using one renders nothing.
      description: 'Conversions ÷ sync events, same month, no lag. Not comparable in level to the trials Conversion Rate above, which uses a lagged denominator — compare trend and attainment, not level.',
      kpis: [
        { metricId: 56, label: 'Conversion', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 296, label: 'Conversion Trajectory', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: NEW_FORECASTED, label: 'Forecasted Sync Conversion Rate', format: 'decimal_rate',
          valueSelector: 'current_or_latest' },
        { metricId: 301, label: 'Sync Conversion Rate', format: 'decimal_rate',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: NEW_TRAJECTORY, label: 'Sync Conversion Rate Trajectory', format: 'decimal_rate',
          valueSelector: 'current_or_latest' },
        // These two are real Supabase formula metrics registered in Task 8,
        // not formulaOverride hacks. Both inputs are decimal rates, so the
        // formula scales once by 100 — unlike the trials section's 322/323,
        // which need overrides because 321 is a percentage and 319 a decimal.
        { metricId: NEW_FCST_VS_TRAJ, label: 'Forecast vs. Trajectory', format: 'percent',
          valueSelector: 'current_or_latest' },
        { metricId: NEW_ATTAINMENT, label: 'Forecasted Attainment', format: 'percent',
          valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Sync Conversion Rate Week Over Week',
          chartType: 'line', valueFormat: 'percent',
          metrics: [
            { id: '__wk_budget_syncconvrate', label: 'Budgeted Sync Conversion Rate', color: '#a3c771', customSql: WEEKLY_BUDGET_SYNC_CONV_RATE_SQL },
            { id: '__wk_forecast_syncconvrate', label: 'Forecasted Sync Conversion Rate', color: '#e84393', customSql: WEEKLY_FORECAST_SYNC_CONV_RATE_SQL },
            { id: '__weekly_sync_conv_rate', label: 'Sync Conversion Rate', color: '#2563eb', customSql: WEEKLY_SYNC_CONVERSION_RATE_SQL },
          ],
          lastNMonths: 2, showLabels: true,
        },
        {
          label: 'Sync Conversion Rate Month Over Month',
          chartType: 'bar', valueFormat: 'decimal_rate',
          metrics: [
            { id: NEW_BUDGETED, label: 'Budgeted Sync Conversion Rate', color: '#1e3a5f' },
            { id: NEW_FORECASTED, label: 'Forecasted Sync Conversion Rate', color: '#2563eb' },
            { id: 301, label: 'Sync Conversion Rate', color: '#9dc3e6' },
          ],
          lastNMonths: 4, showLabels: true,
        },
      ],
    },
```

No `formulaOverride` appears in this section. The two derived KPIs are real Supabase formula metrics from Task 8, so their formulas live in the registry where the MetricInspector can resolve them.

- [ ] **Step 4: Add the three weekly SQL constants**

Insert these after `WEEKLY_CONVERSION_RATE_SQL` (which currently ends at line 51), in the Custom Weekly SQL Queries block.

These are thin pointers at dbt views, not new definitions. The weekly actual reads the dbt view directly. The budget and forecast lines come from `method_forecast`, aggregated to week the same way every other weekly forecast series on this page is.

```javascript
// Weekly sync conversion rate — reads the dbt view. Same-month, no lag.
// Multiplied by 100 because the chart's valueFormat is 'percent'.
const WEEKLY_SYNC_CONVERSION_RATE_SQL = `
SELECT FORMAT_DATE('%Y-%m-%d', period) AS period,
  ROUND(value * 100, 2) AS value
FROM \`project-for-method-dw.revenue_metrics.v_metric__sync_conversion_rate_weekly\`
WHERE period >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
ORDER BY 1
`;

// Weekly budgeted sync conversion rate. Sum the daily allocations within
// the week, THEN divide — same reason as the monthly model.
const WEEKLY_BUDGET_SYNC_CONV_RATE_SQL = `
SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(Date, WEEK(MONDAY))) AS period,
  ROUND(SAFE_DIVIDE(SUM(Budgeted_Conversion), SUM(Budgeted_Syncs)) * 100, 2) AS value
FROM \`project-for-method-dw.revenue.method_forecast\`
WHERE Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH) AND Date <= CURRENT_DATE()
GROUP BY 1 ORDER BY 1
`;

const WEEKLY_FORECAST_SYNC_CONV_RATE_SQL = `
SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(Date, WEEK(MONDAY))) AS period,
  ROUND(SAFE_DIVIDE(SUM(Forecasted_Conversion), SUM(Forecasted_Syncs)) * 100, 2) AS value
FROM \`project-for-method-dw.revenue.method_forecast\`
WHERE Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH) AND Date <= CURRENT_DATE()
GROUP BY 1 ORDER BY 1
`;
```

- [ ] **Step 5: Add int_syncs to the section's view registry**

The `VIEWS` constant at the top of the file (line 6) declares each view's date column. Add the sync view:

```javascript
const VIEWS = {
  int_conversions: { dateCol: 'FirstSaaSInvoiceTxnDate' },
  int_syncs: { dateCol: 'SyncDate' },
  v_new_net_saas: { dateCol: 'TxnDate' },
  v_new_dep_revenue: { dateCol: 'TxnDate' },
  int_cancellations: { dateCol: 'CancellationDate' },
  v_total_net_saas: { dateCol: 'TxnDate' },
  v_total_dep_revenue: { dateCol: 'TxnDate' },
};
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd builder && npm run test:unit -- salesScorecardSyncSection
```

Expected: PASS, 6 tests.

- [ ] **Step 7: Run lint and the full unit suite**

```bash
cd builder && npm run lint && npm run test:unit
```

Expected: no lint errors, no regressions. The `no-undef` rule catches any `NEW_*` placeholder left behind.

- [ ] **Step 8: Verify in the running app**

Start the dev server and confirm the section renders with real numbers, not empty tiles.

Check specifically: all 7 KPIs populate, both charts draw three series, and the trials section above still renders correctly — particularly the Conversion Rate KPI, which Task 6 just repointed.

- [ ] **Step 9: Commit**

```bash
git add builder/src/config/scorecards/sales-scorecard.js \
        builder/tests/unit/salesScorecardSyncSection.test.js
git commit -m "feat(sales-scorecard): add Sync Conversion Rate section"
```

---

### Task 10: Parity pass, definitions, and go-live

Nothing in Tasks 1–9 is leadership-facing yet. Every new metric is still `queued`. This task closes that out.

**Files:**
- Create: `scripts/parity_sync_conversion_vs_looker.py`
- Modify: `docs/metric-definitions.md` — one entry per new metric
- Modify: all seven `models/metrics/*.yml` — fill in `parity_verified`, flip `status`
- Modify: `TICKETS.md` — close tickets 1 and 2
- Modify: `builder/src/config/scorecards/sales-scorecard.js` — flip `status` off `'pending'`

**Interfaces:**
- Consumes: every view and metric from Tasks 1–9.
- Produces: a deployed Sales Scorecard with two conversion sections.

- [ ] **Step 1: Write the parity print script**

Create `scripts/parity_sync_conversion_vs_looker.py`. It prints both sections' KPIs in one table so they can be read against Looker without switching windows. Copy the BQ client setup from `scripts/reconcile_sync_denominators.py`.

```python
#!/usr/bin/env python3
"""
Print every KPI in both Sales Scorecard conversion sections, for manual
side-by-side against the live Looker Sales Scorecard.

Output is the parity record. Paste it into the parity_verified block of
each models/metrics/*.yml and into docs/metric-definitions.md.
"""
from google.cloud import bigquery

PROJECT = "project-for-method-dw"
M = f"{PROJECT}.revenue_metrics"

SQL = f"""
SELECT 'trials: Conversion'                    AS kpi, CAST(value AS STRING) AS value FROM `{M}.v_metric__conversions`                        WHERE period = DATE_TRUNC(CURRENT_DATE(), MONTH)
UNION ALL SELECT 'trials: Conversion Trajectory',      CAST(ROUND(value, 2) AS STRING) FROM `{M}.v_metric__conversions_trajectory`
UNION ALL SELECT 'trials: Conversion Rate',            CAST(ROUND(value * 100, 2) AS STRING) FROM `{M}.v_metric__trial_conversion_rate_lagged` WHERE period = DATE_TRUNC(CURRENT_DATE(), MONTH)
UNION ALL SELECT 'sync: Syncs Trajectory',             CAST(ROUND(value, 2) AS STRING) FROM `{M}.v_metric__syncs_trajectory`
UNION ALL SELECT 'sync: Sync Conversion Rate',         CAST(ROUND(value * 100, 2) AS STRING) FROM `{M}.v_metric__sync_to_conversion_rate`      WHERE period = DATE_TRUNC(CURRENT_DATE(), MONTH)
UNION ALL SELECT 'sync: Rate Trajectory',              CAST(ROUND(value * 100, 2) AS STRING) FROM `{M}.v_metric__sync_conversion_rate_trajectory`
UNION ALL SELECT 'sync: Budgeted Rate',                CAST(ROUND(value * 100, 2) AS STRING) FROM `{M}.v_metric__sync_conversion_rate_budgeted`  WHERE period = DATE_TRUNC(CURRENT_DATE(), MONTH)
UNION ALL SELECT 'sync: Forecasted Rate',              CAST(ROUND(value * 100, 2) AS STRING) FROM `{M}.v_metric__sync_conversion_rate_forecasted` WHERE period = DATE_TRUNC(CURRENT_DATE(), MONTH)
"""


def main():
    client = bigquery.Client(project=PROJECT)
    print(f"{'KPI':<40}{'ours':>12}   looker (fill in by hand)")
    print("-" * 78)
    for r in client.query(SQL).result():
        print(f"{r.kpi:<40}{r.value:>12}   ______")
    print("\nRead the live Looker Sales Scorecard and fill in the right column.")
    print("Record the read timestamp — mid-month values move hour to hour.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it and do the Looker comparison**

```bash
python3 scripts/parity_sync_conversion_vs_looker.py
```

Open the live Looker Sales Scorecard. Fill in the right column by hand. Record the timestamp of the read.

The trials-side rows must match Looker. The sync-side rows have no Looker counterpart yet — Nelson's section does not exist there — so they are recorded as first-observation values, not matches.

- [ ] **Step 3: Confirm the 296 divisor against Looker**

This is the one open question from the spec. The `day_of_month` divisor was derived from a single screenshot, where `51 ÷ 22 × 31 = 71.86` exactly.

Compare our Conversion Trajectory against Looker's from Step 2. If they match, the derivation holds and the `parity_verified` block records it. If they do not, do not adjust the model to force a match — report the actual numbers and stop, because the whole trajectory family depends on getting this right.

- [ ] **Step 4: Fill in every parity_verified block**

For each of the seven `models/metrics/*.yml`, replace both `PENDING` lines:

```yaml
        parity_verified:
          against: "Live Looker Sales Scorecard, read <TIMESTAMP>"
          values: "<what matched, or 'first observation, no Looker counterpart'>"
```

- [ ] **Step 5: Write the metric-definitions.md entries**

Read the template at the top of `docs/metric-definitions.md` and follow it exactly. One entry per new metric, with all non-negotiable fields: what it answers in one sentence, grain, filters and exclusions with why, methodology source, parity-verified against, known caveats.

Two caveats must appear verbatim in every sync-family entry:

1. The denominator is event-grain syncs, inflated by the percentage measured in Task 7. The metric reads low versus a true "share of synced accounts that converted."
2. The sync rate and the trials rate are not comparable in level. Trend and attainment compare; level does not.

- [ ] **Step 6: Get Justin's confirmation on the derived budget ratio**

The budgeted and forecasted sync conversion rates are `Budgeted_Conversion ÷ Budgeted_Syncs`. Justin never published that ratio and he owns revenue methodology.

Send him the Step 2 output with the two derived rows highlighted and ask whether the derivation is what he would sign off on. Do not flip these two metrics live before he answers.

- [ ] **Step 7: Get Nic's approval, then flip statuses**

Show Nic the Step 2 parity table, the Task 7 reconciliation output, and Justin's answer.

On approval, change `status: queued` to `status: live` in all seven `models/metrics/*.yml`, add `verified_at` with the parity date, then rebuild only this plan's models plus their tests:

```bash
/Users/nicolas/.local/bin/dbt build --select \
  v_metric__conversions_trajectory \
  v_metric__syncs_trajectory \
  v_metric__sync_conversion_rate_trajectory \
  v_metric__sync_conversion_rate_budgeted \
  v_metric__sync_conversion_rate_forecasted \
  v_metric__sync_conversion_rate_weekly \
  v_metric__trial_conversion_rate_lagged \
  assert_trajectory_invariants \
  assert_sync_conversion_rate_sane
```

Expected: all seven models build, both tests pass.

Do not widen this to `--select "models/metrics/*"`. That would `CREATE OR REPLACE` every production metric view without the snapshot the Global Constraints require.

Also flip the Supabase rows:

```bash
python3 - <<'EOF'
import json, re, sys, urllib.request
IDS = []  # all six ids from Task 8 — fill in before running
ANON = re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", open("tracker.html").read()).group(0)
H = {"apikey": ANON, "Authorization": f"Bearer {ANON}",
     "x-method-email": "n.peralta-baron@method.me",
     "Content-Type": "application/json", "Prefer": "return=representation"}
if not IDS:
    sys.exit("fill in IDS first")
for mid in IDS:
    r = urllib.request.Request(
        f"https://agkubdpgnpwudzpzcvhs.supabase.co/rest/v1/metrics?id=eq.{mid}",
        data=json.dumps({"status": "live"}).encode(), headers=H, method="PATCH")
    print(mid, urllib.request.urlopen(r).status)
EOF
```

- [ ] **Step 8: Flip the scorecard off pending and close the tickets**

In `builder/src/config/scorecards/sales-scorecard.js`, change `status: 'pending'` (line 126) to `status: 'beta'`.

In `TICKETS.md`, close the two resolved tickets. For ticket 1, record the correction explicitly: the fix was `day_of_month`, not the `day_of_month + 1` the ticket proposed. Leave the churn BOM, conversions budget, and semantic-layer migration tickets open.

- [ ] **Step 9: Build and deploy**

```bash
cd builder && npm run build
```

Stage explicitly. Do **not** use `git add -A` — the working tree carries unrelated in-progress net-saas work (`builder/src/lib/netSaasSql.js`, `net-saas-scorecard.js`, and others) that must not be swept into this commit.

```bash
git add models/metrics tests docs/metric-definitions.md TICKETS.md \
        builder/src/config/scorecards/sales-scorecard.js builder/dist
git commit -m "feat(sales-scorecard): sync conversion section live, scorecard to beta"
git push
```

Before pushing, run `git show --stat HEAD` and confirm no `netSaas*` file appears.

GitHub Pages auto-deploys on push to `main`. Do not run `vercel --prod`.

- [ ] **Step 10: Verify the deployment is live**

Open `https://nickperaltab.github.io/method-metrics/` and confirm both conversion sections render with real numbers on the deployed page, not just locally. Per CLAUDE.md, do not report success until the deployment is verified live.

- [ ] **Step 11: Reply to Nelson**

Tell him what shipped, where to find it, and the two caveats from Step 5 in plain language. He is going to be asked why the sync number is roughly 25% while the trials number is roughly 10%, and he needs the answer before someone else asks it.
