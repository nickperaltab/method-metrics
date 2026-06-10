# Acquisition Funnel V1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Labs/Beta cohort **acquisition funnel** dashboard — Trial → Sync → Converted, with $ (DEP/Core split) at conversion and a Company-Size segment — as a new dashboard that reuses the existing drilldown plumbing.

**Architecture:** New scorecard config + `funnelDrill` renderer + funnel-specific SQL/data/transform + a funnel-step chart and controller. **Reuses** the existing `DrillBreadcrumb`, `GlobalFilterBar`, `ChartErrorBoundary`, `NetSaasAccountTable` (L3), `AccountDetail` (L4), `queryBq` cache, ECharts `method` theme, Labs/Beta pattern. The SaaS MRR Movement dashboard is **not modified**.

**Tech Stack:** Plain JS, React, Vite, Vitest, ECharts. Live BQ via OAuth (session-cached). Source tables: `revenue.Funnel` (Trial/Sync/Conversion events per entity), `revenue.Account` (license count), `revenue.int_customer_mrr_lines` (MRR + DEP classification).

**Spec:** `docs/superpowers/specs/2026-06-10-acquisition-funnel-design.md`

**Scope (V1 only):** cohort spine + $ at conversion + Company-Size segment + new dashboard scaffolding. **Out of scope (future plans):** treatment-lift table (Demo/PS), other segments (DEP both-lenses, payment type, pay-per-use), First Impact stage (Amplitude), full-bowtie overview.

---

## File Structure

**Create:**
- `builder/src/lib/funnelSql.js` — pure SQL builders (spine, conversion-MRR, account-table). Mirrors `netSaasSql.js`.
- `builder/src/lib/funnelData.js` — async BQ wrappers. Mirrors `netSaasData.js`.
- `builder/src/lib/funnelTransform.js` — normalize spine → stages + drop-off % + maturity flag.
- `builder/src/components/scorecards/FunnelChart.jsx` — stepped funnel (narrowing bars + drop-off % + $ at conversion).
- `builder/src/components/scorecards/FunnelDrill.jsx` — controller (cohort + segment + stage state; reuses shared components).
- `builder/src/config/scorecards/funnel-acquisition-scorecard.js` — config (Labs/Beta, `renderer: 'funnelDrill'`).
- `builder/tests/unit/funnelSql.test.js`, `funnelTransform.test.js` — unit tests.

**Modify:**
- `builder/src/config/scorecards/index.js` — register the new scorecard.
- `builder/src/components/Scorecard.jsx` (or wherever `renderer` branches) — add a `funnelDrill` branch mounting `FunnelDrill`.

**Reuse unchanged:** `DrillBreadcrumb.jsx`, `GlobalFilterBar.jsx`, `ChartErrorBoundary`, `NetSaasAccountTable.jsx`, `AccountDetail.jsx`, `lib/bigquery.js` (`queryBq`), `EChart.jsx`.

**Known gotcha (carry through all SQL):** one `EntityRecordID` can map to multiple `Account` rows / `CompanyAccount`s. Always aggregate to the entity (e.g. `MAX(LicenseCount)`) before bucketing — never assume one row per entity off `Account`.

---

## Task 1: Funnel spine SQL (TDD)

**Files:**
- Create: `builder/src/lib/funnelSql.js`
- Test: `builder/tests/unit/funnelSql.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { buildFunnelSpineSql } from '../../src/lib/funnelSql.js';

describe('buildFunnelSpineSql', () => {
  it('builds an entity-level cohort spine for one trial-month', () => {
    const sql = buildFunnelSpineSql({ cohortMonth: '2026-01-01' });
    expect(sql).toContain('revenue.Funnel');
    expect(sql).toContain("MIN(IF(EventType='Trial'");
    expect(sql).toContain("MIN(IF(EventType='Sync'");
    expect(sql).toContain("MIN(IF(EventType='Conversion'");
    expect(sql).toContain('COUNTIF(s.sync_date IS NOT NULL AND s.sync_date >= s.trial_date)');
    expect(sql).toContain('COUNTIF(s.conversion_date IS NOT NULL AND s.conversion_date >= s.trial_date)');
    expect(sql).toContain("DATE_TRUNC(s.trial_date, MONTH) = '2026-01-01'");
    expect(sql).not.toContain('GROUP BY segment');     // no segment → single row
  });

  it('groups by company-size bucket when segment=CompanySize', () => {
    const sql = buildFunnelSpineSql({ cohortMonth: '2026-01-01', segment: 'CompanySize' });
    expect(sql).toContain('MAX(LicenseCount) AS licenses');
    expect(sql).toContain('AS segment');
    expect(sql).toContain('GROUP BY segment');
    expect(sql).toContain('ORDER BY segment');
  });

  it('escapes single quotes in cohortMonth (injection guard)', () => {
    const sql = buildFunnelSpineSql({ cohortMonth: "2026-01-01' OR '1'='1" });
    expect(sql).toContain("'2026-01-01'' OR ''1''=''1'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd builder && npx vitest run tests/unit/funnelSql.test.js`
