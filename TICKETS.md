# Open Tickets

Backlog of known bugs and deferred improvements. Add new items here rather than in memory files.

---

## Shipped

- 2026-04-21 — RLS SELECT loosened on metrics. Non-destructive reads are now open to all authenticated sessions regardless of status; only INSERT/UPDATE/DELETE remain admin-only. Fixes "No data" on scorecards that reference queued metrics (e.g. Customers). Migration: `docs/migrations/2026-04-21-metrics-rls-select-open.md`.
- 2026-04-21 — useMetrics fetch race fixed. Previously fetched on mount before UserContext set `x-method-email`, so initial load was anonymous. Now gated on `userEmail` identity key + header set synchronously in App.jsx before useMetrics runs. Also renamed "Method Approved" sidebar header to "Scorecards" (missed in earlier approval cleanup). Metrics 373–377 (customer-segments) promoted live, verified_at left null pending audit.
- 2026-04-21 — Polish pass: removed duplicate Description column from Registry table (lives in expand only, admin-editable), simplified Add Chart modal to "My Charts" only, Home's AI Dashboards filtered to mine, Charts page defaults to My Charts.
- 2026-04-21 — Ticket 4: PostHog instrumentation. Wizard-installed baseline (bq_connected, chart_generated, chart_saved, feedback, etc.) + ticket-specific events (metric_copy_clicked, scorecard_opened, add_chart_clicked, dashboard_share_clicked, dashboard_duplicate_clicked, home_*_clicked). Explicit pageview capture via PosthogPageview component inside HashRouter. Users identified by email on BQ connect. Project key inlined (public project key, same pattern as Supabase anon).
- 2026-04-21 — Ticket 3 part 2: Share, Duplicate, Overflow menu. New `OverflowMenu` component; `duplicateDashboard()` clones dashboard + each referenced chart under current user. Share copies `?view=shared` URL; recipient sees read-only view with "Duplicate to my dashboards" button; drag handles, edit/remove chart buttons, and +Add Chart all suppressed in shared mode. Old inline Delete replaced by overflow on DashboardList rows and DashboardView header. Old "Method Approved" badge/toggle on DashboardView also removed (consistent with earlier partial).
- 2026-04-21 — Ticket 3 partial: Killed user-dashboard/chart approval UI. Home's "Method Approved" section renamed to "Scorecards"; "Review Requested" tag and "request review" button gone; "Method Approved" filter chip + badge removed from Charts and DashboardList. Neutral blue drag placeholder replaces red (react-grid-layout default). `is_approved` column + `setApproved()` left in DB for revivability. NOT shipped in this PR: Share feature, edit-chart modal, overflow menu — deferred pending product decisions.
- 2026-04-21 — Ticket 2: Registry card simplification. Name is the lead column; ID demoted to lighter secondary. In-row copy button bumped to 20px with clipboard SVG. Expand panel reorganized: description + prominent Copy-definition button at top; collapsible "More details" hides BQ view link / deps / supported grains. BQ view text is now a real link to the Google Cloud console.
- 2026-04-21 — Ticket 1: Permissions & destructive-action cleanup. Non-admins no longer see queued metrics, can't copy non-live definitions, and can't UPDATE/INSERT/DELETE on `metrics`. Enforcement at DB layer via RLS (reads `x-method-email` header). Migration doc: `docs/migrations/2026-04-21-metrics-rls.md`. Known limitation: header is client-asserted; upgrade to Edge Function proxy or Supabase Auth if external users are ever added.
- 2026-04-20 — Scorecard snapshot cache, Phase 1 (marketing-scorecard). Nightly refresh via GitHub Actions; frontend reads snapshot first, falls back to live BQ if >48h stale. Plan: `docs/superpowers/plans/2026-04-20-scorecard-snapshot-cache.md`. Rollback runbook in same plan.

---

## Bugs

