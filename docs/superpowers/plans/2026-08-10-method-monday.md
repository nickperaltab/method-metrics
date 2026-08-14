# Method Monday Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Method Monday scorecard — eight metric groups on a complete-days trajectory convention — and unify the Sales Scorecard onto the same convention.

**Architecture:** One wide dbt intermediate (`int_method_monday`) carries every quantity for the current month so the elapsed-days arithmetic exists in exactly one place. Thin `v_metric__*` views select one column each. Forecast-vs-trajectory and attainment tiles are Supabase formula metrics. The page is three `scorecard-row` sections — no new shared rendering code.

**Tech Stack:** dbt-bigquery, BigQuery, Supabase REST, React/Vite, vitest, Python 3 stdlib.

**Spec:** [docs/superpowers/specs/2026-08-10-method-monday-design.md](../specs/2026-08-10-method-monday-design.md)

## Global Constraints

- **Trajectory convention:** `MTD through yesterday ÷ (day_of_month − 1) × days_in_month`. Verified four times against Looker on 2026-08-10.
- **Any actual beside a trajectory excludes today.** Same window on both sides, always.
- **Do NOT redefine the primitives.** Trials #54, Syncs #55, Conversions #56, Churn #59 stay as month totals. They feed Marketing, the AI chart builder and 19 dbt consumers.
- **On the 1st of the month `day_of_month − 1` is zero.** Every trajectory must return `NULL`, never an error and never zero. This is the single most likely defect in this plan.
- **Attainment is called attainment.** Looker mislabels two tiles "Forecast vs Trajectory" while computing trajectory ÷ forecast. Keep both quantities, name each correctly.
- Metric models land in `revenue_metrics` via the existing `+schema: metrics` config. Never add a per-model schema override.
- **Every new model starts `status: queued`**, `parity_verified` values contain `PENDING`, and nothing flips to `live` without Nic's approval plus a `docs/metric-definitions.md` entry.
- dbt binary is `/Users/nicolas/.local/bin/dbt`. There is no `timeout` command on this machine.
- Rebuild only the models you touch. Never `--select "models/metrics/*"`.
- Deploy is GitHub Pages via CI. Never commit `builder/dist` — `.github/workflows/static.yml` builds it with `VITE_BASE=/method-metrics/builder/`, so a local bundle ships wrong asset paths.
- Stage explicitly. Never `git add -A`.

## Reusable metrics — identify, do not duplicate

These already exist and back Method Monday tiles. Confirm each value before wiring it.

| Metric | Tile | Value 2026-08-10 |
|---|---|---|
| #285 Trials Forecast | Trials Forecast | 620 |
| #286 Syncs Forecast | Syncs Forecast | 391 |
| #274 Forecasted Churn | Churn Forecast (full month) | 99 |
| #319 Forecasted Conversion Rate | Conversion Rate Forecast | 17.97% → 18.0% |
| #361 Forecasted Sync Rate | Sync % Forecast | `SAFE_DIVIDE({286},{285})*100` = 63.1% |
| #402 Forecasted Sync Conversion Rate | Forecasted Sync Conv Rate | 27.11% |

**#300 Sync Rate is NOT reusable** for the Sync % Actual tile — it is `SAFE_DIVIDE({55},{54})*100`, a month total. The tile needs the MTD-through-yesterday figure, 48.5%.

**Forecasted Conversion as a count (106) has no confirmed metric.** Task 5 must search for one before creating it.

## File Structure

| File | Responsibility |
|---|---|
| `models/intermediate/int_method_monday.sql` / `_int_method_monday.yml` | One current-month row with every quantity. The only place elapsed-days arithmetic lives. |
| `models/metrics/v_metric__{trials,syncs,conversions,churn}_mtd.sql` / `.yml` | MTD through yesterday, one per primitive |
| `models/metrics/v_metric__{trials,churn}_trajectory.sql` / `.yml` | New trajectory siblings |
| `models/metrics/v_metric__{conversions,syncs}_trajectory.sql` | **Modify** — convention flip |
| `models/metrics/v_metric__{conversions,churn}_forecast_mtd.sql` / `.yml` | Forecast prorated to the elapsed window |
| `models/metrics/v_metric__sync_rate_mtd.sql` / `.yml` | Syncs ÷ trials, both MTD |
| `tests/assert_method_monday_invariants.sql` | Row count, current month, NULL-on-day-1, trajectory ≥ actual |
| `scripts/register_method_monday_metrics.py` | Supabase pointers + formula metrics |
| `builder/src/config/scorecards/method-monday-scorecard.js` | The page |
| `builder/src/config/scorecards/index.js` | Register it |
| `builder/src/config/scorecards/sales-scorecard.js` | **Modify** — repoint Conversions tile, note the convention change |
| `builder/tests/unit/methodMondayScorecard.test.js` | Config shape |

Tasks 2, 4 depend on 1. Task 3 depends on 1. Tasks 5–8 are sequential after that.

---

### Task 1: The `int_method_monday` intermediate

Everything else reads this. If it is wrong, everything is wrong together — which is the point, but it means this task carries the tests.

**Files:**
- Create: `models/intermediate/int_method_monday.sql`
- Create: `models/intermediate/_int_method_monday.yml`
- Create: `tests/assert_method_monday_invariants.sql`

**Interfaces:**
- Consumes: `ref('int_trials')` (`SignupDate`), `ref('int_syncs')` (`SyncDate`), `source('revenue','int_conversions')` (`FirstSaaSInvoiceTxnDate`), `source('revenue','int_cancellations')` (`CancellationDate`), `source('revenue','method_forecast')`.
- Produces: view `revenue.int_method_monday`, exactly one row. Columns: `period DATE`, `elapsed_days INT64`, `days_in_month INT64`, `{trials,syncs,conversions,churn}_mtd INT64`, `{trials,syncs,conversions,churn}_forecast FLOAT64`, `{trials,syncs,conversions,churn}_trajectory FLOAT64`, `{conversions,churn}_forecast_mtd FLOAT64`. Every later task selects from this.

- [ ] **Step 1: Snapshot the expected values**

```bash
/Users/nicolas/.local/bin/dbt show --inline "
SELECT EXTRACT(DAY FROM CURRENT_DATE())-1 elapsed,
       EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE(),MONTH)) dim"
```

Record both. On 2026-08-10 they were 9 and 31. Every target below assumes those; recompute if you run on a different day.

- [ ] **Step 2: Write the failing invariants test**

Create `tests/assert_method_monday_invariants.sql`. A dbt singular test passes when it returns zero rows.

