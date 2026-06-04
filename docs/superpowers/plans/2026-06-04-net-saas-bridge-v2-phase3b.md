# Net SaaS Bridge v2 — Phase 3b (UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the deployed Net SaaS scorecard into bridge v2: a polished grouped waterfall, a Net SaaS / NRR / GRR lens, and a Monthly / Annual grain toggle — reusing the existing drill (L2/L3) machinery.

**Architecture:** Extends the existing `builder/` components from Phase 2. The pure logic (SQL builders, transforms) gets parameterized by **grain** (monthly→`int_customer_mrr`/`int_mrr_movement_decomposed`; annual→`int_customer_annual_mrr`/`int_annual_mrr_movement_decomposed`, both now live in prod) and by **lens** (which bars show + label mode + headline rate). `NetSaasBridge` is reworked from the simple ECharts bars into the approved grouped-waterfall visual (horizontal dashed connectors, group brackets, dual $/% labels, hover tooltip). Headline GRR/NRR come from the validated `v_metric__*_grr/nrr` views — never recomputed.

**Tech Stack:** Plain JS, React, Vite, Vitest, ECharts/SVG. Live BigQuery via OAuth.

**Spec:** `docs/superpowers/specs/2026-06-04-net-saas-bridge-v2-design.md`
**Approved visual:** the frontend-design mockup (grouped waterfall, horizontal connectors at running-total heights, group brackets, dual labels, hover tooltip). Geometry approach: y-scale px-per-$ against a fixed baseline; each bar positioned by `bottom`+`height`; connectors are `height:0` dashed lines at the shared running-total level between consecutive bars.

**Phase 2 base (all deployed + working):** `net-saas-scorecard.js`, `netSaasSql.js`, `netSaasTransform.js`, `netSaasData.js`, `NetSaasBridge.jsx`, `L2Panel.jsx`, `NetSaasAccountTable.jsx`, `DrillBreadcrumb.jsx`, `GlobalFilterBar.jsx`, `DecompositionDrill.jsx`.

**Prereqs (met):** annual models live in prod (`int_customer_annual_mrr` orphaned view + `int_annual_mrr_movement_decomposed` dbt model); `int_customers` dedup live (deterministic dims). Monthly + annual decompositions both reconcile to validated metrics.

---

## Established facts (verified)

- `int_customer_annual_mrr` (prod view) has the **same columns** as `int_customer_mrr` (Month, EntityRecordID, Company, p1_saas, p2_saas, StartMRR, Cancellations, Downgrades, Expansions, NewMRR, + 7 dims). So monthly SQL builders work for annual by **swapping the FROM view** + the date semantics (annual `Month` = window-end).
- `int_annual_mrr_movement_decomposed` (prod) has the same columns as `int_mrr_movement_decomposed` (month, entity_record_id, p1_saas, p2_saas, movement_kind, app_mrr, seat_mrr, price_mrr).
- Validated rate views in `revenue_metrics`: `v_metric__monthly_grr`, `v_metric__monthly_nrr`, `v_metric__annual_grr`, `v_metric__annual_nrr`. Each is a monthly series with columns `period` (DATE) + `value` (NUMERIC, a ratio).
- `queryBq(sql)` returns `{rows, schema}` with **string** values (coerce numerics).

---

## File Structure

**Modified:**
- `builder/src/config/scorecards/net-saas-scorecard.js` — add `grains` (monthly/annual → source views) + `lenses` (netSaas/nrr/grr → bar visibility, label mode, rate metric).
- `builder/src/lib/netSaasSql.js` — parameterize every builder by `grain` (source view selection). Add `buildRateSql` (fetch validated GRR/NRR).
- `builder/src/lib/netSaasTransform.js` — add lens application (bar visibility + % of Start) to `normalizeBridge`.
- `builder/src/lib/netSaasData.js` — thread `grain`; add `fetchRate`.
- `builder/src/components/scorecards/NetSaasBridge.jsx` — rework to grouped waterfall (connectors, brackets, dual labels, tooltip, lens-aware).
- `builder/src/components/scorecards/DecompositionDrill.jsx` — add `grain` + `lens` state + controls; thread through fetches.
- Tests: `builder/tests/unit/netSaasSql.test.js`, `builder/tests/unit/netSaasBridge.test.js` — extend for grain + lens.