### section.tables Columns Not Fetched (Scorecard Data)
**Status:** Open (pre-existing, surfaced during snapshot-cache work)
`collectMetricIds` in `builder/src/lib/sql/plan.js` and the old hook do not iterate `section.tables`. Table-column metrics (e.g. 354, 355, 358, 359, 360 in Marketing Scorecard) only render data if the metric ID also appears in a KPI or chart in the same section. Otherwise the cell is empty.
**Fix:** Extend `collectMetricIds` to walk `section.tables[].columns[].metricId`. Add test case. Re-run snapshot refresh — expected key count will jump.
**Files:** `builder/src/lib/sql/plan.js`, `builder/tests/unit/sql-plan.test.js`

### "All" Range Only Shows ~13 Months
**Status:** Open
The Range filter's "All" button now correctly bypasses client-side display limits, but `useScorecardData` hardcodes `13` months in the BQ fetch (lines 210, 212, 302). So "All" shows everything fetched — but that's only ~13 months. Showing more requires bumping the fetch limit, which increases query cost/time on large views.
**Decision needed:** How far back do we want "All" to go? Options: fixed 36 months, or no date filter at all (full history, slowest).
**Files:** `builder/src/hooks/useScorecardData.js` (three `13` hardcodes)

---

### MetricInspector Shows Wrong SQL for Breakdown Charts
**Status:** Open
Clicking ⓘ on a grouped/breakdown chart (e.g. By Attribution Channel) opens MetricInspector for the metric and shows the plain time-series SQL — not the grouped SQL that actually ran. The grouped query adds `dimension AS dimension` and `GROUP BY 1, 2`, which is missing from what's shown.
**Fix (Option A):** Pass `groupByDimension` through `onMetricClick` → MetricInspector → use `buildSemanticGroupedSql` when dimension is present. Shows the exact query that produced the chart.
**Files:** `builder/src/components/scorecards/Chart.jsx` (ChartInspectMenu), `builder/src/pages/Scorecard.jsx` (handleMetricClick), `builder/src/components/scorecards/MetricInspector.jsx` (TechnicalDetails)

---

