# Account Detail — History Timeline (Design / Spec)

**Date:** 2026-06-04
**Status:** Design approved (brainstorming). Builds on the deployed Net SaaS drilldown.
**Repo-safe:** architecture + field names only. No dollar figures, no account data.

**Depends on:** the deployed Net SaaS bridge + L3 account table. Adds an **L4 (account detail)** level.

---

## 1. Goal

Clicking a row in the L3 account table opens that account's **history timeline** — what happened over its lifetime: MRR, licenses (seats), and apps over time, with lifecycle event markers. Answers "what's the story of this account since they started?"

## 2. Data reality (verified)

- **Time-series (full monthly history):** `int_customer_mrr_lines` (a fast table) per `entity_record_id`:
  - MRR = `SUM(saas)` per month
  - Seats (licenses) = `SUM(qty)` per month (qty is the per-line user/seat count; exclude discount lines)
  - Apps = `COUNT(DISTINCT item)` per month where `NOT is_discount AND saas != 0` (modules with active revenue)
- **Lifecycle markers (single dates, from `revenue.Account`):** `SignUpDate`, `CustDatFirstSyncCompleted` (first sync), `FirstSaaSInvoiceTxnDate` (= conversion-to-paid / first invoice — one event), `CancellationDate` (end marker). Account has ~1.2 rows/entity (dupes), so aggregate per entity: `MIN` of the onboarding dates, `MAX(CancellationDate)`.
- **Excluded:** Health score — `Account.HealthScore` exists but is a current snapshot only (no history), so it's out of the timeline per the brainstorm. (Could become a line later if we capture it monthly.)

## 3. Design (approved choices)

- **Trigger:** click an L3 account row → account detail renders **in-place below the table** (new L4 level). Breadcrumb gains `› {Company}`. Consistent with the existing drill-in-place pattern.
- **Chart:** one **dual-axis** ECharts line chart over the account's full month range:
  - Left axis ($): **MRR**
  - Right axis (#): **seats** and **#apps**
  - Lifecycle **markers**: vertical dashed `markLine`s at Sign up · First sync · First invoice (convert/pay) · Cancelled (only those that exist for the account), labeled.
- **Series:** MRR + seats + #apps (three lines). (Per-app breakdown deferred.)
- **Header:** company, segment, tier, current MRR/seats/#apps, and the lifecycle dates listed.
- **Grain independence:** account history is always **monthly** (full lifetime), regardless of the bridge's Monthly/Annual grain — the detail is about one account's story, not the cohort window.

## 4. Architecture

Extends `builder/` — no new app, reuses the drill controller + ECharts.

- **`builder/src/lib/netSaasSql.js`** — add:
  - `buildAccountHistorySql({ entityRecordId })` → `[{month, mrr, seats, apps}]` from `int_customer_mrr_lines`, grouped by month, ordered asc, full history.
  - `buildAccountLifecycleSql({ entityRecordId })` → `{signup, firstSync, firstInvoice, cancelled}` aggregated from `Account`.
- **`builder/src/lib/netSaasData.js`** — `fetchAccountHistory({entityRecordId})` + `fetchAccountLifecycle({entityRecordId})` (unwrap `{rows}`, coerce numerics; dates as strings).
- **`builder/src/components/scorecards/AccountDetail.jsx`** (new) — dual-axis line chart (MRR left, seats/#apps right) + lifecycle `markLine`s + a small header (company/segment/tier/current values/dates). Wrapped in `ChartErrorBoundary`.
- **`builder/src/components/scorecards/NetSaasAccountTable.jsx`** — add `onRowClick(row)` so a row click bubbles `entity_record_id` + `Company` up.
- **`builder/src/components/scorecards/DecompositionDrill.jsx`** — add account-detail state (`selectedAccount`); on table row click, fetch history + lifecycle and render `<AccountDetail>` below the table; breadcrumb level 4 (`› {Company}`); navigating up clears it; changing month/grain/lens/filters/drill clears it.

## 5. Data flow

L3 row click → `{entity_record_id, Company}` → controller fetches `fetchAccountHistory` + `fetchAccountLifecycle` (parallel, cached by the queryBq session cache) → `AccountDetail` renders the dual-axis timeline + markers.

## 6. Testing

- TDD the two SQL builders in `netSaasSql.test.js` (correct columns, entity filter, grouping/order, discount exclusion for seats/apps, lifecycle aggregation).
- Chart rendering verified live (ECharts not unit-tested), wrapped in ChartErrorBoundary.

## 7. Scope / non-goals

- No health-score line (snapshot only).
- No per-app breakdown (single #apps line; per-app is a later option).
- No editing/annotations — read-only history.
- Account detail is monthly-only (lifetime), independent of bridge grain.

## 8. References

- Deployed bridge: `docs/superpowers/plans/2026-06-03-net-saas-drilldown-ui-phase2.md`
- Data: `int_customer_mrr_lines` (table), `revenue.Account` (SignUpDate, CustDatFirstSyncCompleted, FirstSaaSInvoiceTxnDate, CancellationDate)
