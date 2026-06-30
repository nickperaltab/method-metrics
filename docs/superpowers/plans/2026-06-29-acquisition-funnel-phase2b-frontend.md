# Acquisition Funnel Phase 2b — Motion + Lifecycle Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Labs scorecard that renders the motion + lifecycle funnel — two side-by-side paths (talked-to-us vs self-serve), the demo booked→attended show-rate, and a 1/3/6/12-month retention tail — reading the `v_motion_funnel` / `int_motion_funnel` models shipped in Phase 2a.

**Architecture:** A new scorecard (`motion-funnel-scorecard.js`, Labs/Beta, `renderer: 'motionFunnelDrill'`) driven by a new controller `MotionFunnelDrill.jsx`, mirroring the shipped `FunnelDrill`. A pure lib trio (`motionFunnelSql.js` → SQL strings, `motionFunnelTransform.js` → rate math, `motionFunnelData.js` → `queryBq` wrappers) feeds a new presentational `MotionFunnelChart.jsx` that draws two path-funnels + retention curve, reusing the bar idiom from `FunnelChart`. The shipped Acquisition Funnel is **not modified**.

**Tech Stack:** React + Vite, ECharts (existing theme), Vitest (pure-lib unit tests), BigQuery via `queryBq` OAuth. No new dependencies.

## Global Constraints

- The shipped `funnel-acquisition-scorecard.js` / `FunnelDrill` / `funnelSql` etc. are **NOT touched**. This is a parallel scorecard reusing patterns.
- Read surface: aggregated counts from `revenue.v_motion_funnel` (grain `(signup_month, motion)`); lens breakdowns from `revenue.int_motion_funnel` (per-customer). Both already in prod BQ.
- `motion ∈ {'talked','self_serve'}`. Two paths, mutually exclusive, each its own Trial→…→Retained funnel.
- **Rates are computed in JS, never shipped by the view.** Conversion % = `next/this`. Show rate = `demo_attended/demo_booked` (talked path). Retention rate at horizon K = `retained_Kmo / eligible_Kmo`, and is **null (greyed) when `eligible_Kmo === 0`** (no mature converts in window).
- **2024+ cohort gate is hard, not cosmetic.** The signup-month window is clamped so it cannot start before `2024-01-01` (Activity-tracking start). The UI states this.
- Two caveat banners always visible: (1) "Talked-to-us is tracked from 2024; earlier sign-ups read as self-serve." (2) "Industry breakdown is sparse for trials, fuller for converts — large Unclassified bucket up top."
- Retention horizons: exactly `[1, 3, 6, 12]` months.
- `queryBq(sql)` resolves to `{ rows: [...] }` (see `funnelData.js`). Number-coerce every count with `Number(v) || 0`.
- Public repo: no dollar figures, ratios, or account names in committed code (the view ships counts only; do not add `$` columns).
- Deploy: GitHub Pages only (push to `main`). NEVER `vercel`. Build output (`builder/dist/`) is committed.
- Match existing style tokens: `'DM Sans'` / `'JetBrains Mono'`, the color palette and pill/banner styles used in `FunnelDrill.jsx` / `FunnelChart.jsx`.

---

### Task 1: Pure lib — SQL builders, rate transform, data wrappers (unit-tested)

**Files:**
- Create: `builder/src/lib/motionFunnelSql.js`
- Create: `builder/src/lib/motionFunnelTransform.js`
- Create: `builder/src/lib/motionFunnelData.js`
- Create: `builder/tests/unit/motionFunnelTransform.test.js`

