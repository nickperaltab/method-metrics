---
name: migrate-metric-to-dbt
description: Use when migrating an existing metric from Supabase to dbt-managed BQ, or adding a new metric to method-metrics. Codifies the proven Phase-1 migration pattern (snapshot → build → parity-verify → update consumers → soft-alias) so future migrations don't reinvent the workflow and don't break production.
---

# Migrating a metric to dbt-managed BigQuery

This skill is the canonical recipe for adding a metric to method-metrics' dbt layer. It was distilled from migrating all 20 live metrics in Phase 1 (2026-05-04 → 2026-05-14). Every step is here because we hit the corresponding failure mode at least once.

## When to use this skill

Trigger this skill when any of the following:

- Adding a new metric that doesn't exist yet
- Migrating an existing Supabase-only metric to dbt-managed BQ
- Modifying an existing metric's underlying intermediate or filter logic
- Renaming a metric or its source view

## When NOT to use this skill

- Pure documentation updates (use metric-definitions.md directly)
- Updating a description without changing math (just edit the yml + `dbt run --select <model>`)
- Cosmetic refactors with no value change

---

## The 7-step recipe

### Step 1 — Capture the canonical Supabase definition

Read the metric's row in `metrics` table:

```bash
curl -s "https://agkubdpgnpwudzpzcvhs.supabase.co/rest/v1/metrics?id=eq.<ID>&select=id,name,semantic_table,semantic_measure,semantic_date_col,semantic_filters,chart_sql,depends_on,status" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
```

