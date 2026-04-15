# AI Chart Builder — Developer Architecture Reference

This document is the authoritative technical reference for the AI Chart Builder. It is intended for developers and Claude sessions working on this codebase.

---

## Building Block Philosophy

The chart builder is a set of primitives, not a list of hardcoded templates.

- **No auto-injection.** Never add columns, metrics, computed values, or visual elements the user didn't ask for. Every element in the output must be traceable to an explicit user request.
- **Computed values = explicit metrics.** If a user wants %Δ vs forecast, that's a derived metric in Supabase — not something the frontend injects. The user assembles the chart by selecting metrics.
- **One chart type, many configurations.** Extend existing types (e.g., `table + group_by_dimension` = pivot) rather than adding hardcoded new types for each use case.
- **The building block creates capabilities; the user assembles the experience.**

---

## How the AI Works

The AI layer is a Supabase Edge Function at `supabase/functions/ai-chart/index.ts`. It proxies requests to **Claude Sonnet 4.5** (Anthropic API) and handles CORS. Currently version 27.

**System prompt structure:**
- Metric catalog: all `live` metrics from Supabase, formatted by `buildMetricContext()` in `ai.js`
  - Format: `ID | name | description | view_name | chart_sql | formula | depends_on | notes`
- BQ column schemas: the known date/dimension/measure columns per view (from `schemaCache.js`)
- Instructions: how to pick metric IDs, choose chart types, return valid JSON

**AI response shape:**

```json
{
  "metric_ids": [54, 56],
  "data_config": {
    "x_field": "TrialStartDate",
    "y_fields": ["COUNT", "COUNT"],
    "time_bucket": "month",
    "last_n_months": 12,
    "channel_filter": null,
    "group_by_dimension": null,
    "labels": ["Trials", "Syncs"],
    "style_rules": null,
    "target_line": null,
    "orientation": null
  },
  "echarts_type": "line",
  "show_labels": false,
  "colors": null,
  "style_rules": null,
  "explanation": "Showing trials and syncs by month for the last 12 months."
}
```

The AI **does not write SQL** and **does not see raw data**. It only picks from a known catalog of metric IDs.

**Only `live` metrics are shown to the AI.** Metrics are either `live` (verified, visible to AI) or `queued` (unsolved, invisible to AI).

**Conversational mode:** `ChatExplorer.jsx` sends the full message history (last 10 turns) plus the current chart state with each follow-up. This allows the AI to modify existing charts ("make it a bar chart", "add data labels").

**Hallucination prevention:** After the AI responds, `ai.js` validates all returned `metric_ids` against the known live set. Unknown IDs are stripped. `applyPromptOverrides()` applies deterministic keyword fixes post-AI (e.g., "YoY" → `yoy` type, "horizontal" → `horizontal_bar`).

**Dimension guard:** `validateColumns()` in `ai.js` checks `group_by_dimension` against each metric's `approved_dimensions` array. If the requested dimension isn't approved for a metric, it's cleared to null to prevent bad queries.

---

## Data Pipeline

There are three fetch paths depending on metric type. Path selection happens in `chartDataBuilder.js`, which calls the appropriate functions from `bigquery.js`.

### Path 1 — Primitive Metrics (Trials, Syncs, Conversions, etc.)

Used when: metric has a `view_name` and no `chart_sql`.

Function: `fetchAggregatedData()` in `bigquery.js`

Builds a `SELECT FORMAT_DATE('%Y-%m', dateCol), COUNT(*) FROM view GROUP BY 1` query with date and channel filters applied.

### Path 2 — Pre-aggregated / Revenue Metrics (MRR, Cancellations, Forecasts, etc.)

Used when: metric has a `chart_sql` field set.

Function: `fetchChartData()` in `bigquery.js`

Runs the `chart_sql` directly against BigQuery (no modification). Expects the query to return `{period, value}` pairs (or multi-series shape for `multiSeries: true` results).

These metrics correspond to BQ views already monthly-aggregated — the generic GROUP BY approach won't work because there's no raw event row to count.