**Interfaces:**
- Produces:
  - `RETENTION_HORIZONS = [1,3,6,12]`
  - `buildMotionFunnelSql({ startMonth, endMonth }): string` — sums `v_motion_funnel` over `signup_month` in `[startMonth, endMonth]`, `GROUP BY motion`. Returns one row per motion with summed `trials, synced, demo_booked, demo_attended, free_booked, free_attended, converted, customized` and `retained_Kmo`/`eligible_Kmo` for K∈{1,3,6,12}.
  - `buildMotionLensSql({ startMonth, endMonth, lens }): string` — queries `int_motion_funnel` (signup_month in range), `GROUP BY motion, <lensExpr>`; returns `motion, lens_value, trials, synced, converted`. `lens ∈ {'industry','dep','prepay','customization'}`.
  - `fetchMotionFunnel({ startMonth, endMonth }): Promise<Array>` and `fetchMotionLens({ startMonth, endMonth, lens }): Promise<Array>` (data.js).
  - `toMotionFunnel(rows): { talked, self_serve }` where each is `{ stages: [...], showRate: number|null, retention: [{k, rate|null, mature}] }`. `stages` is ordered `[trial, synced, converted, customized]` each `{ key, label, count, pctOfTrials, dropToNext }` (same shape `normalizeFunnel` produces).

- [ ] **Step 1: Write the failing transform test**

Create `builder/tests/unit/motionFunnelTransform.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { toMotionFunnel, RETENTION_HORIZONS } from '../../src/lib/motionFunnelTransform.js';

const rows = [
  { motion: 'talked', trials: 100, synced: 80, demo_booked: 60, demo_attended: 45,
    free_booked: 10, free_attended: 8, converted: 40, customized: 12,
    retained_1mo: 38, eligible_1mo: 40, retained_3mo: 30, eligible_3mo: 35,
    retained_6mo: 0, eligible_6mo: 0, retained_12mo: 0, eligible_12mo: 0 },
  { motion: 'self_serve', trials: 300, synced: 150, demo_booked: 0, demo_attended: 0,
    free_booked: 0, free_attended: 0, converted: 60, customized: 5,
    retained_1mo: 50, eligible_1mo: 60, retained_3mo: 40, eligible_3mo: 55,
    retained_6mo: 0, eligible_6mo: 0, retained_12mo: 0, eligible_12mo: 0 },
];

describe('toMotionFunnel', () => {
  it('splits into talked + self_serve with conversion %', () => {
    const out = toMotionFunnel(rows);
    expect(out.talked.stages.map((s) => s.key)).toEqual(['trial', 'synced', 'converted', 'customized']);
    expect(out.talked.stages[0].count).toBe(100);
    expect(out.talked.stages[1].pctOfTrials).toBe(0.8);   // 80/100
    expect(out.self_serve.stages[2].count).toBe(60);
  });

  it('computes show rate = demo_attended / demo_booked (talked only)', () => {
    const out = toMotionFunnel(rows);
    expect(out.talked.showRate).toBe(0.75);   // 45/60
    expect(out.self_serve.showRate).toBe(null); // no booked
  });

  it('computes retention rate = retained/eligible, null when eligible 0', () => {
    const out = toMotionFunnel(rows);
    expect(out.talked.retention.map((r) => r.k)).toEqual(RETENTION_HORIZONS);
    expect(out.talked.retention[0].rate).toBe(0.95); // 38/40
    expect(out.talked.retention[0].mature).toBe(true);
    const r6 = out.talked.retention.find((r) => r.k === 6);
    expect(r6.rate).toBe(null);   // eligible_6mo = 0
    expect(r6.mature).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd builder && npx vitest run tests/unit/motionFunnelTransform.test.js`
Expected: FAIL — cannot resolve `motionFunnelTransform.js`.

- [ ] **Step 3: Write the transform module**

Create `builder/src/lib/motionFunnelTransform.js`:

```javascript
// builder/src/lib/motionFunnelTransform.js
// Pure rate math for the Motion + Lifecycle funnel. No I/O.

export const RETENTION_HORIZONS = [1, 3, 6, 12];

const STAGE_DEFS = [
  { key: 'trial',      label: 'Trial' },
  { key: 'synced',     label: 'Sync' },
  { key: 'converted',  label: 'Converted' },
  { key: 'customized', label: 'Customized' },
];

const num = (v) => Number(v) || 0;
const r4 = (x) => +x.toFixed(4);

function stagesFor(row) {
  const counts = [num(row.trials), num(row.synced), num(row.converted), num(row.customized)];
  const trials = counts[0];
  return STAGE_DEFS.map((def, i) => {
    const count = counts[i];
    const next = counts[i + 1];
    const dropToNext = i === counts.length - 1 ? null : (count > 0 ? r4(1 - next / count) : 0);
    return { ...def, count, pctOfTrials: trials > 0 ? r4(count / trials) : 0, dropToNext };
  });
}

function pathFor(row) {
  const booked = num(row.demo_booked);
  const showRate = booked > 0 ? r4(num(row.demo_attended) / booked) : null;
  const retention = RETENTION_HORIZONS.map((k) => {
    const elig = num(row[`eligible_${k}mo`]);
    const ret = num(row[`retained_${k}mo`]);
    return { k, mature: elig > 0, rate: elig > 0 ? r4(ret / elig) : null };
  });
  return { stages: stagesFor(row), showRate, retention };
}

// rows: [{motion, ...counts}]. Returns { talked, self_serve }, each a path object.
export function toMotionFunnel(rows = []) {
  const empty = { trials: 0, synced: 0, converted: 0, customized: 0, demo_booked: 0, demo_attended: 0 };
  const byMotion = Object.fromEntries(rows.map((r) => [r.motion, r]));
  return {
    talked: pathFor(byMotion.talked || empty),
    self_serve: pathFor(byMotion.self_serve || empty),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd builder && npx vitest run tests/unit/motionFunnelTransform.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the SQL builders**

Create `builder/src/lib/motionFunnelSql.js`:

```javascript
// builder/src/lib/motionFunnelSql.js
// Pure SQL builders for the Motion + Lifecycle funnel. No I/O.
const fqn = (v) => `\`project-for-method-dw.revenue.${v}\``;
const sqlStr = (v) => `'${String(v).replace(/'/g, "''")}'`;

const COUNT_COLS = [
  'trials', 'synced', 'demo_booked', 'demo_attended', 'free_booked', 'free_attended',
  'converted', 'customized',
  'retained_1mo', 'eligible_1mo', 'retained_3mo', 'eligible_3mo',
  'retained_6mo', 'eligible_6mo', 'retained_12mo', 'eligible_12mo',
];

// Sum the aggregated view over a signup-month window, per motion.
export function buildMotionFunnelSql({ startMonth, endMonth }) {
  const sums = COUNT_COLS.map((c) => `  SUM(${c}) AS ${c}`).join(',\n');
  return `SELECT
  motion,
${sums}
FROM ${fqn('v_motion_funnel')}
WHERE signup_month BETWEEN ${sqlStr(startMonth)} AND ${sqlStr(endMonth)}
GROUP BY motion
ORDER BY motion`;
}

// Lens breakdown from the per-customer table: spine counts by motion × lens value.
const LENS_EXPR = {
  industry:      `COALESCE(industry_l1, 'Unclassified')`,
  dep:           `IF(has_dep, 'DEP', 'No DEP')`,
  prepay:        `IF(is_prepay, 'Prepay', 'Monthly')`,
  customization: `IF(is_customized, 'Customized', 'No customization')`,
};

export function buildMotionLensSql({ startMonth, endMonth, lens }) {
  const expr = LENS_EXPR[lens];
  if (!expr) throw new Error(`unknown lens: ${lens}`);
  return `SELECT
  motion,
  ${expr} AS lens_value,
  COUNT(*) AS trials,
  COUNTIF(synced) AS synced,
  COUNTIF(converted) AS converted
FROM ${fqn('int_motion_funnel')}
WHERE signup_month BETWEEN ${sqlStr(startMonth)} AND ${sqlStr(endMonth)}
GROUP BY motion, lens_value
ORDER BY motion, trials DESC`;
}

export const LENSES = [
  { key: null, label: 'None' },
  { key: 'industry', label: 'Industry (V7)' },
  { key: 'dep', label: 'DEP' },
  { key: 'prepay', label: 'Prepay vs Monthly' },
  { key: 'customization', label: 'Customized' },
];
```

- [ ] **Step 6: Write the data wrappers**

Create `builder/src/lib/motionFunnelData.js`:

```javascript
// builder/src/lib/motionFunnelData.js
import { queryBq } from './bigquery.js';
import { buildMotionFunnelSql, buildMotionLensSql } from './motionFunnelSql.js';