```sql
-- Invariants for int_method_monday.
--   1. exactly one row
--   2. keyed to the current month
--   3. elapsed_days is 0 only on the 1st, and then every trajectory is NULL
--   4. a trajectory is never below its own MTD actual (it scales up)
-- Returns offending rows; empty result = pass.

WITH m AS (SELECT * FROM {{ ref('int_method_monday') }}),
n AS (SELECT COUNT(*) AS c FROM m)

SELECT 'not_exactly_one_row' AS violation, CAST(c AS STRING) AS detail FROM n WHERE c != 1

UNION ALL
SELECT 'wrong_period', CAST(period AS STRING) FROM m
WHERE period != DATE_TRUNC(CURRENT_DATE(), MONTH)

UNION ALL
SELECT 'elapsed_days_mismatch', CAST(elapsed_days AS STRING) FROM m
WHERE elapsed_days != EXTRACT(DAY FROM CURRENT_DATE()) - 1

UNION ALL
-- On the 1st there are no complete days, so a projection is undefined.
SELECT 'day_one_trajectory_not_null', CAST(trials_trajectory AS STRING) FROM m
WHERE elapsed_days = 0
  AND (trials_trajectory IS NOT NULL OR syncs_trajectory IS NOT NULL
    OR conversions_trajectory IS NOT NULL OR churn_trajectory IS NOT NULL)

UNION ALL
SELECT 'trajectory_below_actual', CONCAT('trials ', CAST(trials_trajectory AS STRING)) FROM m
WHERE elapsed_days > 0 AND trials_trajectory < trials_mtd

UNION ALL
SELECT 'trajectory_below_actual', CONCAT('syncs ', CAST(syncs_trajectory AS STRING)) FROM m
WHERE elapsed_days > 0 AND syncs_trajectory < syncs_mtd

UNION ALL
SELECT 'trajectory_below_actual', CONCAT('conversions ', CAST(conversions_trajectory AS STRING)) FROM m
WHERE elapsed_days > 0 AND conversions_trajectory < conversions_mtd

UNION ALL
SELECT 'trajectory_below_actual', CONCAT('churn ', CAST(churn_trajectory AS STRING)) FROM m
WHERE elapsed_days > 0 AND churn_trajectory < churn_mtd
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
/Users/nicolas/.local/bin/dbt test --select assert_method_monday_invariants
```

Expected: FAIL — `Compilation Error`, model `int_method_monday` not found.

- [ ] **Step 4: Write the model**

Create `models/intermediate/int_method_monday.sql`:

```sql
{{ config(materialized='view') }}

-- Intermediate model: one row for the current month carrying every quantity
-- the Method Monday scorecard needs.
--
-- Why one wide model instead of one model per tile: the elapsed-days
-- arithmetic below is the whole substance of this page. Repeating it across
-- sixteen thin models invites exactly the drift that cost a day of debugging
-- on 2026-08-10, when a trajectory divided a different window than the tile
-- beside it. It lives here once.
--
-- CONVENTION (see the spec): every actual counts through YESTERDAY, and every
-- trajectory divides by COMPLETE days only:
--
--   trajectory = mtd / (day_of_month - 1) * days_in_month
--
-- Looker's Method Monday page already does this. Its Sales page instead counts
-- through today and divides by day_of_month, which treats a part-finished day
-- as whole and reads low until that day's data lands.
--
-- On the 1st of the month elapsed_days is 0 and every trajectory is NULL.
-- SAFE_DIVIDE returns NULL rather than raising, which is the behaviour we want:
-- a projection from zero complete days is undefined, not zero.

WITH bounds AS (
  SELECT
    DATE_TRUNC(CURRENT_DATE(), MONTH)                     AS period,
    EXTRACT(DAY FROM CURRENT_DATE()) - 1                  AS elapsed_days,
    EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE(), MONTH))     AS days_in_month
),
actuals AS (
  SELECT
    (SELECT COUNT(*) FROM {{ ref('int_trials') }} t, bounds b
     WHERE DATE_TRUNC(t.SignupDate, MONTH) = b.period
       AND t.SignupDate < CURRENT_DATE())                                    AS trials_mtd,
    (SELECT COUNT(*) FROM {{ ref('int_syncs') }} s, bounds b
     WHERE DATE_TRUNC(s.SyncDate, MONTH) = b.period
       AND s.SyncDate < CURRENT_DATE())                                      AS syncs_mtd,
    (SELECT COUNT(*) FROM {{ source('revenue','int_conversions') }} c, bounds b
     WHERE DATE_TRUNC(c.FirstSaaSInvoiceTxnDate, MONTH) = b.period
       AND c.FirstSaaSInvoiceTxnDate < CURRENT_DATE())                       AS conversions_mtd,
    -- Churn is counted at CompanyAccount grain, matching metric 344's basis.
    (SELECT COUNT(DISTINCT x.CompanyAccount)
     FROM {{ source('revenue','int_cancellations') }} x, bounds b
     WHERE DATE_TRUNC(x.CancellationDate, MONTH) = b.period
       AND x.CancellationDate < CURRENT_DATE())                              AS churn_mtd
),
forecast AS (
  SELECT
    SUM(f.Forecasted_Trials)     AS trials_forecast,
    SUM(f.Forecasted_Syncs)      AS syncs_forecast,
    SUM(f.Forecasted_Conversion) AS conversions_forecast,
    SUM(f.Forecasted_Churn)      AS churn_forecast
  FROM {{ source('revenue','method_forecast') }} f, bounds b
  WHERE f.Date IS NOT NULL
    AND DATE_TRUNC(f.Date, MONTH) = b.period
)
SELECT
  b.period,
  b.elapsed_days,
  b.days_in_month,

  a.trials_mtd,
  a.syncs_mtd,
  a.conversions_mtd,
  a.churn_mtd,

  f.trials_forecast,
  f.syncs_forecast,
  f.conversions_forecast,
  f.churn_forecast,

  SAFE_DIVIDE(a.trials_mtd,      b.elapsed_days) * b.days_in_month AS trials_trajectory,
  SAFE_DIVIDE(a.syncs_mtd,       b.elapsed_days) * b.days_in_month AS syncs_trajectory,
  SAFE_DIVIDE(a.conversions_mtd, b.elapsed_days) * b.days_in_month AS conversions_trajectory,
  SAFE_DIVIDE(a.churn_mtd,       b.elapsed_days) * b.days_in_month AS churn_trajectory,

  -- Forecast prorated to the same elapsed window, so the MTD bars compare
  -- like with like. Looker's Conversions and Churn cards do this.
  SAFE_DIVIDE(f.conversions_forecast * b.elapsed_days, b.days_in_month) AS conversions_forecast_mtd,
  SAFE_DIVIDE(f.churn_forecast       * b.elapsed_days, b.days_in_month) AS churn_forecast_mtd
FROM bounds b, actuals a, forecast f
```

- [ ] **Step 5: Write the yml**

Create `models/intermediate/_int_method_monday.yml`:

