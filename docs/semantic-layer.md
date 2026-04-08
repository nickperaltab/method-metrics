# Semantic Layer

The semantic layer is the system that makes metric definitions human-readable and machine-queryable without writing raw SQL. It lives in the `metrics` table in Supabase as five optional columns alongside the existing `chart_sql`/`view_name` fields.

## Why It Exists

Before the semantic layer, clicking a metric in MetricInspector showed a wall of raw SQL. Nic or Justin couldn't look at that and confirm "yes, this counts the right thing" without reading SQL. Numbers could be wrong and no one would know. Trust erodes.

With semantic fields, MetricInspector shows:

```
Source:      revenue.v_cancellations
Measure:     COUNT(DISTINCT CompanyAccount)
Date column: CancellationDate
Grains:      Daily · Weekly · Monthly · Quarterly · Yearly
Dimensions:  AttributionChannel · SignupCountry · Vertical · SyncType
```

Anyone can read that. It's auditable without SQL knowledge.

**Side effect:** `buildSemanticSql` generates correct SQL at any time grain dynamically. Previously, weekly charts required separate hardcoded SQL constants per metric.

## The Five Fields (Supabase `metrics` table)

| Column | Type | Purpose |
|--------|------|---------|
| `semantic_table` | `text` | BQ view name (without project/dataset prefix) |
| `semantic_measure` | `text` | Raw SQL aggregate expression (e.g. `COUNT(DISTINCT CompanyAccount)`, `ROUND(SUM(SaaSAmount), 2)`) |
| `semantic_date_col` | `text` | Column used for time-bucketing and date filters |
| `semantic_filters` | `text[]` | Static WHERE clauses baked into every query for this metric |
| `semantic_dimensions` | `text[]` | Columns valid for `GROUP BY` breakdowns in charts |

All five are nullable. If unset, the system falls back to `chart_sql` or `view_name`.

## Metric Types and What Each Gets

### Primitive metrics (e.g. Trials 54, Syncs 55, Conversions 56, Churn 59)
- Get all five semantic fields
- `semantic_table` points to their BQ view (`v_trials`, `v_syncs`, etc.)
- `semantic_measure` is typically `COUNT(*)` or `COUNT(DISTINCT CompanyAccount)`
- `semantic_filters` are empty `[]` — the view itself bakes in business logic (exclusions, date guards)
- `semantic_dimensions` lists categorical columns valid for chart breakdowns

### Derived / formula metrics (e.g. Sync Rate 300, Trial-to-Close Rate 302)
- No semantic fields needed
- Defined by `formula` (e.g. `SAFE_DIVIDE({55},{54})*100`) and `depends_on` (e.g. `[55, 54]`)
- Computed at runtime by `evaluateFormula` in `useScorecardData` using the fetched primitive data
- Inherit any grain their primitives support

### Complex metrics (trajectory, NRR, churn rate %)
- Keep `chart_sql` forever — multi-CTE joins, MTD extrapolation, 3-table logic
- Not convertible to semantic fields
- AI sees `has_chart_sql:true` (grain is fixed, no dimension breakdowns)

## Dimensions vs Attributes

Two kinds of columns live in a semantic view:

**Dimensions** (`semantic_dimensions`) — categorical columns with a bounded set of values. Valid for `GROUP BY` in charts. Examples: `AttributionChannel`, `SignupCountry`, `Vertical`, `SyncType`. Adding one produces a stacked bar or multi-series chart with a manageable number of series.

**Attributes** — numeric or high-cardinality columns valid for display on individual records (raw tables) but not for chart breakdowns. Examples: `LicenseCount`, `AgeMonths`, `Custdatlastsaasamount`. Grouping by `LicenseCount` would produce 200+ series.

If you want a numeric field to be chartable as a dimension, add a *bucketed* column to the BQ view instead (e.g. `AgeBucket`: `0–6mo / 6–12mo / 1–2yr / 2yr+`) and add that to `semantic_dimensions`.

## How SQL Gets Built

`buildSemanticSql(metric, timeBucket, lastNMonths, endDateRule)` in `builder/src/lib/bigquery.js`:

```
SELECT {period_expr} AS period, {semantic_measure} AS value
FROM `project-for-method-dw.revenue.{semantic_table}`
WHERE {semantic_filters} AND {lastNMonths filter}
GROUP BY 1 ORDER BY 1
```

`timeBucket` controls `period_expr`:
- `'month'` → `FORMAT_DATE('%Y-%m', DATE_TRUNC(col, MONTH))`
- `'week'` → `FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(col, WEEK(MONDAY)))`
- `'day'` → `FORMAT_DATE('%Y-%m-%d', col)`
- `'quarter'` → `FORMAT_DATE('%Y-%m', DATE_TRUNC(col, QUARTER))`
- `'year'` → `FORMAT_DATE('%Y', DATE_TRUNC(col, YEAR))`

For grouped/breakdown queries, `buildSemanticGroupedSql` adds a second SELECT column and `GROUP BY 1, 2`.

## Routing Priority

`fetchChartData` in `bigquery.js` checks in this order:
1. **Semantic fields set** → use `buildSemanticSql` (any grain, any dimension)
2. **`chart_sql` set** → use pre-written SQL (grain is fixed)
3. **`view_name` set** → use `fetchAggregatedData` (generic COUNT)

`useScorecardData` follows the same priority for both the monthly batch path and the weekly path.

## What the AI Sees

`buildMetricContext` in `builder/src/lib/ai.js` formats the metric catalog sent to Claude. For semantic metrics:

```
- id:54 name:"Trials" type:primitive view:v_trials source:v_trials grains:[daily,weekly,monthly,quarterly,yearly] dimensions:[AttributionChannel,SignupCountry,Vertical,SyncType]
```

For complex metrics:
```
- id:346 name:"NRR" type:primitive view:none has_chart_sql:true
```

This lets the AI correctly answer "show me trials weekly by country" — it knows weekly is supported and that country is a valid dimension.

`validateColumns` and `applyPromptOverrides` merge `semantic_dimensions` with the `approved_dimensions` table (both are checked) when validating whether a requested breakdown is allowed.

## Approved Metrics (as of 2026-04-07)

| ID | Name | Table | Measure | Dimensions |
|----|------|-------|---------|------------|
| 54 | Trials | v_trials | COUNT(*) | AttributionChannel, SignupCountry, Vertical, SyncType |
| 55 | Syncs | v_syncs | COUNT(*) | AttributionChannel, SignupCountry, Vertical, SyncType |
| 56 | Conversions | v_conversions | COUNT(*) | AttributionChannel, SignupCountry, Vertical, SyncType |
| 59 | Churn | v_cancellations | COUNT(DISTINCT CompanyAccount) | AttributionChannel, SignupCountry, Vertical, SyncType |
| 300 | Sync Rate | — | formula: SAFE_DIVIDE({55},{54})*100 | — |
| 301 | Sync-to-Conversion Rate | — | formula: SAFE_DIVIDE({56},{55})*100 | — |
| 302 | Trial-to-Close Rate | — | formula: SAFE_DIVIDE({56},{54})*100 | — |

## What We're Building Towards

**Goal:** Every metric Nic or Justin cares about is auditable in plain English — no SQL reading required. The definition lives on the metric record, the AI understands it, and the scorecard renders it at any grain.

**Remaining work:**
- **Cancellations** (59): pending `verified_at` stamp after Nic review
- **Revenue metrics** (26 metrics in `method_forecast` + simple view aggregates): semantic fields drafted in the migration plan, not yet applied. Blocked only by Justin confirming which metric IDs survive his revenue audit.
- **Bucketed attributes** for Cancellations: `AgeBucket`, `LicenseTier` columns in `v_cancellations` → would unlock breakdown charts by those dimensions
- **Revenue dimension breakdowns**: `v_new_net_saas` etc. don't have Country/Vertical — requires Justin to update BQ views

## Revert Strategy

Semantic fields are additive. To revert any metric to its old behavior:

```sql
UPDATE metrics
SET semantic_table=NULL, semantic_measure=NULL, semantic_date_col=NULL,
    semantic_filters=NULL, semantic_dimensions=NULL
WHERE id = <metric_id>;
```

The system falls back to `chart_sql` automatically.
