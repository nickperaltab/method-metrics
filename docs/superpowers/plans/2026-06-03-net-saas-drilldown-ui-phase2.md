# Net SaaS Drilldown Dashboard — Phase 2 (UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a navigable Net SaaS bridge in the `builder/` app: a headline Net SaaS scalar, a waterfall bridge, and click-to-drill panels that break each bar into its dollar composition and then into the accounts behind it — all live against BigQuery for the current month.

**Architecture:** Extends the existing `builder/` React+Vite app (Option A from the design doc). A new scorecard config (`net-saas-scorecard.js`) declares the drill paths; a `DecompositionDrill` controller holds breadcrumb drill state and issues one BQ query per level; a `NetSaasBridge` component renders the L1 waterfall in ECharts. Reuses the existing BQ OAuth layer (`lib/bigquery.js`), the Channel-ARR scorecard/drill-table pattern, and `EChart.jsx`. No precomputed or account-level data is ever committed — everything queries live for a BQ-authed user.

**Tech Stack:** Plain JS (no TS), React, Vite, ECharts, Vitest. Data via Google OAuth → BigQuery REST, querying `project-for-method-dw.revenue.int_customer_mrr` and `.int_mrr_movement_decomposed` (both validated + deployed in Phase 1).

**Companion docs:**
- Design: `docs/superpowers/specs/2026-06-03-net-saas-drilldown-dashboard-design.md`
- Phase 1 (data layer, complete): `docs/superpowers/plans/2026-06-03-net-saas-validation-phase1.md`
- Metric definitions for the L2 components: `docs/metric-definitions.md` §4c

**Prerequisite (met):** Phase 1 is complete. `int_customer_mrr`, `int_customer_mrr_lines`, `int_mrr_movement_decomposed` are validated and live in `revenue`. The decomposition reconciles to `int_customer_mrr` at $0.00.

---

## Locked design (from the brainstorming session — do not re-litigate)

- **L0** = Net SaaS scalar (single KPI tile): `New + Expansion − Downgrades − Churn` for the period.
- **L1** = bridge waterfall: `Start MRR → +New → +Expansion → −Downgrades → −Churn → End MRR`. (Retention is a *label* over Downgrades+Churn, not its own bar.)
- **L2** = dispatches by which bar was clicked (drill in place — bridge stays anchored, panel renders below):

  | L1 bar clicked | L2 view | Default dim | Switcher dims | Source |
  |---|---|---|---|---|
  | New | customer-dim split | `AttributionChannel` | `Segment`, `Vertical` | `int_customer_mrr` (NewMRR) |
  | Expansion | dollar-component split | Seats / Apps / Price | — | `int_mrr_movement_decomposed` (expansion) |
  | Downgrades | dollar-component split | Seats / Apps / Price | — | `int_mrr_movement_decomposed` (downgrade) |
  | Churn | customer-dim split | `Segment` | `Cohort age`, `Vertical`, `SyncType` | `int_customer_mrr` (Cancellations) |

- **L3** = account table (drill in place, below L2). Uniform core columns: `Company`, `ΔMRR`, `Segment`, `Tier`. Plus 1–2 path-specific extra columns declared per drill path (e.g. Seats drill → `ΔSeats`; Channel drill → `Channel`, signup month).
- **Global filters** (above bridge, re-render everything, single-select): primary = `Segment`, `Channel`, `Vertical`, `Tier`; overflow = `Country`, `SyncType`, `HasDEP`.
- **Time grain:** month only (V1). Annual deferred (needs an annual decomposition sibling).
- **Range default:** latest complete month.
- **Comparison:** inline period-over-period delta (▲/▼ vs prior month) on every bar and component, **toggleable on/off**, with a selectable comparison period (default prior month).
- **Deferred to a later phase:** annual cohort grain, multi-select filters, sparklines/trends, the generalized "pick-your-own-split-dimension" pivot.

---

## Data sourcing reference (the exact queries each level issues)

All queries hit `project-for-method-dw.revenue.*` via the user's OAuth token. `:month` is the selected complete month (first-of-month DATE). Global filters append `AND <Dim> = '<value>'` clauses when set. Movement columns in `int_customer_mrr` are stored positive; the bridge negates Downgrades and Cancellations.

**L0 / L1 — bridge (one query):**
```sql
SELECT
  SUM(StartMRR)      AS start_mrr,
  SUM(NewMRR)        AS new_mrr,
  SUM(Expansions)    AS expansion_mrr,
  SUM(Downgrades)    AS downgrade_mrr,      -- positive; bridge shows as negative
  SUM(Cancellations) AS churn_mrr,          -- positive; bridge shows as negative
  SUM(p2_saas)       AS end_mrr
FROM `project-for-method-dw.revenue.int_customer_mrr`
WHERE Month = @month
  -- + optional global filters: AND Segment=@seg AND AttributionChannel=@chan ...
```
Net SaaS = `new_mrr + expansion_mrr - downgrade_mrr - churn_mrr`. (Equals `end_mrr - start_mrr` when no filter splits a company across the boundary; show the movement sum as the headline.)

**L2 New / Churn — customer-dim split (one query, dim is the chosen split):**
```sql
SELECT <DIM> AS bucket, SUM(NewMRR) AS value          -- New
FROM `...int_customer_mrr` WHERE Month=@month AND NewMRR > 0 [+filters]
GROUP BY <DIM> ORDER BY value DESC
-- Churn: SUM(Cancellations) ... WHERE Cancellations > 0
```
Cohort-age split for Churn: derive age = months between the entity's first month and @month. V1 simplification: bucket by `DATE_DIFF(@month, <first_month>, MONTH)` ranges (0-3, 4-12, 13-24, 25+). First month requires a sub-select (min Month per entity in int_customer_mrr). See Task 9.

