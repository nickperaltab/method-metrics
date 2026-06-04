# Materialize Net SaaS Models — Phase 4 (Performance)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Cut dashboard query latency from ~6–7s to sub-second by materializing the heavy MRR models as dbt **tables** (refreshed daily after the ETL), instead of unmaterialized views that recompute from raw `TransLineFlattened` on every query.

**Diagnosis (measured 2026-06-04):** queries scan only ~50 MB but take 6.8s — compute-bound (multi-CTE pipelines, entity-pairing UNION ALL, `int_customers` join, 12-month self-join for annual), not data-bound. Materializing precomputes the work once/day.

**Decisions (user-confirmed):** (1) refresh via a `dbt run` step added to the existing 10:00 UTC `refresh-scorecards.yml` cron, using the existing `GCP_SA_KEY` secret. (2) Daily-fresh is acceptable for all `int_customer_mrr` consumers (monthly metrics, GRR/NRR, other scorecards) — data updates daily, so numbers match; everything gets faster.

**Architecture:** `+materialized: view` → `table` for the dashboard-queried models. `int_customer_annual_mrr` (currently an orphaned view) is migrated to dbt first so it can be a table. A CI dbt run rebuilds them daily.

---

## Models to materialize (all become `table`)
- `int_customer_mrr` (shared: metrics + scorecards + dashboard)
- `int_customer_mrr_lines` (feeds decompositions)
- `int_mrr_movement_decomposed`
- `int_annual_mrr_movement_decomposed`
- `int_customer_annual_mrr` (after migration to dbt)
- `int_customers` (shared upstream; table so the joins it feeds are fast at build) — optional, include if cheap.

## Task A: Migrate int_customer_annual_mrr to dbt (table) — validated, Phase-1 rigor
- [ ] Capture current orphaned-view DDL → `knowledge/verified-queries/int_customer_annual_mrr-pre-migration-ddl.sql`.
- [ ] Create `models/intermediate/int_customer_annual_mrr.sql` from the DDL, `{{ config(materialized='table') }}`, sources via `{{ source('revenue','TransLineFlattened') }}` + `{{ source('revenue','int_customers') }}` (or `ref('int_customers')` since it's a dbt model now). Remove it from `_sources.yml`. Switch the annual metric views (`v_metric__annual_*`) that read it from `source` → `ref` if needed.
- [ ] Snapshot the orphaned view (pre), build in staging, parity row-by-row (pre vs staging) — movement columns must match. Reuse the snapshot/parity pattern from Phase 1 (scripts/snapshot_int_customer_mrr.py is the template; adapt for the annual view's columns/grain).
- [ ] Compile + build staging; commit.

## Task B: Flip materialization to table
- [ ] In each model's `{{ config() }}` (or a folder-level config), set `materialized='table'` for the 5–6 models above. Prefer per-model config headers for clarity. Compile.
- [ ] Commit.

## Task C: Build as tables in prod + verify speed
- [ ] `dbt run --select int_customer_mrr int_customer_mrr_lines int_mrr_movement_decomposed int_annual_mrr_movement_decomposed int_customer_annual_mrr int_customers --target dev` (prod). dbt replaces views with tables (drops+recreates on relation-type change).
- [ ] Re-measure: the bridge / annual / filter-options / decomp queries should drop from ~6–7s to sub-second (re-run the dry-run + timed measurement from the diagnosis).
- [ ] Final parity: monthly + annual decomposition reconciliation scripts still green against the now-tabled models; int_customer_mrr snapshot still matches baseline.
- [ ] Commit any config; HOLD broad prod claims until parity re-confirmed.

## Task D: Daily refresh in CI (extend refresh-scorecards.yml)
- [ ] Add a step to `.github/workflows/refresh-scorecards.yml` (before or after the snapshot refresh) that:
  - Writes a dbt `profiles.yml` from `GCP_SA_KEY` (dbt-bigquery `method: service-account-json` with `keyfile_json` from the secret), targeting the `revenue` dataset.
  - Installs dbt (pip) + runs `dbt run --select <the materialized models>`.
- [ ] Verify the SA has BQ dataEditor on `revenue`/`revenue_metrics` (the snapshot script already uses it; confirm write). If not, that's a GCP IAM grant the user makes.
- [ ] Keep the schedule at 10:00 UTC (after ETL). Test via `workflow_dispatch`.

## Task E: Verify + deploy
- [ ] Confirm dashboard latency improved (live). Frontend cache (already shipped) + tables = fast first paint AND instant revisit.
- [ ] No frontend deploy needed for materialization (data-layer only) unless config/code changed.

## Risks / notes
- **Relation-type change (view→table):** dbt handles by dropping the view and creating the table. Brief moment where the object is mid-rebuild; run during low traffic. int_customer_mrr is shared — its rebuild momentarily affects the metrics/scorecards reading it. Acceptable (seconds, off-hours via cron).
- **Freshness:** all consumers become as-of-last-refresh (daily). Accepted.
- **CI dbt auth:** the dbt profile in CI must use the service account (not the local OAuth profile). Generate profiles.yml in the workflow from the secret.
- **Parity gates** (Phase 1 scripts) re-run against tables to confirm materialization didn't change values.
