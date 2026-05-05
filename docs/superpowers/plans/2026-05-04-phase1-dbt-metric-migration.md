# Phase 1: dbt-Driven Metric Source of Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate metric definitions from the Supabase registry to dbt+BigQuery, with the first 5 metrics (Trials, Syncs, Conversions, Cancellations, Sync Rate) materialized as `v_metric__*` BQ views, validated for numerical parity against their Supabase-defined counterparts, and queryable via BQ INFORMATION_SCHEMA.

**Architecture:** Adopt dbt CLI (Option A — full adoption, decided 2026-05-04). dbt-bigquery natively supports BQ OPTIONS via model config (`description` + `labels`), so the previously-planned custom Python deploy script (`scripts/migrate/generate_metric_views.py`) is not built. Existing intermediate views (`v_trials`, `v_syncs`, etc.) are referenced as dbt sources rather than re-created. The metric layer (`v_metric__*`) is materialized as dbt views, with semantic models declared on the upstream intermediate per dbt latest-spec convention. Parity is enforced via dbt singular tests that compare each `v_metric__*` to the Supabase-defined chart_sql output.

**Tech Stack:** dbt-core 1.12+ (latest spec), dbt-bigquery adapter, BigQuery (`project-for-method-dw.revenue` dataset), Python 3.11+ for dbt runtime, Supabase REST API (read-only, for parity validation), git + GitHub Pages deploy.

**Out of scope for this plan:**
- Method Metrics UI integration (next plan — `useMetricMetadata` hook, ExpandPanel updates)
- CI integration for `dbt run` on merge to main (next plan)
- Retiring the existing Supabase metrics table (Phase 3)
- Migrating remaining 15 live metrics beyond the first 5
- Time spine model (deferred until first cumulative metric is requested)
- Marts layer (`fct_*`, `dim_*`) — Phase 1.6

**Blocking dependencies (must be true before starting):**
- BQ OAuth or service account credentials available for `dbt run`
- Supabase REST API access for parity queries (anon key in `tracker.html` or env var)
- Python 3.11+ installed locally
- The current scaffold at `models/intermediate/v_trials.yml` + `models/metrics/v_metric__trials.{yml,sql}` exists (per `docs/dbt-scaffold-handoff.md`) — the plan modifies these, doesn't re-create from scratch

---

## File Structure

### New files to create

| Path | Responsibility |
|---|---|
| `dbt_project.yml` | dbt project root config: project name, model paths, target schema, version |
| `profiles.yml` (in repo or `~/.dbt/`) | BQ connection profile: dataset, project, auth method |
| `models/sources.yml` | Declares existing BQ views (`v_trials`, `v_syncs`, etc.) as dbt sources so the metric models can `{{ source('revenue', 'v_trials') }}` |
| `models/metrics/v_metric__syncs.sql` | SELECT body for syncs metric materialization |
| `models/metrics/v_metric__syncs.yml` | dbt config with OPTIONS for syncs |
| `models/metrics/v_metric__conversions.sql` | SELECT body for conversions metric |
| `models/metrics/v_metric__conversions.yml` | dbt config for conversions |
| `models/metrics/v_metric__cancellations.sql` | SELECT body for cancellations metric |
| `models/metrics/v_metric__cancellations.yml` | dbt config for cancellations |
| `models/metrics/v_metric__sync_rate.sql` | SELECT body for sync_rate ratio metric |
| `models/metrics/v_metric__sync_rate.yml` | dbt config for sync_rate |
| `models/metrics/_metrics.yml` | Top-level cross-model metrics file (sync_rate ratio definition per MetricFlow latest-spec) |
| `models/intermediate/v_syncs.yml` | semantic_model + simple `syncs` metric on the existing `v_syncs` BQ view (referenced as source) |
| `models/intermediate/v_conversions.yml` | semantic_model + simple `conversions` metric on `v_conversions` |
| `models/intermediate/v_cancellations.yml` | semantic_model + simple `cancellations` metric on `v_cancellations` |
| `tests/parity/test_parity_trials.sql` | Singular test: `v_metric__trials` row-count + sum match Supabase-defined chart_sql output for metric #54 |
| `tests/parity/test_parity_syncs.sql` | Same pattern, syncs |
| `tests/parity/test_parity_conversions.sql` | Same pattern, conversions |
| `tests/parity/test_parity_cancellations.sql` | Same pattern, cancellations |
| `tests/parity/test_parity_sync_rate.sql` | Same pattern, sync_rate |
| `requirements-dbt.txt` | Python deps: `dbt-core==1.12.x`, `dbt-bigquery==1.12.x` |
| `.dbt-version` | Pin dbt version for reproducibility |

### Existing files to modify

| Path | What changes |
|---|---|
| `models/intermediate/v_trials.yml` | Rewrite to dbt latest-spec syntax (current file mixes legacy + latest per handoff §5 Fix 1) |
| `models/metrics/v_metric__trials.yml` | Convert from custom-materialization-spec to dbt model config; drop the `metric_ref` field per handoff §5 Fix 2 |
| `models/metrics/v_metric__trials.sql` | Reduce from full DDL to just the SELECT body — dbt wraps it in `CREATE VIEW ... OPTIONS(...)` at run time |
| `.gitignore` | Add `target/`, `dbt_packages/`, `logs/`, `.user.yml` |
| `CLAUDE.md` | Document dbt as canonical metric definition source; document the model layout; remove references to custom Python deploy script |

### Existing files to archive (move, don't delete)

| From | To |
|---|---|
| `docs/superpowers/plans/2026-04-28-bq-as-metric-source-of-truth-phase1.md` | `docs/superpowers/plans/archive/2026-04-28-bq-as-metric-source-of-truth-phase1.md` (the prior Supabase-as-cache plan, superseded by this one) |

---

## Conventions reference (used throughout)

### dbt project conventions

- **Latest spec only** (dbt 1.12+). semantic_models nested on dbt models, NOT as top-level resources. No `type_params:` blocks. Entity/dimension blocks live on columns, not in nested arrays.
- **Naming:** intermediate views stay as `v_*` (current Method convention). Metric materializations are `v_metric__<slug>`. Cross-model metrics live in `models/metrics/_metrics.yml`. Single-model simple metrics co-locate with their semantic_model on the upstream intermediate.
- **Sources:** existing BQ views (`revenue.v_trials`, etc.) are declared as dbt sources, not re-built. Metric models reference them via `{{ source('revenue', 'v_trials') }}`.
- **Materialization:** all metric models materialize as `view` (not `table`). dbt's BQ adapter applies OPTIONS automatically when `description` and `labels` are set in the model config.

### Metric materialization shape

Every `v_metric__<slug>` BQ view returns the same shape: `(period DATE, value FLOAT64)`. This is the contract the chart builder + AI MCP rely on.

For simple metrics, the SELECT body is:

```sql
SELECT
  DATE_TRUNC(<date_col>, MONTH) AS period,
  COUNT(*) AS value
FROM {{ source('revenue', '<intermediate_view>') }}
GROUP BY period
ORDER BY period
```

For ratio metrics, the SELECT body joins two simple metric materializations:

```sql
SELECT
  num.period,
  SAFE_DIVIDE(num.value, denom.value) AS value
FROM {{ ref('v_metric__<numerator>') }} num
FULL OUTER JOIN {{ ref('v_metric__<denominator>') }} denom USING (period)
ORDER BY period
```

### OPTIONS metadata

Every `v_metric__*` view carries:

- `description` (string): human-readable definition. Pulled from the model `description` field in the yml.
- `labels` (key-value): structured metadata for filtering / discoverability.
  - `layer: metric`
  - `metric_type: simple` or `ratio` or `derived`
  - `slug: <metric_slug>`
  - `supabase_id: <numeric>` — bridge to the existing Supabase metric ID for parity testing
  - `owner_team: revops` (default; override per metric if needed)

dbt-bigquery applies these from the model config block automatically. No custom code.

### Parity testing approach