```yaml
version: 2

models:
  - name: int_method_monday
    description: >
      One row for the current month carrying every quantity the Method Monday
      scorecard needs: MTD actuals through yesterday, full-month forecasts,
      complete-days trajectories, and forecasts prorated to the elapsed window.
      The elapsed-days arithmetic lives here and nowhere else so the sixteen
      tiles built on it cannot drift apart. On the 1st of the month
      elapsed_days is 0 and every trajectory is NULL by design.
    columns:
      - name: period
        description: First of the current month. Exactly one row.
        tests: [not_null, unique]
      - name: elapsed_days
        description: >
          Complete days so far this month, i.e. day_of_month - 1. Zero on the
          1st, which makes every trajectory NULL.
        tests: [not_null]
      - name: days_in_month
        description: Calendar days in the current month.
        tests: [not_null]
      - name: trials_mtd
        description: Trials with SignupDate this month, strictly before today.
      - name: syncs_mtd
        description: Sync events with SyncDate this month, strictly before today.
      - name: conversions_mtd
        description: Conversions with FirstSaaSInvoiceTxnDate this month, strictly before today.
      - name: churn_mtd
        description: >
          Distinct CompanyAccounts cancelled this month, strictly before today.
          CompanyAccount grain, matching metric 344's basis.
      - name: trials_trajectory
        description: trials_mtd / elapsed_days * days_in_month. NULL on the 1st.
      - name: conversions_forecast_mtd
        description: >
          Full-month forecast prorated to the elapsed window, so the MTD
          comparison bar is like-for-like rather than month-vs-part-month.
```

- [ ] **Step 6: Build and verify against the Looker targets**

```bash
/Users/nicolas/.local/bin/dbt run --select int_method_monday
/Users/nicolas/.local/bin/dbt show --select int_method_monday
```

On 2026-08-10 with elapsed_days 9 and days_in_month 31, expect:

| Column | Target |
|---|---|
| `trials_mtd` | 132 |
| `syncs_mtd` | 64 |
| `conversions_mtd` | 20 |
| `churn_mtd` | 27 |
| `trials_forecast` | 620 |
| `syncs_forecast` | 391 |
| `conversions_forecast` | 106 |
| `churn_forecast` | 99 |
| `trials_trajectory` | 454.67 (Looker 455) |
| `syncs_trajectory` | 220.44 (Looker 220) |
| `conversions_trajectory` | 68.89 (Looker 69) |
| `churn_trajectory` | 93.0 (Looker 93) |
| `conversions_forecast_mtd` | 30.77 (Looker 31) |
| `churn_forecast_mtd` | 28.74 (Looker 29) |

If any actual differs, stop and report — do not adjust the SQL to force a match.

- [ ] **Step 7: Run the invariants test**

```bash
/Users/nicolas/.local/bin/dbt test --select assert_method_monday_invariants
```

Expected: PASS.

The day-1 branch cannot be exercised today. Verify its logic by hand instead: run the trajectory expression with `elapsed_days = 0` and confirm `SAFE_DIVIDE` yields NULL, then state in your report that you checked it this way rather than observed it.

```bash
/Users/nicolas/.local/bin/dbt show --inline "SELECT SAFE_DIVIDE(20, 0) * 31 AS day_one_trajectory"
```

Expected: NULL.

- [ ] **Step 8: Commit**

```bash
git add models/intermediate/int_method_monday.sql \
        models/intermediate/_int_method_monday.yml \
        tests/assert_method_monday_invariants.sql
git commit -m "feat(method-monday): wide intermediate carrying the elapsed-days arithmetic"
```

---

### Task 2: MTD actual views

Four thin views. Each backs a tile that sits beside a trajectory, so each must use the same through-yesterday window — which it gets for free by reading the intermediate.

**Files:**
- Create: `models/metrics/v_metric__trials_mtd.sql` / `.yml`
- Create: `models/metrics/v_metric__syncs_mtd.sql` / `.yml`
- Create: `models/metrics/v_metric__conversions_mtd.sql` / `.yml`
- Create: `models/metrics/v_metric__churn_mtd.sql` / `.yml`

**Interfaces:**
- Consumes: `ref('int_method_monday')`.
- Produces: four views in `revenue_metrics`, each `period DATE`, `value FLOAT64`, exactly one row. `v_metric__conversions_mtd` also replaces #56 on the Sales Conversions tile in Task 7.

- [ ] **Step 1: Write the four models**

Each is the same shape. `models/metrics/v_metric__trials_mtd.sql`:

```sql
{{ config(materialized='view') }}

-- Canonical metric: "Trials MTD (through yesterday)"
-- Type: simple (windowed count)
--
-- Trials so far this month, excluding today. Pairs with
-- v_metric__trials_trajectory, which divides this same count by complete days.
-- A tile showing a through-today figure beside a through-yesterday trajectory
-- is the inconsistency this convention exists to prevent.
--
-- Distinct from Trials #54, which is the full-month total and must stay that
-- way — it feeds Marketing, the AI chart builder and 19 dbt consumers.

SELECT period, CAST(trials_mtd AS FLOAT64) AS value
FROM {{ ref('int_method_monday') }}
```

`v_metric__syncs_mtd.sql` — identical but `syncs_mtd`, and the comment names Syncs #55 and `v_metric__syncs_trajectory`.

`v_metric__conversions_mtd.sql` — identical but `conversions_mtd`, naming Conversions #56 and `v_metric__conversions_trajectory`. Add a line: this also backs the Sales Scorecard Conversions tile, which moves 21 → 20.

`v_metric__churn_mtd.sql` — identical but `churn_mtd`, naming Churn #59 and `v_metric__churn_trajectory`. Add a line: CompanyAccount grain, matching metric 344.

- [ ] **Step 2: Write the four ymls**

Each follows the established metrics-layer shape. `models/metrics/v_metric__trials_mtd.yml`:

```yaml
# Canonical metric definition for "Trials MTD (through yesterday)".

models:
  - name: v_metric__trials_mtd
    description: |
      Trials with a SignupDate in the current month, strictly before today.
      Pairs with the complete-days trajectory. Distinct from Trials (#54),
      which is the full-month total and stays that way.
    config:
      materialized: view
      meta:
        answers: "How many trials have we had this month, counting only finished days?"
        grain: "Single row, current month. Account-grain (see Trials #54)."
        filters:
          - rule: "SignupDate < CURRENT_DATE()"
            why: "today is unfinished; including it would not match the trajectory divisor"
          - rule: "inherits int_trials — excludes IsConversionException, Method Integration, and the 0001-01-01 sentinel"
            why: "carried from Trials #54"
        methodology_source: "Method Monday convention, verified against Looker report 510f74bb page p_rh9bepy1rd on 2026-08-10."
        parity_verified:
          against: "PENDING — Task 8 records the browser comparison"
          values: "PENDING"
        caveats:
          - "Excludes today by design. Not the same number as Trials #54 for the current month."
          - "Single-row by design. Do not chart it as a time series."
        used_by:
          - "Method Monday (Acquisition section)"
      labels:
        metric_id: ''
        layer: metrics
        type: simple
        status: queued
        source_table: int_method_monday
        source_measure_safe: ''
        depends_on: '54'
```

Repeat for syncs (`depends_on: '55'`), conversions (`depends_on: '56'`, and note it backs the Sales tile too), churn (`depends_on: '59'`, CompanyAccount grain caveat).

- [ ] **Step 3: Build and verify**