### Path 3 — Derived / Formula Metrics (Conversion Rate, Sync Rate, etc.)

Used when: metric has a `formula` and `depends_on` array, no `view_name`.

Fetches each dependency metric via its own path, aligns by period, then evaluates the formula per bucket using `evaluateFormula()` in `sanitize.js`.

**Formula syntax:** `SAFE_DIVIDE({depId1}, {depId2}) * 100` — `{N}` is replaced with the value for metric ID N at that period.

### Path 4 — Grouped / Breakdown Charts

Used when: `data_config.group_by_dimension` is set and `echarts_type !== 'table'`.

Function: `fetchGroupedData()` in `bigquery.js`

Returns one series per dimension value (e.g., one line per channel). Each dimension value becomes a labeled dataset.

### Path 5 — Pivot Tables

Used when: `echarts_type === 'table'` AND `data_config.group_by_dimension` is set.

Function: `fetchPivotData()` in `chartDataBuilder.js`

1. For each metric: calls `fetchDimensionSnapshot()` → `{ dimValue: number }` (snapshot totals, no time bucketing)
2. Builds union of dimension values across all metrics
3. Joins into rows: `[{ dim: "SEO", "Trials": 108, "Syncs": 62 }, ...]`
4. Adds Grand Total row
5. Returns `{ pivotData, columns, queryDetails }`

Only the explicitly requested metrics appear as columns. No auto-computed columns (%Δ, trajectory, etc.) — those are explicit derived metrics the user must add.

---

## How to Add a New Metric

No code changes are needed for adding a metric. All configuration lives in Supabase.

1. **Create or confirm the BQ view** (or use an existing one)
2. **Add a row to the `metrics` table in Supabase** with:
   - `name` — display name
   - `description` — one sentence; the AI reads this to understand the metric
   - For simple event counts (Path 1): set `view_name`
   - For pre-aggregated views (Path 2): set `chart_sql` returning `period, value` columns
   - For derived rates (Path 3): set `formula` + `depends_on`
   - `approved_dimensions` — array of column names allowed for `group_by_dimension` (e.g., `["AttributionChannel"]`)
   - `notes` — optional; included in AI context for disambiguation
3. **Set `status: 'live'`** to make it visible to the AI
4. **No deploy needed** — AI reads metric catalog fresh on each page load

---

## Metric Statuses

| Status | Visible to AI | Description |
|--------|:---:|---|
| `live` | Yes | Solved, verified, approved |
| `queued` | No | Not yet solved |

---

## Chart Types Supported

| Type | Notes |
|------|-------|
| `line` | Time series, single or multi-series |
| `bar` | Vertical bar, single or grouped |
| `stacked_bar` | Stacked vertical bars; supports `orientation: "horizontal"` |
| `horizontal_bar` | Horizontal bar (ranked comparisons, no time axis) |
| `pie` | Pie / donut |
| `combo` | Bar + line on same axis |
| `funnel` | Funnel chart |
| `heatmap` | Month × year or similar 2D grid |
| `area` | Area chart |
| `yoy` | Year-over-year comparison (primitive metrics only) |
| `variance` | Actual vs target/forecast — bars turn red/green vs dashed line. Requires exactly 2 metrics. |
| `table` | Time-series tabular view. With `group_by_dimension` → pivot table (rows = dimension values, columns = metrics). |
| `kpi` | Single big number tile. Only for primitive count metrics (not derived). |

Chart rendering is handled by `buildEChartsOption()` in `chartUtils.js`. The `EChart.jsx` component applies the Method dark theme.

---

## Key Files