**No new files** unless a builder grows unwieldy. Keep the Phase 2 structure.

---

## Task 1: Config — grains + lenses (TDD-light: import check)

**Files:** Modify `builder/src/config/scorecards/net-saas-scorecard.js`

- [ ] **Step 1:** Read the current config. Add two blocks (keep all existing fields, incl. `renderer:'netSaasDrill'`):

```js
  // grain → source views (monthly = today's; annual = the live annual models)
  grains: {
    monthly: {
      label: 'Monthly',
      bridgeView: 'int_customer_mrr',
      decompView: 'int_mrr_movement_decomposed',
      grrMetric: 'v_metric__monthly_grr',
      nrrMetric: 'v_metric__monthly_nrr',
    },
    annual: {
      label: 'Annual',
      bridgeView: 'int_customer_annual_mrr',
      decompView: 'int_annual_mrr_movement_decomposed',
      grrMetric: 'v_metric__annual_grr',
      nrrMetric: 'v_metric__annual_nrr',
    },
  },

  // lens → which delta bars show + label mode + headline rate (null = no rate)
  lenses: {
    netSaas: { label: 'Net SaaS', bars: ['new','expansion','downgrade','churn'], labelMode: 'dollar', rate: null },
    nrr:     { label: 'NRR',      bars: ['expansion','downgrade','churn'],       labelMode: 'dual',   rate: 'nrr' },
    grr:     { label: 'GRR',      bars: ['downgrade','churn'],                    labelMode: 'dual',   rate: 'grr' },
  },
```
(NRR excludes New — NRR is existing-customer retention+expansion; GRR excludes New AND Expansion. The bridge always renders Start + End; `bars` lists which DELTA bars are visible. Hidden bars render greyed per the mockup.)

- [ ] **Step 2:** Import check: `cd builder && node -e "import('./src/config/scorecards/net-saas-scorecard.js').then(m=>console.log(Object.keys(m.netSaasScorecard.grains), Object.keys(m.netSaasScorecard.lenses)))"` → expect `[ 'monthly', 'annual' ] [ 'netSaas', 'nrr', 'grr' ]`.
- [ ] **Step 3:** Commit `feat(net-saas-v2): config — grains + lenses`.

---

## Task 2: SQL builders parameterized by grain (TDD)

**Files:** Modify `builder/src/lib/netSaasSql.js` + `builder/tests/unit/netSaasSql.test.js`

The Phase 2 builders hardcode `int_customer_mrr` / `int_mrr_movement_decomposed`. Parameterize the source view.

- [ ] **Step 1:** Add failing tests: `buildBridgeSql({ month, filters, bridgeView: 'int_customer_annual_mrr' })` contains `int_customer_annual_mrr`; default (no bridgeView) still uses `int_customer_mrr` (back-compat). Same for `buildComponentSplitSql({ ..., decompView })` and `buildAccountTableSql`. Run → fail.
- [ ] **Step 2:** Implement: each builder takes an optional `bridgeView` / `decompView` param defaulting to the monthly view names; interpolate into the FQN (`project-for-method-dw.revenue.<view>`). Keep the existing exported signatures back-compatible (new params optional).
- [ ] **Step 3:** Run → all green (existing + new). Commit `feat(net-saas-v2): grain-parameterized SQL builders (TDD)`.

---

## Task 3: Validated rate SQL + data wrapper (TDD)

**Files:** Modify `builder/src/lib/netSaasSql.js`, `netSaasData.js`, test file

- [ ] **Step 1:** Failing test for `buildRateSql({ metric: 'v_metric__monthly_grr', period: '2026-05-01' })` → selects `value` from `project-for-method-dw.revenue_metrics.v_metric__monthly_grr WHERE period = '2026-05-01'`.
- [ ] **Step 2:** Implement `buildRateSql` (note: metrics live in `revenue_metrics`, not `revenue`). Add `fetchRate({ metric, period })` to `netSaasData.js` returning `Number(rows[0]?.value)` or null.
- [ ] **Step 3:** Run → green. Commit `feat(net-saas-v2): validated GRR/NRR rate fetch (TDD)`.

