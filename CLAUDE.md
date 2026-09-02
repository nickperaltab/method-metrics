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
- View DDL displayed in the Registry/Inspector is fetched live from BigQuery `INFORMATION_SCHEMA.VIEWS` via `useViewDefinition` (`builder/src/lib/useViewDefinition.js`). The legacy `view_definition` column on `metrics` is no longer read; it remains in the schema for historical/archival rows but should not be relied on (it drifted whenever a BQ view was updated without re-syncing). Drop the column when convenient.

## Semantic Layer

Metrics can have human-readable field definitions stored directly on the `metrics` record (`semantic_table`, `semantic_measure`, `semantic_date_col`, `semantic_filters`, `semantic_dimensions`). When set, these replace `chart_sql` and enable any time grain + dimension breakdowns without custom SQL.

**Full reference:** `docs/semantic-layer.md` — read this before working on metric definitions, scorecards, `buildSemanticSql`, or `buildMetricContext`.

## Supabase Table: metrics

Key columns:
- `view_name` — which BQ view this metric queries
- `view_definition` — *deprecated* legacy cached DDL column. The Registry/Inspector now fetches live DDL from BQ via `useViewDefinition`; this column is no longer read and should not be populated for new metrics.
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

### Semantic-layer invariants

When creating or editing a metric that uses the semantic layer, set both:

- `semantic_table` (e.g. `v_customer_annual_mrr`)
- `view_name` — same value as `semantic_table` (drives the BQ Console link)

The DDL panel is fetched live from BigQuery via `useViewDefinition` (see `builder/src/lib/useViewDefinition.js`), so populating the legacy `view_definition` column is no longer required.

## BQ Views

~24 views total across primitives, breakdowns, derived rates, and Justin's revenue/MRR views. All in `project-for-method-dw.revenue.*`.

Change a primitive (`CREATE OR REPLACE VIEW v_trials AS ...`) → all breakdowns and derived rates update automatically.

### Querying BQ for verified metrics

Method's BQ has TWO datasets that matter for metric work:

| Dataset | Contents | Trust level |
|---|---|---|
| **`revenue_metrics`** | The 20 verified `v_metric__*` views — dbt-managed, fully documented (descriptions + labels), parity-verified | ✅ Verified — quote freely |
| **`revenue`** | Raw sources (Account, Funnel, TransLineFlattened, method_forecast), intermediates (int_trials, int_customers, int_customer_mrr, etc.), deprecated aliases (v_*), and Justin's hand-written revenue views (v_saas_mrr, v_new_mrr, v_channel_scorecard, breakdowns) | ⚠️ Mixed — verify before quoting |

**Rules for any BQ query path (Claude/MCP, ad-hoc, etc.):**

- For canonical metric values (the answer to "what's X for period Y?"): query `revenue_metrics.v_metric__*`. Every view there has a description and `status: live` label.
- For dimensional slicing (group by channel, segment, vertical, etc.): query the corresponding `revenue.int_*` intermediate. These have descriptions too but are at row-level grain.
- For raw exploration: source tables in `revenue` (Account, Funnel, TransLineFlattened).
- **Avoid views without descriptions** (the trust signal). Anything in `revenue` lacking a description in `INFORMATION_SCHEMA.TABLE_OPTIONS` is unverified, ad-hoc, or historical — don't quote externally without confirming.

The 20 v_metric__* views also exist as deprecated aliases in `revenue` (pointing at `revenue_metrics.v_metric__*`) so any legacy bookmark / saved query keeps working. Those aliases will be dropped in a future round.

To list the verified catalog:
```sql
SELECT REPLACE(table_name, 'v_metric__', '') AS metric, option_value AS description
FROM `project-for-method-dw.revenue_metrics.INFORMATION_SCHEMA.TABLE_OPTIONS`
WHERE option_name = 'description' ORDER BY 1
```

### Snapshot before changing any BQ view DDL

**Always capture the pre-change query result before modifying a BQ view, then compare to the post-change result.** Don't just say "looks in range" or "row count matches expectations" — show a row-by-row diff against the actual previous values.

Concretely, before any `CREATE OR REPLACE VIEW`:

1. Run the canonical query against the current view (e.g. `SELECT period, COUNT(*) FROM v_trials GROUP BY period ORDER BY period DESC LIMIT N`) and save the output.
2. Apply the change.
3. Run the same query against the new view.
4. Diff the two — report exact match or surface differences explicitly.

If the change is structural (joins, filters change), use BigQuery time-travel (`FOR SYSTEM_TIME AS OF`) where possible to verify, but **do the snapshot step first** — time-travel windows are short and can be invalidated by the very `CREATE OR REPLACE` you're about to run.

This applies to: any view DDL changes, any column addition/removal to a view, any filter or projection change. The "I made a small change so it's probably fine" framing has produced bad parity checks. Always compare to the actual prior values.

### Define every metric before flipping it `live`

A metric does not flip to `status: live` in dbt or Supabase until it has a filled-in entry in [`docs/metric-definitions.md`](docs/metric-definitions.md). The template + workflow live at the top of that file.

