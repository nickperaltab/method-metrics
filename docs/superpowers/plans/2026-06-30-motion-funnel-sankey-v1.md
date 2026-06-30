# Motion Funnel — Sankey V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the shipped single-column motion funnel with an interactive **Sankey** of the engagement journey — Trial → Sync → Demo → Free hour → Converted → Paid project hours — with a **goal toggle**, **split-by** filter, **click-to-pin path focus**, and a **retention curve** for the goal cohort.

**Architecture:** The per-customer `int_motion_funnel` model (already shipped) gains one column — customer **size tier**. The frontend queries that table grouped by the five journey flags (+ optional split filter) to get a joint distribution, turns it into Sankey nodes/links, and renders an ECharts Sankey. A reworked `MotionFunnelDrill` controller owns the goal toggle, split selector, focus state, and a retention panel. The scorecard registry/renderer wiring is unchanged (`renderer: 'motionFunnelDrill'`).

**Tech Stack:** dbt (BigQuery), React + Vite, ECharts (`echarts/core`, tree-shaken — `SankeyChart` must be registered), Vitest, `queryBq` OAuth.

## Global Constraints

- **Spine order:** Trial → Sync → Demo → Free hour → Converted → Paid project hours. Trial is the universal source (all sign-ups in window).
- **Base population:** all sign-ups with `signup_month >= 2024-01-01` (the tracking gate). No "engaged-only" filter — the full funnel including non-engagers is the honest top.
- **Every flow shown** (all yes/no branches, including skips like "skipped demo → paid" and "not converted → paid"). Cleanliness comes from **focus, never from hiding flows.**
- **Goal toggle:** `Convert` truncates the Sankey after the Converted stage; `Paid project hours` shows the full chain.
- **Click-to-pin focus:** clicking a node pins ECharts `focus:'trajectory'` (lights its up/down-stream path, dims the rest); clicking empty space / a reset control clears. On load, **default focus = the path to the selected goal** so it opens clean.
- **Split-by** (`None / Customer size / DEP / Industry / Prepay`): filters the whole Sankey to a chosen group *value* (re-query). V1 is one group at a time (compare by switching the value); side-by-side is a documented fast-follow.
- **Retention** panel below the Sankey: 1 / 3 / 6 / 12-month retention of the **goal cohort** (converters, or paid-PS customers), `retained_Kmo / eligible_Kmo`, null/greyed when `eligible == 0`. Honors the split filter.
- **Hover tooltip** shows count **and** `% of trials`.
- **Caveat banner** (always): engagement tracked from 2024; ~477 bought project hours without a SaaS conversion (the "Not converted → Paid" cross-flow); association, not proof.
- `dbt_utils` is NOT installed — custom/`not_null`/`unique` tests only.
- Public repo: no dollar figures / account names in committed code (the Sankey is counts only).
- Deploy: GitHub Pages only (push to `main`; CI builds). NEVER `vercel`.
- Style tokens: `'DM Sans'` / `'JetBrains Mono'`, existing palette; stage colors Trial slate `#64748b`, Sync `#3b82f6`, Demo `#0ea5e9`, Free hour `#0891b2`, Converted `#059669`, Paid `#7c3aed`, negative nodes muted `#dde2e8`.

---

### Task 1: Add `user_tier` to `int_motion_funnel`

**Files:**
- Modify: `models/intermediate/int_motion_funnel.sql`
- Modify: `models/intermediate/_int_motion_funnel.yml`

**Interfaces:**
- Produces: new column `user_tier STRING` on `revenue.int_motion_funnel`, values `'Solo' | 'Small (2-4)' | 'SMB (5-10)' | 'Mid (11+)' | 'Unknown'`, derived from each entity's `MAX(TotalUsers)` in `int_customers`.

- [ ] **Step 1: Add a unit-test case** for the bucketing to `_int_motion_funnel.yml` (extend the existing `motion_assignment_and_retention` unit test or add a small new one): given an `int_customers` input with `TotalUsers` 1 / 3 / 8 / 20 / (absent), expect `user_tier` `'Solo' / 'Small (2-4)' / 'SMB (5-10)' / 'Mid (11+)' / 'Unknown'`. Use the existing fixture shape; add an `int_customers` input rows block if not present.

- [ ] **Step 2: Run it to confirm it fails**

Run: `DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1 /Users/nicolas/.local/bin/dbt test --select int_motion_funnel`
Expected: FAIL (column `user_tier` not yet produced).

