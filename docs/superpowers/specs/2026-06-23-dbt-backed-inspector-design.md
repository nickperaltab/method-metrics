# dbt-backed Metric Inspector — design (Phase 1)

Date: 2026-06-23
Status: design — pending user review
Owner: Nic

## What this is

Make every metric and chart in the builder app traceable back to dbt. A user
clicking "see the derivation" on any surface should see the model's
description, its lineage, the SQL, the tests that gate it, and a link to the
source `.sql` on GitHub — sourced from dbt, not from drift-prone cached copies.

Phase 1 builds the mechanism and wires the cohort-survival chart as its first
consumer. Phase 2 (separate spec, right after) sweeps every registry metric
through the same resolver.

## The core decision

**Link by pointer, don't copy.** The Supabase `metrics` registry stays the
catalog (status, priority, ownership, the AI's menu). It does NOT store
derivation content — that is exactly what drifted before (the dead
`view_definition` column). dbt's `manifest.json` is the single source of truth
for everything derivational. Each surface carries a small pointer to a dbt
model; one resolver turns that pointer into dbt metadata.

```
target/manifest.json ──(prebuild)──► builder/public/dbt-models.json ──► useDbtModel(name) ──► MetricInspector "dbt" panel
   (dbt, committed)      slim projection      (served at /builder/)        resolver hook       lineage · SQL · tests · GitHub
```

## Why dbt manifest, not the live BQ DDL

The current inspector ("Definition" panel) calls `useViewDefinition`, which
fetches a view's compiled DDL live from BQ `INFORMATION_SCHEMA`. That requires
a BQ login and returns only the compiled view SQL. `manifest.json` already
holds, per model: `description`, `depends_on`/`refs` (full lineage), columns
with their tests, `compiled_code`, and `original_file_path`. It is richer and
needs no auth. Phase 1 adds the dbt panel alongside the live-DDL panel; Phase 2
decides whether to retire the latter.

## Components

### 1. Projection script — `scripts/build_dbt_models_json.mjs`

A Node script (no warehouse access) that reads `target/manifest.json` and emits
`builder/public/dbt-models.json`. One entry per `model.*` node in the `revenue`
and `revenue_metrics` schemas, keyed by BOTH `name` and `relation_name` for
robust lookup:

```json
{
  "int_customer_survival": {
    "name": "int_customer_survival",
    "relation_name": "`project-for-method-dw`.`revenue`.`int_customer_survival`",
    "description": "Cohort survival by first-pay vintage, ...",
    "original_file_path": "models/intermediate/int_customer_survival.sql",
    "refs": ["int_customer_mrr"],
    "sources": ["revenue.Funnel"],
    "columns": [{ "name": "vintage", "description": "...", "tests": ["not_null"] }],
    "compiled_sql": "WITH mrr AS (...) SELECT ..."
  }
}
```

- `refs`/`sources` come from `depends_on.nodes`, mapped to bare model/source
  names for display + click-through.
- `columns[].tests` are gathered from `test.*` nodes whose `depends_on`
  includes this model + column (the manifest links them).
- Runs as a `prebuild` npm script so `npm run build` always regenerates it;
  the output ships in `dist/` and is served at `/method-metrics/builder/dbt-models.json`.

### 2. Freshness contract + CI guard

The projection is only as fresh as the committed `target/manifest.json`. dbt
runs already rewrite it (it is tracked). Rule: **commit `target/manifest.json`
after dbt model changes.** A CI check (`dbt parse` then `git diff --exit-code
target/manifest.json`) fails the build if the committed manifest is stale.
`dbt parse` needs only the project files, not BQ, so it runs on the Pages
runner. (If wiring `dbt parse` into CI proves heavy, fall back to a documented
manual step; decided in the plan.)

### 3. Resolver — `builder/src/lib/useDbtModel.js`

Loads `dbt-models.json` once (cached singleton, like `schemaCache`), exposes
`useDbtModel(nameOrRelation)` returning `{ model, loading, error }`. Pure
lookup, no BQ. A `dbtModelLink(original_file_path)` helper builds the GitHub
URL: `https://github.com/nickperaltab/method-metrics/blob/main/<path>`.

### 4. Inspector dbt panel — `MetricInspector`

`MetricInspector` currently keys on `metricId` (registry) or `customInfo`
(inline custom SQL). Add a third mode: `dbtModel` (a model name). The new panel
renders: description, an upstream **lineage list** (each ref clickable to open
that model's panel — walks `int_customer_survival` → `int_customer_mrr` →
`Funnel`), the compiled SQL, the model's **tests** (so "what's verified" is
visible), and a **View on GitHub** link. Registry metrics resolve `view_name` →
model alias; if no model matches, the panel degrades gracefully to today's
behavior.

### 5. Cohort pilot wiring

`Scorecard.jsx` owns `setInspected`. Thread an `onInspect` handler into the
`customSections` render and down to `CohortSurvivalChart`. The chart gets a
small **ⓘ derivation** affordance (top-right of the chart, not the whole chart —
so it doesn't fight ECharts tooltips/legend). Clicking it calls
`onInspect({ dbtModel: 'int_customer_survival' })`, opening the inspector's dbt
panel.

## Testing

- `scripts/build_dbt_models_json.mjs`: unit test with a small `manifest.json`
  fixture → assert the slim projection shape, ref/source mapping, and
  column-test gathering.
- `useDbtModel`: unit test lookup by name and by relation_name, and the
  missing-model fallback (returns null, no throw).
- `dbtModelLink`: unit test the GitHub URL construction.
- Inspector panel + ⓘ affordance: presentational; verified via build + the
  existing suite. Live render needs an authed browser (deferred to deploy).

## Scope guard (NOT in Phase 1)

- No mass registry migration — that is Phase 2.
- The live-DDL (`useViewDefinition`) panel stays; not retired yet.
- No handling of metrics without a dbt model beyond graceful degradation.
- No new dbt models, no BQ changes.

## Phase 2 (separate spec, right after)

Sweep every registry metric to resolve through dbt: map all `view_name`s to
models, decide the fate of the live-DDL panel, and explicitly handle metrics
with no dbt model (e.g. Justin's hand-written `revenue` views — flag as
"non-dbt, unverified" rather than silently blank).

## Open questions

- None blocking. The `dbt parse` CI-guard vs documented-manual-step is resolved
  at plan time based on runner constraints.
