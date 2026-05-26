# Method-metrics dbt Architecture (working draft)

**Status:** Working draft for the zoom-out session. Captures what's decided + flags every open question. The zoom-out session refines and locks decisions; this doc becomes the canonical architecture reference after.

**Companion docs:**
- [`docs/dbt-layers-explained.md`](dbt-layers-explained.md) — **plain-English explanation of each layer** (sources, staging, intermediate, marts/dim/fct, metrics). Start here if you're new to dbt.
- [`docs/dbt-roadmap.md`](dbt-roadmap.md) — **forward-looking checklist** of phases, rounds, and what's done vs. pending
- [`docs/primitives-vs-derivatives.md`](primitives-vs-derivatives.md) — the layer-cake framework (architectural primitives vs. derivatives, set conceptually)
- [`docs/dbt-conventions-mapping.md`](dbt-conventions-mapping.md) — jaffle-shop layout vs. Method side-by-side
- [`docs/dbt-scaffold-handoff.md`](dbt-scaffold-handoff.md) — round-by-round decision log

---

## 1. Why this doc exists

We've migrated 3 metrics to dbt (Trials, Syncs, Sync Rate) and proven the architecture works end-to-end (round 3a). Before extending to the remaining 17 live metrics, we need a clear, decision-locked architecture so we're not making 17 mechanical decisions ad-hoc.

The biggest gap today: **we use words like "intermediate" and "metric layer" without rigorous definitions for what they mean in Method's specific stack.** This doc fixes that.

---

## 2. The layer dictionary — what each layer IS in our project

dbt's standard convention has 5 layers. We use 4 of them (skipping staging because our raw data is pre-cleaned by Alocet) plus a Method-specific bridge layer.

### 2.1 Sources

**What:** Raw external tables. Not managed by dbt. Cleaned/loaded upstream by the Alocet → BigQuery pipeline.

**dbt convention:** Declared in `models/_sources.yml`. Referenced in models via `{{ source('schema', 'table') }}`.

**Method-specific contents (in `revenue` dataset):**
- `Account` — accumulating snapshot, one row per Method account. Lifecycle dates (SignupDate, FirstSaaSInvoiceTxnDate, CancellationDate) as columns.
- `Funnel` — event log, one row per lifecycle event (Sync, Conversion, etc.).
- `TransLineFlattened` — atomic revenue lines, one row per billing transaction line.
- `method_forecast` — Sheets-federated forecast table (Google Drive scope required).
- (Plus maybe budget tables, dim tables — to be inventoried in the zoom-out session.)

**Rules:**
- Never modify a source. If a source's schema needs change, it's an upstream conversation (Alocet, Justin).
- Always declare sources before using them; never `select * from project.dataset.RawTable` inside a model.
- One `_sources.yml` per related group is fine; for our scale, one top-level `models/_sources.yml` is sufficient.

**Open questions:**
- Do we want `_sources.yml` in our scaffold? Today we hardcode `project-for-method-dw.revenue.Account` etc. Source declarations are dbt-canonical and enable `dbt source freshness` checks. Cheap to add.
- Should the Sheets-federated tables (`method_forecast`, budget) be in their own source group?

---

### 2.2 Staging (skipped)

**What dbt convention says:** `stg_*` models, 1:1 cleanup of raw sources — rename columns, cast types, drop obviously bad rows. One staging model per source table.

**Method-specific status:** **Skipped.** Alocet's pipeline cleans data before it lands in BQ. Adding a staging layer would be cosmetic (the existing `Account`, `Funnel`, `TransLineFlattened` tables are already well-typed and renamed).

**Rules:**
- We do NOT add staging models unless we find a real cleanup need (e.g., a source with raw column names like `cust_acct_xy7` that needs normalizing).
- If a staging layer is added later, it sits between sources and intermediates.

**Open questions:**
- Will any of the remaining 17 live metrics' sources require a staging cleanup? Probably not — they all use the same `Account` / `Funnel` / `TransLineFlattened` / `int_customer_mrr` paths.

---

### 2.3 Intermediate (`int_*`, currently `v_*`)

**What:** Reusable building blocks. Joins between sources, filters that define a business concept, role-playing dimensions. Not directly consumed by dashboards — exists so multiple downstream metrics can share the same filtered/joined view.

**dbt convention:** Prefix `int_*`. One concept per file. Materialized as ephemeral or view (we use view).

**Method-specific contents (currently named `v_*`):**