**L2 Expansion / Downgrades — seats/apps/price (one query):**
```sql
SELECT
  SUM(seat_mrr)  AS seats,
  SUM(app_mrr)   AS apps,
  SUM(price_mrr) AS price
FROM `project-for-method-dw.revenue.int_mrr_movement_decomposed`
WHERE month = @month AND movement_kind = 'expansion'   -- or 'downgrade'
  -- + global filters: the decomposition lacks dim columns, so dim filters
  --   require a join to int_customer_mrr on (month, entity_record_id). See Task 8.
```

**L3 — account table (one query, scoped to the clicked slice):**
```sql
-- Example: Downgrades → Seats slice
SELECT d.entity_record_id, c.Company, c.Segment, c.UserTier,
       (d.p2_saas - d.p1_saas) AS delta_mrr,
       d.seat_mrr, d.app_mrr, d.price_mrr
FROM `...int_mrr_movement_decomposed` d
JOIN `...int_customer_mrr` c
  ON c.Month = d.month AND c.EntityRecordID = d.entity_record_id
WHERE d.month=@month AND d.movement_kind='downgrade' [+filters]
ORDER BY ABS(d.seat_mrr) DESC
LIMIT 50
```
For New/Churn L3, select straight from `int_customer_mrr` (it already carries Company + dims). Company name is **live-fetched, never committed**.

---

## File Structure

**New files:**
- `builder/src/config/scorecards/net-saas-scorecard.js` — declares the bridge bars, the per-bar L2 drill spec (source view, split dims, default dim), and the per-path L3 column spec. Pure data; no queries.
- `builder/src/lib/netSaasSql.js` — pure SQL-builder functions (one per level). Takes (month, filters, drill state) → SQL string. Unit-tested with Vitest.
- `builder/src/lib/netSaasData.js` — thin async wrappers that call `queryBq()` (from `lib/bigquery.js`) with the built SQL and normalize rows. Returns plain objects for the components.
- `builder/src/components/scorecards/NetSaasBridge.jsx` — the L1 waterfall (ECharts), renders bars from a normalized bridge object, emits `onBarClick(barKey)`.
- `builder/src/components/scorecards/DecompositionDrill.jsx` — the controller. Holds drill state `{level, bar, dim, slice}`, renders bridge + the active L2 panel + L3 table, owns the breadcrumb, issues the level query via `netSaasData`.
- `builder/src/components/scorecards/DrillBreadcrumb.jsx` — small breadcrumb nav (Net SaaS › Expansion › Seats › accounts), emits `onNavigate(level)`.
- `builder/src/components/scorecards/L2Panel.jsx` — renders an L2 split: a small bar/segment chart (component or dim split) + a dim switcher (for New/Churn). Emits `onSliceClick(sliceKey)`.
- `builder/src/components/scorecards/NetSaasAccountTable.jsx` — L3 table. Core columns + path-specific extras from the config. (May reuse/adapt `ChannelTable.jsx` patterns; do NOT fork its scorecard-specific math.)
- `builder/src/components/scorecards/GlobalFilterBar.jsx` — single-select filter chips (primary 4 + overflow 3), emits `onFilterChange(filters)`.
- `builder/tests/unit/netSaasSql.test.js` — Vitest unit tests for the SQL builders.
- `builder/tests/unit/netSaasBridge.test.js` — Vitest tests for the bridge-normalization + delta math.

**Modified files:**
- `builder/src/components/DashboardView.jsx` (or the scorecard router) — register the `net-saas` scorecard so it routes to `DecompositionDrill`. (Confirm the actual routing mechanism by reading the file before editing.)

**Read-only reference (do not modify):**
- `builder/src/config/scorecards/channel-arr-scorecard.js` (config shape exemplar)
- `builder/src/components/scorecards/ChannelTable.jsx` (drill-table pattern)
- `builder/src/lib/bigquery.js` (`queryBq`, OAuth)
- `builder/src/components/EChart.jsx` (ECharts wrapper + Method theme)

---

## Task 1: Scorecard config — declare the drill spec

**Files:**
- Create: `builder/src/config/scorecards/net-saas-scorecard.js`

- [ ] **Step 1: Read the exemplar config** `builder/src/config/scorecards/channel-arr-scorecard.js` to match the export shape and conventions used by the scorecard router.

- [ ] **Step 2: Write the config**