```bash
/Users/nicolas/.local/bin/dbt run --select v_metric__trials_mtd v_metric__syncs_mtd v_metric__conversions_mtd v_metric__churn_mtd
/Users/nicolas/.local/bin/dbt show --inline "
SELECT
 (SELECT value FROM \`project-for-method-dw.revenue_metrics.v_metric__trials_mtd\`) trials,
 (SELECT value FROM \`project-for-method-dw.revenue_metrics.v_metric__syncs_mtd\`) syncs,
 (SELECT value FROM \`project-for-method-dw.revenue_metrics.v_metric__conversions_mtd\`) conv,
 (SELECT value FROM \`project-for-method-dw.revenue_metrics.v_metric__churn_mtd\`) churn"
```

Expected on 2026-08-10: 132, 64, 20, 27 — matching Task 1's snapshot exactly.

- [ ] **Step 4: Commit**

```bash
git add models/metrics/v_metric__trials_mtd.sql models/metrics/v_metric__trials_mtd.yml \
        models/metrics/v_metric__syncs_mtd.sql models/metrics/v_metric__syncs_mtd.yml \
        models/metrics/v_metric__conversions_mtd.sql models/metrics/v_metric__conversions_mtd.yml \
        models/metrics/v_metric__churn_mtd.sql models/metrics/v_metric__churn_mtd.yml
git commit -m "feat(method-monday): MTD-through-yesterday views for the four primitives"
```

---

### Task 3: Trajectory views — two new, two converted

This is the task that changes the Sales Scorecard. Read the whole thing before editing.

**Files:**
- Create: `models/metrics/v_metric__trials_trajectory.sql` / `.yml`
- Create: `models/metrics/v_metric__churn_trajectory.sql` / `.yml`
- Modify: `models/metrics/v_metric__conversions_trajectory.sql` and `.yml`
- Modify: `models/metrics/v_metric__syncs_trajectory.sql` and `.yml`

**Interfaces:**
- Consumes: `ref('int_method_monday')`.
- Produces: four views, `period DATE` / `value FLOAT64`, one row each. `v_metric__conversions_trajectory` continues to back Supabase #296 and therefore metrics 321, 322 and 323.

- [ ] **Step 1: Snapshot what the two existing trajectories return now**

```bash
/Users/nicolas/.local/bin/dbt show --inline "
SELECT
 (SELECT ROUND(value,2) FROM \`project-for-method-dw.revenue_metrics.v_metric__conversions_trajectory\`) conv_traj_before,
 (SELECT ROUND(value,2) FROM \`project-for-method-dw.revenue_metrics.v_metric__syncs_trajectory\`) syncs_traj_before"
```

On 2026-08-10 this returns 65.1 and 201.5 — the through-today convention. Save these. Step 6 diffs against them.

- [ ] **Step 2: Create the two new views**

`models/metrics/v_metric__trials_trajectory.sql`:

```sql
{{ config(materialized='view') }}

-- Canonical metric: "Trials Trajectory"
-- Type: derived (single-period projection)
--
-- Month-end projection from COMPLETE days only:
--   trials_mtd / (day_of_month - 1) * days_in_month
--
-- Matches Looker's Method Monday page: 132 / 9 * 31 = 454.67, shown as 455 on
-- 2026-08-10. NULL on the 1st, when there are no complete days to project from.

SELECT period, trials_trajectory AS value
FROM {{ ref('int_method_monday') }}
```

`models/metrics/v_metric__churn_trajectory.sql` — identical but `churn_trajectory`, and the header cites 27 / 9 * 31 = 93.0, Looker 93.

Both get a `.yml` in the same shape as Task 2's, with `type: derived`, `status: queued`, `PENDING` parity, `depends_on: '54'` and `'59'` respectively, and a caveat that the projection is noisy in the first days of a month.

- [ ] **Step 3: Convert the two existing views**

Replace the body of `models/metrics/v_metric__conversions_trajectory.sql` with:

```sql
{{ config(materialized='view') }}

-- Canonical metric: "Conversions Trajectory" (#296)
-- Type: derived (single-period projection)
--
-- CONVENTION CHANGED 2026-08-10. Was: conversions through today divided by
-- day_of_month. Now: conversions through YESTERDAY divided by COMPLETE days:
--
--   conversions_mtd / (day_of_month - 1) * days_in_month
--
-- Why: the previous convention divided by day_of_month while its numerator
-- held only part of that day, so it read low until the day's data landed. It
-- also disagreed with Looker's Method Monday page, which already divides by
-- complete days. We unify on the Method Monday convention.
--
-- Consequence: this metric moves 65.1 -> 68.89 on 2026-08-10, and Supabase
-- metrics 321, 322 and 323 follow. Those four Sales Scorecard tiles no longer
-- match Looker's Sales page, deliberately.
--
-- NULL on the 1st of the month.

SELECT period, conversions_trajectory AS value
FROM {{ ref('int_method_monday') }}
```

Do the same for `v_metric__syncs_trajectory.sql`, selecting `syncs_trajectory`.

- [ ] **Step 4: Update both ymls**

In each, replace the `parity_verified` block with `PENDING` (Task 8 refills it — the current text records a 2026-07-31 match under the superseded convention and is now wrong), and add a caveat naming the change:

```yaml
          - "Convention changed 2026-08-10: divides by COMPLETE days (day_of_month - 1) counting through yesterday. Previously counted through today and divided by day_of_month. Moves this metric 65.1 -> 68.89 and cascades to 321/322/323. Deliberately diverges from Looker's Sales page, which retains the old convention; matches Looker's Method Monday page."
```

Change `status: live` back to `status: queued` on both, since the parity record no longer holds.

- [ ] **Step 5: Build all four**

```bash
/Users/nicolas/.local/bin/dbt run --select v_metric__trials_trajectory v_metric__churn_trajectory v_metric__conversions_trajectory v_metric__syncs_trajectory
```

- [ ] **Step 6: Verify the new values and diff the changed ones**

```bash
/Users/nicolas/.local/bin/dbt show --inline "
SELECT
 (SELECT ROUND(value,2) FROM \`project-for-method-dw.revenue_metrics.v_metric__trials_trajectory\`) trials,
 (SELECT ROUND(value,2) FROM \`project-for-method-dw.revenue_metrics.v_metric__syncs_trajectory\`) syncs,
 (SELECT ROUND(value,2) FROM \`project-for-method-dw.revenue_metrics.v_metric__conversions_trajectory\`) conv,
 (SELECT ROUND(value,2) FROM \`project-for-method-dw.revenue_metrics.v_metric__churn_trajectory\`) churn"
```

Expected: 454.67, 220.44, 68.89, 93.0 — all four matching Looker's Method Monday page.

Report the before/after for the two changed views explicitly: conversions 65.1 → 68.89, syncs 201.5 → 220.44. That is the Sales Scorecard change, and it must be stated as a diff rather than just a new value.

- [ ] **Step 7: Confirm the invariants test still passes**

```bash
/Users/nicolas/.local/bin/dbt test --select assert_method_monday_invariants assert_trajectory_invariants
```

`assert_trajectory_invariants` was written for the old convention and asserts the projection is at or above the actual MTD. That still holds. If it fails, report the rows rather than editing the test.

