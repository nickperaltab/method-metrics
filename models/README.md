# `models/` — dbt-shaped metric definitions

**Status: scaffold only.** This folder is the proposed permanent home for metric-layer artifacts after the Phase 1 plan rewrite. Today it contains a single reference scaffold (`v_metric__trials`) so we can validate the file layout before committing the rest of the migration to it.

See companion docs:

- [`docs/dbt-conventions-mapping.md`](../docs/dbt-conventions-mapping.md) — why this layout, how it maps to jaffle-shop, and the 5 decision points behind it.
- [`docs/primitives-vs-derivatives.md`](../docs/primitives-vs-derivatives.md) — the layer-cake framework (sources / staging / intermediate / marts / metrics).
- [`docs/superpowers/plans/2026-04-28-bq-as-metric-source-of-truth-phase1.md`](../docs/superpowers/plans/2026-04-28-bq-as-metric-source-of-truth-phase1.md) — the Phase 1 plan being rewritten.

## Layout

```
models/
  intermediate/
    v_trials.yml             ← semantic model on existing intermediate (no .sql; v_trials lives in BQ)
  metrics/
    v_metric__trials.sql     ← materialized canonical view (period, value), generated from the yml
    v_metric__trials.yml     ← metric definition + meta labels, source of truth for OPTIONS sync
```

## Conventions used (vs. dbt-agent latest spec)

| Convention | Source | Notes |
|---|---|---|
| Latest spec for semantic models | `building-dbt-semantic-layer/SKILL.md` | `semantic_model:` nested on the model |
| Metric types: `simple`, `derived`, `ratio`, `cumulative`, `conversion` | MetricFlow | Replaces our prior `aggregation`/`formula` taxonomy |
| `models/intermediate/` for `int_*` (today still `v_*`) and accumulating-snapshot filters | jaffle-shop + dbt structure guide | Renames deferred to Phase 1.5 |
| `models/metrics/` for the `v_metric__*` materialization layer | Method-specific | Bridges canonical yml definition → BQ INFORMATION_SCHEMA UI |

## What's intentionally *not* in this scaffold

- No `dbt_project.yml` — we're not running `dbt run` (yet). The yml shape is for vocabulary alignment with `dbt-agent-skills`, not for the dbt CLI to compile.
- No `_sources.yml` — sources are implicit (`revenue.Account`, `revenue.TransLineFlattened`) and not yet declared.
- No `models/staging/` — raw is already cleaned in the Alocet → BQ pipeline.
- No `macros/` — generator scripts in Python (`scripts/migrate/`).
- No `models/marts/` — facts/dims are Phase 1.6.

## How to read the scaffold

1. Open [`intermediate/v_trials.yml`](intermediate/v_trials.yml) — describes `v_trials` (the underlying entity-grained accumulating-snapshot filter) and the `simple` metric `trials` defined on it.
2. Open [`metrics/v_metric__trials.yml`](metrics/v_metric__trials.yml) — the `v_metric__*` materialization metadata: `meta` block carries the labels that get synced into BQ `OPTIONS`.
3. Open [`metrics/v_metric__trials.sql`](metrics/v_metric__trials.sql) — the BQ DDL for the materialized view. In the rewritten Phase 1, this file is generated from the yml via `scripts/migrate/generate_metric_views.py`, not hand-written.

If the layout looks right, the Phase 1 rewrite extends this scaffold to all 20 live metrics and wires up the generator to read yml as the source of truth.
