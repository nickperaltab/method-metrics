# AI Chart Builder — Developer Architecture Reference

This document is the authoritative technical reference for the AI Chart Builder. It is intended for developers and Claude sessions working on this codebase.

---

## How the AI Works

The AI layer is a Supabase Edge Function at `supabase/functions/ai-chart/index.ts`. It proxies requests to Claude Haiku 4.5 (Anthropic API) and handles CORS.

**System prompt structure:**
- Metric catalog: all `live` metrics from Supabase, formatted as `ID | name | description | view_name | chart_sql | formula | depends_on`
- BQ column schemas: the known date/dimension/measure columns per view (from `schemaCache.js`)
- Instructions: how to pick metric IDs, choose chart types, and return valid JSON

**AI response shape:**

```json
{
  "metric_ids": [54, 56],
  "data_config": {
    "time_bucket": "month",
    "date_range": "last_12_months",
    "filters": { "channel": "SEO" }
  },
  "echarts_type": "line",
  "show_labels": false,
  "colors": ["#4ade80", "#60a5fa"],
  "explanation": "Showing trials and syncs by month for the last 12 months."
}
```

The AI **does not write SQL** and **does not see raw data**. It only picks from a known catalog of metric IDs.

**Only `live` metrics are shown to the AI.** Metrics are either `live` (verified, visible to AI) or `queued` (unsolved, invisible to AI) — see the Metric Statuses section below.

**Conversational mode:** `ChatExplorer.jsx` sends the full message history plus the current chart state (metric IDs, config, echarts_type) with each follow-up. This allows the AI to modify existing charts (e.g., "make it a bar chart", "add data labels", "use green").

**Hallucination prevention:** After the AI responds, the frontend in `ai.js` validates all returned `metric_ids` against the known set of live metric IDs. Unknown IDs are stripped before the config is used to build queries.

---

## Data Pipeline

There are three fetch paths depending on metric type. The correct path is selected in `bigquery.js` based on the metric's Supabase row.

### Path 1 — Primitive Metrics (Trials, Syncs, Conversions, etc.)

Used when: metric has a `view_name` and no `chart_sql`.

Function: `fetchAggregatedData()` in `bigquery.js`

**What it does:**
1. Looks up the view's date column from `schemaCache.js` (auto-detected: first DATE or TIMESTAMP column)
2. Builds a query:
   ```sql
   SELECT FORMAT_DATE('%Y-%m', dateCol) AS period, COUNT(*) AS value
   FROM `project-for-method-dw.revenue.view_name`
   WHERE dateCol >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
   GROUP BY 1
   ORDER BY 1
   ```
3. Applies `agg_expression` from the metric row if set (e.g., `SUM(amount)` instead of `COUNT(*)`)
4. Applies any filters from `data_config.filters` as WHERE clauses
5. Returns `[{ period: "2025-01", value: 123 }, ...]`

### Path 2 — Foundational / Revenue Metrics (MRR, Cancellations, Expansions, etc.)

Used when: metric has a `chart_sql` field set.

Function: `fetchChartData()` in `bigquery.js`

**What it does:**
1. Runs the `chart_sql` directly against BigQuery (no modification)
2. Expects the query to return `{ period, value }` pairs (monthly, pre-aggregated)
3. Returns the rows as-is

These metrics correspond to BQ views that are already monthly-aggregated (e.g., `v_mrr_monthly`). The generic GROUP BY approach in Path 1 won't work because there's no raw event row to count — the view already returns one row per month.

**Example `chart_sql`:**
```sql
SELECT month AS period, mrr_total AS value
FROM `project-for-method-dw.revenue.v_mrr_monthly`
ORDER BY 1
```

### Path 3 — Derived / Formula Metrics (Conversion Rate, Sync Rate, etc.)

Used when: metric has a `formula` and `depends_on` array, and no `view_name`.

**What it does:**
1. Recursively fetches each dependency metric via its own path (Path 1 or Path 2)
2. Aligns all results by `period`
3. Evaluates the formula per time bucket using `computeDerived()` in `chartUtils.js`

**Formula syntax:** `SAFE_DIVIDE({depId1}, {depId2}) * 100`
- `{N}` is replaced with the value for metric ID N at that period
- `SAFE_DIVIDE` returns null if denominator is 0 (avoids divide-by-zero errors)

**Limitation:** Derived metrics cannot be rendered as KPI tiles because the dependency metrics may have different date columns, making it impossible to reliably find the "latest period" value.

---

## How to Add a New Metric

No code changes are needed for adding a metric. All configuration lives in Supabase.

1. **Create or confirm the BQ view** (or use an existing one)
2. **Add a row to the `metrics` table in Supabase** with:
   - `name` — display name (e.g., "New MRR")
   - `description` — one sentence; the AI reads this to understand the metric
   - For simple event counts (Path 1):
     - Set `view_name` to the BQ view name
     - Optionally set `agg_expression` (default is `COUNT(*)`)
   - For pre-aggregated views (Path 2):
     - Set `chart_sql` with a query returning `period, value` columns
   - For derived rates (Path 3):
     - Set `formula` (e.g., `SAFE_DIVIDE({56},{54}) * 100`)
     - Set `depends_on` (e.g., `[56, 54]`)
3. **Set `status`:**
   - Use `review` initially (invisible to AI, safe to test)
   - Use `ready` after verifying data looks correct
   - Use `live` to make it visible to the AI and chart builder users
4. **No deploy needed** — the AI reads the metric catalog fresh on each page load

---

## Metric Statuses

Controls what the AI can access. Maps to the `status` column in Supabase.

| Status | Visible to AI | Queryable | Description |
|--------|:---:|:---:|---|
| `live` | Yes | Yes | Solved, verified, approved |
| `queued` | No | No | Not yet solved |

