# Account Detail History (L4) — Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Clicking an L3 account row opens an in-place account-detail panel below the table: a dual-axis timeline (MRR $, seats #, #apps #) over the account's full history, with lifecycle markers (Sign up · First sync · First invoice · Cancelled).

**Architecture:** Extends the deployed Net SaaS drilldown. Two new TDD'd SQL builders + data wrappers, one new `AccountDetail` component (dual-axis ECharts line + markLines), a row-click on the L3 table, and account-detail state in the controller. All data from fast tables (`int_customer_mrr_lines`) + `revenue.Account`.

**Tech Stack:** Plain JS, React, Vite, Vitest, ECharts. Live BQ via OAuth (session-cached).

**Spec:** `docs/superpowers/specs/2026-06-04-account-detail-history-design.md`

---

## Task 1: SQL builders (TDD)

**Files:** `builder/src/lib/netSaasSql.js` + `builder/tests/unit/netSaasSql.test.js`

- [ ] **Step 1 — failing tests:**
```js
import { buildAccountHistorySql, buildAccountLifecycleSql } from '../../src/lib/netSaasSql.js';

describe('buildAccountHistorySql', () => {
  it('monthly mrr/seats/apps for one entity, full history, ordered', () => {
    const sql = buildAccountHistorySql({ entityRecordId: 100037 });
    expect(sql).toContain('int_customer_mrr_lines');
    expect(sql).toContain('entity_record_id = 100037');
    expect(sql).toContain('SUM(saas)');                 // mrr
    expect(sql).toContain('SUM(case when not is_discount then qty else 0 end)'.toLowerCase()); // seats (case-insensitive check below)
    expect(sql.toLowerCase()).toContain('count(distinct');  // apps
    expect(sql.toLowerCase()).toContain('group by month');
    expect(sql.toLowerCase()).toContain('order by month');
  });
});

describe('buildAccountLifecycleSql', () => {
  it('aggregates lifecycle dates for one entity from Account', () => {
    const sql = buildAccountLifecycleSql({ entityRecordId: 100037 });
    expect(sql).toContain('revenue.Account');
    expect(sql).toContain('EntityRecordID = 100037');
    expect(sql).toContain('MIN(SignUpDate)');
    expect(sql).toContain('MIN(CustDatFirstSyncCompleted)');
    expect(sql).toContain('MIN(FirstSaaSInvoiceTxnDate)');
    expect(sql).toContain('MAX(CancellationDate)');
  });
});
```
(Adjust the seats assertion to match your exact casing; the intent is `SUM(qty)` excluding discount lines.)

- [ ] **Step 2 — run, verify fail.**
- [ ] **Step 3 — implement** (append to `netSaasSql.js`; `entityRecordId` is a trusted numeric from the L3 row — interpolate as a number, not a string):
```js
export function buildAccountHistorySql({ entityRecordId }) {
  const id = Number(entityRecordId);
  return `SELECT
  month,
  ROUND(SUM(saas), 2) AS mrr,
  SUM(CASE WHEN NOT is_discount THEN qty ELSE 0 END) AS seats,
  COUNT(DISTINCT CASE WHEN NOT is_discount AND saas != 0 THEN item END) AS apps
FROM \`project-for-method-dw.revenue.int_customer_mrr_lines\`
WHERE entity_record_id = ${id}
GROUP BY month
ORDER BY month`;
}