| File | What it filters | Grain |
|---|---|---|
| `int_trials` | `Account` rows where SignupDate is set (and not exception/internal) | one row per account that began a trial |
| `int_syncs` | `Funnel` rows where EventType = 'Sync' | one row per sync event |
| `int_conversions` | `Account` rows where FirstSaaSInvoiceTxnDate is set | one row per converted account |
| `int_cancellations` | `Account` rows where CancellationDate is set | one row per cancelled account |
| `int_customers` | Account rows for active customers | one row per active customer |
| `int_customer_mrr` | Per-customer-per-month MRR with movement columns | one row per (customer, month) |
| `int_customer_annual_mrr` | Same shape, annual grain | one row per (customer, year) |
| `AccountWithRevenue` | Account joined to TransLineFlattened aggregates | one row per account |
| (~10 more breakdowns) | Variants of the above by channel/vertical/etc. | various |

**Rules:**
- An intermediate model should be reusable. If only one downstream metric ever uses it, consider inlining into the metric definition instead.
- One filter / one join per intermediate — don't combine unrelated concerns into a "kitchen sink" intermediate.
- Intermediates can reference sources and other intermediates. They should NOT reference marts or the metric layer (no upward refs).

**Naming decision (deferred):**
- Today: `v_*` prefix (legacy, predates dbt adoption)
- Target: `int_*` per dbt convention
- **Locked:** Rename happens in a single one-shot PR after all 20 metrics are migrated to dbt. See handoff §12.5.

**Open questions for zoom-out:**
- What's the rule for when a filter "deserves" its own intermediate vs. living inline in a metric? (e.g., should there be `int_active_customers` or should every metric that needs "active customers" filter inline?)
- The breakdowns family (e.g. `v_trials_by_channel`) — are these intermediates or marts? They're entity-grained views that group by a dimension. dbt convention would call them either intermediates (if pre-aggregated for reuse) or marts (if consumed directly by dashboards). We currently have them as intermediates. Confirm.

---

### 2.4 Marts (`fct_*`, `dim_*`) — NONE today

**What:** Business-facing tables/views. The "final" layer humans / dashboards / chart builders directly query. Two flavors:
- `fct_*` (facts) — event-grained. What happened, when. e.g., `fct_trials` would have one row per trial event with all its denormalized context.
- `dim_*` (dimensions) — entity-grained. Who/what. e.g., `dim_customers` would have one row per customer with their attributes.

**Method-specific status:** **None today.** Phase 1.6 plans to add `fct_trials`, `fct_syncs`, `dim_customers`. The argument for adding them:
- A `dim_customers` table gives the chart builder a canonical "customer" entity to join against — sync rates by customer cohort, MRR by customer tier, etc.
- A `fct_trials` table denormalizes attribution + first-sync + conversion attributes onto each trial event, so analysts don't have to re-derive cohort joins.

**Rules:**
- Marts are entity-grained or event-grained. No "halfway" entities.
- Marts can reference intermediates and sources but should NOT reference the metric layer.
- Marts are typically materialized as tables (not views) for query performance. Method's scale is small enough that view materialization still works — but plan for table materialization on dim_customers if it gets queried a lot.

**Open questions for zoom-out:**
- Is Phase 1.6 still the right place for marts, or should marts come earlier in Phase 1 (e.g., between intermediates and the metric layer)?
- Once marts exist, do semantic models attach to the marts instead of intermediates? Yes (per dbt convention), but that's another migration. Plan for it.
- Do we need `dim_attribution_channels` as a canonical lookup, or is the inline `CASE` expression in `int_trials` good enough?

---

### 2.5 Metrics (`v_metric__*`) — Method-specific bridge layer

**What:** Materialized metric views that produce `(period, value)` time series. The Registry UI reads these via `INFORMATION_SCHEMA.TABLE_OPTIONS` for catalog data + queries them directly for time-series data.

**Why this isn't a standard dbt layer:** dbt computes metrics at query time via MetricFlow (or a BI tool). dbt does NOT materialize metrics as BQ views. We need the materialization because the chart builder reads BQ INFORMATION_SCHEMA, not a MetricFlow server.

**Method-specific contents (target state):**
- One `v_metric__<slug>.{sql,yml}` per live metric (target: 20 of these)
- Each materializes a `(period, value)` series over the last 24 months
- BQ labels carry the catalog data (metric_id, type, status, owner, depends_on, etc.)
- BQ description carries the human-readable metric description

