# Cohort Survival by First-Pay Vintage — design

Date: 2026-06-22
Status: design — pending user review
Owner: Nic

## What this is

A new section on the Accounts scorecard that shows retention by customer
vintage: one curve per first-paying year (2022–2026), x-axis = months into
account life, y-axis = retention. The viewer can toggle between two measures:

- **Logo survival** — % of the vintage's entities still paying at month k.
- **GRR** — % of the vintage's starting MRR retained at month k (expansion
  capped, churned accounts held at $0).

The chart already exists as a hardcoded artifact in the revenue-architecture
review (`hospital-report.html` §s8). This moves it onto method-metrics backed by
a parity-verified dbt model, so anyone can trace the chart back to the SQL, the
methodology doc, and the verified baseline.

## Why dbt (not frontend SQL)

The numbers carry a strategic claim ("2025 cohort retains better at every
checkpoint"). They need an audit trail. A dbt model gives version-controlled
SQL, a `description`, schema tests, and a definition doc the chart can link to.
Frontend-built SQL (the `grr-by-industry` shortcut) was explicitly rejected for
this view.

## Decisions made during brainstorming

- **Measures:** both logo survival and GRR, side by side, toggled. NRR carried
  in the model but not charted.
- **Grain:** entity (`EntityRecordID`), same as the verified chart. This is the
  grain `int_customer_mrr` keys on. Reproduces the published numbers exactly.
  No CompanyAccount roll-up in V1.
- **Placement:** new section on the existing Accounts scorecard
  (`customers-scorecard.js`), below the breakdowns. Custom chart component, since
  the page's generic line/bar charts can't render tenure-x / vintage-series.
- **Build approach:** dbt intermediate model + parity script + custom React
  component. Not the metrics (`v_metric__*`) layer — that layer is
  calendar-period → single-value and does not fit a tenure × vintage triangle.

## The name-vs-math caveat (must be on the page)

The source chart labels the curve "survival / still paying," but its numbers are
**GRR** (dollar-weighted), not logo survival (count-weighted). The two diverge
when churned accounts are larger or smaller than average. "57.9% still paying"
is true only of the dollar line, not the logo line. The on-page explainer and
the definition doc both state this explicitly. This is the
`docs/metric-definitions.md` §3 "does the math match the name?" check applied up
front.

## Data layer

### Sources

| Source | Role | Columns used |
|---|---|---|
| `ref('int_customer_mrr')` | MRR series + first-pay anchor | `Month`, `EntityRecordID`, `StartMRR` |
| `source('revenue','Funnel')` | signup gate | `EntityRecordID`, `Date`, `EventType` |

Both edges are proven: four `v_metric__*` models already `ref('int_customer_mrr')`,
and `Funnel` is declared in `models/_sources.yml`.

### Model: `models/intermediate/int_customer_survival.sql`

Materialized as a **table** (`{{ config(materialized='table') }}`), matching the
other MRR models. Lands in the `revenue` schema. Output is small (≈5 vintages ×
25 tenures = ~125 rows).

Grain: one row per **(vintage, tenure_k)**. Raw additive columns only; rates
derived downstream.

| Column | Type | Meaning |
|---|---|---|
| `vintage` | STRING | `YEAR(t0)`, 2022–2026 |
| `tenure_k` | INT64 | months since first paying month, 0–24 |
| `n_start` | INT64 | entities in the vintage paying at t0 |
| `n_alive` | INT64 | of those, count with StartMRR > 0 at t0+k |
| `base_mrr` | NUMERIC | Σ StartMRR at t0 |
| `retained_mrr` | NUMERIC | Σ LEAST(mrr_k, mrr_0) |
| `net_mrr` | NUMERIC | Σ mrr_k |

Derived (in the frontend or a thin view): logo survival = `n_alive / n_start`,
GRR = `retained_mrr / base_mrr`, NRR = `net_mrr / base_mrr`.

### Methodology (mirrors VINTAGE_SQL exactly)

1. **Anchor** `t0` = each entity's first paying month: `MIN(Month) WHERE
   StartMRR > 0` over `int_customer_mrr`.
2. **Vintage** = `CAST(EXTRACT(YEAR FROM t0) AS STRING)`.
3. **Signup gate**: join `Funnel` Trial signup, keep `MIN(Date) >= '2021-06-01'`
   so the first-pay anchor is genuine and not left-censored by the data start.
4. **Tenure fan-out**: cross join `UNNEST(GENERATE_ARRAY(0,24)) AS k`, left join
   `int_customer_mrr` at `Month = DATE_ADD(t0, INTERVAL k MONTH)`; missing = $0.
5. **Censoring**: keep a cell only where `DATE_ADD(t0, k) <= {{ var
   ('survival_censor_month') }}` (default = latest complete month;
   `int_customer_mrr` already excludes the in-progress month). 2025 stops ≈ m15,
   2026 ≈ m3.
6. **Threshold**: `HAVING n_start >= 30` per cell.

### Parity target

Cell-by-cell match against the verified §18 / VINTAGE_SQL numbers
(`verification-queries.md`, `build_expanders_doc.py`):

| Vintage | m12 GRR | m24 GRR |
|---|---|---|
| 2022 | 52.4 | 39.2 |
| 2023 | 49.3 | 36.8 |
| 2024 | 51.3 | 37.5 |
| 2025 | 57.9 (m12) · 50.5 (m15) | — (censored) |

Snapshot pins `survival_censor_month = '2026-05-01'` so the baseline is stable.

### Scripts

- `scripts/snapshot_int_customer_survival.py` — run the original VINTAGE_SQL,
  save output.
- `scripts/parity_int_customer_survival.py` — diff the dbt model against the
  snapshot, report exact match or per-cell differences.

### Tests (`models/intermediate/_int_customer_survival.yml`)

- `unique` on `(vintage, tenure_k)`
- `not_null` on `vintage`, `tenure_k`, `n_start`, `n_alive`, `base_mrr`
- `n_alive <= n_start` (relationship / expression test)
- `retained_mrr <= base_mrr` (GRR ≤ 100%)
- `tenure_k` accepted range 0–24
- model-level `description` for the BQ MCP surface

## Methodology doc

New entry in `docs/metric-definitions.md` with the non-negotiable fields:

- **Answers:** "Do newer customer vintages retain better than older ones, at
  the same age?"
- **Grain:** entity / first-pay vintage / tenure-indexed.
- **Filters:** signup ≥ 2021-06-01 (genuine anchor), n_start ≥ 30 (cell
  stability), tenure ≤ latest complete month (censoring) — each with its why.
- **Methodology source:** VINTAGE_SQL in `build_expanders_doc.py` + §18 of
  `verification-queries.md`, 2026-06.
- **Parity-verified against:** the §18 values above, dated.
- **Known caveats:** GRR is dollar-weighted vs logo survival count-weighted;
  entity grain not CompanyAccount; younger vintages right-censored; association
  not causation.

## UI

New section on `builder/src/config/scorecards/customers-scorecard.js`, below the
breakdowns: **"Cohort Survival by First-Pay Vintage."**

- New component `builder/src/components/scorecards/CohortSurvivalChart.jsx`,
  reading `revenue.int_customer_survival` via the existing BQ OAuth path.
- Toggle: **GRR** vs **Logo survival**. One line per vintage, x = tenure month,
  checkpoints 3/6/9/12/15/18/21/24, `connectNulls: false` so censored tails
  stop.
- Methodology explainer block under the chart, in the style of the netsaas
  "Why these buckets?" note: what a vintage is, what each line measures, the
  dollar-vs-logo distinction, and the censoring caveat.

## Scope guard (explicitly NOT in V1)

- No NRR line on the chart.
- No help-tier landmark chart (5a, helped-by-m3 vs not). Separate model if
  wanted later.
- No CompanyAccount grain.
- No auto-injected computed columns. The viewer toggles the two measures; the
  system does not append anything behind their back.

## Open questions

- None blocking. The censor-month var default needs a one-line implementation
  decision at build time (compute latest complete month vs pin), resolved in the
  plan.