export async function fetchMotionFunnel({ startMonth, endMonth }) {
  const { rows } = await queryBq(buildMotionFunnelSql({ startMonth, endMonth }));
  return rows;
}

export async function fetchMotionLens({ startMonth, endMonth, lens }) {
  const { rows } = await queryBq(buildMotionLensSql({ startMonth, endMonth, lens }));
  return rows;
}
```

- [ ] **Step 7: Run the full builder test suite + commit**

Run: `cd builder && npx vitest run`
Expected: all existing tests + the 3 new ones PASS.

```bash
git add builder/src/lib/motionFunnelSql.js builder/src/lib/motionFunnelTransform.js builder/src/lib/motionFunnelData.js builder/tests/unit/motionFunnelTransform.test.js
git commit -m "$(printf 'feat(motion-funnel): frontend lib — SQL builders, rate transform, data wrappers (unit-tested)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: `MotionFunnelChart` presentational component

**Files:**
- Create: `builder/src/components/scorecards/MotionFunnelChart.jsx`

**Interfaces:**
- Consumes: `RETENTION_HORIZONS` from `lib/motionFunnelTransform`.
- Produces: default-exported `<MotionFunnelChart paths={{talked, self_serve}} mature={bool} onStageClick={(motion, stageKey)=>{}} />`. `paths` is the output of `toMotionFunnel`.

- [ ] **Step 1: Write the component**

Create `builder/src/components/scorecards/MotionFunnelChart.jsx`. Render two columns side by side (talked | self-serve). Each column: the stage bars (Trial→Sync→Converted→Customized) using the same bar idiom as `FunnelChart.jsx` (bar width = `pctOfTrials`, count + `(pct%)` to the right, `↓ N% drop` between bars). On the **talked** column only, render a "demo show rate" chip near the top (`Math.round(showRate*100)%` of booked demos attended; render "—" when `showRate == null`). Below each column's stages, render the retention tail: one mini-bar per horizon in `RETENTION_HORIZONS` labeled `m1/m3/m6/m12`, height/label = `Math.round(rate*100)%`, and **greyed with an "n/a — not mature" label when `rate == null`**. Bars call `onStageClick(motion, stageKey)`. Use the existing tokens (`'DM Sans'`, `'JetBrains Mono'`, stage colors blue/green/cyan, amber muted text). Mirror `FunnelChart.jsx`'s structure closely; this is the two-path generalization of it.