```
builder/src/lib/ai.js                    — buildMetricContext(), generateChartSpec(), applyPromptOverrides(),
                                           validateColumns(), ID validation
builder/src/lib/bigquery.js              — BQ OAuth, fetchAggregatedData(), fetchChartData(),
                                           fetchGroupedData(), fetchYoYData(), fetchKpiData(),
                                           fetchDimensionSnapshot()
builder/src/lib/chartDataBuilder.js      — fetchChartDatasets() (multi-metric fetch + label alignment),
                                           fetchPivotData() (pivot table join)
builder/src/lib/chartUtils.js            — buildEChartsOption(), computeDerived(), formatDateLabels(),
                                           applyLastNMonths()
builder/src/lib/schemaCache.js           — shared BQ schema cache (singleton, avoids re-fetching schemas)
builder/src/lib/supabase.js              — fetchMetrics(), saveChart(), fetchDashboards()
builder/src/lib/fieldMapper.js           — maps BQ view columns to canonical field names
builder/src/lib/sanitize.js              — evaluateFormula(), validateIdentifier() (SQL injection guards)
builder/src/components/ChatExplorer.jsx  — conversational chart builder (main entry point)
builder/src/components/Explorer.jsx      — single-shot chart builder
builder/src/components/DashboardView.jsx — dashboard, re-queries BQ on load (live data)
builder/src/components/EChart.jsx        — ECharts wrapper with Method dark theme
builder/src/components/DataTableView.jsx — tabular view; pivot mode when pivotData prop is set
builder/src/components/KpiCard.jsx       — KPI tile component
supabase/functions/ai-chart/index.ts     — Edge Function (Claude Sonnet 4.5 proxy, currently v27)
```

---

## Deploy

```
cd builder && npm run build
git add dist && git commit -m "build" && git push
```

GitHub Pages auto-deploys on push to `main`. **Do not use `vercel --prod`** — GitHub Pages is the only deployment target.

---

## Testing

```bash
cd builder && npx vitest run     # unit tests (fast, no network)
cd builder && npm test           # AI eval tests (live, calls Anthropic API)
```

Unit tests cover `chartUtils.js`, `ai.js` validation, and `bigquery.js` SQL generation. AI eval tests send real prompts and assert the returned `echarts_type`, `metric_ids`, and `data_config` are correct.

Add an eval test whenever a new chart scenario, edge case, or AI bug is fixed. The eval suite is the measurement instrument for prompt quality.

---

## Known Limitations

- **Derived rate KPIs produce misleading values** — the "latest period" logic breaks when dependencies have different date columns. Derived metrics fall back to bar chart instead of KPI tile.
- **YoY only for primitive metrics** — `fetchYoYData()` uses generic date-column detection. Revenue/derived metrics are not supported.
- **Schema detection picks the first DATE column** — if a view has multiple date columns, the wrong one may be selected. Fix: use `chart_sql` instead, or add an explicit `date_column` column to the metric row.
- **Viewer mode requires personal BigQuery OAuth** — every request runs in the browser using the viewer's token. Anyone without `bigquery.jobs.create` access sees the "Connect BigQuery" gate. Public read-only mode requires a backend proxy or service-account layer.
- **Metric catalog scales linearly with prompt size** — the entire `live` metrics set (~50+ rows) plus view schemas is sent to Claude on each request. As the catalog grows past ~100 metrics, context cost and selection accuracy degrade. Long-term fix: semantic retrieval layer or 2-call Haiku architecture (researched, not yet implemented).
- **One reply can spawn many BQ jobs** — grouped charts, derived metrics, and KPI tiles issue separate queries per metric and dependency. A single prompt with three metrics + a breakdown can issue 6–10 concurrent jobs.

---

## Pre-Launch Security / Auth TODOs

1. **Rotate the Supabase anon key or move to user auth before GA.** The builder ships an anon key that can create/update charts, dashboards, and conversations client-side. Ensure RLS locks every table to authenticated users before inviting the broader org.
2. **Require login for editing.** Gate `builder/` routes behind Supabase Auth once the admin workflow is stable.

---

## Why We're Not Rebuilding Looker

Looker bundles a much wider surface area (explore UI, governed drill paths, alerting/email delivery, fine-grained permission groups, etc.), but those features come with significant overhead. Our scope: consistent metric definitions, a server-side query layer, and a Claude-driven chart UX. By cherry-picking those core ideas and leaving the rest for later, we iterate quickly without inheriting the full weight of a BI platform.