### Conversion Trajectory Diverges from Looker (metric 296)
**Status:** Open
Metric 296 (Conversions Trajectory) returns ~86 while Looker shows 75. Root cause: our formula filters `< CURRENT_DATE()` (excludes today) and divides by `day_of_month - 1`, while Looker appears to count through today and divide by `day_of_month + 1`. All downstream metrics cascade from this: Conversion Rate Trajectory (321), Forecast vs. Trajectory (322), and Forecast Attainment (323) all show different values than Looker.
Separately, the Conversions delta (-81.7% vs Looker's -9.1%) appears to compare April MTD against full prior month instead of March MTD through the same day.
**Fix candidate:** Update metric 296 `chart_sql` to use `COUNT(...)` through today divided by `(day_of_month + 1)` × days in month. Confirm with Looker formula before changing.
**Files:** Supabase metric 296 (`chart_sql`), and verify delta logic in `useScorecardData.js`

---

### BQ Connection Indicator Out of Sync
**Status:** Open
When BigQuery token expires mid-session, queries throw "Not connected to BigQuery" but the UI still shows green "BQ Connected". `disconnectBq()` nulls the token but doesn't update React state in `useBqAuth`.
**Fix:** Have `disconnectBq()` fire a custom event that `useBqAuth` listens to, so the indicator goes red when a 401 clears the token.
**Files:** `builder/src/lib/bigquery.js`, `builder/src/hooks/useBqAuth.js`

---

### Quarterly Chart Shows Month Label for Current Partial Quarter
**Status:** Open
When grain = Quarterly, the current partial quarter (e.g. April 2026 = Q2) renders as "Apr 2026" instead of "2026-Q2". Root cause: `buildSemanticSql` emits `FORMAT_DATE('%Y-%m', DATE_TRUNC(col, QUARTER))` → `2026-04`, and `formatDateLabels` treats it as a monthly period.
**Fix:** Change the quarter period expression in `buildSemanticSql` to emit the quarter label directly:
```sql
CONCAT(FORMAT_DATE('%Y', DATE_TRUNC(col, QUARTER)), '-Q',
  CAST(CEIL(EXTRACT(MONTH FROM DATE_TRUNC(col, QUARTER)) / 3.0) AS STRING))
```
This produces `2026-Q2` which `formatDateLabels` can display correctly.
**Files:** `builder/src/lib/bigquery.js` (`buildSemanticSql`), `builder/src/lib/chartUtils.js` (`formatDateLabels`)

---

## Improvements

### Labs — Live-Query Exploration Pages (Lab 01: Revenue Architecture Story)
**Status:** Open (proposed 2026-06-11)
A `/labs` route in the builder for narrative data explorations ("story" pages: chapters, verdicts, embedded charts) that render **every number live from BigQuery behind the existing OAuth**. Hard rule, because the repo is public: commit narrative structure + SQL only — no values, dollar figures, or customer identifiers in source; prose must be number-free, with all stats computed client-side at view time (same security model as the tracker).
- **Lab template route** — `/labs` index card list + a lab-page layout (kicker, chapters, verdict callouts, "what we got wrong" section, owner/KPI plan table).
- **Query-block component** — shows the SQL (collapsible "▸ source"), runs it through the existing BQ OAuth client, renders the result as an inline stat, CSS bar row, table, or EChart. This is the core building block; everything else is composition.
- **Lab 01: port the Revenue Architecture story** (private original + all SQL live in the Obsidian vault, `Rev Ops System/05-SCRATCH/2026-06-10-revenue-architecture-loop/`: `revenue-architecture-story.html` + `verification-queries.md`). Queries are already written and keyed to claims; the port is template + scrubbed prose.
- Reuse `EChart.jsx` + Method dark theme; no build-step changes. Brainstorm/spec before building per repo workflow.

---

### Acquisition Funnel — Deferred V1 Layers
**Status:** Open (funnel V1 shipped 2026-06-10 to Labs/Beta; these are the planned follow-ons)
The Acquisition Funnel dashboard (Labs → Beta) shipped with the cohort spine (Trial → Sync → Converted), $ at conversion (DEP/Core split), Company-Size segment, and a Start/End date range. Spec: `docs/superpowers/specs/2026-06-10-acquisition-funnel-design.md`; plan: `docs/superpowers/plans/2026-06-10-acquisition-funnel-phase1.md`. Deferred layers, in priority order:
- **Treatment-lift table** — Demo / Free Consulting / Paid PS as conversion lift (with-vs-without) + effect on time-to-first-impact. Source correction (2026-06-11): for *paid* help, billing (`TransLineFlattened` Pro Services/Customization items) is the source of truth — the Activity-log "paid" signal mislabels ~1,200 accounts. Activity occurrence history goes back YEARS for Demo/Free-Hour/Consulting types, but historical rows have `IsDeleted IS NULL` — filter with `COALESCE(IsDeleted,FALSE)=FALSE` (plain `= FALSE` drops all pre-2026 rows; fixed in `funnelSql.js`). Demo counts as *attended* (exclude no-shows).
- **More segments** — DEP (lead with segment lens, then treatment), Payment Type (Monthly/Prepay), Pay-per-use (needs a canonical billing definition first), plus channel/vertical/country (already in `revenue.Funnel`).
- **First Impact stage** — post-conversion product milestone (Δt₆). NOT in BQ today; requires Amplitude product events. Join UNBLOCKED (2026-06-11): Amplitude `gp:companyAccountName` = `revenue.Account.CompanyAccount`, validated 102/102 exact with ~95% activity coverage; Amplitude history reaches ≥ May 2025. Remaining work is the event pull + metric definition, not the join.
- **$ refinement** — replace the V1 approximation (converts' MRR at the latest `int_customer_mrr_lines` month) with at-conversion MRR.
- **Full-bowtie overview (optional)** — one screen stitching this funnel (left) to the SaaS MRR Movement dashboard (right), cross-linked at the conversion handoff.
**Files:** `builder/src/lib/funnelSql.js`, `funnelData.js`, `funnelTransform.js`, `builder/src/components/scorecards/FunnelDrill.jsx`, `FunnelChart.jsx`, `builder/src/config/scorecards/funnel-acquisition-scorecard.js`

---

### Clean Up Customer Segments — Remove Hardcoded Segments from BQ
**Status:** Open
`v_customer_segments` has a `Segment` CASE column and we created 4 separate metrics (374-377) with hardcoded filters. This is the "sprawling segments" anti-pattern. Should be: one base view with raw fields (entity, user count, has_dep), one metric with dimensions, and segmentation via query-level filters — same as how Trials breaks down by channel without a separate view per channel. Also need to support range filters (e.g. `TotalUsers BETWEEN 2 AND 3`) in `buildSemanticSql` or add a `UserTier` bucketed dimension.
**Files:** BQ view `v_customer_segments`, Supabase metrics 373-377, `builder/src/config/scorecards/customer-segments-scorecard.js`, `builder/src/lib/bigquery.js` (buildSemanticSql)

---

### Home Page Visual Redesign
**Status:** Open
The current Home page rows look utilitarian — individual bordered cards, always-visible action buttons, loud orange "REVIEW REQUESTED" badge. Needs a polish pass before wider sharing.
**Direction:** Refined editorial list — hairline dividers instead of individual card borders, action buttons (delete, request review) hidden until row hover, Review Requested badge toned down to muted text, better section spacing and typography.
**Files:** `builder/src/pages/Home.jsx`

---

### Identity via Google OAuth (remove manual user picker)
**Status:** Open
Currently users are identified via a manual picker stored in localStorage. Should instead use the Google OAuth email from BQ auth to auto-identify the user: look up email in Supabase `users` table, set role from there. If email not found → viewer (no admin). Manual picker and "switch" button removed. Public/shareable routes (dashboards) should not require identity — defer until public sharing is designed.
**Files:** `builder/src/contexts/UserContext.jsx`, `builder/src/hooks/useBqAuth.js`, `builder/src/App.jsx`

---

### All Charts View as Modal for Adding Charts to a Dashboard
**Status:** Open
When editing a dashboard and adding a chart, it should open an `/charts`-style browse view in a modal picker instead of requiring users to navigate away. The `/charts` route was removed from the sidebar as a standalone page; this modal is where it belongs.
**Files:** `builder/src/components/DashboardView.jsx` (add chart modal), `builder/src/pages/Charts.jsx` (reuse as modal content)

---

### KPI Delta: Show Calculation on Click
**Status:** Open
The green/red delta percentage on KPI cards (e.g. +9.2%) has an ⓘ icon that does nothing. Clicking it should show a tooltip explaining the calculation: "31.8% this month vs 22.6% last month (+9.2 pp)".
**Files:** `builder/src/components/scorecards/` (KPI rendering), `builder/src/hooks/useScorecardData.js` (where delta is computed)

---

### Cancellations: Bucketed Dimension Breakdowns
**Status:** Open
`LicenseCount` and `AgeMonths` are numeric — can't be used as `GROUP BY` chart dimensions directly. Add bucketed columns to `v_cancellations` BQ view:
- `AgeBucket`: bucket `DATE_DIFF(CancellationDate, SignupDate, MONTH)` → `0–6mo / 6–12mo / 1–2yr / 2yr+`
- `LicenseTier`: bucket `LicenseCount` → `1–10 / 11–50 / 51–200 / 200+`

Then add both to `semantic_dimensions` on metric 59 and add breakdown tabs to `cancellations-breakdown-scorecard.js`.
**Files:** `v_cancellations` BQ view, Supabase metric 59, `builder/src/config/scorecards/cancellations-breakdown-scorecard.js`

---

### Churn Rate: Create v_customer_bom View as Semantic Primitive
**Status:** Open
Churn Rate = `Churn / (CustomersBOM + Conversions)`. The BOM component doesn't exist as a metric yet. Create a `v_customer_bom` BQ view that exposes one clean row per month with the correct Beginning-of-Month customer count — including the current-month adjustment (prior BOM + prior additions − prior churn, since current month TransLineFlattened data is incomplete mid-month).

Once the view exists:
1. Register "Customers BOM" as a semantic primitive metric in Supabase (`semantic_table: v_customer_bom`, `semantic_measure: COUNT(DISTINCT CompanyAccount)` or `SUM(TotalCustomersBOM)`)
2. Define Churn Rate (344) as a formula metric: `{churn_bom_id} / ({churn_bom_id} + {56}) * 100` with `depends_on` referencing Churn (59) and Conversions (56)
3. Add to Churn scorecard

**Source SQL:** The AdjustedBOM + TotalCustomersBOM CTEs from the existing Churn Rate chart_sql (metric 344) — that logic moves into the view.
**Files:** BQ `v_customer_bom` view (new), Supabase metrics table (new BOM metric + update 344), `builder/src/config/scorecards/cancellations-breakdown-scorecard.js`

---

### Migrate Sales Scorecard Custom SQL to Semantic Layer
**Status:** Open
The Sales Scorecard (`builder/src/config/scorecards/sales-scorecard.js`) has ~10 inline custom SQL strings written before the semantic layer existed. The scorecard hook (`useScorecardData.js`) now respects `semantic_table` / `semantic_measure` / `semantic_date_col` fields on metrics and handles weekly/monthly/daily grain automatically. Most of the custom SQL can be retired by populating semantic layer fields on the existing metrics.

**Migration map:**
| Custom SQL constant | Action | Notes |
|---|---|---|
| `WEEKLY_CHURN_COUNT_SQL` | Delete, use metric 59 + `timeBucket: 'week'` | **Quick win** — metric 59 already has semantic layer (`v_cancellations`, `COUNT(DISTINCT CompanyAccount)`, `CancellationDate`). No Supabase change needed. |
| `WEEKLY_NEW_NET_SAAS_SQL` | Add semantic fields to metric 365 | `semantic_table=v_new_net_saas, semantic_measure=SUM(SaaSAmount), semantic_date_col=TxnDate` |
| `WEEKLY_TOTAL_DEP_SQL` | Add semantic fields to metric 333 | `semantic_table=v_total_dep_revenue, semantic_measure=SUM(SaaSAmount), semantic_date_col=TxnDate` |
| `WEEKLY_TOTAL_NET_SAAS_SQL` | Fix + semantic on metric 337 | Metric 337 currently has NO chart_sql AND NO semantic_table — silently broken. `semantic_table=v_total_net_saas, semantic_measure=SUM(SaaSAmount + SaaSExpense), semantic_date_col=TxnDate` |
| `WEEKLY_NEW_DEP_SQL` | Add semantic fields to metric 329 | Needs `semantic_filters=[{column: 'is_new_dep', operator: '=', value: TRUE}]` in addition to table/measure |
| `FORECAST_WEEKLY` / `FORECAST_WEEKLY_CAST` / `FORECAST_WEEKLY_MAX` helpers | Add semantic fields to 10 metrics | 289, 290, 291, 292, 325, 326, 294, 295, 330, 334 — all point to `method_forecast` with the appropriate column. Pattern already works for metrics 285, 286, 353, 358. |
| `WEEKLY_CONVERSION_RATE_SQL` | **Stays custom** | Joins `Account` table with 1-month-lagged `SignupDate` shift and `method_forecast`. Not expressible as a single semantic measure. |

**Benefits:** Retire ~9 of 10 custom SQL strings, fix the silently-broken metric 337, make these metrics reusable by the chat builder and other scorecards, consolidate metric definitions to one place (Supabase).

**Files:** `builder/src/config/scorecards/sales-scorecard.js` (delete constants + switch to `timeBucket: 'week'`), Supabase `metrics` table (populate semantic fields on ~14 metrics).

---

### Channel Forecast & Trajectory Metrics Are Empty Shells
**Status:** Open
Metrics 305 (Trials Forecast by Channel), 307 (Trials Channel Trajectory), 306 (Syncs Forecast by Channel), 308 (Syncs Channel Trajectory) exist in Supabase but have no `chart_sql`, no `formula`, and no `view_name`. They're placeholders.
These would show budget/forecast/trajectory broken down by attribution channel — useful for the PLAN scorecards once built.
**Approach:** Derive from existing channel views (Trials/Syncs by Attribution Channel) joined to `method_forecast` allocations. Same pattern as the non-channel forecast/trajectory metrics already in the registry.

---

### Conversions Budget Not Yet Built
**Status:** Open
Metric 279 (Conversions Budget, queued) is a shell. No budget number for conversions exists yet. The Conversions PLAN scorecard can't be completed until it's populated.
**Approach:** Add a conversions column to `method_forecast` and wire metric 279 to it, same shape as the existing forecast metrics (285, 286, etc.).

---

## New Metric Candidates

Metrics we've identified as worth building but haven't scoped yet. Move to Improvements once a concrete implementation plan exists.

### NRR (Net Revenue Retention)
**Source:** FAQ in the Looker Studio — Revenue doc references NRR as an existing SaaSAnalytics calculation.
**Approach hint:** Uses `Customer!PerPayExpiryPeriod1/2` fields from the NRR spreadsheet that don't exist in BQ directly — derive via calculated field: if `AccountFullName` contains "Prepay Expiry" include that line's `SaaSAmount`, else 0. Then apply the standard period-over-period comparison at `CompanyAccount` level using the `EntityRecordID` join pattern in `knowledge/routes/revenue-retention.md`.
**Reference:** Looker Studio — Revenue doc, FAQ "How about NRR calculations?"

---

### Retention State Transitions (BOM → EOM matrix)
**Idea:** Use `BOMCustomerGrouping` and `EOMCustomerGrouping` on `TransLineFlattened` directly to produce a transition matrix: `Customer → Lost` (churn), `Trailer → Customer` (conversion), `Customer → Customer` (retained), etc. Source data already encodes these; may be simpler than the current EntityRecordID-join retention logic, or at least a useful cross-check.
**First step:** Spike — compare BOM/EOM-derived cancellation count vs current `v_cancellations` output for 3 months. If they match, this becomes the primitive; if not, understand why and document.

---

### Cohort Analysis by Account Age
**Idea:** Use `AgeAtBOM` on `TransLineFlattened` to slice churn / expansion / retention by tenure bucket (0–6mo, 6–12mo, 1–2yr, 2yr+). Unlocks "do we lose customers in their first year or later?" without computing tenure ourselves.
**Overlap:** Related to the `AgeBucket` work proposed in the Cancellations Bucketed Breakdowns ticket — could be unified.

---

### Platform Split (Classic vs New)
**Idea:** Use `PlatformToggle` on `TransLineFlattened` to segment revenue, customers, churn by platform. Supports the ongoing Classic → New migration narrative.
**Primitive candidate:** Add `PlatformToggle` as a `semantic_dimensions` entry on existing revenue/customer metrics rather than creating separate metrics per platform.

---

### SaaS Write-offs / Bad Debt Tracking
**Idea:** `Line.SaaSExpense` captures bad-debt and retention credit-memo write-offs. Currently not surfaced anywhere. Useful for finance visibility and for computing "net revenue after write-offs."
**First step:** Spike on monthly magnitude — if it's tiny and stable, low priority; if it's material, add as a first-class metric.