---

## Task 4: Lens application in transforms (TDD)

**Files:** Modify `builder/src/lib/netSaasTransform.js` + `builder/tests/unit/netSaasBridge.test.js`

- [ ] **Step 1:** Failing tests for `applyLens(bars, lens, startValue)`:
  - `netSaas` lens → all delta bars `visible:true`, `pct:null`.
  - `grr` lens → New + Expansion `visible:false`; Downgrade/Churn visible with `pct = value/startValue`.
  - `nrr` lens → New `visible:false`; Expansion/Downgrade/Churn visible with `pct`.
  - Start/End always visible; Start `pct:null` (no % on Start).
  Returns bars with `{...bar, visible, pct}`.
- [ ] **Step 2:** Implement `applyLens(bars, lensConfig, startValue)` reading `lensConfig.bars` for visibility and computing `pct = value/startValue` when `labelMode==='dual'` (Start excluded). Keep `normalizeBridge` unchanged; `applyLens` is a separate pure fn composed after it.
- [ ] **Step 3:** Run → green. Commit `feat(net-saas-v2): lens application (bar visibility + % of Start) (TDD)`.

---

## Task 5: Rework NetSaasBridge to the grouped waterfall

**Files:** Modify `builder/src/components/scorecards/NetSaasBridge.jsx`

