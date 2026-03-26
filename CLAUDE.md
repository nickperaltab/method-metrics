# method-metrics

Shared metric tracker and dashboard for Method CRM. Deployed to GitHub Pages.

## What This Is

A single-page metric tracker that loads all 242+ metrics from Supabase and displays them as an editable, filterable table. Connects to BigQuery via OAuth for live data queries and breakdown lenses.

**No build step. No npm. No framework.** Open `tracker.html` in a browser and it works.

## Architecture

- **BigQuery** — source of truth for metric SQL. 47 BQ views in `revenue` dataset (primitives → breakdowns → derived).
- **Supabase** — metric registry/catalog. Stores metadata: name, view_name, depends_on, status, priority, assigned_to, notes. Also caches `view_definition` from BQ for offline viewing.
- **Frontend** — vanilla HTML/JS. Calls Supabase REST API (anon key) for catalog, Google OAuth + BQ REST API for live data.

## Files

```
index.html       — Landing page
tracker.html     — Metric tracker (main app)
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
- `depends_on` — integer[] of metric IDs this depends on
- `primitive_metric_id` — FK to parent metric (for breakdowns)
- `status` — live / have-data / review / missing / broken
- `priority` — high / medium / low
- `assigned_to` — Nic / Justin / null
- `verified_at` — timestamp of last verification

## BQ Views

9 primitives, 28 breakdowns, 5 derived rates, 4 MRR views, 1 scorecard MTD composite. All in `project-for-method-dw.revenue.*`.

Change a primitive (`CREATE OR REPLACE VIEW v_trials AS ...`) → all breakdowns and derived rates update automatically.

## AI Chart Builder (builder/)

React app deployed to Vercel. Users type natural language prompts ("show me trials by month") and get interactive charts.

### How It Works

1. **Supabase `metrics` table** — the AI's "menu." On page load, all metric definitions are fetched and formatted into a text catalog the AI can read.
2. **AI (Claude Haiku 4.5)** — receives the metric catalog + BQ column schemas + user prompt. Returns a JSON config (metric IDs, chart type, time bucket, filters). **Does NOT write SQL or touch data.**
3. **Frontend JS** — takes the AI's JSON config, builds a SQL query, and runs it directly against BigQuery via OAuth.
4. **ECharts** — renders the query results as an interactive chart in the browser.

### Key Files

```
builder/src/lib/ai.js            — buildMetricContext(), generateChartSpec()
builder/src/lib/bigquery.js      — fetchAggregatedData(), builds SQL from AI config
builder/src/lib/supabase.js      — fetchMetrics(), saveChart()
builder/src/components/Explorer.jsx      — main chart page, orchestrates the flow
builder/src/components/ChatExplorer.jsx  — chat-style variant
builder/src/components/ChartRenderer.jsx — ECharts rendering
builder/src/lib/chartUtils.js    — buildEChartsOption(), computeDerived()
supabase/functions/ai-chart/     — Edge Function that calls Anthropic API
```

### Derived Metrics

Metrics like "Sync Rate" have `formula: SAFE_DIVIDE({2},{1})` and `depends_on: [2,1]` in Supabase. The frontend fetches each dependency from BQ, then evaluates the formula client-side per time bucket. No BQ view needed.

### What Updates Automatically

- Change a BQ view definition → charts reflect it on next load (live query)
- Change a metric formula in Supabase → reflected on page reload
- Add a new metric to Supabase → AI sees it on next page load

### Known Gap: Saved Dashboards

Saved charts store baked-in data snapshots. Dashboards do NOT re-query BQ — they show stale data. Fix is planned but not built.

### Deploy

```
cd builder && vercel --prod
```

## Deploy (Tracker)

Push to `main` → GitHub Pages auto-deploys to `https://nickperaltab.github.io/method-metrics/`

## Collaborators

- Nic (nickperaltab) — funnel/marketing metrics, dashboard pages
- Justin (jporter-png) — revenue model, financial metrics, verification