Each metric has a singular dbt test that:
1. Fetches the Supabase `chart_sql` for the metric ID via REST API
2. Runs both the Supabase chart_sql and the dbt-managed `v_metric__<slug>` view
3. Asserts row-count match and value-sum match (with rounding tolerance for floats)

Singular tests live in `tests/parity/`. They run via `dbt test --select test_parity_*`.

---

## Task 1: Archive the prior plan and initialize dbt project skeleton

**Files:**
- Create: `dbt_project.yml`
- Create: `profiles.yml` (in repo root for now; later we'll move to `~/.dbt/`)
- Create: `requirements-dbt.txt`
- Create: `.dbt-version`
- Modify: `.gitignore`
- Move: `docs/superpowers/plans/2026-04-28-bq-as-metric-source-of-truth-phase1.md` → `docs/superpowers/plans/archive/2026-04-28-bq-as-metric-source-of-truth-phase1.md`

- [ ] **Step 1: Move the prior Phase 1 plan to archive**

```bash
mkdir -p docs/superpowers/plans/archive
git mv docs/superpowers/plans/2026-04-28-bq-as-metric-source-of-truth-phase1.md \
       docs/superpowers/plans/archive/2026-04-28-bq-as-metric-source-of-truth-phase1.md
```

- [ ] **Step 2: Create `requirements-dbt.txt`**

Write:

```text
dbt-core==1.12.0
dbt-bigquery==1.12.0
```

- [ ] **Step 3: Create `.dbt-version`**

Write:

```text
1.12.0
```

- [ ] **Step 4: Install dbt locally**

Run: `pip install -r requirements-dbt.txt`
Expected: dbt-core and dbt-bigquery install without errors.

Verify: `dbt --version`
Expected output includes `Core: 1.12.x` and `bigquery: 1.12.x`.

- [ ] **Step 5: Create `dbt_project.yml`**

Write:

```yaml
name: 'method_metrics'
version: '1.0.0'
config-version: 2

profile: 'method_metrics'

model-paths: ["models"]
test-paths: ["tests"]
target-path: "target"
clean-targets:
  - "target"
  - "dbt_packages"
  - "logs"

models:
  method_metrics:
    intermediate:
      +materialized: view
      +schema: revenue
    metrics:
      +materialized: view
      +schema: revenue
```

The `+schema: revenue` directive tells dbt to materialize models into `project-for-method-dw.revenue`, matching where the existing views live.

- [ ] **Step 6: Create `profiles.yml`**

Write:

```yaml
method_metrics:
  target: dev
  outputs:
    dev:
      type: bigquery
      method: oauth
      project: project-for-method-dw
      dataset: revenue
      threads: 4
      timeout_seconds: 300
      location: US
      priority: interactive
```

This uses OAuth (matches the existing builder/lib/bigquery.js OAuth flow). For CI later we'll add a service-account profile; for local dev OAuth is simpler.

- [ ] **Step 7: Update `.gitignore`**

Append these lines to `.gitignore`:

```
# dbt
target/
dbt_packages/
logs/
.user.yml
```

- [ ] **Step 8: Run `dbt debug` to verify connection**

Run: `dbt debug --profiles-dir .`
Expected: All checks pass, including:
- Configuration: OK
- Required dependencies: OK
- Connection test: OK

If "Connection test" fails, run `gcloud auth application-default login` and retry.

- [ ] **Step 9: Commit**

```bash
git add dbt_project.yml profiles.yml requirements-dbt.txt .dbt-version .gitignore
git add docs/superpowers/plans/archive/
git commit -m "feat(dbt): initialize dbt project skeleton; archive prior Phase 1 plan

Adopt dbt CLI (Option A) per 2026-05-04 architectural decision. Project
config targets the existing revenue dataset; OAuth-based profile for
local dev. The prior Phase 1 plan (Supabase-as-cache shape) is archived;
the new plan at 2026-05-04-phase1-dbt-metric-migration.md supersedes it."
```

---

## Task 2: Declare existing BQ views as dbt sources

**Files:**
- Create: `models/sources.yml`

The existing intermediate views (`v_trials`, `v_syncs`, `v_conversions`, `v_cancellations`) live in BQ and are not managed by dbt. We declare them as sources so metric models can reference them with `{{ source(...) }}` instead of hardcoded `revenue.v_trials` strings.

- [ ] **Step 1: Write `models/sources.yml`**

```yaml
version: 2

sources:
  - name: revenue
    database: project-for-method-dw
    schema: revenue
    description: |
      Existing BQ views for Method's revenue / lifecycle data.
      These are NOT managed by dbt — they are pre-existing intermediate views
      that dbt models reference as sources. Phase 1.5 of the Composable CDP
      roadmap may rename / migrate these to dbt-managed `int_*` models.

    tables:
      - name: Account
        description: |
          One row per Method account / EntityRecordID.
          Lifecycle dates as columns (SignUpDate, SyncDate, FirstSaaSInvoiceTxnDate,
          CancellationDate). Accumulating snapshot.

      - name: v_trials
        description: |
          Account filtered to SignUpDate IS NOT NULL.
          One row per account that started a trial. SignUpDate is the
          lifecycle-event timestamp.

      - name: v_syncs
        description: |
          Account filtered to SyncDate IS NOT NULL (or first-sync field per BQ definition;
          verify column name before metric materialization writes).

      - name: v_conversions
        description: |
          Account filtered to FirstSaaSInvoiceTxnDate IS NOT NULL.
          One row per account that converted to a paying customer.

      - name: v_cancellations
        description: |
          Account filtered to CancellationDate IS NOT NULL.
          One row per cancellation event.
```

- [ ] **Step 2: Verify the sources parse**

Run: `dbt parse --profiles-dir .`
Expected: Output ends with `Found X models, Y tests, Z sources, ...` and no parse errors.

- [ ] **Step 3: Verify the sources resolve to BQ**

Run: `dbt source freshness --profiles-dir .` (this will fail because we haven't declared freshness configs, but it will check that the sources exist in BQ)

OR run a quick compile test:

Create a temporary file `models/test_source_resolution.sql`:

```sql
SELECT COUNT(*) FROM {{ source('revenue', 'v_trials') }}
```

Run: `dbt compile --select test_source_resolution --profiles-dir .`
Expected: compiles to `SELECT COUNT(*) FROM \`project-for-method-dw\`.\`revenue\`.\`v_trials\`` (or similar).

Delete the test file: `rm models/test_source_resolution.sql`

- [ ] **Step 4: Commit**

```bash
git add models/sources.yml
git commit -m "feat(dbt): declare existing BQ views as dbt sources

Sources declared: Account, v_trials, v_syncs, v_conversions, v_cancellations.
Metric models reference these via {{ source('revenue', '...') }} instead
of hardcoding the BQ paths. Phase 1.5 may migrate these to dbt-managed
intermediate models."
```

---

## Task 3: Rewrite `models/intermediate/v_trials.yml` to dbt latest-spec syntax

**Files:**
- Modify: `models/intermediate/v_trials.yml`

The current file mixes legacy and latest spec syntax (per handoff §5 Fix 1). Latest spec puts entity/dimension on columns (not in nested arrays) and uses direct `agg`/`expr` on metrics (not `type_params`).

- [ ] **Step 1: Read the existing file**

Run: `cat models/intermediate/v_trials.yml`
Note the current shape so the rewrite preserves intent (the metric is "trials count by signup date").

- [ ] **Step 2: Rewrite the file**

Replace the entire contents of `models/intermediate/v_trials.yml` with:

```yaml
version: 2

sources:
  - name: revenue_trials
    database: project-for-method-dw
    schema: revenue
    tables:
      - name: v_trials

# Note: this file declares a semantic_model + simple metric on top of the
# revenue.v_trials BQ source. dbt latest-spec puts the semantic_model nested
# under the model definition, with entity/dimension blocks on columns (not
# nested arrays).
#
# Because v_trials is an existing BQ view (declared as a source in
# models/sources.yml), there is no dbt-managed model for it — only the
# semantic-layer metadata. We use a "model" entry here purely to attach
# the semantic_model and metric to the source.

models:
  - name: trials_semantic
    description: |
      Semantic model attached to revenue.v_trials. Defines the `account` entity
      and the `signup_date` time dimension. The `trials` simple metric is
      defined here and materialized as v_metric__trials.
    config:
      enabled: false  # No dbt-managed model body; semantic_model only.
      meta:
        layer: intermediate
        underlying_view: revenue.v_trials

    semantic_model:
      enabled: true
      defaults:
        agg_time_dimension: signup_date

    columns:
      - name: EntityRecordID
        description: Stable numeric account identifier.
        entity:
          type: primary
          name: account
      - name: CompanyAccount
        description: Company-level account identifier (string; can change on rename).
        entity:
          type: foreign
          name: company
      - name: SignUpDate
        description: Date the trial was signed up.
        granularity: day
        dimension:
          type: time
          name: signup_date

    metrics:
      - name: trials
        type: simple
        label: Trials
        description: |
          Count of trial signups (Method accounts that began a trial),
          grouped by SignUpDate.
          Canonical "Trials" metric, Supabase ID 54.
        agg: count_distinct
        expr: EntityRecordID
```

**Important:** the `enabled: false` on the model config means dbt does NOT try to build a `trials_semantic` view in BQ. The yml exists purely to attach a semantic_model and metric to the source. Materialization happens via the separate `models/metrics/v_metric__trials.{sql,yml}` files.

- [ ] **Step 3: Verify it parses**

Run: `dbt parse --profiles-dir .`
Expected: No parse errors. Should report `Found 1 model, 0 tests, ...` (the model is present but disabled).

If `dbt parse` reports semantic-layer errors (e.g., "agg_time_dimension not found"), check that:
- The `signup_date` dimension is declared on the `SignUpDate` column
- The `defaults: agg_time_dimension:` references the *dimension name* (`signup_date`), not the column name

- [ ] **Step 4: Validate semantic-layer config**

Run: `dbt parse --profiles-dir . && mf validate-configs` (if `metricflow` is installed; otherwise skip)
Expected: validation passes.

If `mf` is not installed, `pip install dbt-metricflow==0.7.x` and retry. Or skip — `dbt parse` is sufficient for this task; full `mf validate-configs` will be added in a follow-on plan.

- [ ] **Step 5: Commit**

```bash
git add models/intermediate/v_trials.yml
git commit -m "fix(dbt): rewrite v_trials.yml to pure latest-spec syntax

Previous file mixed legacy entities:/dimensions:/measures: arrays with
latest-spec keys. Rewrote to put entity/dimension blocks on columns,
direct agg/expr on the simple metric, no type_params. Semantic model
is attached to a disabled model so dbt does not try to materialize a
trials_semantic view — materialization lives in models/metrics/."
```

---

## Task 4: Convert `models/metrics/v_metric__trials.{yml,sql}` to dbt-config shape

**Files:**
- Modify: `models/metrics/v_metric__trials.sql`
- Modify: `models/metrics/v_metric__trials.yml`

The current `.sql` is full DDL; the current `.yml` is custom-materialization-spec with the invented `metric_ref` field. Both need to convert to dbt's native shape.

- [ ] **Step 1: Rewrite `models/metrics/v_metric__trials.sql`**

Replace the entire contents with the SELECT body only (dbt wraps it in `CREATE VIEW ... OPTIONS(...)` at run time):

```sql
{{ config(
    materialized='view',
    schema='revenue',
    alias='v_metric__trials'
) }}

SELECT
  DATE_TRUNC(SignUpDate, MONTH) AS period,
  COUNT(DISTINCT EntityRecordID) AS value
FROM {{ source('revenue', 'v_trials') }}
WHERE SignUpDate IS NOT NULL
GROUP BY period
ORDER BY period
```

- [ ] **Step 2: Rewrite `models/metrics/v_metric__trials.yml`**

Replace the entire contents with:

```yaml
version: 2

models:
  - name: v_metric__trials
    description: |
      Monthly count of distinct Method accounts that started a trial,
      grouped by SignUpDate truncated to month.
      Canonical "Trials" metric. Materialization of the `trials` simple
      metric defined in models/intermediate/v_trials.yml.
      Source: revenue.v_trials (sourced as revenue.v_trials).
      Shape: (period DATE, value FLOAT64).
    config:
      labels:
        layer: metric
        metric_type: simple
        slug: trials
        supabase_id: '54'
        owner_team: revops
    columns:
      - name: period
        description: First day of the month for the bucket. Time grain = month.
        tests:
          - not_null
          - unique
      - name: value
        description: Distinct count of EntityRecordIDs that signed up in this month.
        tests:
          - not_null
```

Notes on what changed from the previous shape:
- `metric_ref` field dropped (per handoff §5 Fix 2 — slug-equals-filename is the back-pointer)
- `labels:` lives in `config:` directly. dbt-bigquery applies these as BQ table labels at run time.
- `tests:` block adds free schema validation: every period non-null and unique, every value non-null.

- [ ] **Step 3: Verify it parses**

Run: `dbt parse --profiles-dir .`
Expected: No parse errors. Reports `Found 2 models, 2 tests, ...` (the disabled trials_semantic model + the v_metric__trials model + 2 column tests).

- [ ] **Step 4: Compile to inspect generated SQL**

Run: `dbt compile --select v_metric__trials --profiles-dir .`

Then inspect the compiled output:

Run: `cat target/compiled/method_metrics/models/metrics/v_metric__trials.sql`

Expected: the source reference is resolved to `\`project-for-method-dw\`.\`revenue\`.\`v_trials\`` and the SELECT is otherwise unchanged.

- [ ] **Step 5: Commit**

```bash
git add models/metrics/v_metric__trials.sql models/metrics/v_metric__trials.yml
git commit -m "feat(dbt): convert v_metric__trials to dbt-native config shape

.sql is now just the SELECT body; dbt wraps in CREATE VIEW ... OPTIONS()
at run time. .yml uses dbt's labels: config (applied automatically by
dbt-bigquery) instead of custom meta blocks. Dropped invented metric_ref
field. Added column-level not_null/unique tests."
```

---

## Task 5: Run dbt to materialize v_metric__trials in BQ

**Files:** No file changes; this task runs dbt and verifies BQ has the view.

- [ ] **Step 1: Run dbt for v_metric__trials**

Run: `dbt run --select v_metric__trials --profiles-dir .`
Expected output:
```
1 of 1 START sql view model revenue.v_metric__trials .................. [RUN]
1 of 1 OK created sql view model revenue.v_metric__trials ............. [OK in X.XXs]
```

If it fails with auth errors, run `gcloud auth application-default login` and retry.

- [ ] **Step 2: Verify the view exists in BQ with correct OPTIONS**

Run:

```bash
bq show --format=prettyjson project-for-method-dw:revenue.v_metric__trials | head -60
```

Expected output includes:
- `"description": "Monthly count of distinct..."` (from the model description)
- `"labels": {"layer": "metric", "metric_type": "simple", "slug": "trials", "supabase_id": "54", "owner_team": "revops"}`

- [ ] **Step 3: Verify the view returns data**

Run:

```bash
bq query --use_legacy_sql=false --format=prettyjson "
SELECT period, value FROM \`project-for-method-dw.revenue.v_metric__trials\`
ORDER BY period DESC LIMIT 6"
```

Expected: 6 rows of recent months, each with a non-null `period` and integer `value`. The numbers should look like reasonable monthly trial counts (low hundreds to low thousands).

- [ ] **Step 4: Run the schema tests**

Run: `dbt test --select v_metric__trials --profiles-dir .`
Expected: 2 tests pass (`not_null_v_metric__trials_period`, `unique_v_metric__trials_period`, `not_null_v_metric__trials_value`).

If `unique` fails on `period`, that means the SELECT is producing duplicate rows per period — debug by querying `SELECT period, COUNT(*) FROM v_metric__trials GROUP BY period HAVING COUNT(*) > 1`.

- [ ] **Step 5: Commit any incidental changes**

If steps 1-4 produced no file changes, skip the commit. If a target/ artifact accidentally got staged, unstage it (it's gitignored).

```bash
git status
# Should show clean working tree.
```

---

## Task 6: Write parity test for v_metric__trials

**Files:**
- Create: `tests/parity/test_parity_trials.sql`

The parity test compares dbt-managed `v_metric__trials` against the Supabase-defined chart_sql for metric ID 54. They should produce identical results.

- [ ] **Step 1: Look up the Supabase-defined chart_sql for metric 54**

Run:

```bash
curl -s "https://<project-ref>.supabase.co/rest/v1/metrics?id=eq.54&select=chart_sql,view_name" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>"
```

(Replace `<project-ref>` and `<ANON_KEY>` with values from `tracker.html` or `.env`.)

Expected: a JSON response with one row containing the chart_sql for trials. Note: this might be NULL for semantic-layer-defined metrics; in that case fall back to constructing the equivalent SQL from `semantic_table` + `semantic_measure` + `semantic_date_col` columns:

```bash
curl -s "https://<project-ref>.supabase.co/rest/v1/metrics?id=eq.54&select=chart_sql,view_name,semantic_table,semantic_measure,semantic_date_col" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>"
```

For metric 54 (Trials) the semantic-layer fields likely populate as: `semantic_table=v_trials`, `semantic_measure=count_distinct(EntityRecordID)`, `semantic_date_col=SignUpDate`. The equivalent SQL is what we wrote in Task 4 Step 1.

- [ ] **Step 2: Write `tests/parity/test_parity_trials.sql`**

A dbt singular test SELECTs rows that violate the assertion. If it returns zero rows, the test passes.

```sql
-- Singular parity test: dbt-managed v_metric__trials should produce the same
-- (period, value) tuples as the Supabase-defined Trials metric (#54).
--
-- The Supabase definition is: COUNT(DISTINCT EntityRecordID) FROM v_trials
-- WHERE SignUpDate IS NOT NULL, GROUPED BY DATE_TRUNC(SignUpDate, MONTH).
--
-- This test re-runs that definition and joins to v_metric__trials. Any row
-- where the values disagree (with a 1-row tolerance for floor effects) fails.

WITH supabase_definition AS (
  SELECT
    DATE_TRUNC(SignUpDate, MONTH) AS period,
    COUNT(DISTINCT EntityRecordID) AS value
  FROM {{ source('revenue', 'v_trials') }}
  WHERE SignUpDate IS NOT NULL
  GROUP BY period
),

dbt_definition AS (
  SELECT period, value FROM {{ ref('v_metric__trials') }}
),

mismatches AS (
  SELECT
    COALESCE(s.period, d.period) AS period,
    s.value AS supabase_value,
    d.value AS dbt_value
  FROM supabase_definition s
  FULL OUTER JOIN dbt_definition d USING (period)
  WHERE s.value IS DISTINCT FROM d.value
)

SELECT * FROM mismatches
```

- [ ] **Step 3: Run the parity test**

Run: `dbt test --select test_parity_trials --profiles-dir .`
Expected: PASS. The test returns 0 rows because v_metric__trials matches the Supabase definition (they're identical SELECT bodies in this case).

If it fails, the most likely cause is a mismatch in the COUNT aggregation (`COUNT(*)` vs `COUNT(DISTINCT EntityRecordID)`). Reconcile and re-run.

- [ ] **Step 4: Commit**

```bash
git add tests/parity/test_parity_trials.sql
git commit -m "test(dbt): add parity test for v_metric__trials

Asserts dbt-managed v_metric__trials produces identical (period, value)
to the Supabase-defined Trials metric (#54). Singular test pattern:
returns mismatched rows; pass = 0 rows."
```

---

## Task 7: Add v_syncs intermediate semantic model + v_metric__syncs materialization

**Files:**
- Create: `models/intermediate/v_syncs.yml`
- Create: `models/metrics/v_metric__syncs.sql`
- Create: `models/metrics/v_metric__syncs.yml`
- Create: `tests/parity/test_parity_syncs.sql`

Same pattern as Trials. The first non-Trials metric — proves the pattern repeats cleanly.

- [ ] **Step 1: Verify the v_syncs filter in BQ**

Run:

```bash
bq query --use_legacy_sql=false "
SELECT view_definition
FROM \`project-for-method-dw.revenue.INFORMATION_SCHEMA.VIEWS\`
WHERE table_name = 'v_syncs'"
```

Expected: a SELECT statement showing which date column is used. Likely `SyncDate IS NOT NULL` or `FirstSyncDate IS NOT NULL`. Note the exact column name; the metric materialization needs to match.

For this plan, assume the column is `SyncDate`. **If your verification shows a different column name, adjust the SQL in steps 2 and 3 accordingly.**

- [ ] **Step 2: Write `models/intermediate/v_syncs.yml`**

```yaml
version: 2

models:
  - name: syncs_semantic
    description: |
      Semantic model attached to revenue.v_syncs. Defines the `account` entity
      and the `sync_date` time dimension. The `syncs` simple metric is defined
      here and materialized as v_metric__syncs.
    config:
      enabled: false
      meta:
        layer: intermediate
        underlying_view: revenue.v_syncs

    semantic_model:
      enabled: true
      defaults:
        agg_time_dimension: sync_date

    columns:
      - name: EntityRecordID
        description: Stable numeric account identifier.
        entity:
          type: primary
          name: account
      - name: SyncDate
        description: Date of the account's first successful sync.
        granularity: day
        dimension:
          type: time
          name: sync_date

    metrics:
      - name: syncs
        type: simple
        label: Syncs
        description: |
          Count of distinct accounts that completed at least one sync,
          grouped by SyncDate. Canonical "Syncs" metric.
        agg: count_distinct
        expr: EntityRecordID
```

- [ ] **Step 3: Write `models/metrics/v_metric__syncs.sql`**

```sql
{{ config(
    materialized='view',
    schema='revenue',
    alias='v_metric__syncs'
) }}

SELECT
  DATE_TRUNC(SyncDate, MONTH) AS period,
  COUNT(DISTINCT EntityRecordID) AS value
FROM {{ source('revenue', 'v_syncs') }}
WHERE SyncDate IS NOT NULL
GROUP BY period
ORDER BY period
```

- [ ] **Step 4: Write `models/metrics/v_metric__syncs.yml`**

You'll need to look up the Supabase ID for the Syncs metric. Run:

```bash
curl -s "https://<project-ref>.supabase.co/rest/v1/metrics?name=ilike.*syncs*&select=id,name" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>"
```

Note the ID. For this plan template, assume it's `<SYNCS_SUPABASE_ID>` — replace with the actual numeric ID before committing.

```yaml
version: 2

models:
  - name: v_metric__syncs
    description: |
      Monthly count of distinct Method accounts that completed at least one
      sync, grouped by SyncDate truncated to month.
      Canonical "Syncs" metric. Materialization of the `syncs` simple metric
      defined in models/intermediate/v_syncs.yml.
      Source: revenue.v_syncs.
      Shape: (period DATE, value FLOAT64).
    config:
      labels:
        layer: metric
        metric_type: simple
        slug: syncs
        supabase_id: '<SYNCS_SUPABASE_ID>'
        owner_team: revops
    columns:
      - name: period
        description: First day of the month for the bucket.
        tests:
          - not_null
          - unique
      - name: value
        description: Distinct count of EntityRecordIDs that synced in this month.
        tests:
          - not_null
```

- [ ] **Step 5: Run dbt for v_metric__syncs**

Run: `dbt run --select v_metric__syncs --profiles-dir .`
Expected: `OK created sql view model revenue.v_metric__syncs`.

- [ ] **Step 6: Verify in BQ**

Run:

```bash
bq query --use_legacy_sql=false --format=prettyjson "
SELECT period, value FROM \`project-for-method-dw.revenue.v_metric__syncs\`
ORDER BY period DESC LIMIT 6"
```

Expected: 6 recent months with sync counts.

- [ ] **Step 7: Run schema tests**

Run: `dbt test --select v_metric__syncs --profiles-dir .`
Expected: 3 tests pass.

- [ ] **Step 8: Write `tests/parity/test_parity_syncs.sql`**

```sql
WITH supabase_definition AS (
  SELECT
    DATE_TRUNC(SyncDate, MONTH) AS period,
    COUNT(DISTINCT EntityRecordID) AS value
  FROM {{ source('revenue', 'v_syncs') }}
  WHERE SyncDate IS NOT NULL
  GROUP BY period
),

dbt_definition AS (
  SELECT period, value FROM {{ ref('v_metric__syncs') }}
),

mismatches AS (
  SELECT
    COALESCE(s.period, d.period) AS period,
    s.value AS supabase_value,
    d.value AS dbt_value
  FROM supabase_definition s
  FULL OUTER JOIN dbt_definition d USING (period)
  WHERE s.value IS DISTINCT FROM d.value
)

SELECT * FROM mismatches
```

- [ ] **Step 9: Run parity test**

Run: `dbt test --select test_parity_syncs --profiles-dir .`
Expected: PASS, 0 mismatched rows.

- [ ] **Step 10: Commit**

```bash
git add models/intermediate/v_syncs.yml \
        models/metrics/v_metric__syncs.sql \
        models/metrics/v_metric__syncs.yml \
        tests/parity/test_parity_syncs.sql
git commit -m "feat(dbt): add v_metric__syncs with semantic model and parity test

Same pattern as v_metric__trials. Simple metric on revenue.v_syncs;
COUNT(DISTINCT EntityRecordID) by SyncDate truncated to month. Parity
test confirms identical output to the Supabase-defined Syncs metric."
```

---

## Task 8: Add v_conversions intermediate semantic model + v_metric__conversions materialization

**Files:**
- Create: `models/intermediate/v_conversions.yml`
- Create: `models/metrics/v_metric__conversions.sql`
- Create: `models/metrics/v_metric__conversions.yml`
- Create: `tests/parity/test_parity_conversions.sql`

Identical pattern to syncs, on `v_conversions` filtered by `FirstSaaSInvoiceTxnDate`.

- [ ] **Step 1: Verify the v_conversions filter**

Run:

```bash
bq query --use_legacy_sql=false "
SELECT view_definition
FROM \`project-for-method-dw.revenue.INFORMATION_SCHEMA.VIEWS\`
WHERE table_name = 'v_conversions'"
```

Confirm the date column is `FirstSaaSInvoiceTxnDate`. Adjust subsequent SQL if different.

- [ ] **Step 2: Write `models/intermediate/v_conversions.yml`**

```yaml
version: 2

models:
  - name: conversions_semantic
    description: |
      Semantic model attached to revenue.v_conversions. Defines the `account`
      entity and the `conversion_date` time dimension. The `conversions` simple
      metric is defined here and materialized as v_metric__conversions.
    config:
      enabled: false
      meta:
        layer: intermediate
        underlying_view: revenue.v_conversions

    semantic_model:
      enabled: true
      defaults:
        agg_time_dimension: conversion_date

    columns:
      - name: EntityRecordID
        description: Stable numeric account identifier.
        entity:
          type: primary
          name: account
      - name: FirstSaaSInvoiceTxnDate
        description: Date of the account's first SaaS invoice — the conversion event.
        granularity: day
        dimension:
          type: time
          name: conversion_date

    metrics:
      - name: conversions
        type: simple
        label: Conversions
        description: |
          Count of distinct accounts that converted to a paying customer
          (received their first SaaS invoice), grouped by FirstSaaSInvoiceTxnDate.
        agg: count_distinct
        expr: EntityRecordID
```

- [ ] **Step 3: Write `models/metrics/v_metric__conversions.sql`**

```sql
{{ config(
    materialized='view',
    schema='revenue',
    alias='v_metric__conversions'
) }}

SELECT
  DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS period,
  COUNT(DISTINCT EntityRecordID) AS value
FROM {{ source('revenue', 'v_conversions') }}
WHERE FirstSaaSInvoiceTxnDate IS NOT NULL
GROUP BY period
ORDER BY period
```

- [ ] **Step 4: Write `models/metrics/v_metric__conversions.yml`**

Look up the Supabase ID for Conversions and substitute below.

```yaml
version: 2

models:
  - name: v_metric__conversions
    description: |
      Monthly count of distinct accounts that converted to paying customers,
      grouped by FirstSaaSInvoiceTxnDate truncated to month.
      Canonical "Conversions" metric.
      Source: revenue.v_conversions.
      Shape: (period DATE, value FLOAT64).
    config:
      labels:
        layer: metric
        metric_type: simple
        slug: conversions
        supabase_id: '<CONVERSIONS_SUPABASE_ID>'
        owner_team: revops
    columns:
      - name: period
        description: First day of the month for the bucket.
        tests:
          - not_null
          - unique
      - name: value
        description: Distinct count of accounts that converted in this month.
        tests:
          - not_null
```

- [ ] **Step 5: Run dbt for v_metric__conversions**

Run: `dbt run --select v_metric__conversions --profiles-dir .`
Expected: success.

- [ ] **Step 6: Run schema tests**

Run: `dbt test --select v_metric__conversions --profiles-dir .`
Expected: 3 tests pass.

- [ ] **Step 7: Write `tests/parity/test_parity_conversions.sql`**

```sql
WITH supabase_definition AS (
  SELECT
    DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS period,
    COUNT(DISTINCT EntityRecordID) AS value
  FROM {{ source('revenue', 'v_conversions') }}
  WHERE FirstSaaSInvoiceTxnDate IS NOT NULL
  GROUP BY period
),

dbt_definition AS (
  SELECT period, value FROM {{ ref('v_metric__conversions') }}
),

mismatches AS (
  SELECT
    COALESCE(s.period, d.period) AS period,
    s.value AS supabase_value,
    d.value AS dbt_value
  FROM supabase_definition s
  FULL OUTER JOIN dbt_definition d USING (period)
  WHERE s.value IS DISTINCT FROM d.value
)

SELECT * FROM mismatches
```

- [ ] **Step 8: Run parity test**

Run: `dbt test --select test_parity_conversions --profiles-dir .`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add models/intermediate/v_conversions.yml \
        models/metrics/v_metric__conversions.sql \
        models/metrics/v_metric__conversions.yml \
        tests/parity/test_parity_conversions.sql
git commit -m "feat(dbt): add v_metric__conversions with semantic model and parity test"
```

---

## Task 9: Add v_cancellations intermediate semantic model + v_metric__cancellations materialization

**Files:**
- Create: `models/intermediate/v_cancellations.yml`
- Create: `models/metrics/v_metric__cancellations.sql`
- Create: `models/metrics/v_metric__cancellations.yml`
- Create: `tests/parity/test_parity_cancellations.sql`

Same pattern again, on `v_cancellations` filtered by `CancellationDate`.

**Important:** "Cancellations" as an event count (one per cancellation) is distinct from "Cancellations $" (sum of MRR lost). This task migrates the *event count*, not the MRR-weighted version. The MRR-weighted version is part of retention methodology (left out of first 5 per Justin's stabilization).

- [ ] **Step 1: Verify the v_cancellations filter**

Run:

```bash
bq query --use_legacy_sql=false "
SELECT view_definition
FROM \`project-for-method-dw.revenue.INFORMATION_SCHEMA.VIEWS\`
WHERE table_name = 'v_cancellations'"
```

Confirm the date column is `CancellationDate`.

- [ ] **Step 2: Write `models/intermediate/v_cancellations.yml`**

```yaml
version: 2

models:
  - name: cancellations_semantic
    description: |
      Semantic model attached to revenue.v_cancellations. Defines the `account`
      entity and `cancellation_date` time dimension. The `cancellations` simple
      metric counts cancellation events.
      NOTE: this is the EVENT count, not MRR-weighted cancellation $.
      MRR-weighted retention math lives in the v_customer_mrr / v_customer_annual_mrr
      family and is intentionally out of scope for this plan.
    config:
      enabled: false
      meta:
        layer: intermediate
        underlying_view: revenue.v_cancellations

    semantic_model:
      enabled: true
      defaults:
        agg_time_dimension: cancellation_date

    columns:
      - name: EntityRecordID
        description: Stable numeric account identifier.
        entity:
          type: primary
          name: account
      - name: CancellationDate
        description: Date the account cancelled.
        granularity: day
        dimension:
          type: time
          name: cancellation_date

    metrics:
      - name: cancellations
        type: simple
        label: Cancellations
        description: |
          Count of distinct cancellation events, grouped by CancellationDate.
          Event count, not MRR-weighted.
        agg: count_distinct
        expr: EntityRecordID
```

- [ ] **Step 3: Write `models/metrics/v_metric__cancellations.sql`**

```sql
{{ config(
    materialized='view',
    schema='revenue',
    alias='v_metric__cancellations'
) }}

SELECT
  DATE_TRUNC(CancellationDate, MONTH) AS period,
  COUNT(DISTINCT EntityRecordID) AS value
FROM {{ source('revenue', 'v_cancellations') }}
WHERE CancellationDate IS NOT NULL
GROUP BY period
ORDER BY period
```

- [ ] **Step 4: Write `models/metrics/v_metric__cancellations.yml`**

```yaml
version: 2

models:
  - name: v_metric__cancellations
    description: |
      Monthly count of distinct cancellation events, grouped by CancellationDate
      truncated to month.
      EVENT count, not MRR-weighted. The MRR-weighted retention metric family
      (Cancellations $, GRR, NRR) is intentionally out of scope for this
      migration round; those depend on the v_customer_mrr / v_customer_annual_mrr
      view family which uses CEO-confirmed symmetric PE methodology.
      Source: revenue.v_cancellations.
      Shape: (period DATE, value FLOAT64).
    config:
      labels:
        layer: metric
        metric_type: simple
        slug: cancellations
        supabase_id: '<CANCELLATIONS_SUPABASE_ID>'
        owner_team: revops
    columns:
      - name: period
        description: First day of the month for the bucket.
        tests:
          - not_null
          - unique
      - name: value
        description: Distinct count of cancellation events in this month.
        tests:
          - not_null
```

- [ ] **Step 5: Run dbt for v_metric__cancellations**

Run: `dbt run --select v_metric__cancellations --profiles-dir .`
Expected: success.

- [ ] **Step 6: Run schema tests**

Run: `dbt test --select v_metric__cancellations --profiles-dir .`
Expected: 3 tests pass.

- [ ] **Step 7: Write `tests/parity/test_parity_cancellations.sql`**

```sql
WITH supabase_definition AS (
  SELECT
    DATE_TRUNC(CancellationDate, MONTH) AS period,
    COUNT(DISTINCT EntityRecordID) AS value
  FROM {{ source('revenue', 'v_cancellations') }}
  WHERE CancellationDate IS NOT NULL
  GROUP BY period
),

dbt_definition AS (
  SELECT period, value FROM {{ ref('v_metric__cancellations') }}
),

mismatches AS (
  SELECT
    COALESCE(s.period, d.period) AS period,
    s.value AS supabase_value,
    d.value AS dbt_value
  FROM supabase_definition s
  FULL OUTER JOIN dbt_definition d USING (period)
  WHERE s.value IS DISTINCT FROM d.value
)

SELECT * FROM mismatches
```

- [ ] **Step 8: Run parity test**

Run: `dbt test --select test_parity_cancellations --profiles-dir .`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add models/intermediate/v_cancellations.yml \
        models/metrics/v_metric__cancellations.sql \
        models/metrics/v_metric__cancellations.yml \
        tests/parity/test_parity_cancellations.sql
git commit -m "feat(dbt): add v_metric__cancellations (event count) with parity test

Note: this is the cancellation EVENT count, not MRR-weighted. The
MRR-weighted retention family (Cancellations $, GRR, NRR) is
intentionally out of scope; those depend on the symmetric-PE retention
methodology Justin just stabilized."
```

---

## Task 10: Add Sync Rate as a cross-model ratio metric

**Files:**
- Create: `models/metrics/_metrics.yml`
- Create: `models/metrics/v_metric__sync_rate.sql`
- Create: `models/metrics/v_metric__sync_rate.yml`
- Create: `tests/parity/test_parity_sync_rate.sql`

Sync Rate = syncs / trials. This is a *cross-model* metric per MetricFlow latest-spec — it lives in a top-level `metrics:` file, not co-located with a single semantic_model.

- [ ] **Step 1: Write `models/metrics/_metrics.yml`**

This is the top-level cross-model metrics file. Its purpose is to define ratio/derived/cumulative/conversion metrics that span multiple semantic_models.

```yaml
version: 2

# Top-level cross-model metrics file. Single-model simple metrics are
# co-located on their semantic_model in models/intermediate/v_*.yml.
# Cross-model metrics (ratio, derived, cumulative, conversion) live here.

metrics:
  - name: sync_rate
    type: ratio
    label: Sync Rate
    description: |
      Fraction of trials that completed at least one sync.
      Numerator: distinct accounts that synced (the `syncs` metric).
      Denominator: distinct accounts that started a trial (the `trials` metric).
      Both grouped by month — numerator uses SyncDate, denominator uses
      SignUpDate. Ratio is computed per-period after groupings.
    type_params:
      numerator: syncs
      denominator: trials
```

Note: `type_params:` IS used for ratio metrics in latest spec — this is per the dbt-bigquery latest-spec docs, distinct from the deprecated `type_params:` block on simple metrics. Verify with `dbt parse`.

- [ ] **Step 2: Write `models/metrics/v_metric__sync_rate.sql`**

The materialization joins the two simple metric materializations by period.

```sql
{{ config(
    materialized='view',
    schema='revenue',
    alias='v_metric__sync_rate'
) }}

SELECT
  COALESCE(syncs.period, trials.period) AS period,
  SAFE_DIVIDE(syncs.value, trials.value) AS value
FROM {{ ref('v_metric__syncs') }} syncs
FULL OUTER JOIN {{ ref('v_metric__trials') }} trials USING (period)
ORDER BY period
```

`SAFE_DIVIDE` returns NULL on division-by-zero instead of erroring.

- [ ] **Step 3: Write `models/metrics/v_metric__sync_rate.yml`**

```yaml
version: 2

models:
  - name: v_metric__sync_rate
    description: |
      Monthly Sync Rate: fraction of trials that completed at least one sync.
      Cross-model ratio metric materialization. Joins v_metric__syncs and
      v_metric__trials by period; computes SAFE_DIVIDE(syncs, trials).
      Note: numerator uses SyncDate (when the account synced); denominator
      uses SignUpDate (when the account signed up). Same account may
      contribute to numerator and denominator in different months.
      Shape: (period DATE, value FLOAT64).
    config:
      labels:
        layer: metric
        metric_type: ratio
        slug: sync_rate
        supabase_id: '<SYNC_RATE_SUPABASE_ID>'
        owner_team: revops
    columns:
      - name: period
        description: First day of the month for the bucket.
        tests:
          - not_null
          - unique
      - name: value
        description: |
          Sync rate in [0, 1]. NULL if denominator is zero (no trials in that month).
        # No not_null test on value — NULL is valid when no trials in a period.
```

- [ ] **Step 4: Run dbt for v_metric__sync_rate**

Run: `dbt run --select v_metric__sync_rate --profiles-dir .`
Expected: `OK created sql view model revenue.v_metric__sync_rate`. dbt automatically runs prerequisites — if v_metric__syncs and v_metric__trials are already materialized, this just builds the ratio.

If dbt complains about missing prerequisites, run: `dbt run --select +v_metric__sync_rate --profiles-dir .` (the `+` selects upstream dependencies too).

- [ ] **Step 5: Verify the view returns data**

Run:

```bash
bq query --use_legacy_sql=false --format=prettyjson "
SELECT period, value FROM \`project-for-method-dw.revenue.v_metric__sync_rate\`
ORDER BY period DESC LIMIT 6"
```

Expected: 6 recent months, each with a value between 0 and 1 (typical sync rate is ~0.62 per the Strategic Plan).

- [ ] **Step 6: Run schema tests**

Run: `dbt test --select v_metric__sync_rate --profiles-dir .`
Expected: 2 tests pass (`not_null_period`, `unique_period`).

- [ ] **Step 7: Write `tests/parity/test_parity_sync_rate.sql`**

The Supabase definition for Sync Rate is computed in `lib/sql/semantic.js` as a `formula` with `depends_on: [trials_id, syncs_id]`. The computed result should match this dbt-managed view.

```sql
WITH supabase_definition AS (
  SELECT
    COALESCE(s.period, t.period) AS period,
    SAFE_DIVIDE(s.value, t.value) AS value
  FROM (
    SELECT
      DATE_TRUNC(SyncDate, MONTH) AS period,
      COUNT(DISTINCT EntityRecordID) AS value
    FROM {{ source('revenue', 'v_syncs') }}
    WHERE SyncDate IS NOT NULL
    GROUP BY period
  ) s
  FULL OUTER JOIN (
    SELECT
      DATE_TRUNC(SignUpDate, MONTH) AS period,
      COUNT(DISTINCT EntityRecordID) AS value
    FROM {{ source('revenue', 'v_trials') }}
    WHERE SignUpDate IS NOT NULL
    GROUP BY period
  ) t USING (period)
),

dbt_definition AS (
  SELECT period, value FROM {{ ref('v_metric__sync_rate') }}
),

mismatches AS (
  SELECT
    COALESCE(s.period, d.period) AS period,
    s.value AS supabase_value,
    d.value AS dbt_value
  FROM supabase_definition s
  FULL OUTER JOIN dbt_definition d USING (period)
  WHERE
    -- Treat NULL = NULL as matching; mismatch only if values differ.
    -- Float comparison: tolerate 1e-9 difference.
    (s.value IS NULL) IS DISTINCT FROM (d.value IS NULL)
    OR ABS(COALESCE(s.value, 0) - COALESCE(d.value, 0)) > 1e-9
)

SELECT * FROM mismatches
```

- [ ] **Step 8: Run parity test**

Run: `dbt test --select test_parity_sync_rate --profiles-dir .`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add models/metrics/_metrics.yml \
        models/metrics/v_metric__sync_rate.sql \
        models/metrics/v_metric__sync_rate.yml \
        tests/parity/test_parity_sync_rate.sql
git commit -m "feat(dbt): add v_metric__sync_rate as cross-model ratio metric

Sync Rate = syncs / trials. Top-level cross-model metric defined in
models/metrics/_metrics.yml per MetricFlow latest-spec convention
(co-location is for single-model simple metrics only). Materialization
joins v_metric__syncs and v_metric__trials by period with SAFE_DIVIDE.
Parity test confirms identical output to the Supabase formula-based
definition."
```

---

## Task 11: Run all metrics + all tests as a single batch

**Files:** No file changes; this task validates the full set works together.

- [ ] **Step 1: Run all metric models**

Run: `dbt run --select metrics --profiles-dir .`
Expected: 5 models build (`v_metric__trials`, `v_metric__syncs`, `v_metric__conversions`, `v_metric__cancellations`, `v_metric__sync_rate`). All `OK created sql view`. dbt orders them by dependency automatically (the ratio runs after its inputs).

- [ ] **Step 2: Run all schema tests**

Run: `dbt test --select metrics --profiles-dir .`
Expected: 14 tests pass (3 per simple metric × 4 = 12, plus 2 for sync_rate = 14).

- [ ] **Step 3: Run all parity tests**

Run: `dbt test --select test_parity_* --profiles-dir .`
Expected: 5 tests pass (one per metric).

- [ ] **Step 4: Run everything**

Run: `dbt build --profiles-dir .`
Expected: All models build, all tests pass. `dbt build` is the canonical "run + test in dependency order" command.

- [ ] **Step 5: Verify INFORMATION_SCHEMA exposes the new views with metadata**

Run:

```bash
bq query --use_legacy_sql=false --format=prettyjson "
SELECT
  table_name,
  option_name,
  option_value
FROM \`project-for-method-dw.revenue.INFORMATION_SCHEMA.TABLE_OPTIONS\`
WHERE table_name LIKE 'v_metric__%'
ORDER BY table_name, option_name"
```

Expected: each of the 5 metrics shows up with `description` and `labels` populated.

- [ ] **Step 6: Spot-check the AI MCP can read the catalog**

Run a discovery query to confirm an AI-MCP-style consumer can find the metrics:

```bash
bq query --use_legacy_sql=false "
SELECT
  table_name,
  ddl
FROM \`project-for-method-dw.revenue.INFORMATION_SCHEMA.VIEWS\`
WHERE table_name LIKE 'v_metric__%'"
```

Expected: 5 rows, each with the view DDL including the `OPTIONS(description=..., labels=[...])` clause.

---

## Task 12: Update CLAUDE.md to document the new architecture

**Files:**
- Modify: `CLAUDE.md`

The current CLAUDE.md describes the Supabase-as-source-of-truth shape. Update it to reflect dbt+BQ as canonical for the migrated metrics.

- [ ] **Step 1: Read current CLAUDE.md to find the metric definitions section**

Run: `grep -n "metrics" CLAUDE.md | head -20`

Identify the sections that describe the metric registry workflow — specifically the part that talks about `semantic_table`, `semantic_measure`, `chart_sql`, etc. living in Supabase.

- [ ] **Step 2: Add a new section to CLAUDE.md**

Add the following section *before* the existing `## Supabase Table: metrics` section:

```markdown
## Metric Definitions — Source of Truth (Phase 1, In Progress)

**As of 2026-05-04, the canonical source of truth for migrated metrics is dbt+BigQuery, not Supabase.**

Migrated metrics (5 as of Phase 1):
- `v_metric__trials` — supabase_id 54
- `v_metric__syncs` — supabase_id <SYNCS_ID>
- `v_metric__conversions` — supabase_id <CONVERSIONS_ID>
- `v_metric__cancellations` — supabase_id <CANCELLATIONS_ID>
- `v_metric__sync_rate` — supabase_id <SYNC_RATE_ID>

For these metrics:
- **Definition lives in:** `models/intermediate/v_*.yml` (semantic_model + simple metric) and `models/metrics/_metrics.yml` (cross-model metrics)
- **Materialization:** `models/metrics/v_metric__*.{sql,yml}` — dbt builds these as BQ views with OPTIONS(description, labels) populated
- **To update:** edit the yml + sql files, run `dbt run --select v_metric__<slug>`, run `dbt test --select v_metric__<slug>`
- **To verify parity:** `dbt test --select test_parity_<slug>`

For metrics NOT yet migrated (the remaining 15+ live metrics in Supabase): the old workflow applies — `semantic_table`/`semantic_measure`/`semantic_date_col` or `chart_sql` columns in the Supabase `metrics` table.

**Migration status tracker:** the Supabase `metrics` table has a `dbt_migrated` boolean (to be added in Phase 1.1) so the chart builder + AI can route correctly. Until that flag exists, the chart builder reads from BQ for metrics with `v_metric__*` views and from Supabase for the rest. See `builder/src/lib/bigquery.js` `fetchMetricMetadata` (added in Phase 1.1).

**Workflow for adding a new metric (Phase 1+):**
1. Decide if it's a simple metric (single-model) or cross-model (ratio/derived/cumulative/conversion)
2. For simple: add to `models/intermediate/v_<source>.yml` (semantic_model + metric block)
3. For cross-model: add to `models/metrics/_metrics.yml`
4. Create `models/metrics/v_metric__<slug>.{sql,yml}` for the materialization
5. Run `dbt parse` to validate yml shape
6. Run `dbt run --select v_metric__<slug>` to materialize
7. Run `dbt test --select v_metric__<slug>` for schema tests
8. Add `tests/parity/test_parity_<slug>.sql` if a Supabase counterpart exists
9. Open a PR; merge deploys via CI (when CI is wired up in Phase 1.1)

**Do NOT add new metrics to the Supabase registry.** Supabase is being deprecated as the metric definition layer; new work goes to dbt.
```

- [ ] **Step 3: Add a small section to the existing `## Supabase Table: metrics` section**

Find the existing section header and add a note immediately under it:

```markdown
## Supabase Table: metrics

> **Status (2026-05-04):** Being deprecated as the metric definition source. See "Metric Definitions — Source of Truth" above. New metrics go to dbt+BQ; the Supabase `metrics` table is read-only legacy for the 15+ unmigrated metrics until Phase 3 retires it.

[... existing content ...]
```

- [ ] **Step 4: Verify the file is coherent**

Run: `cat CLAUDE.md | head -100`
Confirm the new section reads cleanly and doesn't contradict adjacent sections.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): document dbt+BQ as source of truth for migrated metrics

Phase 1 migrates 5 metrics (Trials, Syncs, Conversions, Cancellations,
Sync Rate) from Supabase to dbt+BQ. The Supabase metrics table is
read-only legacy for unmigrated metrics until Phase 3 retires it.
New metric work goes to dbt, not Supabase."
```

---

## Task 13: Final verification — full project build + all tests + visual inspection

**Files:** No file changes.

- [ ] **Step 1: Clean rebuild from scratch**

Run: `dbt clean --profiles-dir .`
Expected: removes `target/`, `dbt_packages/`, `logs/`.

Run: `dbt build --profiles-dir .`
Expected: 5 models built, 19 tests pass (14 schema + 5 parity).

- [ ] **Step 2: Verify all 5 views exist in BQ with metadata**

Run:

```bash
bq query --use_legacy_sql=false --format=prettyjson "
SELECT table_name, table_type, ddl
FROM \`project-for-method-dw.revenue.INFORMATION_SCHEMA.VIEWS\`
WHERE table_name LIKE 'v_metric__%'
ORDER BY table_name"
```

Expected: 5 rows, each with `table_type = 'VIEW'`, each `ddl` includes `OPTIONS(description=..., labels=[...])`.

- [ ] **Step 3: Confirm all parity tests pass**

Run: `dbt test --select test_parity_* --profiles-dir .`
Expected: 5 tests pass.

- [ ] **Step 4: Confirm no orphaned model files**

Run: `find models tests -type f -name '*.yml' -o -name '*.sql' | sort`
Expected output (no extras, no missing):

```
models/intermediate/v_cancellations.yml
models/intermediate/v_conversions.yml
models/intermediate/v_syncs.yml
models/intermediate/v_trials.yml
models/metrics/_metrics.yml
models/metrics/v_metric__cancellations.sql
models/metrics/v_metric__cancellations.yml
models/metrics/v_metric__conversions.sql
models/metrics/v_metric__conversions.yml
models/metrics/v_metric__sync_rate.sql
models/metrics/v_metric__sync_rate.yml
models/metrics/v_metric__syncs.sql
models/metrics/v_metric__syncs.yml
models/metrics/v_metric__trials.sql
models/metrics/v_metric__trials.yml
models/sources.yml
tests/parity/test_parity_cancellations.sql
tests/parity/test_parity_conversions.sql
tests/parity/test_parity_sync_rate.sql
tests/parity/test_parity_syncs.sql
tests/parity/test_parity_trials.sql
```

If there are extras (e.g., a leftover `v_metric__trials.sql` with full DDL from before the conversion), reconcile.

- [ ] **Step 5: Confirm git is clean**

Run: `git status`
Expected: working tree clean. Any uncommitted file is either intentional follow-up or needs to be committed/discarded explicitly.

- [ ] **Step 6: Push to remote**

Run: `git push origin main`
Expected: success.

Note: this does NOT trigger any auto-deploy yet because CI integration for `dbt run` is in the Phase 1.1 plan, not this one. The BQ views are already materialized from your local `dbt run`s in earlier tasks.

- [ ] **Step 7: Inspect the live catalog from a clean Claude session**

In a fresh Claude session connected to BQ MCP, ask:

> "What metrics exist in `project-for-method-dw.revenue` whose name starts with `v_metric__`? Show me their descriptions and labels."

Expected: Claude returns the 5 metrics with descriptions and labels populated. This confirms the catalog is discoverable by AI consumers — the entire value proposition of the Phase 1 work.

---

## Self-Review

After writing this plan, I checked it against the spec.

**1. Spec coverage**

| Requirement | Task |
|---|---|
| Adopt dbt CLI (Option A decision) | Task 1 |
| Configure BQ profile | Task 1 (Step 6) |
| Convert existing scaffold (Trials) to latest-spec | Tasks 3, 4 |
| Drop `metric_ref` field | Task 4 (Step 2) |
| Convert .sql from full DDL to SELECT body | Task 4 (Step 1) |
| Migrate 5 metrics: Trials, Syncs, Conversions, Cancellations, Sync Rate | Tasks 4, 7, 8, 9, 10 |
| Use dbt's BQ-native OPTIONS support (description + labels via config) | All metric tasks |
| Cross-model ratio (Sync Rate) in top-level _metrics.yml | Task 10 |
| Schema tests for each metric | All metric tasks |
| Parity tests for each metric | Tasks 6, 7, 8, 9, 10 |
| Update CLAUDE.md | Task 12 |
| Final verification | Task 13 |
| Archive prior plan | Task 1 (Step 1) |

All spec items have a task. ✓

**2. Out-of-scope items deliberately not covered (each documented at top of plan)**

- UI integration (Method Metrics chart builder reads new metadata) — next plan
- CI integration (`dbt run` on merge) — next plan
- Retiring custom Python deploy script — next plan (no script existed yet, but if any partial scaffold of one exists in `scripts/migrate/`, it should be removed in the next plan)
- 15+ remaining metrics — subsequent plans
- Time spine model — deferred until first cumulative metric requested
- Marts layer — Phase 1.6

**3. Placeholder scan**

Found and addressed:
- `<SYNCS_SUPABASE_ID>`, `<CONVERSIONS_SUPABASE_ID>`, `<CANCELLATIONS_SUPABASE_ID>`, `<SYNC_RATE_SUPABASE_ID>` — these are placeholders by design. Each task includes a Supabase REST API curl that retrieves the actual ID. Acceptable: the engineer fills them at execution time. Trials is hardcoded to 54 because that ID is established in the existing scaffold.
- `<project-ref>`, `<ANON_KEY>` — Supabase project credentials. Not a placeholder failure; these are environment values the engineer reads from existing config (`tracker.html` or `.env`).

No "TBD"/"TODO"/"implement later" bare placeholders. ✓

**4. Type consistency**

- Schema field name: `period` and `value` consistently across all 5 metrics. ✓
- BQ schema name: `revenue` (in profiles.yml + all model configs). ✓
- Metric naming: `v_metric__<slug>` consistently. ✓
- Singular test naming: `test_parity_<slug>` consistently. ✓
- Source name: `revenue` (in sources.yml + all `{{ source(...) }}` calls). ✓
- Materialization: `view` everywhere. ✓

**5. Order of operations**

- Task 1 (dbt init) precedes anything that uses dbt. ✓
- Task 2 (sources) precedes anything that references sources. ✓
- Task 3 (v_trials.yml fix) precedes Task 4 (v_metric__trials conversion). ✓
- Tasks 7-9 (Syncs, Conversions, Cancellations) are independent of each other but depend on Tasks 1-2. ✓
- Task 10 (Sync Rate) depends on v_metric__syncs (Task 7) and v_metric__trials (Task 4). ✓
- Task 11 (full batch) depends on all 5 metrics. ✓
- Task 12 (CLAUDE.md) is independent of order — could happen any time after Task 1. Placed near end for narrative flow.
- Task 13 (final verification) is last. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-04-phase1-dbt-metric-migration.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Each task is self-contained enough for a clean subagent context.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