```js
// builder/src/config/scorecards/net-saas-scorecard.js
// Declares the Net SaaS bridge drill paths. Pure data — no queries, no UI.
// Consumed by DecompositionDrill.jsx (controller) and netSaasSql.js (query builder).

export const netSaasScorecard = {
  id: 'net-saas',
  title: 'Net SaaS Movement',
  status: 'live',
  group: 'revenue',
  grain: 'month',            // V1: month only
  defaultRange: 'latest-complete-month',

  // L1 bridge bars, in render order. `sign` drives the waterfall direction.
  bridge: [
    { key: 'start',      label: 'Start MRR',  type: 'total',  column: 'StartMRR' },
    { key: 'new',        label: 'New',        type: 'delta',  sign: +1, column: 'NewMRR',        drill: 'new' },
    { key: 'expansion',  label: 'Expansion',  type: 'delta',  sign: +1, column: 'Expansions',    drill: 'expansion' },
    { key: 'downgrade',  label: 'Downgrades', type: 'delta',  sign: -1, column: 'Downgrades',    drill: 'downgrade' },
    { key: 'churn',      label: 'Churn',      type: 'delta',  sign: -1, column: 'Cancellations', drill: 'churn' },
    { key: 'end',        label: 'End MRR',    type: 'total',  column: 'p2_saas' },
  ],

  // L2 drill spec per bar.
  // mode 'component' => seats/apps/price from the decomposition view.
  // mode 'dimension' => customer-dim split from int_customer_mrr.
  drills: {
    new: {
      mode: 'dimension',
      source: 'int_customer_mrr',
      measure: 'NewMRR',
      defaultDim: 'AttributionChannel',
      dims: ['AttributionChannel', 'Segment', 'Vertical'],
    },
    churn: {
      mode: 'dimension',
      source: 'int_customer_mrr',
      measure: 'Cancellations',
      defaultDim: 'Segment',
      dims: ['Segment', 'CohortAge', 'Vertical', 'SyncType'],
    },
    expansion: {
      mode: 'component',
      source: 'int_mrr_movement_decomposed',
      movementKind: 'expansion',
      components: ['seats', 'apps', 'price'],
    },
    downgrade: {
      mode: 'component',
      source: 'int_mrr_movement_decomposed',
      movementKind: 'downgrade',
      components: ['seats', 'apps', 'price'],
    },
  },

  // L3 table column spec. Core columns are always shown; `extras` keyed by drill bar.
  l3: {
    core: [
      { key: 'Company',  label: 'Company',  format: 'text' },
      { key: 'deltaMrr', label: 'Δ MRR',    format: 'currency' },
      { key: 'Segment',  label: 'Segment',  format: 'text' },
      { key: 'UserTier', label: 'Tier',     format: 'text' },
    ],
    extras: {
      new:        [{ key: 'AttributionChannel', label: 'Channel', format: 'text' },
                   { key: 'signupMonth',        label: 'Signed up', format: 'month' }],
      churn:      [{ key: 'cohortAgeMonths',    label: 'Cohort age (mo)', format: 'number' }],
      expansion:  [{ key: 'seat_mrr', label: 'Seats $', format: 'currency' },
                   { key: 'app_mrr',  label: 'Apps $',  format: 'currency' },
                   { key: 'price_mrr',label: 'Price $', format: 'currency' }],
      downgrade:  [{ key: 'seat_mrr', label: 'Seats $', format: 'currency' },
                   { key: 'app_mrr',  label: 'Apps $',  format: 'currency' },
                   { key: 'price_mrr',label: 'Price $', format: 'currency' }],
    },
  },

  // Global filters. Single-select in V1.
  filters: {
    primary:  ['Segment', 'AttributionChannel', 'Vertical', 'UserTier'],
    overflow: ['SignupCountry', 'SyncType', 'HasDEP'],
  },
};

export default netSaasScorecard;
```

- [ ] **Step 3: Verify it imports cleanly**

Run: `cd builder && node -e "import('./src/config/scorecards/net-saas-scorecard.js').then(m=>console.log(Object.keys(m.netSaasScorecard)))"`
Expected: prints the config keys (`id, title, status, group, grain, defaultRange, bridge, drills, l3, filters`).

- [ ] **Step 4: Commit**

```bash
git add builder/src/config/scorecards/net-saas-scorecard.js
git commit -m "feat(net-saas): scorecard config declaring bridge + drill spec"
```

---

## Task 2: SQL builders — bridge query (TDD)

**Files:**
- Create: `builder/src/lib/netSaasSql.js`
- Create: `builder/tests/unit/netSaasSql.test.js`

- [ ] **Step 1: Read the existing SQL-builder test** `builder/tests/unit/sql-builders.test.js` (or `tests/sql-builders.test.js`) to match the Vitest import style and the project's existing SQL-builder conventions (table-qualification, filter-clause format).

- [ ] **Step 2: Write the failing test**

```js
// builder/tests/unit/netSaasSql.test.js
import { describe, it, expect } from 'vitest';
import { buildBridgeSql } from '../../src/lib/netSaasSql.js';

describe('buildBridgeSql', () => {
  it('selects all six bridge aggregates for the given month, no filters', () => {
    const sql = buildBridgeSql({ month: '2026-05-01', filters: {} });
    expect(sql).toContain('FROM `project-for-method-dw.revenue.int_customer_mrr`');
    expect(sql).toContain("Month = '2026-05-01'");
    expect(sql).toContain('SUM(StartMRR)');
    expect(sql).toContain('SUM(NewMRR)');
    expect(sql).toContain('SUM(Expansions)');
    expect(sql).toContain('SUM(Downgrades)');
    expect(sql).toContain('SUM(Cancellations)');
    expect(sql).toContain('SUM(p2_saas)');
    expect(sql).not.toContain('AND Segment');
  });

  it('appends single-select global filters as AND clauses', () => {
    const sql = buildBridgeSql({
      month: '2026-05-01',
      filters: { Segment: 'SMB', AttributionChannel: 'Paid' },
    });
    expect(sql).toContain("AND Segment = 'SMB'");
    expect(sql).toContain("AND AttributionChannel = 'Paid'");
  });

  it('escapes single quotes in filter values', () => {
    const sql = buildBridgeSql({ month: '2026-05-01', filters: { Vertical: "Joe's Plumbing" } });
    expect(sql).toContain("Vertical = 'Joe''s Plumbing'");
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `cd builder && npx vitest run tests/unit/netSaasSql.test.js`
Expected: FAIL — `buildBridgeSql is not a function` / module not found.

- [ ] **Step 4: Implement the bridge builder + filter helper**

```js
// builder/src/lib/netSaasSql.js
// Pure SQL builders for the Net SaaS drilldown. No I/O. Unit-tested.

const ICM = '`project-for-method-dw.revenue.int_customer_mrr`';
const DECOMP = '`project-for-method-dw.revenue.int_mrr_movement_decomposed`';

// BigQuery string-literal escape: double any single quote.
function sqlStr(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

// Build "AND <col> = '<val>'" clauses for set single-select filters.
// `alias` optionally prefixes columns (e.g. 'c' -> "c.Segment") for joined queries.
export function buildFilterClauses(filters = {}, alias = '') {
  const p = alias ? `${alias}.` : '';
  return Object.entries(filters)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `  AND ${p}${k} = ${sqlStr(v)}`)
    .join('\n');
}

