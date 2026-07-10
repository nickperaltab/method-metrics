# Method Metrics MCP — Design

**Date:** 2026-07-10
**Status:** Approved (brainstormed with Nic)
**Goal:** A read-only MCP server that gives people the metric definitions today, built on dbt as the single source of truth.

## Context

Metric definitions currently live in three places: dbt model YAML (`description` + labels), `docs/metric-definitions.md` (rich prose: grain, filters-with-why, methodology source, parity, caveats), and Supabase (workflow metadata). The prose doc predates the dbt migration; dbt's `meta:` block can hold all of its structured fields. Folding the prose into dbt makes the manifest carry the complete definition, so one artifact serves every consumer (this MCP server, the future catalog UI, the frontend, the future Alexander RevOps agent).

The long-term direction (separately backlogged in TICKETS.md): frontend reads the dbt manifest directly; Supabase demotes to a pointer-registry. This MCP server is the first consumer of the consolidated definitions.

## Phase 0 — Definitions move into dbt

Port all metric definitions from `docs/metric-definitions.md` into each model's `.yml` in `models/metrics/` under a `meta:` block:

```yaml
meta:
  answers: "one-sentence business question"
  grain: "customer-level (EntityRecordID) | account-level | event-level | period-only"
  filters:
    - rule: "IsConversionException = FALSE"
      why: "excludes test accounts and internal Method Integration partner rows"
  methodology_source: "where the canonical definition came from"
  parity_verified:
    against: "source"
    date: "YYYY-MM-DD"
    values: "what matched"
  limitations: ["hard warnings — directional-only, etc."]
  caveats: ["pre-FX", "in-progress month excluded", ...]
  used_by: ["Method Monday", "Marketing Scorecard", ...]
```

Rules:
- Content fidelity over reformatting: the port must not change meaning. Grouped doc entries (e.g. #384–387, #382/383/388/389) are split per model, each carrying its own fields.
- Fields the doc leaves blank stay absent (no empty keys, no invented content).
- Existing `description` and `labels` are untouched.
- `dbt parse` must pass clean after the port.

`docs/metric-definitions.md` is demoted from store to workflow doc: template (§1), process (§2), and audit checklist (§3) stay; a header states that approved definition content now lives in the model YAML `meta:` blocks and the per-metric entries in the doc are historical. The `migrate-metric-to-dbt` skill is updated so new metrics author `meta:` directly.

## Phase 1 — The MCP server (local, stdio)

TypeScript + official `@modelcontextprotocol/sdk`, living at `mcp/metrics/` in this repo, registered in `.mcp.json`.

**Data source:** `target/manifest.json`, path via `DBT_MANIFEST_PATH` env var (default: repo-relative `target/manifest.json`). This env-var seam is what later becomes "fetch from GitHub" in Phase 2. Loaded lazily at first tool call; re-stat on each call and reload if mtime changed.

**Tools (all read-only):**

| Tool | Input | Output |
|---|---|---|
| `list_metrics` | optional status filter | name, metric_id, status, one-line description for every `v_metric__*` model |
| `get_metric` | metric name (fuzzy) or metric_id | full definition: description + entire `meta` block + labels |
| `get_lineage` | metric name or metric_id | upstream `depends_on` chain walked to sources, as an indented tree |
| `get_sql` | model name | the model's SQL |

**Known gotchas baked in:**
- Manifest `raw_code` can be a placeholder (hit on the dbt-backed Inspector) — `get_sql` reads the `.sql` file from disk (`models/**/<name>.sql`), falling back to compiled SQL in `target/compiled/` if present.
- Unknown metric → error message with closest-name suggestions (simple edit-distance or substring match).
- Missing/stale manifest → error telling the caller to run `dbt parse`.

**Scope of metrics served:** models under `models/metrics/` (the `v_metric__*` views). `get_lineage` and `get_sql` may traverse/serve intermediates since lineage requires them.

**Tests:** unit tests on the manifest-projection functions (metric listing, meta extraction, lineage walk, name resolution) using a fixture manifest slice; one tool-level smoke test against the real manifest.

## Phase 2 — Deploy (later, backlogged)

Same server behind streamable HTTP on a small host (Cloud Run / Supabase Edge Function); CI publishes `manifest.json` on merge to `main`; the endpoint becomes a claude.ai connector and the grounding surface for the future Alexander RevOps agent. Not in scope now.

## Out of scope

- BigQuery queries / metric values (no warehouse connection at all)
- Writes of any kind
- The visual catalog UI
- Supabase schema changes / registry demotion (separate TICKETS.md item)

## Security notes

- Read-only by construction; serves only content already public in this repo.
- No secrets: no BQ credentials, no Supabase keys.