You need to know:
- `semantic_measure` (e.g., `COUNT(*)`, `ROUND(SUM(StartMRR), 2)`)
- `semantic_table` (which BQ source view)
- `semantic_date_col` (period grouping column)
- `semantic_filters` (any WHERE clauses — **don't forget these**, see "Common Pitfalls")
- `depends_on` (for ratio/derived metrics)

### Step 2 — Snapshot pre-change values

**Required by CLAUDE.md.** Run the canonical query and save N months of values:

```sql
SELECT
  <semantic_date_col> AS period,
  <semantic_measure> AS value
FROM `project-for-method-dw.revenue.<semantic_table>`
WHERE <semantic_filters>
  AND <semantic_date_col> >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
GROUP BY 1 ORDER BY 1
```

Save the output. You'll diff against it after `dbt run`.

### Step 3 — Build the dbt model

Two files in `models/metrics/`:

**`v_metric__<slug>.sql`** — the SELECT body:

```sql
{{ config(materialized='view') }}

-- Canonical metric: "<Name>" (#<ID>)
-- Type: <simple | ratio | derived | cumulative>
-- Materialization: rolling 24 months ending at the current day

SELECT
  <semantic_date_col> AS period,
  <semantic_measure> AS value
FROM {{ source('revenue', '<semantic_table>') }}
WHERE <semantic_filters>
  AND <semantic_date_col> >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1
```

**`v_metric__<slug>.yml`** — the catalog metadata + consumer-facing description:

```yaml
models:
  - name: v_metric__<slug>
    description: |
      <Consumer-facing description per docs/metric-definitions.md §2a:
       What it counts (1 sentence) + grain explicitly + key caveat or
       pointer. No internal jargon. No file paths. No dbt vocabulary.>
    config:
      materialized: view
      labels:
        metric_id: '<ID>'
        layer: metrics
        type: <simple | ratio | derived | cumulative>
        status: live
        verified_at: 'YYYY-MM-DD'
        source_table: <semantic_table>
        source_measure_safe: <snake_case_of_measure>
        depends_on: ''
```

For ratio metrics: numerator + denominator are FK-style `{{ ref('v_metric__X') }}` references; see existing `v_metric__sync_rate.sql` as template.

For derived metrics with multi-input formulas: see `v_metric__monthly_grr.sql` as template.

If the source table isn't in `models/_sources.yml`, add it.

### Step 4 — Compile + run

```bash
DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1 /Users/nicolas/.local/bin/dbt compile
DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1 /Users/nicolas/.local/bin/dbt run --select v_metric__<slug>
```

Both should report `Summary: N total | N success`.

### Step 5 — Parity-check against the snapshot

**Required.** Diff post-change values against the snapshot from Step 2 — penny-match expected for simple/sum metrics, 6-decimal-match for ratios:

```sql
WITH expected AS (
  -- the values you snapshotted in Step 2
  SELECT 'YYYY-MM' AS period, <value> AS expected UNION ALL
  ...
)
SELECT e.period,
  CASE WHEN m.value = e.expected THEN '✓'
       ELSE CONCAT('✗ diff=', CAST(m.value - e.expected AS STRING)) END AS check
FROM `project-for-method-dw.revenue.v_metric__<slug>` m
JOIN expected e ON FORMAT_DATE('%Y-%m', m.period) = e.period
ORDER BY e.period DESC
```

If any month diverges: **stop, investigate, don't proceed.** The dbt model has drift from the Supabase canonical.

### Step 6 — Document in metric-definitions.md

Add a complete entry to `docs/metric-definitions.md` §4 using the template at §1. Include:

- "What it answers in one sentence" (consumer-facing)
- "The math" (the actual SQL)
- "Grain" (event / account / customer / period — explicit, with example)
- "Filters / exclusions" (every WHERE with WHY)
- "Methodology source" (where the definition came from)
- "Parity-verified against" (snapshot date + how many months matched)
- "Status" (`live` only if audit checklist passes; else `under_review`)
- "Known caveats" (FX, in-progress month, account-vs-customer grain, etc.)
- "Used by" (Method Monday section, AC, etc.)

Run the §3 audit checklist:
- Does the math match the name?
- Grain match?
- Event vs entity match?
- Numerator/denominator match (for ratios)?
- Filter match?
- Currency/FX match?
- Cohort definition match?
- Methodology consistency (does it inherit upstream methodology like Prepay Expiry)?

If any audit question is "no" or "unclear," metric stays `under_review` until resolved.

### Step 7 — Update consumers (only when migrating, not when adding new)

If this metric was previously consumed elsewhere with old names/paths:

1. **Supabase metric row**: PATCH `view_name` and `semantic_table` to the new BQ view
2. **Production code** (`builder/src/lib/bigquery.js`, `builder/src/config/scorecards/*.js`): update references
3. **Downstream BQ views**: any view that queries the old source needs its DDL updated
4. **Rebuild chart builder**: `cd builder && npm run build && git add dist && git commit + push`
5. **Soft-alias the old source** (if renaming): `CREATE OR REPLACE VIEW <old> AS SELECT * FROM <new>` — keeps external consumers working
6. **DO NOT drop the old source yet** — soft alias for ~2-4 weeks, then check `INFORMATION_SCHEMA.JOBS_BY_PROJECT` for residual usage, then drop

---

## Common pitfalls (from Phase 1 retros)

### "Math compiles + parity-checks but the name lies"

We hit this on Syncs and Sync Rate. The math counted events; the name suggested entities. Parity passes (matches historical) but the metric was always answering a different question than its name implied.

**Catch this in Step 6's audit:** "Does the math match the name?" Specifically check grain explicitly — account vs. customer vs. event is the #1 source of confusion.

If unsure, flip status to `under_review` and surface to the owner. **Don't ship to `live` without resolution.**

### "I forgot the semantic_filters"

We almost shipped #373 Customers without its `IsActive = TRUE` filter. The values would have matched anyway (because v_customers only contains active rows) but the dbt model would have drifted from the canonical Supabase definition.

**Always copy ALL of `semantic_filters` into the WHERE clause**, even if it seems redundant.

### "I used the wrong column for revenue"

The CRO flagged `v_converted_mrr` using `Custdatlastsaasamount` (drifts upward over time) instead of `SaaSAmount` from TransLineFlattened (the canonical revenue column).

**For any revenue metric, the canonical column is `SaaSAmount` on TransLineFlattened.** Never `Custdatlastsaasamount` (that's a snapshot column from Account).

### "I declared a non-unique column as primary entity"

We initially declared `CompanyAccount` as primary on v_trials, but `CompanyAccount` is foreign-key-grained (multiple accounts per company). MetricFlow accepted it but joins downstream would have been wrong.

**Primary entity must be unique per row.** If no column is unique-per-row, use no primary entity (foreign-only is valid in latest-spec).

### "I tried to dbt run a passthrough that self-references"

`SELECT * FROM revenue.v_trials` as a dbt model named `v_trials` → dbt creates `revenue.v_trials` from itself → destroys the real DDL. Caught by a hook but worth knowing.

**Either rename the model (e.g., `int_trials` materializing as `revenue.int_trials`) or inline the source SQL directly.**

### "I dropped a view that had downstream consumers I didn't know about"

Always do the full audit before dropping:

- `INFORMATION_SCHEMA.VIEWS` (other BQ views that query this view)
- Supabase `metrics` table (live + queued rows)
- `builder/src/` (chart builder code)
- `builder/dist/` (deployed bundle — verify it's rebuilt too)
- `INFORMATION_SCHEMA.JOBS_BY_PROJECT` over the last 30 days (find ad-hoc queries by humans)

For Phase 1.5 we found 11 downstream BQ views, 13 Supabase rows, 4 scorecard configs, and the chart builder dist/ all needed updating before drops would be safe.

**Default to soft-alias before hard-drop.** It's the only way to safely handle external systems (Looker, personal saved queries, scheduled jobs) that we have no visibility into.

---

## Templates

### Simple metric (e.g., Trials, Customers)

See `models/metrics/v_metric__trials.{sql,yml}` and `models/metrics/v_metric__customers.{sql,yml}` as canonical examples.

### Ratio metric (cross-model)

See `models/metrics/v_metric__sync_rate.{sql,yml}`.

### Derived metric (multi-input formula)

See `models/metrics/v_metric__monthly_grr.{sql,yml}` and `v_metric__monthly_nrr.{sql,yml}`.

### Source declaration

See `models/_sources.yml`.

---

## What goes in BQ vs. what stays in dbt files

Critical to understand because consumers (Claude/MCP, chart builder, BI tools) only see what's in BQ:

| Place | What lives there | Who sees it |
|---|---|---|
| `models/metrics/<name>.yml` description field | Consumer-facing description (per §2a format) | dbt at compile time → propagated to BQ via `+persist_docs` |
| `models/metrics/<name>.yml` labels block | Catalog metadata (metric_id, layer, type, status, owner, depends_on, etc.) | dbt → propagated to BQ as view labels |
| BQ `INFORMATION_SCHEMA.TABLE_OPTIONS` | Same description + labels above | Every BQ consumer |
| `docs/metric-definitions.md` entry | Long-form definition (audit checklist results, methodology source, parity history, caveats) | Team members reviewing the repo (NOT BQ consumers) |
| Supabase `metrics` row | Pointer fields (view_name, semantic_table, semantic_date_col, semantic_measure, status, etc.) | Chart builder + tracker UI |

The BQ description IS the consumer's window. Treat it as such — short, sharp, no jargon.

---

## Final checklist before flipping a metric to `live`

- [ ] Snapshotted pre-change values
- [ ] dbt model compiled cleanly
- [ ] dbt run succeeded
- [ ] Parity-check passed (penny-match for simple/sum; 6-decimal for ratios)
- [ ] BQ description follows the consumer-facing format (§2a)
- [ ] BQ labels include all 9 standard fields (metric_id, layer, type, status, owner, verified_at, source_table, source_measure_safe, depends_on)
- [ ] Description shows up in `bq show project:dataset.view` output
- [ ] Entry in `docs/metric-definitions.md` §4 is complete
- [ ] Audit checklist (§3) all passed
- [ ] If renaming/replacing: Supabase rows updated, builder code updated, downstream views updated, soft-aliases in place
- [ ] Status flipped to `live` (in both the yml `labels.status` and the Supabase row)

---

## Related docs

- `docs/metric-definitions.md` — the canonical metric definitions (template + §2a description format + §3 audit checklist)
- `docs/dbt-architecture.md` — target architecture
- `docs/dbt-layers-explained.md` — what sources / intermediates / marts / metrics mean
- `docs/dbt-roadmap.md` — phase tracking
- `CLAUDE.md` (under "BQ Views") — the snapshot-before-change rule + define-before-live rule
- `knowledge/verified-queries/` — Justin's CEO-confirmed canonical SQL patterns (for any revenue methodology questions)

---

*Skill created 2026-05-14 from the Phase 1 + Phase 1.5 migration of 20 metrics. Update as new patterns emerge.*