**Why this rule exists:** SQL that compiles + parity-checks can still answer a different question than the metric's name implies. We caught this on Syncs and Sync Rate in May 2026 — both shipped with bit-identical values to historical, but the name suggests entity counts while the math computes event counts. A ~13% inflation hidden in plain sight. The definition doc forces a name-vs-math reconciliation before live.

**The non-negotiable fields** for any metric going live:
- "What it answers in one sentence" — plain-English business question
- "Grain" — event / account / customer / period — and explicit if the name doesn't disambiguate
- "Filters / exclusions" — every WHERE clause, with WHY
- "Methodology source" — where the canonical definition came from (Excel file, Justin's verified-queries, CEO confirmation date)
- "Parity-verified against" — source + date + values matched
- "Known caveats" — anything a consumer should know (pre-FX, in-progress month excluded, account vs customer grain, etc.)

(Note: there is no per-metric "owner" field. Nic is the PM for all 20 metrics. Justin is the methodology authority specifically on the revenue family (#378-389) because the CEO assigned him that responsibility — but that's a methodology question for ambiguous cases, not a generic ownership pattern.)

Metrics that fail the audit checklist in `metric-definitions.md` §3 (e.g. "does the math match the name?") flip to `status: under_review`, not `live`, until the owner resolves the ambiguity.

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

## Local UI Dev Note

For UI-only work on the Vite builder, run the offline mock mode:

```bash
npm run dev:mock
```

No Google sign-in, no network. Serves synthetic fixtures in place of BigQuery
and Supabase, shows a **Mock data** badge in the top bar, and stubs out PostHog.
All of it is gated on `import.meta.env.DEV` as well as the env var, so a
production build can never serve fixtures.

**Full reference: `docs/local-ui-dev.md`** — read it before adding a screen, and
before touching anything in `builder/src/dev/`. The fixtures are public-repo-safe
fakes and must stay that way; never paste a real BQ result into them.

The PS project tracker (`/projects`) is built — board, create/edit, per-project
work log with markdown notes, and delivered-vs-promised efficiency ratings — but
has **no backing store yet**, so it only works in mock mode and is kept out of the
nav. Read `docs/ps-project-tracker.md` before extending it: the fixture shape is
its draft schema, `lib/projectsStore.js` is the seam a real store plugs into, and
the store choice (BigQuery vs. Supabase) is still open.

The EOD follow-through screen has **no route**. `pages/Eod.jsx`, `lib/eod.js` and
their tests are still in the tree, but `/eod` was taken out of the router and the
nav on 2026-08-13 — the screen lists findings it can't act on until the Draft and
Dismiss writes exist. Read `docs/ps-eod-followups.md` before putting it back: it
reads real BigQuery (`call_prep.time_killer_findings`, written by the
`/time-killer` routine), the table is append-only and dedupes on `finding_id`
rather than `account_record_id`, and both write actions are blocked on a BigQuery
write path and on Gmail OAuth scopes.

The customer page (`/accounts/:recordId`) is the exception — it reads **real**
BigQuery tables (`customer_signals.v_conversations`, `call_audits.*`,
`customer_signals.signals_by_call`, `call_prep.snapshots`) and works outside mock
mode. Read `docs/ps-customer-page.md` first; it documents two upstream data
problems that constrain it: the audit tables key on an account *name* so only
~28% of PPU audits can be joined, and `customer_signals.conversations` is 291 MB
unclustered, so touching `transcript_text` scans the whole table.

The older `VITE_BYPASS_AUTH=true` flag still works but only opens the sign-in
gate — BigQuery stays real, so the PS pages error out. Prefer `dev:mock`. Do not
enable either in shared/staging/prod environments.

## UI copy and design standards

Before writing or reviewing any user-facing text, screen, form or table in
`builder/`, load the **`ui-review`** skill
(`builder/.claude/skills/ui-review/SKILL.md`). It holds the AI-slop tells with
rewrites, microcopy length limits, the measured contrast table for this codebase's
tokens, and the interaction/accessibility checklist.

**The recurring defect to avoid:** a statement, an em dash, then reasoning nobody
asked for. Design rationale belongs in a code comment, never in the interface —
comments are free, UI text is not.

The `ui-auditor` agent (`.claude/agents/ui-auditor.md`) sweeps a feature area and
returns file:line findings with replacement text. Its first run is
`docs/ui-audit-2026-08-05.md` — 106 open findings on the project tracker, including
five contrast tokens that fail WCAG AA, 36 unlabelled form controls and 41 `<th>`
cells with no `scope`. Read that before adding a screen, so new work doesn't inherit
the same faults.

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
  - **Customer grain in the dbt stack (clarified 2026-06-23):** the shipped models flip this. `int_customers`, `int_customer_mrr`, `int_customer_annual_mrr`, and `int_customer_survival` key the customer at **`EntityRecordID`**, where one customer can own multiple `CompanyAccount`s (`AccountCount`). This matches `docs/metric-definitions.md` ("customer-level (EntityRecordID)", e.g. Customers #373). The `CompanyAccount`-as-customer line above describes the Excel deck-matching context; it is NOT how the dbt models define a customer. Confirm which grain a task needs before grouping — this exact ambiguity caused a wrong "build a CompanyAccount rollup" detour on the cohort-survival work.
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
