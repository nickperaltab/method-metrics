# Customer Retention Triangle — design

Date: 2026-06-23
Status: design — pending user review
Owner: Nic (CRO-requested)

## What this is

A cohort retention triangle on the Customers page: rows = monthly cohorts (by
first-paying month), columns = months since start, cells = % retained, heatmap
colored. The granular operating view a CRO uses to see *which* cohorts leak and
*when* — complements the existing aggregate Monthly Retention (GRR/NRR over
time) and the yearly Cohort Survival chart. Modeled on the Amplitude-style
retention table the CRO referenced.

Two toggles, four views off one model:
- **Measure:** Customers (logo count) | MRR (dollars)
- **Basis:** From start (cumulative survival) | Previous month (MoM step rate)

## Decisions made during brainstorming

- **Measure:** both Customers and MRR, toggle. The logo-vs-dollar gap is the
  core retention insight for Method's book (small accounts are ~42% of logos
  but ~9% of MRR), so logo-only would hide the most actionable read.
- **Basis:** both From-start and Previous-month, toggle. From-start shows
  cohort quality + compounding; MoM pinpoints the leak month. Same triangle.
- **MRR semantics:** **net** (NRR-style, includes expansion, can exceed 100%),
  labeled "MRR retained (net)" to keep it distinct from the survival chart's
  expansion-capped GRR. Net is the standard for a retention triangle and is
  symmetric with the logo view (which also exceeds 100% on reactivation).
- **Grain:** customer (`EntityRecordID`), consistent with `int_customer_mrr`,
  `int_customers`, and the survival model. A customer can own multiple
  `CompanyAccount`s; it counts once.
- **Cohort grain:** monthly only in V1. Quarterly/weekly deferred.
- **dbt-proper:** new dbt model + schema tests + verification + metric-def
  entry + ⓘ → dbt panel (via the resolver shipped 2026-06-23).
- **Placement:** Customers page (`customer-segments-scorecard`), retention area,
  full-width section.

## Data layer

### Model: `models/intermediate/int_customer_retention_triangle.sql`

Materialized as a **table**, lands in `revenue`. Source: `ref('int_customer_mrr')`
(+ `source('revenue','Funnel')` signup gate, same as the survival model).

Grain: one row per **(cohort_month, tenure_k)**. Raw additive columns only;
all four view ratios are derived downstream.

| Column | Type | Meaning |
|---|---|---|
| `cohort_month` | DATE | customer's first paying month (`MIN(Month) WHERE StartMRR > 0`) |
| `tenure_k` | INT64 | months since cohort_month, 0–24 |
| `n_start` | INT64 | customers in the cohort (active at k=0) |
| `n_active` | INT64 | of the cohort, count with StartMRR > 0 at cohort_month + k |
| `mrr_start` | NUMERIC | Σ cohort StartMRR at k=0 |
| `mrr_active` | NUMERIC | Σ cohort StartMRR at cohort_month + k |

### Methodology (mirrors the survival model, monthly cohorts)

1. Anchor `cohort_month` = `MIN(Month) WHERE StartMRR > 0` per `EntityRecordID`.
2. Signup gate: `Funnel` Trial `MIN(Date) >= '2021-06-01'` (genuine anchor).
3. Tenure fan-out: cross join `UNNEST(GENERATE_ARRAY(0,24))`, left join
   `int_customer_mrr` at `Month = DATE_ADD(cohort_month, INTERVAL k MONTH)`;
   missing month = not active (0).
4. Censor: keep a cell only where `cohort_month + k <= {{ var
   ('retention_censor_month') }}` (default latest complete month).
5. Threshold: `HAVING n_start >= {{ var('retention_min_cohort', 20) }}` so tiny
   cohorts don't render as noise. (20 chosen to match the CRO example, which
   shows cohorts down to n≈20; survival used 30. Confirm at build.)

### Derived ratios (frontend, not stored)

- Customers / from-start = `n_active(k) / n_start`
- Customers / MoM = `n_active(k) / n_active(k-1)`
- MRR / from-start = `mrr_active(k) / mrr_start`
- MRR / MoM = `mrr_active(k) / mrr_active(k-1)`

Divide-by-zero → null (blank cell). MoM at k=0 = null (no prior month).

### Verification

No published baseline for monthly cohorts, so:
- `scripts/parity_int_customer_retention_triangle.py` (or a diagnostic):
  reproduce the source method on current data and diff cell-by-cell against the
  model (same approach that validated the survival model).
- **Sanity tie:** rolling the monthly cohorts up to first-pay *year* and
  computing from-start GRR should reconcile with `int_customer_survival`'s
  vintage numbers (same underlying data, coarser cohort). Assert a few
  checkpoints match within rounding.
- Schema tests (`models/intermediate/_int_customer_retention_triangle.yml`):
  unique on (cohort_month, tenure_k); not_null on keys + n_start/n_active/
  mrr_start; `tenure_k` accepted range 0–24; **assert `n_active <= n_start`** —
  a cohort can never have more members active than it started with.
  Reactivation lifts a *later* month above the *prior* month (MoM > 100%), but
  never above `n_start`, so this invariant holds.

## Frontend

### Component: `builder/src/components/scorecards/RetentionTriangle.jsx`

Mirrors `BookHeatmap.jsx` (existing) for the grid + color scale. Fetches the
model via `queryBq` + a small `lib/retentionTriangleSql.js` (SQL builder +
`toTriangle(rows, measure, basis)` pure transform, unit-tested). Renders:

- A grid: cohort_month rows × tenure columns, each cell colored by value
  (green high → amber/red low), value labeled.
- A `Cohort Value` column (n_start) and an **Average** row at the bottom
  (tenure-column averages across cohorts).
- Toggles: **Measure** (Customers / MRR), **Basis** (From start / Previous
  month). A `Start` cohort-month selector (defaults to ~12 months back).
- Color scale adapts to basis: From-start spans ~35–100%; MoM is banded tight
  around ~85–105% (matching the CRO example's subtle banding).
- Standard gray **ⓘ** by the section title → dbt panel (section declares
  `dbtModel: 'int_customer_retention_triangle'`).

The pure transform `toTriangle(rows, measure, basis)` is the unit-tested core:
given rows + the two toggles, returns `{ cohorts, tenures, cells, averages }`.

### Placement

A new section in `customer-segments-scorecard.js` (Customers page), in the
retention area. Full-width grid (no `maxWidth` cap).

## Scope guard (NOT in V1)

- Monthly cohorts only (no quarterly/weekly toggle).
- Net MRR only (no capped-GRR variant in the triangle).
- No CSV export (the CRO's tool has it; add later if asked).
- No segment filter on the triangle (whole book); segment cuts are a later add.
- No new dbt sources; reuses `int_customer_mrr` + `Funnel`.

## Open questions

- `retention_min_cohort` default (20 vs 30) — resolved at build against the
  real cohort sizes.
- Net-MRR vs capped-GRR for the MRR measure — locked to **net** per above;
  revisit only if the CRO wants GRR semantics.
