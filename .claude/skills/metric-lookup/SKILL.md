---
name: metric-lookup
description: Look up active metrics powering Method's scorecards. Find metric IDs, formulas, dependencies, BQ views, and which scorecard uses each metric. Covers the ~65 live metrics, not the full 242+ catalog.
---

# Metric Lookup

Quick reference for the metrics actively powering Method's scorecards. These are Supabase `metrics` table IDs, used in scorecard configs under `builder/src/config/scorecards/`.

## How Metrics Work

Metrics live in Supabase (`metrics` table). Each has:
- **`id`** — Supabase row ID (the numbers in this doc)
- **`metric_type`** — `primitive` (queries BQ directly) or `derived` (formula over other metrics)
- **`view_name`** — which BQ view to query (primitives only)
- **`chart_sql`** — pre-written SQL returning `{period, value}` pairs (some primitives)
- **`formula`** — expression like `{55}/{54} * 100` referencing other metric IDs (derived only)
- **`depends_on`** — integer array of metric IDs this depends on (derived only)
- **`semantic_*` fields** — table, measure, date_col, filters, dimensions for semantic-layer queries

The frontend resolves derived metrics at runtime: fetch all dependency values first, then evaluate the formula client-side.

## Scorecards

| Scorecard Key | Title | Group | Config File |
|---------------|-------|-------|-------------|
| `sales-scorecard` | Sales Scorecard | — | `sales-scorecard.js` |
| `marketing-scorecard` | Marketing Scorecard | — | `marketing-scorecard.js` |
| `funnel` | Funnel | funnel | `funnel-scorecard.js` |
| `trials-breakdown` | Trials | funnel | `trials-breakdown-scorecard.js` |
| `syncs-breakdown` | Syncs | funnel | `syncs-breakdown-scorecard.js` |
| `conversions-breakdown` | Conversions | funnel | `conversions-breakdown-scorecard.js` |
| `cancellations-breakdown` | Churn | funnel | `cancellations-breakdown-scorecard.js` |
| `trials-plan` | Trials | plan | `trials-plan-scorecard.js` |
| `syncs-plan` | Syncs | plan | `syncs-plan-scorecard.js` |
| `churn-plan` | Churn | plan | `churn-plan-scorecard.js` |

All config files are in `builder/src/config/scorecards/`.

---

## Funnel Primitives (BQ Views)

These are the core count metrics. Each queries a BQ view using COUNT(*) grouped by month.

| ID | Name | BQ View | Date Column | Scorecards |
|----|------|---------|-------------|------------|
| 54 | Trials | `v_trials` | `SignupDate` | marketing, funnel, trials-breakdown, trials-plan |
| 55 | Syncs | `v_syncs` | `SyncDate` | marketing, funnel, syncs-breakdown, syncs-plan |
| 56 | Conversions | `v_conversions` | `FirstSaaSInvoiceTxnDate` | sales, funnel, conversions-breakdown |
| 59 | Cancellations (Churn) | `v_cancellations` | `CancellationDate` | sales, cancellations-breakdown, churn-plan |

## Revenue Primitives (BQ Views)

These query revenue BQ views using SUM(SaaSAmount) grouped by month.

| ID | Name | BQ View | Scorecards |
|----|------|---------|------------|
| 365 | Total New Net SaaS Revenue | `v_new_net_saas` | sales |
| 329 | Total New DEP Net SaaS | `v_new_dep_revenue` (filter `is_new_dep = TRUE`) | sales |
| 337 | Total Net SaaS | `v_total_net_saas` (SUM of `SaaSAmount + SaaSExpense`) | sales |
| 333 | Total DEP Net SaaS | `v_total_dep_revenue` | sales |

## Retention Metrics (TransLineFlattened)

These use the proven CTE pattern against `TransLineFlattened`. See `/bq-query` skill for the pattern.

| ID | Name | Scorecards |
|----|------|------------|
| 346 | NRR (Net Revenue Retention) | sales |

