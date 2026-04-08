# Open Tickets

Backlog of known bugs and deferred improvements. Add new items here rather than in memory files.

---

## Bugs

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
