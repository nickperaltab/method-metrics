# dbt Conventions — Mapping to method-metrics

**Date:** 2026-05-04
**Purpose:** Reference doc to inform the Phase 1 plan rewrite. Two questions: (1) is there a canonical engineering-RevOps / analytics-engineering skill we should adopt, and (2) how does jaffle-shop (dbt's reference project) lay out files, and what's the equivalent in our stack?

Companion docs: `docs/primitives-vs-derivatives.md` (the layer-cake framework, already written), `docs/superpowers/specs/2026-05-04-composable-cdp-roadmap.md` (full architecture roadmap), `docs/superpowers/plans/2026-04-28-bq-as-metric-source-of-truth-phase1.md` (the Phase 1 plan that's about to be rewritten).

---

## 1. The skill ecosystem — yes, dbt has one

`dbt-labs/dbt-agent-skills` is an official Claude Code plugin marketplace published by dbt Labs. It covers analytics engineering (models, sources, tests), the semantic layer (MetricFlow metrics + dimensions + semantic models), dbt Mesh, and dbt Cloud ops.

Install:
```
/plugin marketplace add dbt-labs/dbt-agent-skills
/plugin install dbt@dbt-agent-marketplace
```

**What this changes for us:** the skill teaches Claude the dbt vocabulary and conventions explicitly. Adopting MetricFlow's `metrics.yml` + `semantic_models` schema is the path of least resistance — even if we never run `dbt run`, mirroring the file layout means a fresh hire with dbt experience reads it natively.

**What it does NOT solve:** the INFORMATION_SCHEMA-driven Registry UI is bespoke. No canonical skill for that — it sits on top of MetricFlow-style conventions.

Sources: [dbt-labs/dbt-agent-skills](https://github.com/dbt-labs/dbt-agent-skills), [dbt blog announcement](https://docs.getdbt.com/blog/dbt-agent-skills).

---

## 2. jaffle-shop layout (the canonical reference)

`dbt-labs/jaffle-shop` (note: hyphen, not underscore — `jaffle_shop` is archived). Sandwich-shop fictional data. Small enough to read in an hour.

```
dbt_project.yml                   ← project config (paths, materializations)
packages.yml                      ← dbt package deps (dbt_utils, etc.)
models/
  staging/
    __sources.yml                 ← source declarations
    stg_customers.sql             ← 1:1 cleanup of customers source
    stg_customers.yml             ← column docs + tests
    stg_orders.sql                ← 1:1 cleanup of orders source
    stg_orders.yml
    ... (stg_<entity>.sql + .yml per source)
  marts/
    customers.sql                 ← entity-grained dim, business-facing
    customers.yml                 ← description, tests, semantic_models, measures, metrics
    orders.sql                    ← entity-grained fact
    orders.yml
    metricflow_time_spine.sql     ← the time spine for MetricFlow
    ... (one <entity>.sql + .yml per business entity)
macros/
  cents_to_dollars.sql            ← reusable SQL macros
```

**Three things worth noting:**

1. **No `intermediate/` folder in jaffle-shop.** It's a small project; staging → marts directly. Real-world projects with joins/classifications add `models/intermediate/int_*.sql`. Our stack needs intermediate.

2. **Metrics live inside marts yml files,** not a separate `metrics/` folder. Each marts yml contains:
   - `models:` — column docs, tests
   - `unit_tests:` — model-level unit tests
   - `semantic_models:` — entities, dimensions, measures (MetricFlow)
   - `metrics:` — derived/ratio/cumulative metric definitions

3. **Materialization conventions in `dbt_project.yml`:** staging = view (cheap), marts = table (queryable). We're all-views today, which is fine for our scale.

A staging file is mechanical: `with source as (select * from {{ source('ecom', 'raw_orders') }}), renamed as (select id as order_id, ... cents_to_dollars(subtotal) as subtotal ... from source) select * from renamed`. No filters, no joins, no aggregations.

A marts yml file pairs data tests with `semantic_models:` blocks that name `entities` (primary/foreign keys), `dimensions` (categorical/time), and `measures` (aggregations like `sum(order_total)`). This is the MetricFlow pattern — it's **declarative metric definition co-located with the marts model.**

---

## 3. Method-metrics's current layout

```
project-for-method-dw.revenue.*   ← all BQ views in one dataset
  Account                         ← source (accumulating snapshot, lifecycle dates as cols)
  TransLineFlattened              ← source (atomic revenue lines)
  int_trials, int_syncs,              ← intermediate (filters of Account by date col)
    int_conversions, int_cancellations
  int_customer_mrr,                 ← intermediate (per-customer-month MRR)
    int_customer_annual_mrr
  int_customers, AccountWithRevenue ← intermediate
  v_metric__*  (Phase 1 adds 20)  ← metrics layer (period, value)

method-metrics/                   ← repo
  builder/                        ← React chart builder
  scripts/migrate/                ← Phase 1 migration scripts
    ddl/<id>_<slug>.sql          ← generated DDL files (one per metric)
  docs/
    primitives-vs-derivatives.md  ← layer-cake framework (already written)
    semantic-layer.md
    superpowers/
      specs/                      ← research, design, roadmap docs
      plans/                      ← executable plans (the one being rewritten)
  knowledge/                      ← metric catalog, glossary, schema notes
  supabase/                       ← edge functions + migrations
```

Metric metadata is split: SQL definitions in BQ views, business metadata in Supabase rows (`description`, `notes`, `semantic_table`, `semantic_measure`, etc.). Phase 1's move puts metadata in `OPTIONS(description, labels)` directly on the BQ view, making BQ canonical and Supabase a cache.

---

## 4. The mapping

| dbt concept | jaffle-shop location | method-metrics today | Notes |
|---|---|---|---|
| **Project config** | `dbt_project.yml` | (none) | Could add a stub if we adopt dbt CLI |
| **Source declarations** | `models/staging/__sources.yml` | (implicit — `revenue.Account`, `revenue.TransLineFlattened`) | A `_sources.yml` would let dbt-agent-skills index them |
| **Staging models** | `models/staging/stg_*.sql` + `.yml` | (skipped — raw is pre-cleaned in Alocet/BQ pipeline) | Can stay skipped; just be explicit |
| **Intermediate models** | `models/intermediate/int_*.sql` | `revenue.int_trials`, `int_syncs`, `int_conversions`, `int_cancellations`, `int_customer_mrr`, `int_customer_annual_mrr`, `int_customers`, `AccountWithRevenue` | **Unnamed** as intermediate today. Renaming `v_*` → `int_*` is a mechanical refactor, no business impact |
| **Marts (facts)** | `models/marts/<entity>.sql` | (none yet — Phase 1.6) | `fct_trials`, `fct_syncs` planned |
| **Marts (dims)** | `models/marts/<entity>.sql` | (none yet — Phase 1.6) | `dim_customers` planned |
| **Time spine** | `models/marts/metricflow_time_spine.sql` | (none — embedded in CTEs) | If we adopt MetricFlow, this is needed |
| **Aggregation metrics** | `measures:` blocks in marts yml | `v_metric__*` views with `OPTIONS(labels=[("type", "aggregation")])` | Different convention, same goal |
| **Formula / ratio metrics** | `metrics:` blocks in marts yml | `v_metric__*` views with `OPTIONS(labels=[("type", "formula")])` | Different convention, same goal |
| **Metric metadata** | YAML schema (`description:`, `label:`, `type:`, `type_params:`) | BQ `OPTIONS(description, labels)` | YAML is git-versioned; OPTIONS is BQ-native |
| **Reusable SQL** | `macros/*.sql` (Jinja) | (none — generator scripts in Python) | Could keep Python generator; dbt macros are nice-to-have |
| **Tests** | `tests:` blocks in marts yml | Fingerprint comparison + manual review | `dbt_utils` tests are richer; could backfill |

---

## 5. Decision points for the Phase 1 rewrite

These are the choices the rewrite has to make. None are obvious; they trade convention-fit against migration cost.

### D1. YAML files vs. BQ OPTIONS for metric metadata

**jaffle-shop way:** metadata in `models/marts/<entity>.yml` (declarative, git-versioned, human-editable).
**Phase 1 plan today:** metadata in BQ `OPTIONS(description, labels)`, queried via `INFORMATION_SCHEMA.VIEW_OPTIONS`.

Tradeoffs:
- **BQ OPTIONS:** Registry UI reads it with one query, no yml parser needed. But edits require regenerating + redeploying the view. Not great for hand-tuning a description.
- **YAML companion files:** dbt-native, easier to read/diff, supports richer schema (tests, units, type_params). Requires a parser, plus a sync step to BQ.

**Recommendation:** add `.yml` companion files alongside the generated `.sql` (so each metric is `metric_<id>_<slug>.sql` + `.yml`). Keep BQ OPTIONS as a derived sync — generator reads yml, writes both the DDL and the OPTIONS labels. Registry UI can read either source. This is closer to dbt-agent-skills's expected shape.

### D2. Where do generated SQL files live long-term?

**Today (Phase 1):** `scripts/migrate/ddl/<id>_<slug>.sql` — implies temporary migration artifacts.
**dbt-style:** `models/metrics/v_metric__<slug>.sql` — implies permanent source of truth.

**Recommendation:** rename `scripts/migrate/ddl/` to `models/metrics/` once the migration ships. The directory becomes the authoritative store. Generator script stays (it's the validator/regenerator), but the .sql files are the artifact people read and review.

### D3. Should Phase 1 also rename `v_*` intermediates to `int_*`?

**Path A (current Phase 1):** keep `int_trials` etc. as-is; metric views reference them by current name. Rename in Phase 1.5.
**Path B:** rename intermediates first, metric views reference `int_trials` from day one.

**Recommendation:** **Path A.** The intermediate rename is a no-business-impact refactor. Doing it inside Phase 1 doubles the diff and the risk surface. Phase 1.5 (already in the roadmap) handles it cleanly.

But — **document the intent** in the Phase 1 rewrite. Even without renaming, the plan should articulate "these are intermediate-layer views; we're not renaming yet, but we're aware they're not primitives." The current `primitives-vs-derivatives.md` does this; the Phase 1 plan should reference it explicitly.

### D4. Adopt MetricFlow's metric type taxonomy?

MetricFlow distinguishes: `simple` (= aggregation), `derived` (= formula over other metrics), `ratio` (= numerator/denominator), `cumulative` (= running window).

Phase 1 today uses: `aggregation` and `formula` — coarser.

**Recommendation:** rename our two types to MetricFlow's: `simple` and `derived`. Add `ratio` as a separate type when we hit our first GRR-style metric (it's already there — Monthly GRR % is conceptually a ratio). This gets us free vocabulary alignment with `dbt-agent-skills`.

### D5. Install dbt-agent-skills, or stay convention-only?

Even without adopting dbt the tool, `dbt-agent-skills` gives Claude the right vocabulary in this project. Cheap to install, easy to remove.

**Recommendation:** install. It's the closest thing to a canonical engineering-RevOps skill, and it costs nothing.

---

## 6. Suggested rewrite outline for Phase 1

Light suggestion — the rewrite owner decides. Sections that change:

1. **Add a "Conventions" preamble** referencing `primitives-vs-derivatives.md` and naming the dbt vocabulary explicitly. Resolve D3 (don't rename intermediates yet) and D4 (use MetricFlow's `simple` / `derived` / `ratio` type names).
2. **Move file outputs** from `scripts/migrate/ddl/` to `models/metrics/` (D2).
3. **Add yml companion files** alongside each `.sql` (D1). Generator script writes both.
4. **Cross-reference** `dbt-agent-skills` install in the project setup section (D5).

Tasks that don't change: the migration scripts, fingerprint diffing, registry UI changes, smoke-test workflow. Phase 1's structural decisions (BQ as canonical, Supabase as cache, fingerprint-verified migration) all hold.

---

## 7. Open questions for the rewrite session

- Do we want to adopt dbt the tool eventually, or stay views-only with conventions borrowed from dbt? Affects D1 (yml shape) and whether we add a `dbt_project.yml` stub.
- If we add `models/metrics/*.yml`, who owns the canonical edit path — generator-only (regenerate from Supabase) or hand-editable (human edits yml, generator builds DDL from yml)? Different ergonomics.
- Are there metrics in the registry that don't fit `simple` / `derived` / `ratio`? If so, how do we model them?

These don't need to be answered now — flag them in the rewrite and decide as the work surfaces them.