(Presentational — pure-logic already covered by Task 1's tests; no separate unit test. Verified visually in Task 4 via preview.)

- [ ] **Step 2: Verify it builds**

Run: `cd builder && npm run build`
Expected: build succeeds (no import/JSX errors).

- [ ] **Step 3: Commit**

```bash
git add builder/src/components/scorecards/MotionFunnelChart.jsx
git commit -m "$(printf 'feat(motion-funnel): MotionFunnelChart — two-path funnel + show rate + retention tail\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: `MotionFunnelDrill` controller

**Files:**
- Create: `builder/src/components/scorecards/MotionFunnelDrill.jsx`

**Interfaces:**
- Consumes: `fetchMotionFunnel`, `fetchMotionLens` (data.js); `toMotionFunnel` (transform); `LENSES` (sql.js); `MotionFunnelChart`; `ChartErrorBoundary` from `../EChart`; `isCohortMature` from `lib/funnelTransform`.
- Produces: default-exported `<MotionFunnelDrill cfg bqConnected onConnect />` (same props contract as `FunnelDrill`).

- [ ] **Step 1: Write the controller**

Create `builder/src/components/scorecards/MotionFunnelDrill.jsx`, mirroring `FunnelDrill.jsx`'s structure (header + Beta pill, unauthed connect prompt, error banner). Differences:
- **Signup-month window** instead of day range. Provide month inputs (or reuse date inputs truncated to month). Default: end = current month, start = 24 months earlier — but **clamp start to never precede `2024-01-01`** (the 2024+ gate). Convert dates to month-floor `YYYY-MM-01` strings for `startMonth`/`endMonth` passed to the SQL builders.
- Fetch `fetchMotionFunnel({startMonth, endMonth})` on window change → `toMotionFunnel(rows)` → `<MotionFunnelChart>`.
- **Lens selector** from `LENSES`; when a lens is set, `fetchMotionLens(...)` and render a compare table grouped by `motion × lens_value` (columns: Motion, Lens value, Trials, Sync %, Convert %) — mirror the segment-compare `<table>` in `FunnelDrill.jsx`.
- **Two always-on caveat banners** (amber, like the maturity note in `FunnelChart`): the 2024-tracking caveat and the enrichment-sparsity caveat (verbatim text in Global Constraints).
- Maturity: the per-horizon `mature` flag already comes from the transform; no extra gate needed, but keep an overall "recent cohorts still maturing" note when `endMonth` is within ~12 months of today.
- `onStageClick(motion, stageKey)` — for V1, wire it to a no-op or a simple console aid; L3 account drill is OUT of V1 scope (note this; it can reuse `buildMotionLensSql`-style account queries later).

- [ ] **Step 2: Verify it builds**

Run: `cd builder && npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add builder/src/components/scorecards/MotionFunnelDrill.jsx
git commit -m "$(printf 'feat(motion-funnel): MotionFunnelDrill controller — window, lens table, caveats\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: Scorecard config + registry + renderer wiring

**Files:**
- Create: `builder/src/config/scorecards/motion-funnel-scorecard.js`
- Modify: `builder/src/config/scorecards/index.js`
- Modify: `builder/src/pages/Scorecard.jsx` (renderer branch + import)

**Interfaces:**
- Produces: a Labs scorecard at route `/scorecards/motion-funnel`, rendered by `MotionFunnelDrill` when `renderer === 'motionFunnelDrill'`.

- [ ] **Step 1: Create the config**

Create `builder/src/config/scorecards/motion-funnel-scorecard.js`:

```javascript
// builder/src/config/scorecards/motion-funnel-scorecard.js
export const motionFunnelScorecard = {
  id: 'motion-funnel',
  title: 'Motion & Lifecycle Funnel',
  subtitle: 'Two paths — did the prospect talk to us (demo/free hour) or self-serve — from trial through convert, customization, and retention at 1/3/6/12 months. Directional; talked-to-us tracked from 2024.',
  status: 'beta',
  labs: true,
  renderer: 'motionFunnelDrill',
};
export default motionFunnelScorecard;
```

- [ ] **Step 2: Register it in `index.js`**

Add the import (next to `funnelAcquisition`) and the `SCORECARDS` entry:

```javascript
import motionFunnel from './motion-funnel-scorecard.js';
```
and inside `SCORECARDS`:
```javascript
  'motion-funnel': motionFunnel,
```

- [ ] **Step 3: Wire the renderer in `Scorecard.jsx`**

First read `Scorecard.jsx` and find the existing branch that maps `renderer === 'funnelDrill'` to `<FunnelDrill .../>`. Add the import near it:
```jsx
import MotionFunnelDrill from '../components/scorecards/MotionFunnelDrill';
```
and an adjacent branch with the identical props the `funnelDrill` branch passes:
```jsx
  if (config.renderer === 'motionFunnelDrill') {
    return <MotionFunnelDrill cfg={config} bqConnected={bqConnected} onConnect={onConnect} />;
  }
```
(Use the exact prop names/values the sibling `funnelDrill` branch uses — copy its shape.)

- [ ] **Step 4: Build + full test suite**

Run: `cd builder && npm run build && npx vitest run`
Expected: build succeeds; all tests PASS. Confirm "Motion & Lifecycle Funnel" would appear in the Labs sidebar section (it has `labs: true`).

- [ ] **Step 5: Commit**

```bash
git add builder/src/config/scorecards/motion-funnel-scorecard.js builder/src/config/scorecards/index.js builder/src/pages/Scorecard.jsx
git commit -m "$(printf 'feat(motion-funnel): Labs scorecard config + registry + renderer wiring\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: Preview-verify against live BQ, build artifact, deploy (user-gated)

**Files:**
- Modify: `builder/dist/**` (build output)

- [ ] **Step 1: Preview-verify against live BigQuery**

Start the dev server in `builder/` (preview workflow), open `/scorecards/motion-funnel` with BQ connected. Confirm:
- Two path-funnels render (talked | self-serve) with sane counts (talked path smaller than self-serve; talked trials > 0 only for 2024+).
- Demo show-rate chip shows a sensible % on the talked path; "—" on self-serve.
- Retention tail shows m1/m3 filled and m6/m12 greyed "not mature" for recent windows.
- Lens selector → compare table groups by motion × lens value (try Industry: expect an "Unclassified" bucket; try DEP / Prepay / Customized).
- Both caveat banners visible.
- No console errors; check `preview_console_logs` + `preview_network` (the two BQ queries 200).
Capture a screenshot. If empty/erroring, diagnose (query shape vs `v_motion_funnel`/`int_motion_funnel` columns) and fix the lib, then re-verify.

- [ ] **Step 2: Production build + commit dist**

Run: `cd builder && npm run build`
```bash
git add builder/dist
git commit -m "$(printf 'build(motion-funnel): rebuild Labs bundle with Motion & Lifecycle Funnel\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

- [ ] **Step 3: Deploy (user-gated)**

GitHub Pages deploys from `main`. Do NOT merge/push to `main` without explicit user approval. When approved: merge the branch (or PR), push, confirm the page is live at `https://nickperaltab.github.io/method-metrics/#/scorecards/motion-funnel`. The dbt models are already in prod BQ (Phase 2a). NEVER run `vercel`.

---

## Self-Review

**Spec coverage (design §9 visualization + V1 scope):**
- Two-path funnel (talked vs self-serve) → `toMotionFunnel` + `MotionFunnelChart` (Tasks 1–2). ✓
- Demo show-rate (booked→attended, customer grain) → `showRate` in transform + chip in chart (Tasks 1–2). ✓
- Retention curve 1/3/6/12 with maturity null-out → `retention[]` + greyed bars (Tasks 1–2). ✓
- Lenses (industry/DEP/prepay/customization) → `buildMotionLensSql` + lens table (Tasks 1, 3). ✓
- Reads `v_motion_funnel` / `int_motion_funnel`, rates in JS → Task 1. ✓
- 2024+ hard gate + caveat banners → Task 3 + Global Constraints. ✓
- Labs/Beta scorecard, reuses funnelDrill patterns, shipped funnel untouched → Task 4 + Global Constraints. ✓
- Deploy GitHub-only, user-gated → Task 5. ✓

**Deferred (noted, not silent):** L3 account-drill on stage click (V1 stub); cohort-trend (per-month) view — only the windowed snapshot ships in V1; event-grain show rate (customer-grain only, per the locked decision).

**Placeholder scan:** Task 2 (chart) and Task 3 (controller) describe the component structure rather than pasting full JSX, because they are presentational and must match live style tokens + the exact sibling `funnelDrill` prop shape in `Scorecard.jsx` (which the implementer reads at build time); both are verified by `npm run build` + preview. All pure logic (the testable surface) has complete code in Task 1.

**Type consistency:** `toMotionFunnel(rows) → {talked, self_serve}` with `{stages, showRate, retention}` consistent across Tasks 1–3; `stages[i]` shape matches `normalizeFunnel`'s `{key,label,count,pctOfTrials,dropToNext}`; `RETENTION_HORIZONS=[1,3,6,12]` consistent Tasks 1–2; lens keys `{industry,dep,prepay,customization}` consistent across `LENS_EXPR`/`LENSES`/Task 3; `renderer:'motionFunnelDrill'` consistent Tasks 3–4.
```