export function buildAccountLifecycleSql({ entityRecordId }) {
  const id = Number(entityRecordId);
  return `SELECT
  MIN(SignUpDate) AS signup,
  MIN(CustDatFirstSyncCompleted) AS first_sync,
  MIN(FirstSaaSInvoiceTxnDate) AS first_invoice,
  MAX(CancellationDate) AS cancelled
FROM \`project-for-method-dw.revenue.Account\`
WHERE EntityRecordID = ${id}`;
}
```
- [ ] **Step 4 — run, verify pass.** Full suite no new failures.
- [ ] **Step 5 — commit** `feat(account-detail): history + lifecycle SQL builders (TDD)`.

## Task 2: Data wrappers

**Files:** `builder/src/lib/netSaasData.js`

- [ ] Add (mirror existing wrappers: unwrap `{rows}`, coerce numerics; dates stay strings):
```js
export async function fetchAccountHistory({ entityRecordId }) {
  const { rows } = await queryBq(buildAccountHistorySql({ entityRecordId }));
  return rows.map((r) => ({ month: r.month, mrr: Number(r.mrr)||0, seats: Number(r.seats)||0, apps: Number(r.apps)||0 }));
}
export async function fetchAccountLifecycle({ entityRecordId }) {
  const { rows } = await queryBq(buildAccountLifecycleSql({ entityRecordId }));
  const r = rows[0] || {};
  return { signup: r.signup||null, firstSync: r.first_sync||null, firstInvoice: r.first_invoice||null, cancelled: r.cancelled||null };
}
```
Import the two builders. Commit `feat(account-detail): data wrappers`.

## Task 3: AccountDetail component

**Files:** `builder/src/components/scorecards/AccountDetail.jsx` (new)

- [ ] Read `NetSaasBridge.jsx` for the ECharts-direct rendering pattern + Method theme registration, and a sibling for styling.
- [ ] Props: `{ history, lifecycle, account }` where `account = {Company, Segment, UserTier}` (from the clicked row), `history = [{month,mrr,seats,apps}]`, `lifecycle = {signup,firstSync,firstInvoice,cancelled}`.
- [ ] Render:
  - A small header: Company, Segment · Tier, current MRR/seats/#apps (last history row), and the lifecycle dates.
  - A **dual-axis ECharts line chart**: x = month; left y-axis ($) for MRR; right y-axis (#) for seats and apps. Three series. Format MRR axis as $K/$M, counts as integers.
  - **Lifecycle markers** via a series `markLine` (or a dedicated markLine on one series): vertical dashed lines at signup / firstSync / firstInvoice / cancelled — only those that are non-null and fall within the x range — each labeled ("Signup", "First sync", "First invoice", "Cancelled"). Use distinct subtle colors.
  - Empty guard: if `history` is empty, render "No history for this account".
- [ ] Lint + build clean. Commit `feat(account-detail): dual-axis history chart component`.

## Task 4: Row click on the L3 table

**Files:** `builder/src/components/scorecards/NetSaasAccountTable.jsx`

- [ ] Add an optional `onRowClick` prop. Make each row clickable (cursor pointer, hover highlight) → `onRowClick(row)` (the row already carries `entity_record_id` and `Company`/`Segment`/`UserTier`). Keep existing rendering/sorting intact. Commit `feat(account-detail): clickable L3 rows`.

## Task 5: Controller wiring

**Files:** `builder/src/components/scorecards/DecompositionDrill.jsx`

- [ ] Import `AccountDetail`, `fetchAccountHistory`, `fetchAccountLifecycle`.
- [ ] State: `const [account, setAccount] = useState(null)` (the selected row), `accountHistory`, `accountLifecycle`, `accountLoading`.
- [ ] Pass `onRowClick={handleAccountClick}` to `<NetSaasAccountTable>`. `handleAccountClick(row)`: setAccount(row); fetch history + lifecycle in parallel (by `row.entity_record_id`); set state.
- [ ] Render `<AccountDetail account={account} history={accountHistory} lifecycle={accountLifecycle} />` (wrapped in `ChartErrorBoundary`) below the table when `account` is set; a "Loading account history…" placeholder while `accountLoading`.
- [ ] Breadcrumb: when `account` set, push `{level: 4, label: account.Company}`. `handleNavigate`: level ≤ 3 clears `account` (+ its data). Also clear `account` whenever drill/slice/month/grain/lens/filters change (so it never shows stale).
- [ ] Build + eslint + full vitest green. Commit `feat(account-detail): controller wiring + breadcrumb`.

## Task 6: Verify + deploy

- [ ] `npm run build`, `npm run lint` (exit 0), `npx vitest run` (green).
- [ ] Headless mount check (loads to connect-gate, no console errors).
- [ ] Leak-guard the diff (UI code only), push → static.yml deploys. Confirm green + bundle hash changes.
- [ ] Live verification is the user's (OAuth): click an account → timeline + markers render; current values match.

## Self-Review
**Spec coverage:** history SQL (T1) · lifecycle SQL (T1) · wrappers (T2) · dual-axis chart + markers (T3) · row click (T4) · in-place render + breadcrumb + clearing (T5) · deploy (T6). All spec §3/§4 items mapped.
**Placeholders:** none — SQL + wrappers are complete code; the component is specified against the existing ECharts pattern (geometry verified live, like the bridge).
**Type consistency:** `fetchAccountHistory` → `[{month,mrr,seats,apps}]` consumed by `AccountDetail`; `fetchAccountLifecycle` → `{signup,firstSync,firstInvoice,cancelled}` consumed as markers; `onRowClick(row)` row carries `entity_record_id`+`Company`+`Segment`+`UserTier` (present in the L3 SELECTs).