- [ ] **Step 1:** Read the current `NetSaasBridge.jsx` + the approved mockup geometry (grouped waterfall: y-scale px-per-$ vs fixed baseline; bars by `bottom`+`height`; horizontal `height:0` dashed connectors at the shared running-total level; group brackets "ADDED"/"RETENTION LOSS" with subtotals; dual $/% labels; hover tooltip with $ + account count). The mockup used an SVG/div approach (cleaner for brackets + connectors than ECharts waterfall) — port that approach.
- [ ] **Step 2:** New props: `{ bars, prior, lens, showDelta, onBarClick }` where `bars` carry `{key,label,type,value,visible,pct}` from `applyLens`. Render:
  - Running-total geometry; each visible delta bar floats between prior and new total; hidden bars (per lens) render greyed with "hidden" label (GRR's Expansion).
  - Horizontal dashed connectors at running-total heights between consecutive **visible** bars.
  - Group brackets over (New+Expansion) = "ADDED" and (Downgrades+Churn) = "RETENTION LOSS" with $ subtotals (skip a bracket if all its bars are hidden — e.g. GRR hides Expansion so the ADDED bracket spans only what's visible; keep it simple — bracket spans the group's columns regardless, subtitle reflects visible sum).
  - Labels: `labelMode==='dollar'` → $ + ▲/▼ chip (existing computeDelta); `labelMode==='dual'` → $ + % of Start (no % on Start/End... End may show the rate). 
  - Hover tooltip per bar: `$X,XXX,XXX · NN% of Start · N accounts` (account count optional; show $ + % if count not readily available).
  - Keep it wrapped-by-parent in ChartErrorBoundary (parent already wraps it).
- [ ] **Step 3:** `cd builder && npm run build` + `npx eslint` on the file → clean. (ECharts rendering not unit-testable; geometry verified live in Task 8.) Commit `feat(net-saas-v2): grouped waterfall NetSaasBridge (connectors, brackets, dual labels)`.

---

## Task 6: Controller — grain + lens state + headline rate

**Files:** Modify `builder/src/components/scorecards/DecompositionDrill.jsx`

- [ ] **Step 1:** Add state: `const [grain, setGrain] = useState('monthly')` and `const [lens, setLens] = useState('netSaas')`. Derive `grainCfg = cfg.grains[grain]`, `lensCfg = cfg.lenses[lens]`.
- [ ] **Step 2:** Thread `grainCfg.bridgeView`/`decompView` into all fetches (`fetchBridge`, `fetchComponentSplit`, `fetchDimSplit`, `fetchAccountTable`, `fetchFilterOptions`). Reset drill on grain/lens change (like filter change). Apply `applyLens(normalizeBridge(...), lensCfg, startValue)` before passing to the bridge.
- [ ] **Step 3:** When `lensCfg.rate`, `fetchRate({ metric: grainCfg[lensCfg.rate+'Metric'], period: month })` → show the headline rate (e.g. "GRR REDACTED-PCT") above/beside the bridge. (`grrMetric`/`nrrMetric` from grainCfg.)
- [ ] **Step 4:** Add controls to the header: a **grain** segmented toggle (Monthly/Annual) and a **lens** selector (Net SaaS/NRR/GRR), styled like the mockup. Prominent grain label.
- [ ] **Step 5:** Annual drill routing: component drill (Expansion/Downgrades → seats/apps/price) uses `grainCfg.decompView` — works in both grains now (annual model is live). New/Churn dim drills use `grainCfg.bridgeView`.
- [ ] **Step 6:** `npm run build` + eslint clean; full vitest suite still green (324 + new tests). Commit `feat(net-saas-v2): grain + lens controls in DecompositionDrill`.

---

## Task 7: Wire it together + unit-suite green

**Files:** none new — integration verification

- [ ] **Step 1:** `cd builder && npx vitest run` → all green (Phase 2's 324 + the new grain/lens/rate/applyLens tests).
- [ ] **Step 2:** `npm run build` → succeeds. `npm run lint` → exit 0 (the Action's gate).
- [ ] **Step 3:** Commit any final wiring. 

---

## Task 8: Live verification + deploy

**Files:** none (verification + deploy)

- [ ] **Step 1:** `npm run dev`, sign in, open Net SaaS Movement (Admin › Revenue until promoted). Verify:
  - Polished grouped waterfall with horizontal connectors + brackets renders (Monthly, Net SaaS lens).
  - Lens = NRR → New hidden, bars show $ + %, headline NRR % matches `v_metric__monthly_nrr`.
  - Lens = GRR → New + Expansion hidden, headline GRR % matches `v_metric__monthly_grr`.
  - Grain = Annual → bridge + rates from annual views; headline annual GRR differs (much lower) — label is clearly "Annual".
  - Drill still works both grains: Expansion/Downgrades → seats/apps/price (annual uses the annual decomposition); New/Churn → dims.
  - Hover shows dollar detail.
- [ ] **Step 2:** Cross-check one headline rate against a direct `bq query` of the validated metric view for that period.
- [ ] **Step 3:** Deploy: push to main (the static.yml Action builds + deploys; `npm run lint` must pass). Confirm the run goes green and the live bundle hash changes.

---

## Self-Review

**Spec coverage** (against `2026-06-04-net-saas-bridge-v2-design.md`):

| Spec item | Task |
|---|---|
| Polished grouped waterfall (connectors, brackets, dual labels, hover) | 5 |
| GRR/NRR lens (hide bars + % contribution) | 1 (config), 4 (transform), 5 (render), 6 (control) |
| Headline GRR/NRR from validated metrics (not recomputed) | 3, 6 |
| Monthly/Annual grain toggle | 1, 2, 6 |
| Annual component drill uses annual decomposition | 6 (Step 5) |
| Drills otherwise unchanged | reuse Phase 2 (L2Panel, account table) |
| No standalone tiles, no scope creep | not in plan |

**Placeholder scan:** Task 5 (bridge rework) specifies behavior + geometry but not full JSX — acceptable because it ports the approved mockup's documented geometry and depends on reading the current component; the testable logic (lens, grain, rate, applyLens) is fully TDD'd in Tasks 1–4. Live verification (Task 8) is the geometry gate.

**Type consistency:** `applyLens` output `{key,label,type,value,visible,pct}` consumed by `NetSaasBridge` (Task 5). `grainCfg.bridgeView/decompView/grrMetric/nrrMetric` keys (Task 1) match the controller's reads (Task 6). `fetchRate` returns a Number consumed as the headline (Task 6). Builders' new `bridgeView`/`decompView` params (Task 2) match the controller's fetch calls (Task 6).