Expected: FAIL — `buildFunnelSpineSql is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// builder/src/lib/funnelSql.js
// Pure SQL builders for the Acquisition Funnel. No I/O. Unit-tested.

const fqn = (view) => `\`project-for-method-dw.revenue.${view}\``;
function sqlStr(v) { return `'${String(v).replace(/'/g, "''")}'`; }

// Company-size buckets from per-entity MAX(LicenseCount). Bucket order is
// preserved by a leading sort index so labels don't sort lexically.
const SIZE_BUCKET = `CASE
      WHEN sz.licenses IS NULL THEN '5 · Unknown'
      WHEN sz.licenses <= 1     THEN '1 · 1 seat (VSB)'
      WHEN sz.licenses <= 4     THEN '2 · 2-4 (SB)'
      WHEN sz.licenses <= 10    THEN '3 · 5-10 (SMB)'
      ELSE '4 · 11+ (Mid)'
    END`;

export function buildFunnelSpineSql({ cohortMonth, segment = null }) {
  const seg = segment === 'CompanySize';
  return `WITH stages AS (
  SELECT EntityRecordID,
    MIN(IF(EventType='Trial', Date, NULL))      AS trial_date,
    MIN(IF(EventType='Sync', Date, NULL))       AS sync_date,
    MIN(IF(EventType='Conversion', Date, NULL)) AS conversion_date
  FROM ${fqn('Funnel')}
  GROUP BY EntityRecordID
),
sizes AS (
  SELECT EntityRecordID, MAX(LicenseCount) AS licenses
  FROM ${fqn('Account')}
  GROUP BY EntityRecordID
)
SELECT
${seg ? `  ${SIZE_BUCKET} AS segment,\n` : ''}  COUNT(*) AS trials,
  COUNTIF(s.sync_date IS NOT NULL AND s.sync_date >= s.trial_date)             AS synced,
  COUNTIF(s.conversion_date IS NOT NULL AND s.conversion_date >= s.trial_date) AS converted
FROM stages s
LEFT JOIN sizes sz USING (EntityRecordID)
WHERE DATE_TRUNC(s.trial_date, MONTH) = ${sqlStr(cohortMonth)}
${seg ? 'GROUP BY segment\nORDER BY segment' : ''}`.trimEnd();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd builder && npx vitest run tests/unit/funnelSql.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Live sanity-check (manual, optional but recommended)**

Run the no-segment SQL for `2026-01-01` via `bq query` and confirm trials/synced/converted match the numbers from the design-phase spike (declining trials → synced → converted). Documents the SQL is correct end-to-end.

- [ ] **Step 6: Commit**

```bash
git add builder/src/lib/funnelSql.js builder/tests/unit/funnelSql.test.js
git commit -m "feat(funnel): cohort spine SQL builder (TDD)"
```

---

## Task 2: Conversion-MRR SQL ($ at conversion, DEP/Core split) (TDD)

**Files:**
- Modify: `builder/src/lib/funnelSql.js`
- Test: `builder/tests/unit/funnelSql.test.js`

> **V1 approximation (document in a code comment):** "$ at conversion" uses each converted entity's MRR at the **latest** `int_customer_mrr_lines` month (their current book), not the value at their exact conversion date. Good enough for V1's "value of this cohort's converts"; refine to at-conversion MRR in a later phase.

- [ ] **Step 1: Add the failing test**

```js
import { buildConversionMrrSql } from '../../src/lib/funnelSql.js';

describe('buildConversionMrrSql', () => {
  it('sums converted-cohort MRR split into core vs DEP from the lines model', () => {
    const sql = buildConversionMrrSql({ cohortMonth: '2026-01-01' });
    expect(sql).toContain('int_customer_mrr_lines');
    expect(sql).toContain("conversion_date IS NOT NULL AND conversion_date >= trial_date");
    expect(sql).toContain("DATE_TRUNC(trial_date, MONTH) = '2026-01-01'");
    expect(sql).toContain('premium app');         // DEP classification
    expect(sql).toContain('enhancement plan');
    expect(sql).toContain('AS core_mrr');
    expect(sql).toContain('AS dep_mrr');
    expect(sql).toContain('l.month = (SELECT m FROM latest)');
  });
});
```

- [ ] **Step 2: Run, verify fail.** `npx vitest run tests/unit/funnelSql.test.js` → FAIL (`buildConversionMrrSql is not a function`).

- [ ] **Step 3: Implement (append to `funnelSql.js`)**

```js
// DEP-revenue classification (same item patterns proven in the MRR-movement work).
const DEP_ITEM = `(LOWER(l.item) LIKE '%premium app%' OR LOWER(l.item) LIKE '%enhancement plan%' OR LOWER(l.item) LIKE '%dedicated%')`;

export function buildConversionMrrSql({ cohortMonth }) {
  return `WITH stages AS (
  SELECT EntityRecordID,
    MIN(IF(EventType='Trial', Date, NULL))      AS trial_date,
    MIN(IF(EventType='Conversion', Date, NULL)) AS conversion_date
  FROM ${fqn('Funnel')}
  GROUP BY EntityRecordID
),
converted AS (
  SELECT EntityRecordID
  FROM stages
  WHERE DATE_TRUNC(trial_date, MONTH) = ${sqlStr(cohortMonth)}
    AND conversion_date IS NOT NULL AND conversion_date >= trial_date
),
latest AS ( SELECT MAX(month) AS m FROM ${fqn('int_customer_mrr_lines')} )
SELECT
  ROUND(SUM(IF(NOT ${DEP_ITEM}, l.saas, 0)), 2) AS core_mrr,
  ROUND(SUM(IF(${DEP_ITEM}, l.saas, 0)), 2)      AS dep_mrr
FROM ${fqn('int_customer_mrr_lines')} l
JOIN converted c ON c.EntityRecordID = l.entity_record_id
WHERE l.month = (SELECT m FROM latest) AND l.saas != 0`.trimEnd();
}
```

- [ ] **Step 4: Run, verify pass.** `npx vitest run tests/unit/funnelSql.test.js` → PASS.
- [ ] **Step 5: Commit** `feat(funnel): conversion-MRR SQL (DEP/core split, TDD)`.

---

## Task 3: L3 account-table SQL (accounts at a stage) (TDD)

**Files:**
- Modify: `builder/src/lib/funnelSql.js`
- Test: `builder/tests/unit/funnelSql.test.js`

- [ ] **Step 1: Add failing test**

```js
import { buildFunnelAccountTableSql } from '../../src/lib/funnelSql.js';

describe('buildFunnelAccountTableSql', () => {
  it('lists converted-stage accounts for a cohort, with mrr as deltaMrr', () => {
    const sql = buildFunnelAccountTableSql({ cohortMonth: '2026-01-01', stage: 'converted' });
    expect(sql).toContain('revenue.Funnel');
    expect(sql).toContain('entity_record_id');
    expect(sql).toContain('AS deltaMrr');
    expect(sql).toContain('s.conversion_date IS NOT NULL AND s.conversion_date >= s.trial_date');
    expect(sql).toContain('LIMIT 50');
  });
  it('synced stage filters on sync_date; trial stage has no extra filter', () => {
    expect(buildFunnelAccountTableSql({ cohortMonth: '2026-01-01', stage: 'synced' }))
      .toContain('s.sync_date IS NOT NULL AND s.sync_date >= s.trial_date');
    const trial = buildFunnelAccountTableSql({ cohortMonth: '2026-01-01', stage: 'trial' });
    expect(trial).not.toContain('sync_date IS NOT NULL');
    expect(trial).not.toContain('conversion_date IS NOT NULL');
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement (append)**

```js
export function buildFunnelAccountTableSql({ cohortMonth, stage }) {
  const cond = stage === 'synced'
      ? 'AND s.sync_date IS NOT NULL AND s.sync_date >= s.trial_date'
    : stage === 'converted'
      ? 'AND s.conversion_date IS NOT NULL AND s.conversion_date >= s.trial_date'
    : '';
  return `WITH stages AS (
  SELECT EntityRecordID,
    ANY_VALUE(CompanyAccount)     AS company,
    ANY_VALUE(Vertical)           AS vertical,
    ANY_VALUE(SignupCountry)      AS country,
    MAX(CustDatLastSaasAmount)    AS mrr,
    MIN(IF(EventType='Trial', Date, NULL))      AS trial_date,
    MIN(IF(EventType='Sync', Date, NULL))       AS sync_date,
    MIN(IF(EventType='Conversion', Date, NULL)) AS conversion_date
  FROM ${fqn('Funnel')}
  GROUP BY EntityRecordID
)
SELECT
  s.EntityRecordID AS entity_record_id,
  s.company  AS Company,
  s.vertical AS Vertical,
  s.country  AS SignupCountry,
  ROUND(s.mrr, 2) AS deltaMrr
FROM stages s
WHERE DATE_TRUNC(s.trial_date, MONTH) = ${sqlStr(cohortMonth)}
  ${cond}
ORDER BY s.mrr DESC
LIMIT 50`.trimEnd();
}
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(funnel): L3 account-table SQL (TDD)`.

---

## Task 4: Async data wrappers

**Files:**
- Create: `builder/src/lib/funnelData.js`

- [ ] **Step 1: Implement** (mirror `netSaasData.js`: unwrap `{rows}`, coerce numerics)

```js
// builder/src/lib/funnelData.js
import { queryBq } from './bigquery.js';
import { buildFunnelSpineSql, buildConversionMrrSql, buildFunnelAccountTableSql } from './funnelSql.js';

const num = (v) => Number(v) || 0;

// Returns [{ segment?, trials, synced, converted }]
export async function fetchFunnelSpine({ cohortMonth, segment }) {
  const { rows } = await queryBq(buildFunnelSpineSql({ cohortMonth, segment }));
  return rows.map((r) => ({
    segment: r.segment ?? null,
    trials: num(r.trials), synced: num(r.synced), converted: num(r.converted),
  }));
}

// Returns { core_mrr, dep_mrr }
export async function fetchConversionMrr({ cohortMonth }) {
  const { rows } = await queryBq(buildConversionMrrSql({ cohortMonth }));
  const r = rows[0] || {};
  return { core_mrr: num(r.core_mrr), dep_mrr: num(r.dep_mrr) };
}

// Returns [{ entity_record_id, Company, Vertical, SignupCountry, deltaMrr }]
export async function fetchFunnelAccounts({ cohortMonth, stage }) {
  const { rows } = await queryBq(buildFunnelAccountTableSql({ cohortMonth, stage }));
  return rows.map((r) => ({ ...r, deltaMrr: num(r.deltaMrr) }));
}
```

- [ ] **Step 2: Lint** `cd builder && npx eslint src/lib/funnelData.js` → exit 0.
- [ ] **Step 3: Commit** `feat(funnel): async data wrappers`.

---

## Task 5: Transform — stages + drop-off % + maturity flag (TDD)

**Files:**
- Create: `builder/src/lib/funnelTransform.js`
- Test: `builder/tests/unit/funnelTransform.test.js`

- [ ] **Step 1: Write failing test**

```js
import { describe, it, expect } from 'vitest';
import { normalizeFunnel, isCohortMature } from '../../src/lib/funnelTransform.js';

describe('normalizeFunnel', () => {
  it('builds stages with counts, % of trials, and drop-off to next', () => {
    const stages = normalizeFunnel({ trials: 1000, synced: 620, converted: 185 });
    expect(stages.map(s => s.key)).toEqual(['trial', 'synced', 'converted']);
    expect(stages[0]).toMatchObject({ count: 1000, pctOfTrials: 1, dropToNext: 0.38 });
    expect(stages[1]).toMatchObject({ count: 620, pctOfTrials: 0.62 });
    expect(stages[2]).toMatchObject({ count: 185, pctOfTrials: 0.185, dropToNext: null });
  });
  it('guards divide-by-zero on an empty cohort', () => {
    const stages = normalizeFunnel({ trials: 0, synced: 0, converted: 0 });
    expect(stages[0].pctOfTrials).toBe(0);
    expect(stages[0].dropToNext).toBe(0);
  });
});

describe('isCohortMature', () => {
  it('is false for a cohort younger than the maturity window', () => {
    expect(isCohortMature('2026-06-01', '2026-06-10', 90)).toBe(false);
    expect(isCohortMature('2026-01-01', '2026-06-10', 90)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```js
// builder/src/lib/funnelTransform.js

const STAGE_DEFS = [
  { key: 'trial',     label: 'Trial' },
  { key: 'synced',    label: 'Sync' },
  { key: 'converted', label: 'Converted' },
];

// row = { trials, synced, converted }. Returns ordered stage objects with
// count, pctOfTrials (share of the trial cohort), and dropToNext (1 - next/this).
export function normalizeFunnel(row = {}) {
  const counts = [row.trials || 0, row.synced || 0, row.converted || 0];
  const trials = counts[0];
  return STAGE_DEFS.map((def, i) => {
    const count = counts[i];
    const next = counts[i + 1];
    const dropToNext = i === counts.length - 1
      ? null
      : (count > 0 ? +(1 - next / count).toFixed(4) : 0);
    return {
      ...def,
      count,
      pctOfTrials: trials > 0 ? +(count / trials).toFixed(4) : 0,
      dropToNext,
    };
  });
}

// Cohort is "mature" once `windowDays` have elapsed since the cohort month start.
export function isCohortMature(cohortMonth, today, windowDays = 90) {
  const start = new Date(cohortMonth + 'T00:00:00Z');
  const now = new Date(today + 'T00:00:00Z');
  const elapsedDays = (now - start) / 86400000;
  return elapsedDays >= windowDays;
}
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(funnel): normalize + maturity transform (TDD)`.

---

## Task 6: FunnelChart component (stepped funnel)

**Files:**
- Create: `builder/src/components/scorecards/FunnelChart.jsx`

- [ ] **Step 1: Read references.** Read `NetSaasBridge.jsx` (div/SVG bar rendering, Method colors, `formatUsd`) and `AccountDetail.jsx` (ECharts wrapper) for the house style.

- [ ] **Step 2: Implement.** A div/SVG component (no ECharts needed — bars are simple). Props:
  `{ stages, conversionMrr, onStageClick, mature }` where `stages` = `normalizeFunnel(...)` output, `conversionMrr = { core_mrr, dep_mrr }`.
  Render, top to bottom, one horizontal bar per stage:
  - bar width ∝ `pctOfTrials` (trial = 100%); label = stage label; right side shows `count` and `(pctOfTrials%)`.
  - between bars, a muted "↓ NN% drop" line from `dropToNext`.
  - on the **Converted** bar, append a `$` annotation: `formatUsd(core_mrr)` core + `formatUsd(dep_mrr)` DEP (two chips).
  - each bar is clickable → `onStageClick(stage.key)` (cursor pointer + hover highlight).
  - if `!mature`, show an amber "⚠ cohort still maturing — counts will rise" note above the funnel.
  Colors: Trial `#2563eb`, Sync `#059669`, Converted `#0891b2`; DEP chip `#a855f7`. Copy `formatUsd` from `AccountDetail.jsx` (do not import private helpers — duplicate the small function, matching the codebase's existing pattern).

- [ ] **Step 3: Lint + build.** `cd builder && npx eslint src/components/scorecards/FunnelChart.jsx && npm run build` → both exit 0.
- [ ] **Step 4: Commit** `feat(funnel): stepped funnel chart component`.

---

## Task 7: Scorecard config + registration + renderer branch

**Files:**
- Create: `builder/src/config/scorecards/funnel-acquisition-scorecard.js`
- Modify: `builder/src/config/scorecards/index.js`
- Modify: the file where `renderer` is branched to mount drilldowns (grep for `'netSaasDrill'`).

- [ ] **Step 1: Create config**

```js
// builder/src/config/scorecards/funnel-acquisition-scorecard.js
export const funnelAcquisitionScorecard = {
  id: 'acquisition-funnel',
  title: 'Acquisition Funnel',
  subtitle: 'Cohort funnel: of the trials that started each month, how many synced and converted. $ shown at conversion only (DEP/Core split); retention lives in SaaS MRR Movement.',
  status: 'beta',
  labs: true,
  renderer: 'funnelDrill',
  // V1 segment options for the segment selector.
  segments: [
    { key: null, label: 'All' },
    { key: 'CompanySize', label: 'Company size' },
  ],
  maturityDays: 90,
};
export default funnelAcquisitionScorecard;
```

- [ ] **Step 2: Register in `index.js`.** Add the import + map entry next to the others:

```js
import funnelAcquisition from './funnel-acquisition-scorecard.js';
// ...inside the SCORECARDS object:
'acquisition-funnel': funnelAcquisition,
```

- [ ] **Step 3: Find the renderer branch.** Run `grep -rn "netSaasDrill" builder/src` to locate where `renderer === 'netSaasDrill'` mounts `DecompositionDrill`. Add a sibling branch:

```jsx
if (scorecard.renderer === 'funnelDrill') {
  return <FunnelDrill cfg={scorecard} />;
}
```
Import `FunnelDrill` at the top of that file. (Match the exact prop name the netSaas branch uses — mirror it.)

- [ ] **Step 4: Build.** `cd builder && npm run build` → exit 0. The card auto-appears in the **Labs** sidebar section (driven by `labs: true`).
- [ ] **Step 5: Commit** `feat(funnel): config + registration + funnelDrill renderer branch`.

---

## Task 8: FunnelDrill controller

**Files:**
- Create: `builder/src/components/scorecards/FunnelDrill.jsx`

- [ ] **Step 1: Read reference.** Read `DecompositionDrill.jsx` for: the header + Beta-pill block, `DrillBreadcrumb` usage, `ChartErrorBoundary` wrapping, month-selector pattern, and how it mounts `NetSaasAccountTable` + `AccountDetail`.

- [ ] **Step 2: Implement.** State: `cohortMonth` (default = latest cohort that is ≥ `maturityDays` old), `segment` (default null), `stage` (null until a bar is clicked), `account` (null until an L3 row clicked). Plus loaded data: `spine`, `conversionMrr`, `l3`, `accountHistory`, `accountLifecycle`.
  - On mount / cohortMonth change: `fetchFunnelSpine({ cohortMonth, segment: null })` (single row) + `fetchConversionMrr({ cohortMonth })`; `normalizeFunnel(spine[0])`; compute `mature = isCohortMature(cohortMonth, todayISO(), cfg.maturityDays)`.
  - Render header (`cfg.title` + Beta pill, reuse the exact pill markup from `DecompositionDrill`), `cfg.subtitle`, a cohort-month `<select>`, and a segment selector from `cfg.segments`.
  - When `segment` is set, fetch `fetchFunnelSpine({ cohortMonth, segment })` and render a small **segment-compare table** (segment | trials | sync% | convert%) below the funnel (counts → rates via `normalizeFunnel` per row). When `null`, render the single `FunnelChart`.
  - `<FunnelChart stages={...} conversionMrr={...} mature={mature} onStageClick={handleStageClick} />` wrapped in `ChartErrorBoundary`.
  - `handleStageClick(stageKey)`: setStage; `fetchFunnelAccounts({ cohortMonth, stage: stageKey })` → `l3`. Render `<NetSaasAccountTable rows={l3} onRowClick={handleAccountClick} />` (reused as-is).
  - `handleAccountClick(row)`: reuse the **exact** `fetchAccountHistory` / `fetchAccountLifecycle` from `netSaasData.js` (import them) keyed by `row.entity_record_id`; render `<AccountDetail account={row} history={accountHistory} lifecycle={accountLifecycle} />` in `ChartErrorBoundary`.
  - Breadcrumb: `Funnel › <Stage> › <Company>` mirroring `DrillBreadcrumb` usage; navigating up clears `stage` / `account`. Clear `stage` + `account` whenever `cohortMonth` or `segment` changes.

  > **Verify column compatibility:** `NetSaasAccountTable` must render the funnel rows (`Company`, `Vertical`, `SignupCountry`, `deltaMrr`). Read it first — if it hard-codes netSaas columns, add a `columns` prop (light generalization) rather than forking it. Keep the change minimal and backward-compatible with `DecompositionDrill`.

- [ ] **Step 3: Lint + build.** `cd builder && npx eslint src/components/scorecards/FunnelDrill.jsx && npm run build` → exit 0.
- [ ] **Step 4: Commit** `feat(funnel): FunnelDrill controller (reuses breadcrumb/table/detail)`.

---

## Task 9: Integration, verify, deploy

- [ ] **Step 1: Full suite.** `cd builder && npx vitest run` → all green (no regressions in existing suites).
- [ ] **Step 2: Lint + build.** `npx eslint src && npm run build` → exit 0.
- [ ] **Step 3: Headless mount check.** Load the built app to the connect-gate; confirm no console errors and the **Labs → Acquisition Funnel** entry renders.
- [ ] **Step 4: Leak-guard.** `git diff` the staged changes; confirm **no $ figures, ratios, or account names** are committed (UI code + SQL builders only). Use the established scan: `git diff -- builder/ | grep '^[+]' | grep -iE '\$[0-9]|[0-9]+\.[0-9]+%'` → must be empty (style values excepted).
- [ ] **Step 5: Commit + push.**

```bash
git add builder/src builder/tests
git commit -m "feat(funnel): acquisition funnel V1 — cohort spine + conversion \$ + company-size segment"
git push origin main
```

- [ ] **Step 6: Watch deploy.** Confirm `static.yml` run completes green and the bundle hash changes.
- [ ] **Step 7: Live verification (user, OAuth):** open **Labs → Acquisition Funnel**; pick a mature cohort month; confirm trials/synced/converted match a fresh `bq` query for that month; click Converted → account list; click an account → history timeline. Confirm the maturity warning appears for a recent (<90d) cohort.

---

## Self-Review

**Spec coverage (against `2026-06-10-acquisition-funnel-design.md`):**
- §3 spine (Trial→Sync→Converted, cohort, first-event-per-type, maturity cap) → Tasks 1, 5, 8.
- §4 dollars (none pre-conversion; gross MRR DEP/Core at conversion) → Task 2 + Task 6 ($ only on Converted bar).
- §5 segments — Company Size (must-have V1) → Tasks 1, 8. *(DEP/payment-type/pay-per-use intentionally deferred — noted in scope.)*
- §6 sources (`Funnel`, `Account`, `int_customer_mrr_lines`) → Tasks 1–3.
- §7 First Impact → **explicitly out of V1 scope** (Phase 2; documented in header).
- §8 visualization (stepped funnel + segment compare; Labs/Beta) → Tasks 6, 7, 8.
- §12 build approach (new dashboard, reuse breadcrumb/filter-bar/account-table/account-detail/cache; MRR untouched) → Tasks 7, 8 (reuse) + "Modify" list (no netSaas files changed except an additive renderer branch + optional minimal `columns` prop on the table).

**Placeholder scan:** SQL and JS are concrete in every code step; the two component tasks (6, 8) specify props, data flow, colors, and reference files rather than full JSX (house-style components built against named existing patterns) — acceptable, and each ends in lint+build verification.

**Type consistency:** `fetchFunnelSpine` → `[{segment,trials,synced,converted}]` consumed by `normalizeFunnel({trials,synced,converted})`; `fetchConversionMrr` → `{core_mrr,dep_mrr}` consumed by `FunnelChart`; `fetchFunnelAccounts` → rows with `entity_record_id`+`deltaMrr` consumed by `NetSaasAccountTable`/`handleAccountClick`; `onStageClick(stageKey)` keys (`trial`/`synced`/`converted`) match `buildFunnelAccountTableSql` stage values and `STAGE_DEFS`.

**Treatment vs deferral:** Treatment-lift table, additional segments, and First Impact are deferred to follow-on plans — called out in the header scope so the executor doesn't attempt them.