The AI context builder (`buildMetricContext()` in `ai.js`) filters to `status = 'live'` before constructing the system prompt.

---

## Chart Types Supported

| Type | Notes |
|------|-------|
| `line` | Time series, single or multi-series |
| `bar` | Vertical bar, single or grouped |
| `stacked_bar` | Stacked vertical bars |
| `horizontal_bar` | Horizontal bar |
| `pie` | Pie / donut |
| `combo` | Bar + line on same axis |
| `funnel` | Funnel chart |
| `heatmap` | Month × year or similar 2D grid |
| `area` | Area chart |
| `yoy` | Year-over-year comparison (primitive metrics only) |
| `table` | Tabular data view |
| `kpi` | Single big number tile (not available for derived metrics) |

Chart rendering is handled by `buildEChartsOption()` in `chartUtils.js`, which maps the AI's `echarts_type` + data to a full ECharts option object. The `EChart.jsx` component applies the Method dark theme.

---

## Key Files

```
builder/src/lib/ai.js                  — buildMetricContext(), generateChartSpec(), ID validation
builder/src/lib/bigquery.js            — BQ OAuth, fetchAggregatedData(), fetchChartData(),
                                         fetchYoYData(), fetchKpiData()
builder/src/lib/chartUtils.js          — buildEChartsOption(), computeDerived(), formatDateLabels()
builder/src/lib/schemaCache.js         — shared BQ schema cache (singleton, avoids re-fetching schemas)
builder/src/lib/supabase.js            — fetchMetrics(), saveChart(), fetchDashboards()
builder/src/lib/fieldMapper.js         — maps BQ view columns to canonical field names
builder/src/components/ChatExplorer.jsx  — conversational chart builder (main entry point)
builder/src/components/Explorer.jsx      — single-shot chart builder
builder/src/components/DashboardView.jsx — dashboard, re-queries BQ on load (live data)
builder/src/components/EChart.jsx        — ECharts wrapper with Method dark theme
supabase/functions/ai-chart/index.ts     — Edge Function (Claude Haiku 4.5 proxy)
```

---

## Known Limitations

- **Derived rate KPIs produce misleading values** — the "latest period" logic breaks when dependencies have different date columns. Derived metrics fall back to bar chart instead of KPI tile.
- **YoY only for primitive metrics** — `fetchYoYData()` uses the generic date-column detection path. Revenue/derived metrics are not supported.
- **Revenue metrics require `chart_sql`** — pre-aggregated views cannot use the generic `GROUP BY dateCol` approach in `fetchAggregatedData()`.
- **Schema detection picks the first DATE column** — if a view has multiple date columns, the wrong one may be selected. Fix by explicitly setting `date_column` on the metric row (if that column is added) or by using `chart_sql` instead.
- **Data-fetching logic is partially duplicated** across `Explorer.jsx`, `ChatExplorer.jsx`, and `DashboardView.jsx` (~306 lines). A shared `useChartData` hook would consolidate this.
- **Viewer mode requires personal BigQuery OAuth** — every dashboard/chat request runs in the browser using the viewer's token. Anyone without dataset + `bigquery.jobs.create` access simply sees the "Connect BigQuery" gate, so a public/internal read-only mode will require a backend proxy or service-account query layer before we can share links broadly.
- **Metric catalog scales linearly with prompt size** — the entire `metrics` table (currently 242 rows) plus every view schema is stuffed into Claude's context on each request. At ~350–400 metrics we start approaching Anthropic's cost/context limits and the initial schema prefetch becomes slow/expensive. Long-term fix is to move to a semantic layer or retrieval-indexed catalog so we fetch only the relevant metric slices per prompt.
- **One assistant reply can spawn many BigQuery jobs** — grouped charts, derived metrics, and KPI tiles all run separate queries per metric (and per dependency) via the browser. A single prompt with three metrics + a breakdown can issue 6–10 concurrent jobs, quickly hitting per-user concurrency quotas (100 interactive jobs/user by default) and driving on-demand query cost. Back-end batching or cached aggregates are required before rolling out to larger audiences.

---

## Pre-Launch Security / Auth TODOs

1. **Rotate the Supabase anon key or move to user auth before GA.** The builder currently ships an anon key that can create/update charts, dashboards, and conversations client-side. Ensure RLS locks every table to authenticated users or swap to Supabase Auth/SSO before inviting the broader org.
2. **Require login for editing.** Even if read-only dashboards stay open, the chart builder/editor should sit behind a signed-in session so we can track ownership and enforce per-user permissions. Plan: gate `builder/` routes behind Supabase Auth (or another IdP) once the admin workflow is stable.

---

## Why We’re Not Rebuilding Looker

Looker bundles a much wider surface area (explore UI, governed drill paths, alerting/email delivery, fine-grained permission groups, etc.), but those features come with significant overhead (LookML learning curve, admin + licensing). Our scope is narrower: we need consistent metric definitions, a server-side query broker/caching layer, and a Claude-driven chart UX. By cherry-picking those core ideas (semantic layer + centralized BigQuery orchestration) and leaving the rest for later, we can iterate quickly without inheriting the full weight of a BI platform. If the org eventually needs the broader Looker feature set, we can revisit it, but for now a “Looker-lite” approach meets the revops use case.

---

## Testing

```bash
cd builder && npx vitest run     # 77 unit tests (fast, no network)
cd builder && npm test           # 25 AI eval tests (live, calls Anthropic API)
```

Total: 102 tests. Unit tests cover `chartUtils.js`, `ai.js` validation, and `bigquery.js` SQL generation. AI eval tests send real prompts and assert the returned `echarts_type` and `metric_ids` are sensible.
