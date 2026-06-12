# GRR by Industry — Labs page design

Date: 2026-06-12
Status: approved (Approach A — frontend-only)
Owner: Nic

## What this is

A new Labs scorecard in the builder app that breaks annual GRR down by the V7
industry taxonomy (L1 → L2 → L3) and by operating model, using the enrichment
data in `v7_classification.account_labels`. Clicking any segment shows the
underlying accounts with their labels and classification reasoning, so segment
quality and churn drivers can be inspected directly.

## Decisions made during brainstorming

- **Placement:** new dedicated Labs page ("GRR by Industry"), not an addition
  to the Net SaaS scorecard.
- **GRR basis:** annual GRR only — same math as `v_metric__annual_grr`
  (#388): `(StartMRR − Cancellations − Downgrades) / StartMRR` over
  `revenue.int_customer_annual_mrr`. No monthly variant in V1.
- **Layout:** two sections on one page — industry drill on top, operating
  model below. No dimension switcher, no matrix.
- **Drill-down:** clicking a bar fills an account table below that section
  (Net SaaS account-table pattern), not a modal or side panel.
- **Build approach:** Approach A — frontend-built SQL, no BQ DDL changes, no
  dbt model. Graduation to a BQ view / dbt-managed model is explicitly
  deferred ("come back and do the rest later").

## Data layer

### Sources (read-only, no DDL)

| Table | Role |
|---|---|
| `revenue.int_customer_annual_mrr` | Annual MRR movement at customer grain. Columns used: `Month`, `Company`, `StartMRR`, `Cancellations`, `Downgrades`. |
| `v7_classification.account_labels` | Current-state V7 classification, one row per `account_record_id`. Columns used: `company_account`, `l1`, `l2`, `l3`, `operating_model`, `confidence`, `business_description`, `short_reasoning`. |

### Join

`int_customer_annual_mrr.Company = account_labels.company_account`, LEFT JOIN
so unlabeled customers fall into an **Unclassified** bucket. `account_labels`
can hold multiple rows per `company_account` (it is keyed by
`account_record_id`); the join must first dedupe to one label row per
`company_account` (pick highest `confidence`, ties broken by latest
`classified_at`) so MRR rows are never fanned out.

Coverage measured 2026-06-12 for the 2026-05 cohort: 98.4% of customers,
97.8% of StartMRR carry an L1 label.

### GRR per segment

```sql
SAFE_DIVIDE(SUM(StartMRR) - SUM(Cancellations) - SUM(Downgrades), SUM(StartMRR))
```

grouped by the active dimension (`l1`, `l2`, `l3`, or `operating_model`),
filtered to one cohort `Month`. Segments where `SUM(StartMRR) = 0` are
omitted. **Implementation note:** confirm the sign convention of
`Cancellations`/`Downgrades` in `int_customer_annual_mrr` against
`v_metric__annual_grr` before finalizing the formula (the metric view
subtracts positive magnitudes).

### Parity gate (non-negotiable)

The page's all-up GRR (no segment filter, Unclassified included) must equal
`revenue_metrics.v_metric__annual_grr` for the same period. This is asserted
two ways:

1. A unit test proving the generated unfiltered SQL aggregates the same
   columns over the same source as the metric definition.
2. A dev-time runtime check (console warning) comparing the page total to
   `buildRateSql`-style fetch of the canonical metric.

## Frontend

### New files

```
builder/src/lib/grrIndustrySql.js            — pure SQL builders, no I/O
builder/src/lib/grrIndustryData.js           — fetch wrappers (BQ via existing OAuth client)
builder/src/config/scorecards/grr-industry-scorecard.js  — labs: true config
builder/src/components/scorecards/GrrIndustryView.jsx    — page component
builder/tests/unit/grrIndustrySql.test.js    — unit tests
```

Existing chart (`EChart.jsx`) and table patterns are reused; no changes to
Net SaaS files.

### SQL builders (`grrIndustrySql.js`)

- `buildGrrBySegmentSql({ month, dimension, parentFilters })` — GRR + StartMRR
  + customer count per segment value. `dimension ∈ {l1, l2, l3, operating_model}`;
  `parentFilters` carries the drill path (e.g. `{ l1: 'Construction' }` when
  showing L2s). NULL label → literal `'Unclassified'`.
- `buildGrrAccountsSql({ month, filters })` — account rows for a clicked
  segment: `Company`, `StartMRR`, `Cancellations`, `Downgrades`, `l1`, `l2`,
  `l3`, `operating_model`, `confidence`, `business_description`,
  `short_reasoning`. Sorted by `(Cancellations + Downgrades)` descending.
- All string interpolation goes through the same escaping helper pattern as
  `netSaasSql.js` (`sqlStr`).

### Page behavior (`GrrIndustryView.jsx`)

- **Header:** cohort month picker. Defaults to the latest complete month
  (current in-progress month excluded, per house rule). All-up annual GRR for
  the period shown as a headline KPI sourced from
  `revenue_metrics.v_metric__annual_grr` (never recomputed).
- **Section 1 — GRR by industry:** bar chart per L1. Each bar labeled with
  GRR % and segment StartMRR (so small-base segments read as small).
  Clicking a bar drills L1 → L2 (within that L1) → L3, with a breadcrumb to
  climb back up. Unclassified appears as its own bar at every level it
  applies.
- **Section 2 — GRR by operating model:** same bar treatment, single level,
  the nine `operating_model` values plus Unclassified.
- **Drill-down table:** clicking any bar in either section populates a table
  directly below that section. Columns: Company, Start MRR, Churned $,
  Downgraded $, L1 / L2 / L3, Operating model, Confidence. Each row expands
  to show `business_description` and `short_reasoning`. Sorted by lost $
  (churn + downgrade) descending.
- Charts and table show loading/error states consistent with the existing
  scorecards (no silent failures).

### Nav

`grr-industry-scorecard.js` registers in `SCORECARDS` with `labs: true`, so
it appears in the Labs sidebar section automatically. No Sidebar.jsx changes
expected beyond the config import (match however funnel-acquisition wired in).

## Testing

- Unit tests for every SQL builder (shape, filters, escaping, NULL →
  Unclassified, dedupe-before-join), in the same style as
  `funnelSql.test.js`.
- Parity test: unfiltered segment SQL total reconciles with the
  `v_metric__annual_grr` definition (see Parity gate).
- Manual verification in the browser before deploy (charts render, drill
  path works, account table matches a hand-run BQ query for one segment).

## Out of scope (V1) — revisit later

- Monthly GRR / trend view.
- BQ view or dbt-managed model for the labeled-GRR join (Approach B/C —
  the graduation path if this page earns it).
- NRR by industry (expansion data is in the same table; cheap follow-on).
- Industry × operating-model matrix.
- Writing back review flags to the classification system from this page.

## Risks / caveats

- `account_labels` is current-state, not historical: a customer reclassified
  after churning is counted under its *current* label. Acceptable for V1;
  note it in the page footnote.
- Multiple `account_record_id` rows can map to one `company_account` with
  conflicting labels; the dedupe rule (highest confidence, latest
  classified_at) makes the choice deterministic but arbitrary in true ties.
- This is a Labs page: numbers are exploratory and the all-up GRR headline is
  the only externally quotable figure (it comes from the verified metric).