- [ ] **Step 3: Add the size join + column to the model**

In `int_motion_funnel.sql`, add a CTE and column:

```sql
sizes AS (
  SELECT EntityRecordID, MAX(TotalUsers) AS users
  FROM {{ ref('int_customers') }}
  GROUP BY 1
),
```
Join `LEFT JOIN sizes sz ON sz.EntityRecordID = t.EntityRecordID` in the final SELECT, and add:
```sql
  CASE
    WHEN sz.users IS NULL THEN 'Unknown'
    WHEN sz.users <= 1     THEN 'Solo'
    WHEN sz.users <= 4     THEN 'Small (2-4)'
    WHEN sz.users <= 10    THEN 'SMB (5-10)'
    ELSE 'Mid (11+)'
  END AS user_tier
```

- [ ] **Step 4: Confirm the unit test passes + build**

Run: `DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1 /Users/nicolas/.local/bin/dbt build --select int_motion_funnel`
Expected: model rebuilds; unit test + existing schema tests PASS. Add a `user_tier` `not_null` test + `accepted_values` (the 5 values) to the yml.

- [ ] **Step 5: Commit**

```bash
git add models/intermediate/int_motion_funnel.sql models/intermediate/_int_motion_funnel.yml
git commit -m "$(printf 'feat(motion-funnel): add user_tier (size) to int_motion_funnel for split-by\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: Register `SankeyChart` in the ECharts wrapper

**Files:**
- Modify: `builder/src/components/EChart.jsx` (lines 4 + 8)

- [ ] **Step 1: Add SankeyChart to imports + `echarts.use`**

Line 4 — add `SankeyChart`:
```jsx
import { LineChart, BarChart, PieChart, FunnelChart, ScatterChart, SankeyChart } from 'echarts/charts';
```
Line 8 — add it to the `echarts.use([...])` array (alongside the others).

- [ ] **Step 2: Verify build**

Run: `cd builder && npm run build`
Expected: succeeds (no import error).

- [ ] **Step 3: Commit**

```bash
git add builder/src/components/EChart.jsx
git commit -m "$(printf 'feat(motion-funnel): register echarts SankeyChart\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: Rework the lib — Sankey SQL + flow transform (unit-tested)

**Files:**
- Replace contents: `builder/src/lib/motionFunnelSql.js`, `builder/src/lib/motionFunnelTransform.js`, `builder/src/lib/motionFunnelData.js`
- Replace: `builder/tests/unit/motionFunnelTransform.test.js`

**Interfaces:**
- `STAGES` — ordered `[{key:'synced',...},{key:'demo_attended',...},{key:'free_attended',...},{key:'converted',...},{key:'is_customized',...}]` with display label + color; plus a `Trial` source.
- `SPLITS = [{key:null,label:'None'},{key:'user_tier',...},{key:'has_dep',...},{key:'industry_l1',...},{key:'is_prepay',...}]`.
- `buildJointSql({ startMonth, endMonth, splitKey, splitValue }): string` — `SELECT <5 flags>, COUNT(*) n FROM int_motion_funnel WHERE signup_month BETWEEN … [AND <splitKey> = <splitValue>] GROUP BY 1..5`.
- `buildSplitValuesSql({ startMonth, endMonth, splitKey }): string` — distinct values + counts of `splitKey` (to populate the group selector).
- `buildGoalRetentionSql({ startMonth, endMonth, goal, splitKey, splitValue }): string` — `retained_Kmo`/`eligible_Kmo` sums for the goal cohort (`goal==='paid'` → `WHERE is_customized`; `goal==='convert'` → `WHERE converted`).
- `toSankey(jointRows, goal): { total, nodes, links }` — builds ECharts Sankey `nodes`/`links` from the joint, truncating after Converted when `goal==='convert'`. `total` = sum of n.
- `goalNodeName(goal): string` — `'Paid project hours'` or `'Converted'` (for default focus).
- data.js: `fetchJoint`, `fetchSplitValues`, `fetchGoalRetention` wrappers over `queryBq`.

- [ ] **Step 1: Write the failing transform test**

