# Method Metric Architecture — Layering Framework

## Why this exists

We need a shared way to answer "where does this thing belong in the architecture?" — for a new BQ view, an existing one being audited, a metric being added to the registry, or a definition being written into a description/notes field.

This doc is the framework. It uses **dbt's standard vocabulary** (sources / staging / intermediate / marts / metrics) — the de facto authority for warehouse-layered architecture in 2026. You can read it in any dbt project guide. We use the same language so anyone we hire understands without translation.

The companion deeper roadmap lives in `docs/superpowers/specs/2026-05-04-composable-cdp-roadmap.md`.

## Definitions

**Primitive (architectural):** A view that exposes one atomic concept, source-shaped, with the business definition living inside it. Multiple downstream consumers read from it. When the definition changes, you fix it here and everything downstream updates.

**Derivative:** Anything that combines, filters, classifies, or aggregates primitives to answer a specific question or serve a specific view.

These map onto layer position — primitives sit at sources/staging; derivatives at intermediate/marts/metrics.

## The four-question test

Walk through these in order. If a candidate fails any one, it's a derivative.

1. **Single bounded concept?** One thing — a customer record, a transaction line, a per-(customer, month) MRR snapshot — or does it combine multiple concepts to answer a question?
2. **Source-shaped, not question-shaped?** Just exposing facts, or has it pre-answered something specific?
3. **Multiple downstream consumers, or one with a real reason not to fan out?** A "primitive" with one consumer is suspicious — probably that consumer's logic in disguise.
4. **Holds the business definition?** When the definition changes ("what counts as paying"), do you fix it here, or does the real definition live somewhere else and this view inherits it?

All four pass → primitive. Any fail → derivative.

## The five layers (dbt vocabulary)

| Layer | What | Naming | Method examples |
|---|---|---|---|
| **sources** | Raw upstream tables, untouched | declared in `_sources.yml`, original names kept | `Account`, `TransLineFlattened` |
| **staging** | 1:1 source-conformed cleanup (renames, type casts, no joins, no filters, no aggregations) | `stg_<source>__<entity>` | (skipped today — our raw tables are already cleaned upstream of BQ) |
| **intermediate** | Joins, filters, classifications, re-graining | `int_<entity>` | `int_trials`, `int_syncs`, `int_conversions`, `int_cancellations`, `int_customer_mrr`, `int_customer_annual_mrr`, `int_customers`, `AccountWithRevenue` |
| **marts** | Entity-grained, denormalized, business-facing | `fct_<entity>` (facts) / `dim_<entity>` (dimensions) | (not built yet — Phase 1.6) `fct_trials`, `fct_syncs`, `dim_customers` |
| **metrics** | Aggregations + formula KPIs over marts/intermediate | `v_metric__<slug>` | `v_metric__monthly_cancellations_dollars`, `v_metric__monthly_grr_pct` (Phase 1 builds these) |

## Multiple atomic grains can co-exist

A common confusion: people imagine "atomic" means there's one foundational table everything derives from. That's wrong. Different concepts have different natural grains and **each can be atomic at its grain**.

For Method:

| Atomic concept | Grain | Where it lives |
|---|---|---|
| **Account** (one Method instance/login) | EntityRecordID | `Account` table |
| **Customer** (one paying business) | CompanyAccount | Implicit — derived by GROUP BY CompanyAccount; no dedicated table today (gap for Phase 1.6 `dim_customers`) |
| **Transaction line** | (entity, txn_date, line) | `TransLineFlattened` |
| **Customer-month MRR snapshot** | (CompanyAccount, Month) | Currently *unmaterialized* — embedded as `entity_monthly` CTE in `int_customer_mrr` and re-implemented in `int_customer_annual_mrr`. Architectural debt; Phase 1.5 extracts it. |

These four are all atomic at their respective grains. None is "more L0" than another. dbt's marts guidance is explicit about this:

> *"all our marts are meant to represent a specific entity or concept at its unique grain. For instance, an order, a customer, a territory, a click event, a payment — each of these would be represented with a distinct mart."*

So when you classify a candidate, **first identify the grain it belongs to.** Then ask if it's source-shaped or question-shaped at that grain.