- [ ] **Step 8: Commit**

```bash
git add models/metrics/v_metric__trials_trajectory.sql models/metrics/v_metric__trials_trajectory.yml \
        models/metrics/v_metric__churn_trajectory.sql models/metrics/v_metric__churn_trajectory.yml \
        models/metrics/v_metric__conversions_trajectory.sql models/metrics/v_metric__conversions_trajectory.yml \
        models/metrics/v_metric__syncs_trajectory.sql models/metrics/v_metric__syncs_trajectory.yml
git commit -m "feat(method-monday): unify trajectories on complete-days convention

Conversions 65.1 -> 68.89 and syncs 201.5 -> 220.44; 321/322/323 follow.
Sales Scorecard now diverges from Looker's Sales page on those tiles, and
matches Looker's Method Monday page instead."
```

---

### Task 4: Prorated forecast and MTD sync rate

Three thin views completing the metric layer.

**Files:**
- Create: `models/metrics/v_metric__conversions_forecast_mtd.sql` / `.yml`
- Create: `models/metrics/v_metric__churn_forecast_mtd.sql` / `.yml`
- Create: `models/metrics/v_metric__sync_rate_mtd.sql` / `.yml`

**Interfaces:**
- Consumes: `ref('int_method_monday')`.
- Produces: three views, `period DATE` / `value FLOAT64`, one row each. `v_metric__sync_rate_mtd` emits a **percentage** (48.48), matching #300's and #361's convention, not a decimal.

- [ ] **Step 1: Write the three models**

`models/metrics/v_metric__conversions_forecast_mtd.sql`:

```sql
{{ config(materialized='view') }}

-- Canonical metric: "Conversions Forecast MTD"
-- Type: derived
--
-- The full-month conversions forecast prorated to the elapsed window:
--   conversions_forecast * (day_of_month - 1) / days_in_month
--
-- Exists so the MTD comparison bar is like-for-like. Comparing 20 actual
-- against a 106 full-month forecast would say nothing; against 30.77 it says
-- we are behind. Looker's Conversions card does this and shows 31.

SELECT period, conversions_forecast_mtd AS value
FROM {{ ref('int_method_monday') }}
```

`v_metric__churn_forecast_mtd.sql` — identical but `churn_forecast_mtd`, citing 99 * 9 / 31 = 28.74, Looker 29.

`models/metrics/v_metric__sync_rate_mtd.sql`:

```sql
{{ config(materialized='view') }}

-- Canonical metric: "Sync Rate MTD (through yesterday)"
-- Type: ratio
--
-- Syncs divided by trials, both counted through yesterday:
--   syncs_mtd / trials_mtd
--
-- Emits a PERCENTAGE (48.48), matching Sync Rate #300 and Forecasted Sync
-- Rate #361, so the two tiles can sit side by side without rescaling.
--
-- Distinct from #300, which is the full-month ratio. This one shares its
-- window with everything else on the Method Monday page.
--
-- NULL when trials_mtd is 0 — early in a month that is genuinely undefined,
-- not zero.

SELECT period, SAFE_DIVIDE(syncs_mtd, trials_mtd) * 100 AS value
FROM {{ ref('int_method_monday') }}
```

- [ ] **Step 2: Write the three ymls**

Same shape as Task 2. For `v_metric__sync_rate_mtd`, `depends_on: '55-54'`, `type: ratio`, and caveats stating: emits a percentage not a decimal; excludes today; NULL when no trials yet this month; not the same number as #300.

For the two forecast ones, `type: derived` and a caveat that `method_forecast` is an EXTERNAL table over a Google Sheet, so a column rename breaks them silently.

- [ ] **Step 3: Build and verify**

```bash
/Users/nicolas/.local/bin/dbt run --select v_metric__conversions_forecast_mtd v_metric__churn_forecast_mtd v_metric__sync_rate_mtd
/Users/nicolas/.local/bin/dbt show --inline "
SELECT
 (SELECT ROUND(value,2) FROM \`project-for-method-dw.revenue_metrics.v_metric__conversions_forecast_mtd\`) conv_fc_mtd,
 (SELECT ROUND(value,2) FROM \`project-for-method-dw.revenue_metrics.v_metric__churn_forecast_mtd\`) churn_fc_mtd,
 (SELECT ROUND(value,2) FROM \`project-for-method-dw.revenue_metrics.v_metric__sync_rate_mtd\`) sync_rate_mtd"
```

Expected: 30.77 (Looker 31), 28.74 (Looker 29), 48.48 (Looker 48.5%).

- [ ] **Step 4: Commit**

```bash
git add models/metrics/v_metric__conversions_forecast_mtd.sql models/metrics/v_metric__conversions_forecast_mtd.yml \
        models/metrics/v_metric__churn_forecast_mtd.sql models/metrics/v_metric__churn_forecast_mtd.yml \
        models/metrics/v_metric__sync_rate_mtd.sql models/metrics/v_metric__sync_rate_mtd.yml
git commit -m "feat(method-monday): prorated forecast and MTD sync rate views"
```

---

### Task 5: Register the Supabase metrics

The scorecard resolves KPIs by numeric Supabase id — `builder/src/lib/sql/plan.js:53` skips any KPI whose `metricId` is not a number. Each new view needs a registry row whose `chart_sql` points at it.

**Files:**
- Create: `scripts/register_method_monday_metrics.py`
- Modify: the nine new `models/metrics/*.yml` — fill in `metric_id` labels once ids are assigned

**Interfaces:**
- Consumes: the nine views from Tasks 2–4.
- Produces: printed metric ids. Task 6 hardcodes them, so the printed output is the handoff.

- [ ] **Step 1: Find whether a "Forecasted Conversion" count metric already exists**

The spec flags this as unresolved. Search before creating:

```bash
python3 - <<'EOF'
import json, re, urllib.request, pathlib
a = re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", pathlib.Path("tracker.html").read_text()).group(0)
url = ("https://agkubdpgnpwudzpzcvhs.supabase.co/rest/v1/metrics"
       "?select=id,name,status,chart_sql&order=id")
r = urllib.request.Request(url, headers={"apikey": a, "Authorization": f"Bearer {a}"})
for m in json.load(urllib.request.urlopen(r)):
    cs = m["chart_sql"] or ""
    if "Forecasted_Conversion" in cs and "Rate" not in cs:
        print(f"#{m['id']} {m['name']} [{m['status']}]  {cs[:150]}")
EOF
```

If a row emits `SUM(Forecasted_Conversion)` by month, reuse it and record the id. If the only hit is #319 (which uses `Forecasted_Conversion_Rate`), there is no count metric and Task 6 must read the count from `int_method_monday` via a `customSql` chart series instead of a KPI tile. Report which case you found.

- [ ] **Step 2: Snapshot before writing anything**