`builder/tests/unit/motionFunnelTransform.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { toSankey } from '../../src/lib/motionFunnelTransform.js';

// rows: {synced,demo_attended,free_attended,converted,is_customized,n}
const rows = [
  { synced:1, demo_attended:1, free_attended:1, converted:1, is_customized:1, n:100 },
  { synced:1, demo_attended:1, free_attended:0, converted:1, is_customized:0, n:50 },
  { synced:0, demo_attended:0, free_attended:0, converted:0, is_customized:0, n:300 },
];

describe('toSankey', () => {
  it('builds Trial source + yes/no nodes per stage, conserving flow', () => {
    const { total, nodes, links } = toSankey(rows, 'paid');
    expect(total).toBe(450);
    // Trial -> Sync(yes) = 150 (two synced rows), Trial -> No sync = 300
    const tSyncYes = links.find(l => l.source === 'Trial' && l.target === 'Sync');
    const tSyncNo  = links.find(l => l.source === 'Trial' && l.target === 'No sync');
    expect(tSyncYes.value).toBe(150);
    expect(tSyncNo.value).toBe(300);
    // Paid stage present under 'paid' goal
    expect(nodes.some(n => n.name === 'Paid project hours')).toBe(true);
  });

  it("convert goal truncates after Converted (no Paid node)", () => {
    const { nodes } = toSankey(rows, 'convert');
    expect(nodes.some(n => n.name === 'Paid project hours')).toBe(false);
    expect(nodes.some(n => n.name === 'Converted')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it; confirm fail** — `cd builder && npx vitest run tests/unit/motionFunnelTransform.test.js` → FAIL (no module / export).

- [ ] **Step 3: Write `motionFunnelTransform.js`**

```javascript
// builder/src/lib/motionFunnelTransform.js
// Pure: joint distribution over the 5 journey flags -> ECharts Sankey nodes/links.
export const STAGES = [
  { key:'synced',        yes:'Sync',                no:'No sync',          color:'#3b82f6' },
  { key:'demo_attended', yes:'Demo',                no:'No demo',          color:'#0ea5e9' },
  { key:'free_attended', yes:'Free hour',           no:'No free hour',     color:'#0891b2' },
  { key:'converted',     yes:'Converted',           no:'Not converted',    color:'#059669' },
  { key:'is_customized', yes:'Paid project hours',  no:'No project hours', color:'#7c3aed' },
];
const TRIAL = 'Trial';
const NEG = '#dde2e8';
const num = (v) => Number(v) || 0;

export function goalNodeName(goal) { return goal === 'convert' ? 'Converted' : 'Paid project hours'; }

export function toSankey(rows = [], goal = 'paid') {
  const active = goal === 'convert' ? STAGES.slice(0, 4) : STAGES; // stop after Converted
  const total = rows.reduce((a, r) => a + num(r.n), 0);
  const nodes = [{ name: TRIAL, itemStyle: { color: '#64748b', borderColor: '#64748b' } }];
  active.forEach((s) => {
    nodes.push({ name: s.yes, itemStyle: { color: s.color, borderColor: s.color } });
    nodes.push({ name: s.no,  itemStyle: { color: NEG, borderColor: NEG } });
  });
  const sum = (pred) => rows.reduce((a, r) => a + (pred(r) ? num(r.n) : 0), 0);
  const links = [];
  const first = active[0];
  links.push({ source: TRIAL, target: first.yes, value: sum((r) => num(r[first.key]) === 1) });
  links.push({ source: TRIAL, target: first.no,  value: sum((r) => num(r[first.key]) === 0) });
  for (let i = 0; i < active.length - 1; i++) {
    const a = active[i], b = active[i + 1];
    [[1, a.yes], [0, a.no]].forEach(([av, an]) => {
      [[1, b.yes], [0, b.no]].forEach(([bv, bn]) => {
        const v = sum((r) => num(r[a.key]) === av && num(r[b.key]) === bv);
        if (v > 0) links.push({ source: an, target: bn, value: v });
      });
    });
  }
  return { total, nodes, links };
}
```

- [ ] **Step 4: Confirm test passes** — `cd builder && npx vitest run tests/unit/motionFunnelTransform.test.js` → PASS.

- [ ] **Step 5: Write `motionFunnelSql.js`** (builders below) and `motionFunnelData.js` (thin `queryBq` wrappers returning `{rows}`):

```javascript
// builder/src/lib/motionFunnelSql.js
const fqn = (v) => `\`project-for-method-dw.revenue.${v}\``;
const s = (v) => `'${String(v).replace(/'/g, "''")}'`;
export const SPLITS = [
  { key:null, label:'None' },
  { key:'user_tier', label:'Customer size' },
  { key:'has_dep', label:'DEP' },
  { key:'industry_l1', label:'Industry' },
  { key:'is_prepay', label:'Prepay vs Monthly' },
];
const FLAGS = 'synced, demo_attended, free_attended, converted, is_customized';
const win = (a, b) => `signup_month BETWEEN ${s(a)} AND ${s(b)}`;
const splitFilter = (k, v) => (k && v != null) ? ` AND ${k} = ${typeof v === 'boolean' ? v : s(v)}` : '';

