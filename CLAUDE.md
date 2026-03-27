# method-metrics

Shared metric tracker and dashboard for Method CRM. Deployed to GitHub Pages.

## What This Is

A single-page metric tracker that loads all 242+ metrics from Supabase and displays them as an editable, filterable table. Connects to BigQuery via OAuth for live data queries and breakdown lenses.

**No build step. No npm. No framework.** Open `tracker.html` in a browser and it works.

## Architecture

- **BigQuery** — source of truth for metric SQL. ~24 BQ views in `revenue` dataset (primitives → breakdowns → derived + Justin's revenue views).
- **Supabase** — metric registry/catalog. Stores metadata: name, view_name, chart_sql, depends_on, status, priority, assigned_to, notes. Also caches `view_definition` from BQ for offline viewing.
- **Frontend** — vanilla HTML/JS. Calls Supabase REST API (anon key) for catalog, Google OAuth + BQ REST API for live data.

## Files

```
index.html               — Landing page
tracker.html             — Metric tracker (main app)
builder/                 — AI Chart Builder (React + Vite)
  src/
    lib/
      ai.js              — buildMetricContext(), generateChartSpec(), response validation
      bigquery.js        — BQ OAuth, fetchAggregatedData(), fetchChartData(), fetchYoYData(), fetchKpiData()
      chartUtils.js      — buildEChartsOption(), computeDerived(), formatDateLabels()
      schemaCache.js     — shared BQ schema cache (singleton)
      supabase.js        — fetchMetrics(), saveChart()
      fieldMapper.js     — maps view columns to canonical field names
    components/
      ChatExplorer.jsx   — conversational chart builder (main entry point)
      Explorer.jsx       — single-shot chart builder
      DashboardView.jsx  — dashboard with live-loading charts
      EChart.jsx         — ECharts wrapper with Method dark theme
      ChatInterface.jsx  — chat panel component
      ChatModal.jsx      — modal wrapper for chat
      DashboardList.jsx  — dashboard list/selector
      KpiCard.jsx        — KPI tile component
      SaveChartModal.jsx — save/name chart modal
      TopBar.jsx         — app top navigation
      ChartControls.jsx  — chart type/bucket controls
      ChartDetails.jsx   — chart metadata panel
      DataTableView.jsx  — tabular data view
      AiPrompt.jsx       — prompt input component
  supabase/
    functions/
      ai-chart/
        index.ts         — Edge Function (Claude Haiku proxy)
docs/
  ai-chart-builder-architecture.md  — comprehensive developer/AI-session reference
```

## Key Patterns

- Supabase anon key is in `tracker.html` — safe to expose, RLS controls access
- BQ OAuth uses client ID `546732685010-nojjfak7esmun2taour8r5pakrsrg3aq.apps.googleusercontent.com`
- Authorized JS origins for OAuth: `https://nickperaltab.github.io`, `http://localhost:*`
- Inline editing saves via PATCH to Supabase REST API
- Breakdown lenses generate SQL dynamically from primitive schema definitions
- `view_definition` column in Supabase = cached copy of BQ view SQL (sync manually when views change)

## Supabase Table: metrics

Key columns:
- `view_name` — which BQ view this metric queries
- `view_definition` — cached SQL from BQ INFORMATION_SCHEMA
- `chart_sql` — pre-written query for pre-aggregated views (returns `{period, value}` pairs); used for revenue/MRR metrics that can't use generic GROUP BY
- `depends_on` — integer[] of metric IDs this depends on
- `primitive_metric_id` — FK to parent metric (for breakdowns)
- `status` — live / ready / review / catalog (see graduated metrics system below)
- `priority` — high / medium / low
- `assigned_to` — Nic / Justin / null
- `verified_at` — timestamp of last verification

### Graduated Metrics Status

- `live` — visible to AI, queryable in chart builder
- `ready` — audited and waiting for approval, not yet visible to AI
- `review` — registered but not verified, invisible to AI
- `catalog` — placeholder name only, no SQL defined

## BQ Views

~24 views total across primitives, breakdowns, derived rates, and Justin's revenue/MRR views. All in `project-for-method-dw.revenue.*`.

Change a primitive (`CREATE OR REPLACE VIEW v_trials AS ...`) → all breakdowns and derived rates update automatically.

## AI Chart Builder (builder/)

React app deployed to **GitHub Pages** (same repo, `dist/` output). Users type natural language prompts ("show me trials by month") and get interactive charts backed by live BigQuery queries.

For detailed architecture, see `docs/ai-chart-builder-architecture.md`.

### How It Works

1. **Supabase `metrics` table** — the AI's "menu." On page load, all `live` metric definitions are fetched and formatted into a text catalog the AI can read.
2. **AI (Claude Haiku 4.5)** — receives the metric catalog + BQ column schemas + user prompt. Returns a JSON config (metric IDs, chart type, time bucket, filters, colors, labels). **Does NOT write SQL or touch data.**
3. **Frontend JS** — takes the AI's JSON config, builds a SQL query, and runs it directly against BigQuery via OAuth.
4. **ECharts** — renders the query results as an interactive chart in the browser.

### What Updates Automatically

- Change a BQ view definition → charts reflect it on next load (live query)
- Change a metric formula in Supabase → reflected on page reload
- Add a new metric to Supabase → AI sees it on next page load
- Dashboard charts re-query BigQuery on load — data is always current

### Deploy

```
cd builder && npm run build && vercel --prod
```

(Vercel deploys from `dist/`; the output is also what GitHub Pages serves.)

## Deploy (Tracker)

Push to `main` → GitHub Pages auto-deploys to `https://nickperaltab.github.io/method-metrics/`

## Collaborators

- Nic (nickperaltab) — funnel/marketing metrics, dashboard pages
- Justin (jporter-png) — revenue model, financial metrics, verification