## Funnel Rate Metrics (Derived)

Computed from funnel primitives via formula.

| ID | Name | Formula | Depends On | Scorecards |
|----|------|---------|------------|------------|
| 300 | Sync Rate | `{55}/{54} * 100` | 54, 55 | marketing, funnel, trials-breakdown, syncs-plan |
| 301 | Sync-to-Conversion Rate | `{56}/{55} * 100` | 55, 56 | funnel |
| 302 | Trial-to-Conversion Rate | `{56}/{54} * 100` | 54, 56 | funnel |
| 357 | Conversion Rate | derived from conversions/trials | 54, 56 | sales |
| 344 | Churn Rate | derived from churn/active accounts | — | sales |

## Forecast & Budget Metrics (method_forecast table)

These query `revenue.method_forecast` — a daily table with forecast and budget columns. Monthly values are SUM (counts/revenue) or MAX (rates) over the month.

| ID | Name | Forecast Column | Scorecards |
|----|------|-----------------|------------|
| 285 | Forecasted Trials | `Forecasted_Trials` | marketing, trials-plan |
| 286 | Forecasted Syncs | `Forecasted_Syncs` | marketing, syncs-plan |
| 274 | Forecasted Churn | `Forecasted_Churn` | sales, churn-plan |
| 289 | Forecasted New Net SaaS | `Forecasted_New_Net_SaaS` | sales |
| 290 | Forecasted New DEP Revenue | `Forecasted_New_DEP_Revenue` | sales |
| 291 | Forecasted Total Net SaaS | `Forecasted_Total_Net_SaaS` | sales |
| 292 | Forecasted Total DEP Revenue | `Forecasted_Total_DEP_Revenue` | sales |
| 319 | Forecasted Conversion Rate | `Forecasted_Conversion_Rate` | sales |
| 342 | Forecasted Churn Rate % | `Forecasted_Churn_Rate` | sales, churn-plan |
| 347 | Forecasted NRR | `Forecasted_NRR` | sales |
| 361 | Forecasted Sync % | `Forecasted_Sync_Rate` | marketing, syncs-plan |
| 353 | Budgeted Trials | `Budgeted_Trials` | marketing, trials-plan |
| 358 | Budgeted Syncs | `Budgeted_Syncs` | marketing, syncs-plan |
| 280 | Budgeted Churn | `Budgeted_Churn` | churn-plan |
| 325 | Budgeted New Net SaaS | `Budgeted_New_Net_SaaS` | sales |
| 282 | Budgeted New DEP Revenue | `Budgeted_New_DEP_Revenue` | sales |
| 283 | Budgeted Total Net SaaS | `Budgeted_Total_Net_SaaS` | sales |
| 284 | Budgeted Total DEP Revenue | `Budgeted_Total_DEP_Revenue` | sales |
| 324 | Budgeted Conversion Rate | `Budgeted_Conversion_Rate` | sales |
| 343 | Budgeted Churn Rate % | `Budgeted_Churn_Rate` | sales, churn-plan |
| 348 | Budgeted NRR | `Budgeted_NRR` | sales |
| 362 | Budgeted Sync Rate | `Budgeted_Sync_Rate` | marketing, syncs-plan |

## Trajectory Metrics (Derived)

Trajectory = current month's actual prorated to a full month (value / days elapsed * days in month). These are derived metrics whose formulas reference the corresponding primitive.

| ID | Name | Based On | Scorecards |
|----|------|----------|------------|
| 294 | Trials Trajectory | 54 | marketing, trials-plan |
| 295 | Sync Trajectory | 55 | marketing, syncs-plan |
| 296 | Conversion Trajectory | 56 | sales |
| 297 | Churn Trajectory | 59 | sales, churn-plan |
| 321 | Conversion Rate Trajectory | 357 | sales |
| 326 | New Net SaaS Revenue Trajectory | 365 | sales |
| 330 | New DEP Revenue Trajectory | 329 | sales |
| 334 | Total DEP Net SaaS Trajectory | 333 | sales |
| 338 | Net SaaS Trajectory | 337 | sales |
| 345 | Churn Rate % Trajectory | 344 | sales, churn-plan |