export function buildJointSql({ startMonth, endMonth, splitKey, splitValue }) {
  return `SELECT ${FLAGS}, COUNT(*) AS n FROM ${fqn('int_motion_funnel')}
WHERE ${win(startMonth, endMonth)}${splitFilter(splitKey, splitValue)}
GROUP BY 1,2,3,4,5`;
}
export function buildSplitValuesSql({ startMonth, endMonth, splitKey }) {
  return `SELECT ${splitKey} AS value, COUNT(*) AS n FROM ${fqn('int_motion_funnel')}
WHERE ${win(startMonth, endMonth)} GROUP BY 1 ORDER BY n DESC`;
}
export function buildGoalRetentionSql({ startMonth, endMonth, goal, splitKey, splitValue }) {
  const gate = goal === 'convert' ? 'converted' : 'is_customized';
  const f = (k) => `COUNTIF(eligible_${k}mo) AS e${k}, COUNTIF(retained_${k}mo) AS r${k}`;
  return `SELECT ${[1,3,6,12].map(f).join(', ')} FROM ${fqn('int_motion_funnel')}
WHERE ${win(startMonth, endMonth)} AND ${gate}${splitFilter(splitKey, splitValue)}`;
}
```

- [ ] **Step 6: Full suite + commit**

Run: `cd builder && npx vitest run` → all green.
```bash
git add builder/src/lib/motionFunnelSql.js builder/src/lib/motionFunnelTransform.js builder/src/lib/motionFunnelData.js builder/tests/unit/motionFunnelTransform.test.js
git commit -m "$(printf 'feat(motion-funnel): Sankey SQL + joint->flow transform (unit-tested)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: `MotionSankeyChart` component (Sankey + focus)

**Files:**
- Create: `builder/src/components/scorecards/MotionSankeyChart.jsx`
- Delete: `builder/src/components/scorecards/MotionFunnelChart.jsx` (replaced)

**Interfaces:**
- Consumes: `EChart` (default) from `../EChart`; `toSankey`, `goalNodeName` from `lib/motionFunnelTransform`.
- Produces: `<MotionSankeyChart jointRows goal total />`. Builds the ECharts `option` via `toSankey`, renders `<EChart option={...} onEvents={...} />`. Tooltip shows `value` + `% of total` (total = trials in window). `series.emphasis.focus = 'trajectory'`. On mount and when `goal` changes, dispatch a persistent highlight on `goalNodeName(goal)` (default focus = path to goal); clicking a node re-pins highlight to that node, clicking blank resets. Use `onEvents={{ click: ... }}` and the chart instance's `dispatchAction` (get instance via the EChart ref or `echarts.getInstanceByDom`).

- [ ] **Step 1: Build the component** (presentational + focus interaction). Match the prototype's option (left:12,right:158,nodeWidth:14,nodeGap:11, gradient links opacity .36, label `name · count`). Read the design at `docs/superpowers/specs/` — see the Sankey prototype behavior described in the V1 plan Global Constraints.

- [ ] **Step 2: Verify build** — `cd builder && npm run build` → succeeds.