```bash
python3 - <<'EOF'
import json, re, urllib.request, pathlib
a = re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", pathlib.Path("tracker.html").read_text()).group(0)
H = {"apikey": a, "Authorization": f"Bearer {a}"}
url = "https://agkubdpgnpwudzpzcvhs.supabase.co/rest/v1/metrics?select=id&order=id.desc&limit=1"
r = urllib.request.Request(url, headers=H)
print("max existing id:", json.load(urllib.request.urlopen(r)))
EOF
```

- [ ] **Step 3: Write the registration script**

Create `scripts/register_method_monday_metrics.py`, following `scripts/register_sync_conversion_metrics.py` exactly for auth: the anon key is regexed out of `tracker.html`, writes go through the `x-method-email` header for RLS, and the script aborts on the first write error so a rejected auth leaves no partial state.

Nine pointer metrics. Use `FORMAT_DATE('%Y-%m', period)` — **not** `'%Y-%m-%d'`. The day-grain format breaks the derived-metric join at `builder/src/lib/sql/load.js:137`, the `current_month` KPI lookup, `showDelta`, and any mixed monthly chart. This was learned the hard way on 2026-07-31.

```python
POINTERS = [
    ("Trials MTD (through yesterday)", "v_metric__trials_mtd",
     "Trials with SignupDate this month, excluding today. Pairs with the complete-days trajectory. Distinct from Trials #54, the full-month total."),
    ("Syncs MTD (through yesterday)", "v_metric__syncs_mtd",
     "Sync events this month, excluding today. Distinct from Syncs #55, the full-month total."),
    ("Conversions MTD (through yesterday)", "v_metric__conversions_mtd",
     "Conversions this month, excluding today. Also backs the Sales Scorecard Conversions tile, which moves 21 -> 20. Distinct from Conversions #56."),
    ("Churn MTD (through yesterday)", "v_metric__churn_mtd",
     "Distinct CompanyAccounts cancelled this month, excluding today. CompanyAccount grain, matching metric 344."),
    ("Trials Trajectory (complete days)", "v_metric__trials_trajectory",
     "Month-end projection from complete days only. 132/9*31 = 455 on 2026-08-10, matching Looker's Method Monday page."),
    ("Churn Trajectory (complete days)", "v_metric__churn_trajectory",
     "Month-end projection from complete days only. 27/9*31 = 93."),
    ("Conversions Forecast MTD", "v_metric__conversions_forecast_mtd",
     "Full-month conversions forecast prorated to the elapsed window, so the MTD bar compares like with like."),
    ("Churn Forecast MTD", "v_metric__churn_forecast_mtd",
     "Full-month churn forecast prorated to the elapsed window."),
    ("Sync Rate MTD (through yesterday)", "v_metric__sync_rate_mtd",
     "Syncs divided by trials, both excluding today. Emits a percentage. Distinct from Sync Rate #300, the full-month ratio."),
]
```

Then four formula metrics for the forecast-vs-trajectory and attainment tiles. `TRIALS_TRAJ` and `SYNCS_TRAJ` are the ids created above; 285 and 286 are the existing forecast metrics:

```python
FORMULAS = [
    ("Trials Forecast vs Trajectory",
     f"{{{trials_traj}}} - {{285}}", [trials_traj, 285],
     "Trajectory minus full-month forecast, in trials. Negative means pacing behind. -165 on 2026-08-10."),
    ("Trials Attainment",
     f"SAFE_DIVIDE({{{trials_traj}}}, {{285}}) * 100", [trials_traj, 285],
     "Trajectory as a percentage of forecast. 73.3% on 2026-08-10. Looker labels this tile 'Forecast vs Trajectory'; that label is wrong, it computes attainment."),
    ("Syncs Forecast vs Trajectory",
     f"{{{syncs_traj}}} - {{286}}", [syncs_traj, 286],
     "Trajectory minus full-month forecast, in syncs. -171 on 2026-08-10."),
    ("Syncs Attainment",
     f"SAFE_DIVIDE({{{syncs_traj}}}, {{286}}) * 100", [syncs_traj, 286],
     "Trajectory as a percentage of forecast. 56.4% on 2026-08-10."),
]
```

All thirteen rows get `status: "queued"` and `stage: "revenue"`.

- [ ] **Step 4: Run it**

```bash
python3 scripts/register_method_monday_metrics.py
```

Expected: nine `created #NNN` pointer lines then four formula lines. Write down all thirteen ids.

- [ ] **Step 5: Verify each pointer returns data**

For each of the nine, run its registered `chart_sql` against BigQuery wrapped the way `wrapChartSql` wraps it, and confirm a non-empty single row with a `'YYYY-MM'` period. Do not assume — read the `chart_sql` back out of Supabase and execute that string.

- [ ] **Step 6: Fill in the metric_id labels and rebuild**

Put each pointer's id into `metric_id: ''` in its `.yml`, then:

```bash
/Users/nicolas/.local/bin/dbt run --select v_metric__trials_mtd v_metric__syncs_mtd v_metric__conversions_mtd v_metric__churn_mtd v_metric__trials_trajectory v_metric__churn_trajectory v_metric__conversions_forecast_mtd v_metric__churn_forecast_mtd v_metric__sync_rate_mtd
```

- [ ] **Step 7: Commit**

```bash
git add scripts/register_method_monday_metrics.py models/metrics
git commit -m "feat(method-monday): register nine pointer metrics and four formula metrics"
```

---

### Task 6: The Method Monday page

**Files:**
- Create: `builder/src/config/scorecards/method-monday-scorecard.js`
- Modify: `builder/src/config/scorecards/index.js`
- Create: `builder/tests/unit/methodMondayScorecard.test.js`

**Interfaces:**
- Consumes: the thirteen ids from Task 5, plus existing #285, #286, #274, #319, #361, #402.
- Produces: a scorecard registered under key `method-monday`, three sections.

- [ ] **Step 1: Write the failing test**

Create `builder/tests/unit/methodMondayScorecard.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import methodMonday from '../../src/config/scorecards/method-monday-scorecard.js';
import { SCORECARDS } from '../../src/config/scorecards/index.js';

describe('Method Monday scorecard', () => {
  it('is registered', () => {
    expect(SCORECARDS['method-monday']).toBe(methodMonday);
  });

  it('starts pending', () => {
    expect(methodMonday.status).toBe('pending');
  });

  it('has the three sections in order', () => {
    expect(methodMonday.sections.map((s) => s.title))
      .toEqual(['Acquisition', 'Conversion', 'Churn']);
  });

  it('every section states that figures exclude today', () => {
    for (const s of methodMonday.sections) {
      expect(s.description).toMatch(/exclude[s]? today/i);
    }
  });

  it('gives every KPI its own metric id', () => {
    for (const s of methodMonday.sections) {
      const ids = s.kpis.map((k) => k.metricId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('uses no placeholder ids', () => {
    const all = JSON.stringify(methodMonday);
    expect(all).not.toMatch(/NEW_|TODO|undefined/);
  });

  it('never labels an attainment tile as forecast-vs-trajectory', () => {
    // Looker mislabels these. We do not inherit the mistake.
    for (const s of methodMonday.sections) {
      for (const k of s.kpis) {
        if (/attainment/i.test(k.label)) {
          expect(k.label).not.toMatch(/forecast vs/i);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd builder && npm run test:unit -- methodMondayScorecard
```