## Gap & Attainment Metrics (Derived)

These compare trajectory to forecast/budget. Pattern: gap = `{trajectory} - {forecast}`, attainment = `SAFE_DIVIDE({trajectory}, {forecast}) * 100`.

| ID | Name | Formula Pattern | Depends On | Scorecards |
|----|------|-----------------|------------|------------|
| 322 | Conv Rate: Forecast vs Trajectory | `{321} - ({319} * 100)` | 321, 319 | sales |
| 323 | Conv Rate: Forecasted Attainment | `SAFE_DIVIDE({321}, {319} * 100) * 100` | 321, 319 | sales |
| 327 | New Net SaaS: Forecast vs Trajectory | `{326} - {289}` | 326, 289 | sales |
| 328 | New Net SaaS: Forecasted Attainment | `SAFE_DIVIDE({326}, {289}) * 100` | 326, 289 | sales |
| 331 | New DEP: Forecast vs Trajectory | `{330} - {290}` | 330, 290 | sales |
| 332 | New DEP: Forecasted Attainment | `SAFE_DIVIDE({330}, {290}) * 100` | 330, 290 | sales |
| 335 | Total DEP: Forecast vs Trajectory | `{334} - {292}` | 334, 292 | sales |
| 336 | Total DEP: Forecasted Attainment | `SAFE_DIVIDE({334}, {292}) * 100` | 334, 292 | sales |
| 339 | Total Net SaaS: Forecast vs Trajectory | `{338} - {291}` | 338, 291 | sales |
| 340 | Total Net SaaS: Forecasted Attainment | `SAFE_DIVIDE({338}, {291}) * 100` | 338, 291 | sales |
| 349 | Trials: Trajectory vs Forecast | `{294} - {285}` | 294, 285 | marketing |
| 350 | Trials: Forecasted Attainment | `SAFE_DIVIDE({294}, {285}) * 100` | 294, 285 | marketing, trials-plan |
| 351 | Syncs: Trajectory vs Forecast | `{295} - {286}` | 295, 286 | marketing |
| 352 | Syncs: Forecasted Attainment | `SAFE_DIVIDE({295}, {286}) * 100` | 295, 286 | marketing, syncs-plan |
| 354 | Forecast vs Trials | `{54} - {285}` | 54, 285 | marketing |
| 355 | Budget vs Trials | `{54} - {353}` | 54, 353 | marketing, trials-plan |
| 359 | Forecast vs Syncs | `{55} - {286}` | 55, 286 | marketing |
| 360 | Budget vs Syncs | `{55} - {358}` | 55, 358 | marketing, syncs-plan |
| 363 | Sync Rate: Actual vs Forecast | `{300} - {361}` | 300, 361 | marketing |
| 364 | Sync Rate: Forecasted Attainment | `SAFE_DIVIDE({300}, {361}) * 100` | 300, 361 | marketing |

---

## Where Metric Definitions Live

- **Source of truth:** Supabase `metrics` table (queried via REST API)
- **Supabase URL:** `https://agkubdpgnpwudzpzcvhs.supabase.co`
- **Anon key:** in `builder/src/lib/supabase.js`
- **Fetch all:** `GET /rest/v1/metrics?select=*&order=id`

## For Deeper Information

- Full business definitions and dependency chains: `knowledge/metrics-catalog.md`
- Revenue retention route (NRR, GRR, MRR formulas): `knowledge/routes/revenue-retention.md`
- Marketing route (trials, syncs, conversions): `knowledge/routes/marketing.md`
- Forecast route (budget/forecast data): `knowledge/routes/forecast.md`
- Use `/bq-query` skill for writing SQL against the underlying BQ views
- Use `/metric-solver` skill for verifying a metric against a source of truth