- [ ] **Step 3: Commit**
```bash
git add builder/src/components/scorecards/MotionSankeyChart.jsx
git rm builder/src/components/scorecards/MotionFunnelChart.jsx
git commit -m "$(printf 'feat(motion-funnel): MotionSankeyChart — ECharts sankey + trajectory focus\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: Rework `MotionFunnelDrill` controller (goal toggle, split, retention)

**Files:**
- Rewrite: `builder/src/components/scorecards/MotionFunnelDrill.jsx`

**Interfaces:**
- Props unchanged: `({ cfg, bqConnected, onConnect })`.
- Consumes: `fetchJoint`, `fetchSplitValues`, `fetchGoalRetention` (data.js); `SPLITS` (sql.js); `MotionSankeyChart`; `ChartErrorBoundary`.

- [ ] **Step 1: Rewrite the controller.** State: `goal` (`'paid'` default), `splitKey` (null), `splitValue` (null), signup-month window (default start 2024-01 clamped, end current month). On window/split change → `fetchJoint` → `<MotionSankeyChart jointRows goal total />`. **Goal toggle** (Convert / Paid project hours) pill buttons. **Split-by** select (`SPLITS`); when set, `fetchSplitValues` populates a second select of group values (+ "All"), and the chosen value re-queries the joint. **Retention panel** below: `fetchGoalRetention` → curve of 1/3/6/12mo (`r/e`, null when `e==0`), labeled "Retention of [goal cohort]". Always-on caveat banner (Global Constraints text). Unauthed → connect prompt (mirror existing). Beta pill.

- [ ] **Step 2: Build + full test suite** — `cd builder && npm run build && npx vitest run` → green.

- [ ] **Step 3: Commit**
```bash
git add builder/src/components/scorecards/MotionFunnelDrill.jsx
git commit -m "$(printf 'feat(motion-funnel): rework drill — goal toggle, split-by, retention panel\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: Config copy + preview-verify + deploy (user-gated)

**Files:**
- Modify: `builder/src/config/scorecards/motion-funnel-scorecard.js` (subtitle/description to match the Sankey framing)
- Modify: `builder/dist/**` (build output)

- [ ] **Step 1: Update the scorecard subtitle** to describe the Sankey/goal framing. Confirm `renderer: 'motionFunnelDrill'`, `labs: true`, `status: 'beta'` unchanged; registry/`Scorecard.jsx` branch already point here (no rewire needed).

- [ ] **Step 2: Preview-verify against live BigQuery.** Start dev server in `builder/`, open `/scorecards/motion-funnel` with BQ connected. Confirm: the Sankey renders Trial→…→Paid; goal toggle truncates at Converted; hovering a node dims the rest; clicking pins focus; split-by (Customer size) re-renders for a chosen tier; retention curve shows below; tooltip shows count + % of trials; no console errors (`preview_console_logs`, `preview_network` — queries 200). Screenshot. Fix and re-verify if needed.

- [ ] **Step 3: Production build + commit dist**
```bash
cd builder && npm run build
git add builder/dist
git commit -m "$(printf 'build(motion-funnel): rebuild bundle with Sankey motion funnel\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

- [ ] **Step 4: Deploy (user-gated).** Merge to `main` + push only on explicit approval; CI (`static.yml`) builds + deploys to GitHub Pages. Verify live at `https://nickperaltab.github.io/method-metrics/builder/#/scorecards/motion-funnel`. NEVER `vercel`.

---

## Self-Review

**Spec coverage:**
- Trial-start spine, all flows incl. skips → Task 3 `toSankey` + Global Constraints. ✓
- Goal toggle (Convert truncates / Paid full) → Tasks 3 (`toSankey` truncation) + 5 (toggle). ✓
- Click-to-pin focus + default-focus-on-goal → Task 4. ✓
- Split-by (size/DEP/industry/prepay), size via new dbt col → Tasks 1 + 3 + 5. ✓
- Retention curve for goal cohort → Tasks 3 (`buildGoalRetentionSql`) + 5. ✓
- Tooltip count + % → Task 4. ✓
- Caveat (2024 + 477 PS-without-convert + association) → Task 5. ✓
- SankeyChart registered → Task 2. ✓
- Deploy GitHub-only, gated → Task 6. ✓

**Replaced/removed:** old `MotionFunnelChart.jsx` (single funnel) deleted (Task 4); `motionFunnelSql/Transform/Data.js` rewritten for the Sankey (Task 3); drill reworked (Task 5).

**Deferred (noted):** side-by-side split comparison (V1 is filter-to-one-group); transcript-theme / health-score drill (data not wired); L3 account drill.

**Placeholder scan:** Tasks 4–5 describe the component/controller rather than full JSX (presentational, style-token + live-data dependent; verified by build + Task 6 preview). All pure logic (`toSankey`, SQL builders) has complete code + tests in Task 3.

**Type consistency:** `toSankey(rows, goal) → {total, nodes, links}` consistent Tasks 3–4; flag keys (`synced/demo_attended/free_attended/converted/is_customized`) match `int_motion_funnel` columns + `buildJointSql` SELECT; `user_tier` produced in Task 1, consumed as a `splitKey` in Task 3.