**Rules:**
- One metric per file.
- The metric layer is the dbt-native materialization (Option A from round 1 — dbt-bigquery's `description` + `labels` config). NO raw `CREATE OR REPLACE VIEW` DDL — let dbt own the materialization.
- Cross-model metrics (ratios, derived) live in `models/metrics/_metrics.yml` (the top-level metrics file) and reference single-model metrics by name.
- Simple metrics are defined inline on the intermediate's semantic_model (see `models/intermediate/int_trials.yml` for the `trials` metric).

**Decisions locked (round 2.5 → 3a):**
- Use dbt-bigquery's native materialization, not a custom Python generator.
- `+persist_docs: relation, columns` enabled so descriptions propagate to BQ.
- Labels follow the 9-field convention: `metric_id`, `layer`, `type`, `status`, `owner`, `verified_at`, `source_table`, `source_measure_safe`, `depends_on`.

**Open questions for zoom-out:**
- Naming: `v_metric__*` is the current convention. Should this stay even after the `v_*` → `int_*` rename of intermediates? (Probably yes — they're a different layer entirely, prefix-wise unrelated.)
- Do we need a separate materialization config for `cumulative` metrics (those would need a time spine model)? Not for the live 20, but worth noting.

---

## 3. Cross-cutting decisions

### 3.1 Source-of-truth matrix

| Thing | Today | Target (after Phase 1) |
|---|---|---|
| Metric definitions (SQL + filters) | Hand-written BQ DDL | dbt files in git |
| Metric metadata (description, owner, status, deps) | Supabase `metrics` table | BQ `INFORMATION_SCHEMA.TABLE_OPTIONS` (labels + description) |
| Saved charts | Supabase `saved_charts` table | Same (no plan to move) |
| Dashboards | Supabase `dashboards` table | Same (no plan to move) |
| User preferences | Supabase | Same |
| The metric tracker UI (tracker.html) | Reads catalog from Supabase | Open question — switch to BQ or keep Supabase as cache? |

**Open question for zoom-out:** Does the Supabase `metrics` table go away entirely, shrink to a cache, or stay as-is with dbt as a parallel source? Three real options:
- **(A) Retire `metrics` table.** tracker.html reads catalog from BQ INFORMATION_SCHEMA. Simplest end state, but requires rewriting the tracker.
- **(B) Keep `metrics` table as a cache.** A nightly sync script reads BQ INFORMATION_SCHEMA and updates Supabase. tracker.html unchanged. Maintains both, but no drift because the sync is automated.
- **(C) Hybrid.** Supabase stores user-mutable fields (notes, priority, assigned_to); BQ stores everything else. tracker.html reads both and joins on metric_id.

### 3.2 How a new metric gets added — target state

**Today:** Open Supabase, manually create a metric row. Maybe write a SQL view in BQ. Hope they stay in sync.

**Target state:** 
1. Add `models/intermediate/<slug>.yml` (semantic model + simple metric) or update `models/metrics/_metrics.yml` (cross-model)
2. Add `models/metrics/v_metric__<slug>.{sql,yml}` (materialization)
3. `dbt run`
4. Verify parity against the canonical source (a previous query, or Supabase if it had a definition)
5. Commit + push

**Who does what:**
- Nic (PM) authors metric specs, runs parity checks, approves status changes
- Justin (engineer) reviews dbt PRs, maintains the underlying intermediates and sources
- Claude (agent) does the mechanical scaffolding under explicit direction

### 3.3 Sequencing of remaining work

| Phase | Scope | Status | When |
|---|---|---|---|
| Round 3a | Bug fix + first dbt run + 3 metrics live | ✅ done | 2026-05-08 |
| Round 3b | Pilot Customers + Monthly Start MRR | ⏳ next | next session |
| Zoom-out architecture | This doc finalized + decisions locked | ⏳ pending | after 3b |
| Round 4 | Bulk extend to remaining 15 simple/ratio metrics | ⏳ pending | after zoom-out |
| Round 5 | GRR/NRR migration (the protected family) | ⏳ pending | last, most carefully |
| Phase 1.5 | `v_*` → `int_*` rename (single PR) | ⏳ deferred | after all 20 migrated |
| Phase 1.6 | Marts (`fct_trials`, `dim_customers`) + tracker.html migration | ⏳ deferred | after Phase 1.5 |

---

## 4. What the zoom-out session needs to lock

Listed in order of "blocker for round 4" → "nice to have."

**Blockers for round 4:**

1. **Source declarations** — yes or no on adding `models/_sources.yml`? If yes, what's in it?
2. **Source-of-truth matrix (§3.1)** — which of options A/B/C for the Supabase `metrics` table?
3. **Breakdowns family** — intermediate or mart? Affects how the breakdown metrics scaffold next.
4. **Customer-grain question** — do we need `dim_customers` *before* migrating customer-centric metrics (#373 Customers, MRR family)?

**Nice to have (can be locked later):**

5. The `v_*` → `int_*` rename timing — currently after Round 5; confirm.
6. Forecast/budget family treatment — defer to Phase 2 or include in Phase 1?
7. Test coverage strategy — what `dbt test` blocks do we want on metrics?
8. dbt Cloud vs local-only — Fusion is preview; do we need dbt Cloud's semantic manifest validation?

---

## 5. What we explicitly accept as remaining technical debt

To be filled in during the zoom-out session. Examples:
- The chart builder may continue reading from Supabase for some time even after BQ is canonical — that's fine.
- GRR/NRR migration may stay manual longer than the others — protected by CEO methodology.
- (others TBD)

---

## 6. Tooling boundaries — dbt vs Cube.dev vs the AI chart builder

This section exists because "do we need Cube?" comes up. The short answer is **not in Phase 1**, but they're not alternatives — they stack.

### 6.1 What each tool actually does

**dbt** — how data is transformed and modeled *inside* the warehouse.
- Source of truth lives in git (yml + sql files)
- Generates BigQuery views/tables at compile time via `dbt run`
- Builds metric *definitions* and *underlying data shape*
- Does NOT serve a query API. Apps still talk to BQ directly.

**Cube.dev** — a metric API service that sits *between* the warehouse and consuming apps.
- Source of truth in Cube's config (similar in flavor to dbt's yml)
- Runs as a service. Apps call Cube's REST/GraphQL/SQL API instead of BQ directly
- Handles caching, pre-aggregations, query optimization
- Typed metric query interface ("trials by month grouped by channel") — consumers don't write SQL

**Method's AI chart builder** — a UX layer on top of one specific consumer.
- Natural language → JSON config → SQL → BQ → chart
- Alternative *for that one consumer* to what Cube would provide

### 6.2 Side-by-side capability matrix

| Need | dbt | Cube | AI chart builder |
|---|---|---|---|
| Define metrics in version-controlled files | ✓ | ✓ | partial (in dbt now) |
| Generate underlying BQ views | ✓ | ✗ | ✗ |
| Provide typed query API to apps | ✗ | ✓ | ✗ |
| Caching / pre-aggregations | ✗ | ✓ | ✗ |
| Natural language → chart | ✗ | ✗ | ✓ |
| Lineage / data quality tests | ✓ | partial | ✗ |

### 6.3 The stack, not the alternatives

```
[git: dbt files] → dbt run → [BigQuery views] → [optional: Cube API] → consumers
                                                                       ├─ tracker UI
                                                                       ├─ AI chart builder
                                                                       └─ external apps (AC, ML, etc.)
```

dbt is the foundation. Cube is an optional service tier above it that earns its keep when there are multiple consumers each needing typed access to metrics. The AI chart builder is a UX layer that can read directly from BQ OR through Cube.

### 6.4 When Cube earns its keep (the trigger conditions)

Cube becomes worth adopting if AT LEAST ONE of these is true:

1. **Multiple external apps need a typed metric API** — ActiveCampaign, HubSpot, ML pipelines, vendor integrations. A clean "give me Sync Rate by month, JSON please" endpoint that doesn't require SQL.
2. **Query performance is a bottleneck** — caching / pre-aggregations needed to keep dashboards fast at scale.
3. **Multiple in-house apps consuming metrics** — and you don't want each one re-implementing SQL generation.

### 6.5 Decision for Phase 1: dbt only, revisit Cube in Phase 2

For Method right now:
- (1) ⚠️ Future possible (ActiveCampaign integration), not pressing today
- (2) ❌ Not pressing at ~20 metrics + modest volume
- (3) ❌ One serious consumer (chart builder); Supabase tracker becomes the second when it migrates

**Phase 1 stays dbt-only.** BigQuery serves queries directly to the chart builder. AI chart builder handles the natural-language UX. Adding Cube means another service to operate, configure, and reason about — pay that complexity later when the trigger conditions actually fire.

**Phase 2 reopens the question** if/when external API consumers materialize (most likely trigger: ActiveCampaign reverse-ETL or a Looker/Hex/Mode dashboard for non-engineering users). At that point Cube goes *on top of* the dbt models — no rework of what Phase 1 built; Cube just reads from the same BQ views dbt creates.

---

*Draft written 2026-05-08 in response to: "as part of that, we need to understand each level here, like the different types of, I forget what they call it, like marts and stuff like that. We need to understand how we're defining those." The zoom-out session refines this into the locked architecture doc.*