## Common mistake — events vs. lifecycle states

Trial, sync, conversion, and cancellation in our codebase are **NOT atomic event streams.** Our `Account` table is an *accumulating snapshot* (Kimball's term) — one row per account, with date columns marking each lifecycle milestone. There's no separate `trial_events` source; a "trial" is just an account where `SignUpDate IS NOT NULL`.

So `int_trials` / `int_syncs` / `int_conversions` / `int_cancellations` are **intermediate-layer views** (filters of `Account`), not source-layer event streams. If we ever start ingesting actual event streams (e.g., from Segment Warehouses), those would be sources at event-grain — but that's not where we are today.

## Classifying a metric

- **Aggregation metric (in `metrics` layer)** — has a `v_metric__*` view that aggregates an intermediate or mart view. Returns a `(period, value)` time-series. Example: `v_metric__monthly_cancellations_dollars` = `SELECT period, ROUND(SUM(Cancellations), 2) FROM int_customer_mrr GROUP BY 1`.
- **Formula metric (also in `metrics` layer)** — JOINs other metric views and computes a formula. Example: `v_metric__monthly_grr_pct` = JOIN over the start/cancel/down metric views, computing the GRR formula.

Both are derivatives. Both live in the metrics layer. The distinction is "reads a view" (aggregation) vs. "math over other metrics" (formula). dbt's MetricFlow uses the same split (`simple`/`derived`/`ratio` metric types).

## Classifying a BQ view

- **Source layer:** raw upstream table; we don't model it.
- **Staging:** would be 1:1 source-conformed cleanup. We don't have these today (our raw layer is already cleaned).
- **Intermediate (`int_<entity>`):** any view that joins, filters, classifies, or re-grains source data. Most of our current `v_*` views are this.
- **Marts (`fct_<entity>` or `dim_<entity>`):** entity-grained, denormalized, business-facing wide tables. None today; Phase 1.6 builds them.

A view that isn't actually a primitive (i.e., fails any of the four questions) belongs in intermediate or marts. Calling it "primitive" is a smell.

## When designing something new

1. State the question or fact in plain English first.
2. Identify the grain (entity, customer, transaction-line, customer-month, event, etc.).
3. Walk the four-question test.
4. Decide the layer before writing SQL.
5. Resist the urge to lift question-shaped logic into a "primitive" because it's convenient. If it pre-answers a specific question, it's intermediate or marts.

## Pitfalls we've already hit

- **Conflated source + intermediate inside one view.** `int_customer_mrr` and `int_customer_annual_mrr` both embed the per-(customer, month) MRR snapshot logic inline rather than reading from a shared `int_customer_monthly_mrr_snapshot`. Same logic, two places. Phase 1.5 fixes.
- **Calling aggregation metrics "primitive"** in `metric_type` (the Supabase column we've been using). They're not architectural primitives — they aggregate intermediate or mart views. The label was shorthand for "directly aggregates a view," not "is the atomic concept." Phase 1+ fixes by replacing the column with `OPTIONS(layer="metric", type="aggregation")` labels in BQ.
- **Multiple measurement paths for the same event.** "Churn" (count from `int_cancellations`) and "Cancellations $" (sum from `int_customer_mrr`) both measure "customer stopped paying" but read from different intermediate views with different exclusions and windows. They probably don't reconcile to the same customer set without explicit checking. To-do: a reconciliation script.

## Quick reference card

> **Before assigning a layer label to a view or describing a metric in docs/copy, run the four-question test. If it doesn't pass all four, it's a derivative — name it accordingly (`int_*`, `fct_*`, `dim_*`, or `v_metric__*`).**

> **The architectural primitive is at the source/staging layer; everything above it is a derivative. Aggregation metrics and formula metrics are both derivatives, both in the `metrics` layer.**

## Companion docs

- `docs/superpowers/specs/2026-05-04-composable-cdp-roadmap.md` — full architecture roadmap, all phases, decision log
- `docs/bq-metric-conventions.md` — naming + labeling conventions for `v_metric__*` views (created in Phase 1)
- dbt's "How we structure our dbt projects" — https://docs.getdbt.com/best-practices/how-we-structure/1-guide-overview — the canonical reference for the vocabulary we're using