Expected: FAIL — cannot resolve `method-monday-scorecard.js`.

- [ ] **Step 3: Write the config**

Create `builder/src/config/scorecards/method-monday-scorecard.js`. Substitute the real ids from Task 5 as plain numeric literals.

```javascript
/**
 * Method Monday — compact month-pacing view.
 *
 * Convention: every figure excludes today, and every trajectory divides by
 * complete days (day_of_month - 1). See
 * docs/superpowers/specs/2026-08-10-method-monday-design.md.
 *
 * This deliberately diverges from Looker's Sales page, which counts through
 * today. It matches Looker's Method Monday page.
 */

const EXCLUDES_TODAY =
  'All figures exclude today. Trajectories project from complete days only, so they do not move during the day.';

// Forecasted Conversion Rate as a PERCENTAGE. Metric #319 emits this column as
// a decimal (0.1797); metric #321 next to it on the chart emits a percentage
// (12.45). Mixing the two scales on one chart is the 3289% bug. Reading the
// column directly and multiplying keeps both series on one scale.
const MONTHLY_FORECAST_CONV_RATE_PCT_SQL = `
SELECT FORMAT_DATE('%Y-%m', DATE_TRUNC(Date, MONTH)) AS period,
  ROUND(MAX(Forecasted_Conversion_Rate) * 100, 2) AS value
FROM \\\`project-for-method-dw.revenue.method_forecast\\\`
WHERE Date IS NOT NULL AND DATE_TRUNC(Date, MONTH) = DATE_TRUNC(CURRENT_DATE(), MONTH)
GROUP BY 1
`;

export default {
  id: 'method-monday',
  title: 'Method Monday',
  status: 'pending',
  views: {
    int_method_monday: { dateCol: 'period' },
  },
  sections: [
    {
      title: 'Acquisition',
      layout: 'scorecard-row',
      description: EXCLUDES_TODAY,
      kpis: [
        { metricId: 361, label: 'Sync % Forecast', format: 'percent', valueSelector: 'current_or_latest' },
        { metricId: SYNC_RATE_MTD, label: 'Sync % Actual', format: 'percent', valueSelector: 'current_or_latest' },
        { metricId: 285, label: 'Trials Forecast', format: 'number', valueSelector: 'current_or_latest' },
        { metricId: TRIALS_TRAJ, label: 'Trials Trajectory', format: 'number', valueSelector: 'current_or_latest' },
        { metricId: TRIALS_FVT, label: 'Trials Forecast vs. Trajectory', format: 'number', valueSelector: 'current_or_latest' },
        { metricId: TRIALS_ATT, label: 'Trials Attainment', format: 'percent', valueSelector: 'current_or_latest' },
        { metricId: 286, label: 'Syncs Forecast', format: 'number', valueSelector: 'current_or_latest' },
        { metricId: SYNCS_TRAJ, label: 'Syncs Trajectory', format: 'number', valueSelector: 'current_or_latest' },
        { metricId: SYNCS_FVT, label: 'Syncs Forecast vs. Trajectory', format: 'number', valueSelector: 'current_or_latest' },
        { metricId: SYNCS_ATT, label: 'Syncs Attainment', format: 'percent', valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Trials — Forecast vs Trajectory',
          chartType: 'bar', valueFormat: 'number',
          metrics: [
            { id: 285, label: 'Forecast', color: '#1e3a5f' },
            { id: TRIALS_TRAJ, label: 'Trajectory', color: '#2563eb' },
          ],
          lastNMonths: 1, showLabels: true,
        },
        {
          label: 'Syncs — Forecast vs Trajectory',
          chartType: 'bar', valueFormat: 'number',
          metrics: [
            { id: 286, label: 'Forecast', color: '#1e3a5f' },
            { id: SYNCS_TRAJ, label: 'Trajectory', color: '#2563eb' },
          ],
          lastNMonths: 1, showLabels: true,
        },
      ],
    },
    {
      title: 'Conversion',
      layout: 'scorecard-row',
      description: EXCLUDES_TODAY,
      kpis: [
        { metricId: CONV_MTD, label: 'Conversions', format: 'number', valueSelector: 'current_or_latest' },
        { metricId: CONV_FC_MTD, label: 'Conversions Forecast MTD', format: 'number', valueSelector: 'current_or_latest' },
        { metricId: 319, label: 'Conversion Rate Forecast', format: 'decimal_rate', valueSelector: 'current_or_latest' },
        { metricId: 321, label: 'Conversion Rate Trajectory', format: 'percent', valueSelector: 'current_or_latest' },
        // 301 is a Supabase formula emitting a PERCENTAGE (32.89), not a decimal.
        // Declaring it decimal_rate renders 3289%. See the 2026-08-04 fix.
        { metricId: 301, label: 'Sync Conversion Rate', format: 'percent', valueSelector: 'current_or_latest' },
        { metricId: 402, label: 'Forecasted Sync Conversion Rate', format: 'decimal_rate', valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Conversions — Forecast vs Actual (MTD)',
          chartType: 'bar', valueFormat: 'number',
          metrics: [
            { id: CONV_FC_MTD, label: 'Forecast', color: '#1e3a5f' },
            { id: CONV_MTD, label: 'Actual', color: '#2563eb' },
          ],
          lastNMonths: 1, showLabels: true,
        },
        {
          // SCALE TRAP. #319 emits a DECIMAL (0.1797); #321 is a Supabase
          // formula emitting a PERCENTAGE (12.45). Putting both on one chart
          // renders them 100x apart — the same class of bug as the 3289% tile.
          // The forecast series therefore reads the sheet column directly and
          // scales to a percentage, so both series share one scale.
          label: 'Conversion Rate — Forecast vs Trajectory',
          chartType: 'bar', valueFormat: 'percent',
          metrics: [
            { id: '__mm_fc_conv_rate', label: 'Forecast', color: '#1e3a5f',
              customSql: MONTHLY_FORECAST_CONV_RATE_PCT_SQL },
            { id: 321, label: 'Trajectory', color: '#2563eb' },
          ],
          lastNMonths: 1, showLabels: true,
        },
      ],
    },
    {
      title: 'Churn',
      layout: 'scorecard-row',
      description: EXCLUDES_TODAY,
      kpis: [
        { metricId: CHURN_MTD, label: 'Churn', format: 'number', valueSelector: 'current_or_latest' },
        { metricId: CHURN_FC_MTD, label: 'Churn Forecast MTD', format: 'number', valueSelector: 'current_or_latest' },
        { metricId: 274, label: 'Churn Forecast (month)', format: 'number', valueSelector: 'current_or_latest' },
        { metricId: CHURN_TRAJ, label: 'Churn Trajectory', format: 'number', valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Churn — Forecast vs Actual (MTD)',
          chartType: 'bar', valueFormat: 'number',
          metrics: [
            { id: CHURN_FC_MTD, label: 'Forecast', color: '#1e3a5f' },
            { id: CHURN_MTD, label: 'Actual', color: '#2563eb' },
          ],
          lastNMonths: 1, showLabels: true,
        },
        {
          label: 'Churn — Forecast vs Trajectory',
          chartType: 'bar', valueFormat: 'number',
          metrics: [
            { id: 274, label: 'Forecast', color: '#1e3a5f' },
            { id: CHURN_TRAJ, label: 'Trajectory', color: '#2563eb' },
          ],
          lastNMonths: 1, showLabels: true,
        },
      ],
    },
  ],
};
```

Note the Churn Rate tiles from Looker are **not** included. Metric 344 (Churn Rate) and 345 (Churn Rate % Trajectory) are raw `chart_sql` on the old convention; wiring them here would put a through-today figure on a through-yesterday page. Task 8 files that as a follow-up.

- [ ] **Step 4: Register it in the index**

In `builder/src/config/scorecards/index.js`, add the import alongside the others and the entry `'method-monday': methodMonday,` in the `SCORECARDS` object.

- [ ] **Step 5: Run the test and the full suite**

```bash
cd builder && npm run test:unit -- methodMondayScorecard && npm run lint && npm run test:unit
```

Expected: the seven new tests pass, no lint errors, no regressions.

- [ ] **Step 6: Commit**

```bash
git add builder/src/config/scorecards/method-monday-scorecard.js \
        builder/src/config/scorecards/index.js \
        builder/tests/unit/methodMondayScorecard.test.js
