# Net SaaS Drill-Down Dashboard — Design / Handoff

**Date:** 2026-06-03
**Status:** Concept approved (Option A — live BQ OAuth in the app). **Blocked on validation** of the underlying decomposition models before account-level numbers can be trusted.
**Repo-safe:** this doc is architecture + data-model only — no dollar figures, no account data. (Per [public-repo rule]: code/SQL logic may be public; financials & account data may not.)

---

## 1. Goal

A drill-down dashboard in **method-metrics** where the **Net SaaS bridge is navigable**: start at the waterfall, click into an engine, then into a movement type, then into a component, then into the **account tables** behind it — for any **time grain (month / year)** and **time range**.

It turns the static bridge (built as a mockup in `~/Desktop/method-revenue-roadmap.html`) into a live, explorable cockpit.

## 2. The drill hierarchy (the core idea)

Every level is a breakdown of the level above; the leaf is always an account table.

```
L0  Net SaaS bridge          Start → +New +Expansion − Downgrades − Churn → End
        │ (click a bar)
L1  Engine breakdown
        ├─ Acquisition (New)     → by AttributionChannel / Segment / Vertical / Country
        ├─ Retention             → split into Churn  and  Downgrades
        │      ├─ Churn          → by Segment / cohort-age / SyncType
        │      └─ Downgrades     → by COMPONENT: Seats / Apps / Price   (+ by Segment)
        └─ Expansion             → by COMPONENT: Seats / Apps / Price   (+ by Segment)
        │ (click a slice)
L2  Account table             companies in that slice: company, ΔMRR, segment, tier,
                              Δseats, Δapps, cohort age, ...
        │ (click a row)  [optional]
L3  Account detail            that company's line/app history over the range
```

**Generalization (note for V2, not V1):** L1 is really "pick a dimension to split this measure by." The split dimension can be a *movement component* (seats/apps/price) **or** a *customer dimension* (channel/segment/vertical/tier). V1 ships **fixed, sensible drill paths** (above); V2 can let the user choose the split dimension at each node (a true pivot/drill explorer). YAGNI for now.

## 3. Data model

| Layer | Source | Notes |
|---|---|---|
| Movement classification + dims | `revenue.int_customer_mrr` | Monthly per-entity StartMRR / Cancellations / Downgrades / Expansions / NewMRR, plus dims: **Segment, UserTier, HasDEP, AttributionChannel, SignupCountry, Vertical, SyncType**. ⚠ **Orphaned** (built outside dbt; owner left) — migrate into dbt. |
| Seats / apps / price split | `int_mrr_movement_decomposed` | **DRAFT, unvalidated.** Per (month, entity, movement_kind): `seat_mrr` / `app_mrr` / `price_mrr` (price–volume–mix). Reconciles to `int_customer_mrr` movements. |
| Account-level line detail | `int_customer_mrr_lines` | **DRAFT.** Per (month, entity, item) qty/saas — powers L2/L3 (which apps/seats per account). |
| Annual grain | `revenue.int_customer_annual_mrr` + `v_metric__annual_*` | Annual cohort variants for the year grain. A decomposition sibling may be needed (see open Q). |
| Company names for tables | join entity → CompanyAccount | Needed only at L2/L3; **live-fetched, never committed**. |

**Gating dependency:** the three DRAFT models (`int_customer_mrr_lines`, `int_mrr_movement_decomposed`, and the migration of `int_customer_mrr`) must be **validated + ideally moved into dbt** before L1-component / L2 numbers are trusted. The dashboard can be prototyped on them in parallel, clearly labeled "provisional."

## 4. Architecture (Option A)

- **Where:** the builder app (`builder/`, React + Vite → GitHub Pages).
- **Data:** **live BigQuery via the user's Google OAuth** (`builder/src/lib/bigquery.js`). The dashboard generates SQL against the views above and queries at runtime. **No precomputed or account-level data is ever committed.** Code is public; data appears only for a BQ-authed user (matches the existing tracker/scorecards).
- **Reuse (don't reinvent):**
  - Scorecard config pattern → `builder/src/config/scorecards/channel-arr-scorecard.js`
  - Drill-down table → `builder/src/components/scorecards/ChannelTable.jsx` (the Channel ARR scorecard is already "scorecard + drill-down table" — closest existing analog)
  - `DashboardView.jsx`, `EChart.jsx`, `fetchChartData`/`fetchAggregatedData`
- **New components:**
  - `NetSaasBridge` — the L0 waterfall (ECharts or custom SVG; SVG mock already exists in the HTML scratchpad).
  - `DecompositionDrill` — breadcrumb-navigable controller holding drill state (engine → movement → component → account), rendering the right view per level and issuing the level's query.
  - A scorecard config `net-saas-scorecard.js` describing the drill paths + which view/dimension each level queries.
- **Controls:** time **grain** (month ↔ annual cohort) and **range** (single period or sum over a span). Month grain uses `int_customer_mrr`; annual uses `int_customer_annual_mrr`. Persist selection across drill levels.

## 5. Privacy / security (the rule)

- **Live OAuth only.** No baked account data, ever. The deployed URL is public but shows nothing without BQ access.
- This is the *same* model the app already uses — so it's not new exposure, provided we never snapshot account-level results into committed files.

## 6. Open decisions (resolve during planning/implementation)

1. **Default split dimensions** for Acquisition (channel vs segment first?) and Churn (segment vs cohort-age vs reason?).
2. **Account-table columns** at L2 (proposed: company, ΔMRR, segment, UserTier, Δseats, Δapps, cohort age — owner?).
3. **Annual decomposition parity** — does `int_mrr_movement_decomposed` need an annual-cohort sibling, or do we only offer seats/apps/price at month grain in V1?
4. **Validation plan** for the DRAFT models (the gate). Includes entity- vs company-level rollup parity.
5. **Bridge rendering** — ECharts waterfall vs port the existing custom SVG.

## 7. Proposed phases

- **P0 — Validate** the decomposition models (gating; ties to the dbt-migration roadmap item).
- **P1 — Bridge live** (L0) as a scorecard, month grain, live BQ.
- **P2 — Drill L1** (engine → movement / component breakdown).
- **P3 — Drill L2** (account tables).
- **P4 — Time grain + range** controls; annual cohort.
- **P5 — Polish / optional generalize** to a choose-your-dimension explorer.

## 8. References

- Mock / visual scratchpad: `~/Desktop/method-revenue-roadmap.html` (Net SaaS bridge + seats/apps/price split)
- Decomposition logic: `scripts/decompose_mrr_movements.py`
- DRAFT models: `models/intermediate/int_customer_mrr_lines.sql`, `int_mrr_movement_decomposed.sql`
- Related: [[project_revenue_operating_model]], [[project_mrr_movement_decomposition]], the composable-CDP roadmap.
