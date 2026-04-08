# Open Tickets

Backlog of known bugs and deferred improvements. Add new items here rather than in memory files.

---

### Channel Forecast & Trajectory Metrics Are Empty Shells
**Status:** Open — needs Justin
Metrics 305 (Trials Forecast by Channel), 307 (Trials Channel Trajectory), 306 (Syncs Forecast by Channel), 308 (Syncs Channel Trajectory) exist in Supabase but have no `chart_sql`, no `formula`, and no `view_name`. They're placeholders.
These would show budget/forecast/trajectory broken down by attribution channel — useful for the PLAN scorecards once built.
**Owner:** Justin to define SQL or confirm if these should be derived from channel views.

---

### Conversions Budget Not Yet Built
**Status:** Open
Metric 279 (Conversions Budget, queued) is a shell. No budget number for conversions exists yet. Once Justin defines it in `method_forecast`, the Conversions PLAN scorecard can be completed.

---

## Bugs

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