export function buildBridgeSql({ month, filters = {} }) {
  return `SELECT
  SUM(StartMRR)      AS start_mrr,
  SUM(NewMRR)        AS new_mrr,
  SUM(Expansions)    AS expansion_mrr,
  SUM(Downgrades)    AS downgrade_mrr,
  SUM(Cancellations) AS churn_mrr,
  SUM(p2_saas)       AS end_mrr
FROM ${ICM}
WHERE Month = ${sqlStr(month)}
${buildFilterClauses(filters)}`.trimEnd();
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd builder && npx vitest run tests/unit/netSaasSql.test.js`
Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
git add builder/src/lib/netSaasSql.js builder/tests/unit/netSaasSql.test.js
git commit -m "feat(net-saas): bridge SQL builder + filter helper (TDD)"
```

---

## Task 3: SQL builders — L2 dimension split (New / Churn) (TDD)

**Files:**
- Modify: `builder/src/lib/netSaasSql.js`
- Modify: `builder/tests/unit/netSaasSql.test.js`

- [ ] **Step 1: Add failing tests**

```js
// append to netSaasSql.test.js
import { buildDimSplitSql } from '../../src/lib/netSaasSql.js';

describe('buildDimSplitSql', () => {
  it('groups NewMRR by AttributionChannel where NewMRR > 0', () => {
    const sql = buildDimSplitSql({ month: '2026-05-01', measure: 'NewMRR', dim: 'AttributionChannel', filters: {} });
    expect(sql).toContain('AttributionChannel AS bucket');
    expect(sql).toContain('SUM(NewMRR) AS value');
    expect(sql).toContain('NewMRR > 0');
    expect(sql).toContain('GROUP BY AttributionChannel');
    expect(sql).toContain('ORDER BY value DESC');
  });

  it('groups Cancellations by Segment where Cancellations > 0', () => {
    const sql = buildDimSplitSql({ month: '2026-05-01', measure: 'Cancellations', dim: 'Segment', filters: {} });
    expect(sql).toContain('SUM(Cancellations) AS value');
    expect(sql).toContain('Cancellations > 0');
    expect(sql).toContain('GROUP BY Segment');
  });
});
```

- [ ] **Step 2: Run, verify fail** (`buildDimSplitSql is not a function`).

- [ ] **Step 3: Implement**

```js
// append to netSaasSql.js
export function buildDimSplitSql({ month, measure, dim, filters = {} }) {
  return `SELECT
  ${dim} AS bucket,
  SUM(${measure}) AS value
FROM ${ICM}
WHERE Month = ${sqlStr(month)}
  AND ${measure} > 0
${buildFilterClauses(filters)}
GROUP BY ${dim}
ORDER BY value DESC`.trimEnd();
}
```
(Note: `CohortAge` is a derived dim, handled separately in Task 9 — `buildDimSplitSql` is for real columns. Guard against passing `CohortAge` here in the controller.)

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add builder/src/lib/netSaasSql.js builder/tests/unit/netSaasSql.test.js
git commit -m "feat(net-saas): L2 dimension-split SQL builder (New/Churn) (TDD)"
```

---

## Task 4: SQL builders — L2 component split (Expansion / Downgrade) (TDD)

**Files:**
- Modify: `builder/src/lib/netSaasSql.js`
- Modify: `builder/tests/unit/netSaasSql.test.js`

- [ ] **Step 1: Add failing tests**

```js
import { buildComponentSplitSql } from '../../src/lib/netSaasSql.js';

describe('buildComponentSplitSql', () => {
  it('sums seat/app/price for the given movement_kind', () => {
    const sql = buildComponentSplitSql({ month: '2026-05-01', movementKind: 'expansion', filters: {} });
    expect(sql).toContain('SUM(seat_mrr)');
    expect(sql).toContain('SUM(app_mrr)');
    expect(sql).toContain('SUM(price_mrr)');
    expect(sql).toContain('int_mrr_movement_decomposed');
    expect(sql).toContain("movement_kind = 'expansion'");
    expect(sql).toContain('month = ');
  });

  it('joins int_customer_mrr for dim filters since the decomposition lacks dim columns', () => {
    const sql = buildComponentSplitSql({ month: '2026-05-01', movementKind: 'downgrade', filters: { Segment: 'SMB' } });
    expect(sql).toContain('JOIN');
    expect(sql).toContain("c.Segment = 'SMB'");
  });

  it('omits the join when no filters are set', () => {
    const sql = buildComponentSplitSql({ month: '2026-05-01', movementKind: 'downgrade', filters: {} });
    expect(sql).not.toContain('JOIN');
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** (conditional join only when dim filters are present — the decomposition view has no dim columns)

```js
// append to netSaasSql.js
export function buildComponentSplitSql({ month, movementKind, filters = {} }) {
  const hasFilters = Object.values(filters).some((v) => v !== null && v !== undefined && v !== '');
  if (!hasFilters) {
    return `SELECT
  SUM(seat_mrr)  AS seats,
  SUM(app_mrr)   AS apps,
  SUM(price_mrr) AS price
FROM ${DECOMP}
WHERE month = ${sqlStr(month)}
  AND movement_kind = ${sqlStr(movementKind)}`.trimEnd();
  }
  return `SELECT
  SUM(d.seat_mrr)  AS seats,
  SUM(d.app_mrr)   AS apps,
  SUM(d.price_mrr) AS price
FROM ${DECOMP} d
JOIN ${ICM} c
  ON c.Month = d.month AND c.EntityRecordID = d.entity_record_id
WHERE d.month = ${sqlStr(month)}
  AND d.movement_kind = ${sqlStr(movementKind)}
${buildFilterClauses(filters, 'c')}`.trimEnd();
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add builder/src/lib/netSaasSql.js builder/tests/unit/netSaasSql.test.js
git commit -m "feat(net-saas): L2 component-split SQL builder (Expansion/Downgrade) (TDD)"
```

---

## Task 5: SQL builders — L3 account tables (TDD)

**Files:**
- Modify: `builder/src/lib/netSaasSql.js`
- Modify: `builder/tests/unit/netSaasSql.test.js`

- [ ] **Step 1: Add failing tests** for `buildAccountTableSql({ month, drill, slice, filters })`:
  - For `drill='downgrade', slice='seats'`: joins decomposition+icm, selects Company/Segment/UserTier/seat_mrr/app_mrr/price_mrr and `(d.p2_saas - d.p1_saas) AS deltaMrr`, `WHERE d.movement_kind='downgrade'`, `ORDER BY ABS(d.seat_mrr) DESC`, `LIMIT 50`.
  - For `drill='new', slice='Paid'` (a channel slice): selects from `int_customer_mrr` only (no decomposition join), `WHERE NewMRR>0 AND AttributionChannel='Paid'`, selects Company/Segment/UserTier/NewMRR.
  - For `drill='churn', slice='SMB'`: from `int_customer_mrr`, `WHERE Cancellations>0 AND Segment='SMB'`.

```js
import { buildAccountTableSql } from '../../src/lib/netSaasSql.js';

describe('buildAccountTableSql', () => {
  it('downgrade→seats: joins decomposition+icm, orders by |seat_mrr|, limit 50', () => {
    const sql = buildAccountTableSql({ month:'2026-05-01', drill:'downgrade', slice:'seats', filters:{} });
    expect(sql).toContain('int_mrr_movement_decomposed');
    expect(sql).toContain('JOIN');
    expect(sql).toContain('c.Company');
    expect(sql).toContain("d.movement_kind = 'downgrade'");
    expect(sql).toContain('ORDER BY ABS(d.seat_mrr) DESC');
    expect(sql).toContain('LIMIT 50');
  });
  it('new→channel slice: from int_customer_mrr only, filtered by channel', () => {
    const sql = buildAccountTableSql({ month:'2026-05-01', drill:'new', slice:'Paid', filters:{} });
    expect(sql).not.toContain('int_mrr_movement_decomposed');
    expect(sql).toContain('NewMRR > 0');
    expect(sql).toContain("AttributionChannel = 'Paid'");
  });
  it('churn→segment slice: from int_customer_mrr, filtered by segment', () => {
    const sql = buildAccountTableSql({ month:'2026-05-01', drill:'churn', slice:'SMB', filters:{} });
    expect(sql).toContain('Cancellations > 0');
    expect(sql).toContain("Segment = 'SMB'");
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `buildAccountTableSql`. Branch on `drill`:
  - `expansion`/`downgrade` → decomposition+icm join, slice maps to the ordering column (`seats`→`seat_mrr`, `apps`→`app_mrr`, `price`→`price_mrr`).
  - `new` → icm only, `NewMRR > 0`, and the slice is a dim value applied to the drill's split dim (channel/segment/vertical). The controller passes the active dim alongside the slice; accept `{ drill, dim, slice }`.
  - `churn` → icm only, `Cancellations > 0`, slice applied to the active dim.

```js
// append to netSaasSql.js
const ORDER_COL = { seats: 'seat_mrr', apps: 'app_mrr', price: 'price_mrr' };

export function buildAccountTableSql({ month, drill, dim, slice, filters = {} }) {
  if (drill === 'expansion' || drill === 'downgrade') {
    const orderCol = ORDER_COL[slice] || 'seat_mrr';
    return `SELECT
  d.entity_record_id,
  c.Company, c.Segment, c.UserTier,
  (d.p2_saas - d.p1_saas) AS deltaMrr,
  d.seat_mrr, d.app_mrr, d.price_mrr
FROM ${DECOMP} d
JOIN ${ICM} c
  ON c.Month = d.month AND c.EntityRecordID = d.entity_record_id
WHERE d.month = ${sqlStr(month)}
  AND d.movement_kind = ${sqlStr(drill)}
${buildFilterClauses(filters, 'c')}
ORDER BY ABS(d.${orderCol}) DESC
LIMIT 50`.trimEnd();
  }
  // new / churn — straight from int_customer_mrr
  const measure = drill === 'new' ? 'NewMRR' : 'Cancellations';
  const sliceClause = dim && slice ? `  AND ${dim} = ${sqlStr(slice)}\n` : '';
  return `SELECT
  EntityRecordID AS entity_record_id,
  Company, Segment, UserTier, AttributionChannel,
  ${measure} AS deltaMrr
FROM ${ICM}
WHERE Month = ${sqlStr(month)}
  AND ${measure} > 0
${sliceClause}${buildFilterClauses(filters)}
ORDER BY ${measure} DESC
LIMIT 50`.trimEnd();
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add builder/src/lib/netSaasSql.js builder/tests/unit/netSaasSql.test.js
git commit -m "feat(net-saas): L3 account-table SQL builders (TDD)"
```

---

## Task 6: Bridge normalization + delta math (TDD)

**Files:**
- Create: `builder/tests/unit/netSaasBridge.test.js`
- Modify: `builder/src/lib/netSaasSql.js` (add pure transforms) OR create `builder/src/lib/netSaasTransform.js` — prefer a separate transform module to keep SQL builders pure-string.

- [ ] **Step 1: Create `builder/src/lib/netSaasTransform.js`** with `normalizeBridge(row, config)` and `computeDelta(current, prior)`.

- [ ] **Step 2: Write failing tests**

```js
// builder/tests/unit/netSaasBridge.test.js
import { describe, it, expect } from 'vitest';
import { normalizeBridge, computeDelta } from '../../src/lib/netSaasTransform.js';
import { netSaasScorecard } from '../../src/config/scorecards/net-saas-scorecard.js';

const ROW = { start_mrr:100000, new_mrr:8000, expansion_mrr:5000, downgrade_mrr:3000, churn_mrr:4000, end_mrr:106000 };

describe('normalizeBridge', () => {
  it('produces signed bar values: downgrades and churn negative', () => {
    const bars = normalizeBridge(ROW, netSaasScorecard);
    const byKey = Object.fromEntries(bars.map(b => [b.key, b.value]));
    expect(byKey.new).toBe(8000);
    expect(byKey.expansion).toBe(5000);
    expect(byKey.downgrade).toBe(-3000);
    expect(byKey.churn).toBe(-4000);
    expect(byKey.start).toBe(100000);
    expect(byKey.end).toBe(106000);
  });
  it('net saas = new + expansion - downgrade - churn', () => {
    const bars = normalizeBridge(ROW, netSaasScorecard);
    const net = bars.filter(b=>b.type==='delta').reduce((s,b)=>s+b.value,0);
    expect(net).toBe(6000); // 8000+5000-3000-4000
  });
});

describe('computeDelta', () => {
  it('returns absolute and pct change vs prior', () => {
    expect(computeDelta(8000, 5000)).toEqual({ abs: 3000, pct: 0.6, direction: 'up' });
  });
  it('handles prior=0 without dividing by zero', () => {
    const d = computeDelta(8000, 0);
    expect(d.abs).toBe(8000);
    expect(d.pct).toBeNull();
    expect(d.direction).toBe('up');
  });
  it('down direction for negative movement getting more negative', () => {
    // churn worsening: -4000 vs -3000 -> abs -1000, direction down
    expect(computeDelta(-4000, -3000).direction).toBe('down');
  });
});
```

- [ ] **Step 3: Run, verify fail.**

- [ ] **Step 4: Implement** `normalizeBridge` (map config.bridge → `{key,label,type,value}` applying `sign` and the column→row-field mapping) and `computeDelta` (abs = current−prior; pct = prior≠0 ? abs/|prior| : null; direction = abs>0 ? 'up' : abs<0 ? 'down' : 'flat'). Map the config columns to row fields with an explicit lookup (`StartMRR→start_mrr`, `NewMRR→new_mrr`, `Expansions→expansion_mrr`, `Downgrades→downgrade_mrr`, `Cancellations→churn_mrr`, `p2_saas→end_mrr`).

- [ ] **Step 5: Run, verify pass.**

- [ ] **Step 6: Commit**

```bash
git add builder/src/lib/netSaasTransform.js builder/tests/unit/netSaasBridge.test.js
git commit -m "feat(net-saas): bridge normalization + period-over-period delta math (TDD)"
```

---

## Task 7: Data layer — async query wrappers

**Files:**
- Create: `builder/src/lib/netSaasData.js`

- [ ] **Step 1: Read `builder/src/lib/bigquery.js`** to confirm the exact signature/return shape of `queryBq(sql)` (does it return rows directly, or `{rows}`? does it throw on auth failure?). Match it.

- [ ] **Step 2: Implement thin wrappers** that build SQL (via `netSaasSql`) and call `queryBq`, returning normalized objects. One function per level: `fetchBridge({month, filters})`, `fetchDimSplit({month, measure, dim, filters})`, `fetchComponentSplit({month, movementKind, filters})`, `fetchAccountTable({month, drill, dim, slice, filters})`. Each returns plain data; surface errors (don't swallow — the app shows a BQ-auth prompt elsewhere). Include the comparison-period fetch by calling `fetchBridge` twice (current + prior month) in the controller, not here.

```js
// builder/src/lib/netSaasData.js
import { queryBq } from './bigquery.js';
import { buildBridgeSql, buildDimSplitSql, buildComponentSplitSql, buildAccountTableSql } from './netSaasSql.js';

export async function fetchBridge({ month, filters }) {
  const rows = await queryBq(buildBridgeSql({ month, filters }));
  return rows[0] || null;   // single aggregate row
}
export async function fetchDimSplit({ month, measure, dim, filters }) {
  return queryBq(buildDimSplitSql({ month, measure, dim, filters })); // [{bucket, value}]
}
export async function fetchComponentSplit({ month, movementKind, filters }) {
  const rows = await queryBq(buildComponentSplitSql({ month, movementKind, filters }));
  return rows[0] || { seats: 0, apps: 0, price: 0 };
}
export async function fetchAccountTable({ month, drill, dim, slice, filters }) {
  return queryBq(buildAccountTableSql({ month, drill, dim, slice, filters }));
}
```

**Note:** if `queryBq` returns a shape other than a plain row array, adapt the unwrapping. Confirm in Step 1.

- [ ] **Step 3: Smoke-test against live BQ (manual, requires OAuth)** — documented, not automated. After Task 11 wires the UI, verify in the running app. For now: `cd builder && npx vitest run` to confirm nothing broke and the module imports.

- [ ] **Step 4: Commit**

```bash
git add builder/src/lib/netSaasData.js
git commit -m "feat(net-saas): async BQ query wrappers per drill level"
```

---

## Task 8: NetSaasBridge component (L1 waterfall)

**Files:**
- Create: `builder/src/components/scorecards/NetSaasBridge.jsx`

- [ ] **Step 1: Read `builder/src/components/EChart.jsx`** to learn the wrapper's props (how option is passed, theme, click-event wiring).

- [ ] **Step 2: Implement the waterfall.** ECharts waterfall is a stacked bar with a transparent "placeholder" series. Accept props `{ bars, prior, showDelta, onBarClick }` where `bars` is the `normalizeBridge` output. Render:
  - Start and End as full bars from 0.
  - New/Expansion/Downgrade/Churn as floating bars stacked on the running total.
  - Color: positive deltas green, negative red, totals neutral (use the Method dark theme palette from EChart).
  - When `showDelta`, render the `computeDelta` chip (▲/▼ + pct) as a label above each delta bar.
  - Wire ECharts `click` → `onBarClick(bars[params.dataIndex].key)` for the four delta bars (start/end are not clickable).

- [ ] **Step 3: Manual render check** — covered by the integration verification in Task 11 (ECharts canvas is not meaningfully unit-testable). Add a defensive guard: if `bars` is null/empty, render a "No data for this month" placeholder.

- [ ] **Step 4: Commit**

```bash
git add builder/src/components/scorecards/NetSaasBridge.jsx
git commit -m "feat(net-saas): NetSaasBridge L1 waterfall component"
```

---

## Task 9: Cohort-age derived dimension (Churn switcher)

**Files:**
- Modify: `builder/src/lib/netSaasSql.js`
- Modify: `builder/tests/unit/netSaasSql.test.js`

Cohort age isn't a column. It's `months between an entity's first month and the selected month`, bucketed. Build a dedicated SQL function.

- [ ] **Step 1: Add failing test** for `buildCohortAgeChurnSql({ month, filters })`:
  - Contains a sub-select for each entity's first month (`MIN(Month)` over `int_customer_mrr`).
  - Buckets `DATE_DIFF(@month, first_month, MONTH)` into `'0-3'`, `'4-12'`, `'13-24'`, `'25+'`.
  - Sums `Cancellations` per bucket where `Cancellations > 0` at `@month`.
  - `GROUP BY bucket`.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```js
// append to netSaasSql.js
export function buildCohortAgeChurnSql({ month, filters = {} }) {
  return `WITH firsts AS (
  SELECT EntityRecordID, MIN(Month) AS first_month
  FROM ${ICM}
  GROUP BY EntityRecordID
)
SELECT
  CASE
    WHEN DATE_DIFF(${sqlStr(month)}, f.first_month, MONTH) <= 3  THEN '0-3'
    WHEN DATE_DIFF(${sqlStr(month)}, f.first_month, MONTH) <= 12 THEN '4-12'
    WHEN DATE_DIFF(${sqlStr(month)}, f.first_month, MONTH) <= 24 THEN '13-24'
    ELSE '25+'
  END AS bucket,
  SUM(c.Cancellations) AS value
FROM ${ICM} c
JOIN firsts f ON f.EntityRecordID = c.EntityRecordID
WHERE c.Month = ${sqlStr(month)}
  AND c.Cancellations > 0
${buildFilterClauses(filters, 'c')}
GROUP BY bucket
ORDER BY bucket`.trimEnd();
}
```

- [ ] **Step 4: Run, verify pass.** The controller routes `dim==='CohortAge'` to this builder instead of `buildDimSplitSql`.

- [ ] **Step 5: Commit**

```bash
git add builder/src/lib/netSaasSql.js builder/tests/unit/netSaasSql.test.js
git commit -m "feat(net-saas): cohort-age derived churn split (TDD)"
```

---

## Task 10: Panels + breadcrumb + filter bar + account table components

**Files:**
- Create: `builder/src/components/scorecards/DrillBreadcrumb.jsx`
- Create: `builder/src/components/scorecards/L2Panel.jsx`
- Create: `builder/src/components/scorecards/NetSaasAccountTable.jsx`
- Create: `builder/src/components/scorecards/GlobalFilterBar.jsx`

- [ ] **Step 1: `DrillBreadcrumb.jsx`** — props `{ trail, onNavigate }`. `trail` is an array like `[{level:0,label:'Net SaaS'},{level:1,label:'Expansion'},{level:2,label:'Seats'}]`. Render clickable crumbs; clicking emits `onNavigate(level)` to truncate drill state.

- [ ] **Step 2: `L2Panel.jsx`** — props `{ drill, data, dims, activeDim, onDimChange, onSliceClick, showDelta, priorData }`. For `mode:'component'` render a 3-bar chart (Seats/Apps/Price) via EChart. For `mode:'dimension'` render a horizontal bar of buckets + a dim switcher (segmented control over `dims`). Each bar/slice click emits `onSliceClick(bucketKey)`. When `showDelta`, annotate with `computeDelta` vs `priorData`.

- [ ] **Step 3: `NetSaasAccountTable.jsx`** — props `{ rows, drill, config }`. Render core columns from `config.l3.core` + extras from `config.l3.extras[drill]`. Format per column `format` (currency/number/text/month). Sortable headers (reuse the sort approach from `ChannelTable.jsx`, but do NOT copy its ARR/CAD derived-column math — this table just displays the queried rows). Show row count and the LIMIT note ("top 50 by impact").

- [ ] **Step 4: `GlobalFilterBar.jsx`** — props `{ filters, options, onFilterChange }`. Render single-select dropdowns for the 4 primary dims; a "More filters" disclosure for the 3 overflow dims. `options` per dim are fetched once (distinct values) or hardcoded for the small/stable ones (Segment, UserTier, HasDEP). For high-cardinality dims (Vertical, Channel, Country, SyncType), fetch distinct values lazily. Changing any filter emits the full `filters` object.

- [ ] **Step 5: Commit**

```bash
git add builder/src/components/scorecards/DrillBreadcrumb.jsx \
        builder/src/components/scorecards/L2Panel.jsx \
        builder/src/components/scorecards/NetSaasAccountTable.jsx \
        builder/src/components/scorecards/GlobalFilterBar.jsx
git commit -m "feat(net-saas): breadcrumb, L2 panel, account table, filter bar components"
```

---

## Task 11: DecompositionDrill controller + register the scorecard

**Files:**
- Create: `builder/src/components/scorecards/DecompositionDrill.jsx`
- Modify: the scorecard router (confirm: `builder/src/components/DashboardView.jsx` or a scorecard registry) to route `id:'net-saas'` → `DecompositionDrill`.

- [ ] **Step 1: Read the routing mechanism.** Find how `channel-arr-scorecard` is registered and routed to `ChannelTable`. Mirror that registration for `net-saas` → `DecompositionDrill`.

- [ ] **Step 2: Implement `DecompositionDrill.jsx`** — the controller. State:
  ```js
  const [filters, setFilters] = useState({});
  const [month, setMonth] = useState(/* latest complete month */);
  const [compareMonth, setCompareMonth] = useState(/* prior month */);
  const [showDelta, setShowDelta] = useState(true);
  const [drill, setDrill] = useState(null);     // {bar, dim, slice} or null at L1
  const [bridge, setBridge] = useState(null);
  const [priorBridge, setPriorBridge] = useState(null);
  const [l2, setL2] = useState(null);
  const [l3, setL3] = useState(null);
  ```
  Behavior:
  - On mount / filter change / month change: `fetchBridge` for `month` and `compareMonth` → `normalizeBridge` both → render `NetSaasBridge`.
  - On `onBarClick(bar)`: set drill `{bar, dim: config.drills[bar].defaultDim, slice:null}`; fetch the L2 split (component vs dimension vs cohort-age per `config.drills[bar].mode`/dim); render `L2Panel` below the bridge.
  - On L2 `onDimChange(dim)` (New/Churn only): refetch L2 with the new dim.
  - On L2 `onSliceClick(slice)`: set drill.slice; `fetchAccountTable` → render `NetSaasAccountTable` below.
  - Breadcrumb `onNavigate(level)`: truncate drill state to that level (level 0 clears drill, level 1 clears slice, etc.).
  - A `showDelta` toggle switch and a comparison-period selector in the header.
  - Render order top→bottom: GlobalFilterBar, header (month picker + delta toggle + compare selector), NetSaasBridge, DrillBreadcrumb (when drilled), L2Panel (when drilled), NetSaasAccountTable (when slice selected).

- [ ] **Step 3: Compute "latest complete month"** — prior month from today (the in-progress month is excluded by the data models anyway). Use a small helper: first day of (current month − 1). Comparison default = (that − 1).

- [ ] **Step 4: Build the app**

Run: `cd builder && npm run build`
Expected: build succeeds, no errors.

- [ ] **Step 5: Commit**

```bash
git add builder/src/components/scorecards/DecompositionDrill.jsx <router file>
git commit -m "feat(net-saas): DecompositionDrill controller + scorecard registration"
```

---

## Task 12: Live verification + deploy

**Files:** none (verification + deploy)

- [ ] **Step 1: Run the app locally and verify the full drill against live BQ** (requires the user's Google OAuth — this is the only true end-to-end check; the design memory notes most users are BQ-authed).

Run: `cd builder && npm run dev`, open the Net SaaS scorecard, connect BQ, and verify:
- Bridge renders for the latest complete month with six bars; Net SaaS headline = New + Expansion − Downgrades − Churn.
- Click Expansion → Seats/Apps/Price panel appears; numbers are non-zero and sum to the Expansion bar.
- Click Downgrades → Seats/Apps/Price; click Seats → account table with ΔSeats-relevant rows, top 50 by |seat_mrr|.
- Click New → Channel split (default); switch to Segment/Vertical; click a slice → account table.
- Click Churn → Segment split (default); switch to Cohort age → 4 buckets; Vertical; SyncType.
- Set a global filter (e.g. Segment=SMB) → whole bridge re-renders; drill again → numbers respect the filter.
- Toggle delta off/on → ▲/▼ chips appear/disappear; change comparison month → chips update.
- Breadcrumb navigates back up cleanly.

- [ ] **Step 2: Cross-check one number against the data layer.** Pick the Expansion bar's Seats value for the month and confirm it matches a direct BQ query of `int_mrr_movement_decomposed` (the Phase-1 reconciliation guarantees the model is right; this confirms the UI query is faithful).

- [ ] **Step 3: Build + deploy to GitHub Pages** (per CLAUDE.md — GitHub Pages only, never `vercel --prod`):

```bash
cd builder && npm run build
git add dist && git commit -m "build(net-saas): deploy drilldown dashboard"
git push origin main   # confirm gh account is nickperaltab first
```

- [ ] **Step 4: Verify the deployed page loads** at the GitHub Pages URL and the bridge renders for a BQ-authed user.

---

## Self-Review

**Spec coverage** (against `2026-06-03-net-saas-drilldown-dashboard-design.md` + locked decisions):

| Locked decision | Task |
|---|---|
| L0 scalar + L1 bridge | 1, 2, 6, 8 |
| L2 dispatch by bar (component vs dimension) | 3, 4, 9, 10 (L2Panel), 11 |
| L3 path-aware core+extras table | 1 (config), 5 (SQL), 10 (table), 11 |
| Drill in place + breadcrumb | 10 (breadcrumb), 11 (controller) |
| Global single-select filters (4 primary + 3 overflow) | 1 (config), 2/3/4/5 (filter clauses), 10 (bar), 11 |
| Month grain, latest-complete-month default | 11 (Step 3) |
| Inline delta toggle + selectable comparison period | 6 (math), 8/10 (render), 11 (toggle/selector) |
| Live BQ OAuth, no committed data | 7 (queryBq), 12 |
| Annual / multi-select / sparklines / pivot deferred | not in plan (correctly) |

**Placeholder scan:** SQL builders, transforms, config, and data wrappers have complete code. React components (Tasks 8, 10, 11) are specified with props + behavior rather than full JSX — acceptable because (a) they depend on the exact EChart/ChannelTable APIs the implementer must read first, and (b) the testable logic (SQL, normalization, delta) is fully TDD'd. The implementer reads the named reference files before writing each component.

**Type consistency:** `normalizeBridge` output `{key,label,type,value}` is consumed by `NetSaasBridge` (Task 8) and the net calc (Task 6). `buildDimSplitSql`/`buildCohortAgeChurnSql` both return `{bucket, value}` rows so `L2Panel` handles them uniformly. `fetchComponentSplit` returns `{seats,apps,price}` consumed by `L2Panel` component mode. Drill state `{bar, dim, slice}` threads consistently from `onBarClick`→L2→`onSliceClick`→`buildAccountTableSql`.

**Known risks flagged for the implementer:**
- The decomposition view has no dim columns; dim-filtered component splits and L3 require the `int_customer_mrr` join (Tasks 4, 5). Confirmed in the data-sourcing reference.
- `queryBq`'s exact return shape must be confirmed (Task 7 Step 1) before the wrappers are trusted.
- Cohort-age `MIN(Month)` over the full view assumes the entity's first row in `int_customer_mrr` is its true acquisition month. Good enough for V1 bucketing; note it as an approximation.
- The dim-attribution known issue from Phase 1 (~12 entities flicker on Vertical/Channel/SyncType) propagates to New/Churn dim splits. Footnote it in the UI.