git commit -m "feat(method-monday): the page — three sections on the excludes-today convention"
```

---

### Task 7: Repoint the Sales Conversions tile

Small but it is the whole point of the convention decision: the Sales tile and the trajectory beside it must share a window.

**Files:**
- Modify: `builder/src/config/scorecards/sales-scorecard.js`
- Modify: `builder/tests/unit/salesScorecardSyncSection.test.js`

**Interfaces:**
- Consumes: `CONV_MTD`, the Conversions MTD id from Task 5.
- Produces: no new interface. The Sales Conversions tile reads 20 instead of 21.

- [ ] **Step 1: Change both Conversion tiles**

`sales-scorecard.js` uses `metricId: 56` for the Conversion KPI in **two** sections — Conversion Rate and Sync Conversion Rate. Change both to `CONV_MTD` and relabel to `Conversions (excl. today)`.

Add a comment above each explaining why: metric 56 is the full-month total and stays that way for Marketing and the AI builder; this tile needs the through-yesterday figure so it ties to the trajectory beside it.

- [ ] **Step 2: Add the convention note to both section descriptions**

Append to each of the two sections' `description`: that trajectories now divide by complete days and therefore no longer match Looker's Sales page.

- [ ] **Step 3: Update the existing test**

`salesScorecardSyncSection.test.js` asserts the sync section's KPI labels in order, and the first is `'Conversion'`. Update the expected label to `'Conversions (excl. today)'`. Do not weaken any other assertion.

- [ ] **Step 4: Run lint and the full suite**

```bash
cd builder && npm run lint && npm run test:unit
```

- [ ] **Step 5: Commit**

```bash
git add builder/src/config/scorecards/sales-scorecard.js \
        builder/tests/unit/salesScorecardSyncSection.test.js
git commit -m "fix(sales-scorecard): Conversions tile shares the trajectory's window"
```

---

### Task 8: Browser verification and documentation

Both display bugs found in this codebase — the 3289% scale error and NULL-as-0% — passed their unit tests. Nothing here is finished until it has been seen rendering.

**Files:**
- Modify: `docs/metric-definitions.md` — an entry per new metric
- Modify: the nine new `.yml` files — fill in `parity_verified`
- Modify: `models/metrics/v_metric__{conversions,syncs}_trajectory.yml` — refill parity under the new convention

- [ ] **Step 1: Start the dev server against THIS worktree**

`preview_start` reads `.claude/launch.json` from the shared checkout, not the worktree. The entry `builder-dev-sync-conversion` already exists there and runs `npm --prefix ../method-metrics-sync-conversion/builder run dev` on port 5173. Port 5173 is the only origin registered with the BigQuery OAuth client, so any other port fails with `origin_mismatch`.

**Before trusting anything you see, confirm the server is serving this worktree:**

```bash
curl -s "http://localhost:5173/src/config/scorecards/index.js" | grep -c "method-monday"
```

Expected: 1. If 0, you are looking at the shared checkout and every observation is void. This exact mistake cost several turns on 2026-08-10.

- [ ] **Step 2: Verify every tile against the Looker targets**

Open `http://localhost:5173/#/scorecards/method-monday`, connect BigQuery, and check:

| Tile | Target |
|---|---|
| Sync % Forecast | 63.1% |
| Sync % Actual | 48.5% |
| Trials Forecast | 620 |
| Trials Trajectory | 455 |
| Trials Forecast vs. Trajectory | −165 |
| Trials Attainment | 73.3% |
| Syncs Forecast | 391 |
| Syncs Trajectory | 220 |
| Syncs Forecast vs. Trajectory | −171 |
| Syncs Attainment | 56.4% |
| Conversions | 20 |
| Conversions Forecast MTD | 31 |
| Churn | 27 |
| Churn Trajectory | 93 |
| Churn Forecast MTD | 29 |

Screenshot the page. Any tile reading `0`, blank, or wildly out of scale is a formula-versus-view scale mismatch — check whether the metric is a Supabase formula emitting a percentage while the config declares `decimal_rate`.

- [ ] **Step 3: Confirm the Sales Scorecard moved as predicted**

Open `#/scorecards/sales-scorecard` and check: Conversions reads **20** (was 21), Conversion Trajectory reads **68.9** (was 65.1). Both sections. Screenshot.

- [ ] **Step 4: Fill in parity_verified**

For all nine new ymls plus the two converted ones, replace `PENDING` with the browser comparison: the Looker page and date read, the values matched, and for the two converted ones the before/after.

The sync conversion rate on this page has no Looker counterpart — record it as a first observation, not a match.

- [ ] **Step 5: Write the metric-definitions entries**

Follow the template at the top of `docs/metric-definitions.md`. One entry per new metric, with all non-negotiable fields. Every entry must carry two caveats verbatim:

1. Excludes today by design; not the same number as the corresponding full-month primitive.
2. Trajectory divides by complete days, which is Looker's Method Monday convention and not its Sales convention.

- [ ] **Step 6: File the follow-ups**

Add to `TICKETS.md`: Churn Rate (#344) and Churn Rate % Trajectory (#345) are raw `chart_sql` on the through-today convention and were left off the Method Monday page for that reason; they need migrating to the intermediate before the page is complete. Also note the 19 dbt ymls claiming Method Monday consumes GRR/NRR/MRR movements, which it does not.

- [ ] **Step 7: Commit**

```bash
git add models/metrics docs/metric-definitions.md TICKETS.md
git commit -m "docs(method-monday): parity records, definitions, and follow-ups"
```

Do not flip anything to `live` and do not merge. Promotion is Nic's call and needs the browser evidence from Steps 2 and 3 in front of him.
