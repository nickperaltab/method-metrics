# Net SaaS Bridge v2 — Design / Spec (Phase 3b, UI)

**Date:** 2026-06-04
**Status:** Design approved (brainstorming + visual mockup). Builds on the deployed Net SaaS drilldown.
**Repo-safe:** architecture + component design only. No dollar figures, no account data.

**Depends on:** `2026-06-04-annual-mrr-decomposition-design.md` (Phase 3a) for the annual seats/apps/price drill. Build data-first; UI consumes both monthly + annual decompositions.

---

## 1. Why

The deployed bridge (Phase 2) shows monthly Net SaaS movement with drill-downs. Reviewing it live, two gaps surfaced:
1. The bridge reads as four flat bars; it should look like a proper **grouped waterfall** with running-total connectors (leadership-grade).
2. There's no way to view it as **GRR / NRR**, or to see it **annually** — the two lenses leadership actually reports on.

## 2. What changes (evolution of the existing scorecard, not a rebuild)

### 2a. Polished grouped waterfall (`NetSaasBridge` rework)
- Horizontal **dashed connectors** at each running-total height (right edge of bar N → left edge of bar N+1). This was the key visual fix — connectors are horizontal step lines, not diagonal.
- Two **group brackets** with subtotals: "ADDED" (New + Expansion) and "RETENTION LOSS" (Downgrades + Churn).
- **Keep four movement bars** (New, Expansion, Downgrades, Churn). We explicitly rejected collapsing Downgrades+Churn into a single "Retention" bar — the split is the actionable finding, and each drills differently.
- **Dual labels:** each movement bar shows **both $ and % of Start**. Start shows **$ only** (it's the 100% base — no %).
- **Hover → dollar tooltip** with the full dollar figure + account count.
- Approved mockup: `.superpowers/brainstorm/.../bridge-polished.html` (frontend-design output) is the visual reference.

### 2b. GRR / NRR lens (a selector: Net SaaS · NRR · GRR)
Reframes the **same** bridge — hides/shows bars and shows % contribution:
- **Net SaaS** (default): all four movements, dollar-primary labels, the period-over-period ▲/▼ chips already built.
- **NRR**: all bars, labeled $ + % of Start. Headline NRR %.
- **GRR**: Expansion **greyed/hidden** (GRR ignores expansion), losses as $ + % of Start. Headline GRR %.
- The per-bar % **is** the "what's contributing most to GRR/NRR" answer. Drilling a bar (seats/apps/price or segment) goes deeper — unchanged from today.

**Headline GRR/NRR source:** the **validated** metrics `v_metric__monthly_grr/nrr` and `v_metric__annual_grr/nrr` — NOT recomputed in the frontend. The per-bar % contributions are derived from the bridge components (component ÷ Start). If a validated rate differs slightly from the naive bridge ratio (methodology nuance), the **validated metric is the headline**; note the reconciliation. Do not invent a third number.

### 2c. Monthly / Annual grain toggle
- **Monthly:** `int_customer_mrr` (bridge + dims) + `int_mrr_movement_decomposed` (seats/apps/price). Today's behavior.
- **Annual:** `int_customer_annual_mrr` (bridge + GRR/NRR + New/Churn dims) + `int_annual_mrr_movement_decomposed` (Phase 3a) for the seats/apps/price drill.
- Grain label is **prominent** — monthly vs annual GRR diverge hard (monthly high-90s%, annual mid-70s%); leadership must always know which they're viewing.

### 2d. Drills (L2/L3) — unchanged contract
Same dispatch as deployed: Expansion/Downgrades → seats/apps/price; New/Churn → channel/segment/vertical/cohort-age; L3 account tables. The only change: in Annual grain the component drill reads the annual decomposition (3a) instead of the monthly one.

## 3. Architecture

Extends the existing `builder/` components — no new app, no new routing pattern.
- **`NetSaasBridge.jsx`** — reworked to the grouped-waterfall visual (connectors, brackets, dual labels, tooltip). Still ECharts (or a custom SVG layer if ECharts waterfall can't do the brackets cleanly — decide in the plan; the mockup is SVG-based and may be the cleaner port).
- **`net-saas-scorecard.js`** — add `lenses` (netSaas/nrr/grr with their bar-visibility + label rules) and confirm `grain` supports `annual`. Add the validated GRR/NRR metric refs per grain.
- **`DecompositionDrill.jsx`** — add lens state + grain state; both re-render the bridge and re-issue queries. Grain routes monthly vs annual sources; lens controls bar visibility + label mode + headline rate.
- **`netSaasSql.js` / `netSaasData.js`** — add annual-grain query builders (bridge, dim split, component split, account table) parameterized by grain → source view. Mirror the existing monthly builders (TDD).
- **GRR/NRR**: fetch the validated `v_metric__*_grr/nrr` value for the period/grain for the headline; compute per-bar % from the bridge row.

## 4. Data flow

`grain + lens + filters + month/window` → controller picks source views → SQL builders → `queryBq` → normalize → bridge bars (with % when lens≠netSaas) + headline rate (from validated metric). Drill unchanged except grain-routed source.

## 5. Testing

- SQL builders + the grain/lens parameterization: Vitest unit tests (mirror the Phase 2 `netSaasSql.test.js` pattern), including annual-source FQNs and lens bar-visibility rules.
- Bridge normalization with % mode + lens bar hiding: unit tests in `netSaasBridge.test.js`.
- Live BQ verification (user, OAuth) across both grains + all three lenses before deploy.
- Reuse the ChartErrorBoundary wrapping (Phase 2 fix) for the reworked bridge.

## 6. Scope / non-goals

- No new standalone GRR/NRR KPI tiles (the lens shows the rates; tiles would be auto-injection the user didn't ask for).
- No sparklines, no multi-select filters, no pick-your-own-dimension pivot (still deferred).
- Annual New/Churn **dim** drill uses existing `int_customer_annual_mrr` dims — no new model. Only the annual **component** (seats/apps/price) drill needs Phase 3a.

## 7. Open decisions (resolve in the plan)

1. **ECharts waterfall vs port the SVG mockup** for the grouped/connector look. The mockup is SVG; ECharts' waterfall may not do brackets + dashed connectors cleanly. Lean: port the SVG approach as a focused component.
2. **GRR/NRR headline vs bridge-ratio reconciliation** — confirm the validated metric and the bridge ratio agree (or document the gap) during the plan.

## 8. References

- Deployed Phase 2: `docs/superpowers/plans/2026-06-03-net-saas-drilldown-ui-phase2.md`
- Data prerequisite: `2026-06-04-annual-mrr-decomposition-design.md`
- Approved visual mockup: `.superpowers/brainstorm/10798-1780586162/content/bridge-polished.html`
- Validated rates: `v_metric__monthly_grr/nrr`, `v_metric__annual_grr/nrr`
