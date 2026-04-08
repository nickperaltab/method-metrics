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
        index.ts         — Edge Function (Claude Sonnet 4.5 proxy)
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

## Semantic Layer

Metrics can have human-readable field definitions stored directly on the `metrics` record (`semantic_table`, `semantic_measure`, `semantic_date_col`, `semantic_filters`, `semantic_dimensions`). When set, these replace `chart_sql` and enable any time grain + dimension breakdowns without custom SQL.

**Full reference:** `docs/semantic-layer.md` — read this before working on metric definitions, scorecards, `buildSemanticSql`, or `buildMetricContext`.

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

### Metric Statuses

- `live` — solved, verified, approved. Visible to AI, queryable in chart builder.
- `queued` — not yet solved. Invisible to AI.

## BQ Views

~24 views total across primitives, breakdowns, derived rates, and Justin's revenue/MRR views. All in `project-for-method-dw.revenue.*`.

Change a primitive (`CREATE OR REPLACE VIEW v_trials AS ...`) → all breakdowns and derived rates update automatically.

## AI Chart Builder (builder/)

React app deployed to **GitHub Pages** (same repo, `dist/` output). Users type natural language prompts ("show me trials by month") and get interactive charts backed by live BigQuery queries.

For detailed architecture, see `docs/ai-chart-builder-architecture.md`.

### How It Works

1. **Supabase `metrics` table** — the AI's "menu." On page load, all `live` metric definitions are fetched and formatted into a text catalog the AI can read.
2. **AI (Claude Sonnet 4.5)** — receives the metric catalog + BQ column schemas + user prompt. Returns a JSON config (metric IDs, chart type, time bucket, filters, colors, labels). **Does NOT write SQL or touch data.**
3. **Frontend JS** — takes the AI's JSON config, builds a SQL query, and runs it directly against BigQuery via OAuth.
4. **ECharts** — renders the query results as an interactive chart in the browser.

### What Updates Automatically

- Change a BQ view definition → charts reflect it on next load (live query)
- Change a metric formula in Supabase → reflected on page reload
- Add a new metric to Supabase → AI sees it on next page load
- Dashboard charts re-query BigQuery on load — data is always current

### Deploy

```
cd builder && npm run build
git add dist && git commit -m "build" && git push
```

GitHub Pages auto-deploys on push to `main`. Do NOT use `vercel --prod`.

## Deploy (Tracker)

Push to `main` → GitHub Pages auto-deploys to `https://nickperaltab.github.io/method-metrics/`

## Knowledge Base

The `knowledge/` directory is the accumulated learning from solving metrics. It grows every time a metric is verified.

- `knowledge/schema.md` — BigQuery schema and field reference for TransLineFlattened
- `knowledge/account-mapping.md` — entity whitelist and account type logic
- `knowledge/glossary.md` — terminology reference
- `knowledge/metrics-catalog.md` — business definitions, families, and dependencies for 155 metrics (reference doc — Supabase is the source of truth for metric IDs)
- `knowledge/routes/` — route files documenting how to solve each metric family
- `knowledge/verified-queries/` — SQL files for metrics verified to exact match against Excel

The `sources/` directory contains Excel verification files (the spreadsheet source of truth for revenue metrics).

## Metric Solver

Use `/metric-solver` to verify metrics against a source of truth. The skill interviews you, discovers the route, solves the metric, and writes back what it learned. After you approve the result, it publishes the verified SQL to Supabase and flips the metric to live.

## Principles Learned

These apply to ALL metrics. Family-specific rules live in the route files under `knowledge/routes/`.

- **Always check the metrics catalog first.** `knowledge/metrics-catalog.md` has family assignments and dependencies. Load the right route file before solving.
- **Scan related families.** A metric might depend on metrics from a different family. Check the catalog's dependency chain and scan those route files too.
- **Retention grouping: join by EntityRecordID, classify at CompanyAccount.** CompanyAccount is the correct level (customer). But CompanyAccount strings change when companies are renamed, so use EntityRecordID (stable numeric ID) for the temporal join, then aggregate to CompanyAccount before classifying. This produces EXACT match with Excel output.
- **Exclude the current incomplete month** in BQ queries. Mid-month data shows false cancellations.
- **Trace down to the cell formula** when working with spreadsheets. Don't trust summary tabs — trace to the source.

## Self-Improvement Rules

After solving or attempting to solve any metric, update the relevant files:

1. **New route discovered** — create a new file in `knowledge/routes/` documenting the pattern
2. **New gotcha discovered** — add to the relevant route file or this CLAUDE.md
3. **Existing knowledge refined** — update the relevant knowledge file
4. **General principle learned** — add to this CLAUDE.md
5. **Verified query created** — save to `knowledge/verified-queries/`

## Chart Builder Philosophy

The chart builder is a **building block system**, not a collection of pre-built templates. Every feature should give users tools to assemble what they need, not hardcode an opinionated output.

**Rules:**
- **No auto-injection.** Never add columns, metrics, computed values, or visual elements the user didn't ask for. If a user asks for "trials and syncs by channel", they get exactly those two columns — not %Δ, not trajectory, not anything else automatically appended.
- **No hardcoded chart types for specific use cases.** Don't create a `scorecard_table` or `channel_breakdown` type. Extend existing primitives (`table + group_by_dimension`) to handle new layouts.
- **Computed values = explicit metrics.** If %Δ or trajectory should appear, those need to be registered metrics in Supabase that the user explicitly selects. Auto-detecting "actual + forecast pair → add computed columns" is magic behavior that violates this rule.
- **The user decides the output.** Each chart is a combination of: metrics selected + chart type + dimension + time range. The system provides those knobs; the user turns them.

When in doubt: does the user have to explicitly ask for this, or does it happen behind their back? If behind their back, don't do it.

## Collaborators

- Nic (nickperaltab) — funnel/marketing metrics, dashboard pages
- Justin (jporter-png) — revenue model, financial metrics, verification
