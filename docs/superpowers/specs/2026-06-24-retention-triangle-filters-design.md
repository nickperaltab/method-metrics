# Retention Triangle Filters — design

Date: 2026-06-24
Status: design — pending user review
Owner: Nic (CRO-requested)

## What this is

Add filters to the Customer Retention Triangle: **Industry (L1)**, **Customer
type**, **Country**, and **Acquisition channel**. Each is multi-select; the four
combine with AND. The triangle (cohort × tenure, Customers/MRR × from-start/MoM,
rolling-6 baseline, auto-scaled colors) then reflects only the selected slice.

The triangle becomes a small dimension cube in dbt; the frontend fetches it once
and filters client-side (additive rollup), so filtering is instant and stays
dbt-traceable via the ⓘ panel.

## Dimensions

| Filter | Source column | Notes |
|---|---|---|
| Industry (L1) | `v7_classification.account_labels.l1` | join on the customer's `Company`; deduped; Multi-client/Unclassified buckets (GRR-by-industry pattern) — **Superseded:** l1 is sourced from `v_entity_primary_label` on `customer_record_id = EntityRecordID` (customer grain), not `account_labels`/`Company` |
| Customer type | `int_customer_mrr.Segment` | values: Solo no DEP / 2-3 no DEP / 4+ no DEP / Team AI Plus — the CRO's "solo, dep, etc." |
| Country | `int_customer_mrr.SignupCountry` | already on the model source |
| Channel | `int_customer_mrr.AttributionChannel` | already on the model source |

Dims are **frozen at cohort start** (the customer's attributes in their first
paying month). L1 is the current-state classification of the customer's Company
(account_labels is a current snapshot, effectively static).

## Decisions made during brainstorming

- Multi-select per filter; combine with AND.
- Customer type = `Segment` (single named dim), not separate UserTier/HasDEP.
- Keep Country + Channel even though the CRO named only L1 + customer type
  (cheap, same cube; someone will want country). L1 only, not Method `Vertical`.
- Dimension-cube model (additive rollup), not frontend-only dim joins, so the
  filtered numbers stay dbt-traceable.
- Extend the existing `int_customer_retention_triangle` (add dims to the grain),
  not a second model. No-filter rollup reproduces today's numbers exactly.

## Data layer

### New dbt source

Declare `v7_classification.account_labels` in `models/_sources.yml` (a new
source group, database `project-for-method-dw`, schema `v7_classification`).
Columns used: `company_account`, `l1`, `confidence`, `classified_at`,
`is_multi_client`.

### Model: extend `int_customer_retention_triangle.sql`

New grain: **(cohort_month, tenure_k, l1, segment, country, channel)**. Same
additive measures (`n_start, n_active, mrr_start, mrr_active`). Steps added to
the existing model:

1. `base` already selects each customer's cohort_month row; also carry that
   row's `Segment AS segment`, `SignupCountry AS country`,
   `AttributionChannel AS channel` (frozen at cohort start).
2. Join a deduped `account_labels` (one row per `company_account`,
   `QUALIFY ROW_NUMBER() OVER (PARTITION BY company_account ORDER BY confidence
   DESC, classified_at DESC) = 1`) on `Company = company_account`; derive
   `l1 = CASE WHEN is_multi_client THEN 'Multi-client' ELSE COALESCE(l1,
   'Unclassified') END`.
3. `GROUP BY cohort_month, tenure_k, l1, segment, country, channel`.

Censor unchanged. **Drop the in-model `HAVING n_start >= 20` threshold.** On a
cube, a per-cell threshold would silently delete thin dim-combos, so the "All"
rollup would undercount and stop matching today's numbers (and break parity).
Instead the cube stores **every** cell, and the threshold moves to **display
time**: the frontend hides a cohort row whose *filtered* `n_start` is below the
minimum (default 20), after rollup. So the cube is complete and additive, the
no-filter rollup is exact, and thin filtered slices are still suppressed in the
UI. (Keeps `retention_min_cohort` as a frontend constant, not a dbt var.)

### Frontend transform: `toTriangle(rows, measure, basis, filters)`

`filters = { l1s, segments, countries, channels }`, each a Set (empty/absent =
"All"). Sum rows where `(l1 ∈ l1s || all) AND (segment ∈ segments || all) AND
(country ∈ countries || all) AND (channel ∈ channels || all)` into
`(cohort_month, tenure_k)` totals, then compute the four ratios and the rolling-6
baseline exactly as today. **No filters → identical to current output.**

`cohorts[]` carries the **filtered** `n_start` (sum of matching dim cells at
k=0). The component hides any cohort whose filtered `n_start` is below the
display threshold (default 20), so thin slices don't render as noise.

`buildRetentionTriangleSql` selects the four new dim columns. A helper
`filterOptions(rows)` returns the sorted distinct values per dim for populating
the dropdowns.

### Verification

- Parity (`scripts/parity_int_customer_retention_triangle.py`): roll the cube up
  over all dims and assert the `(cohort, tenure)` `n_start/n_active` totals equal
  the source-method numbers — i.e. adding dims did not move the aggregate. Keep
  the cell-by-cell source-method match (now grouped by the dims too).
- Unit test: extend the fixture with a 2-dim case; assert (a) no-filter rollup
  equals the summed cells, (b) a filter selects the right subset.
- Schema tests: unique on (cohort_month, tenure_k, l1, segment, country,
  channel); not_null on the dim columns; existing invariants hold per cell.
- Refresh + commit the manifest so the ⓘ panel shows the updated model.

## Frontend UI

Four compact multi-select controls above the grid (Industry / Customer type /
Country / Channel), each defaulting to "All", populated from `filterOptions`.
The component fetches the cube once (a few thousand rows) and re-derives the grid
client-side on any filter or toggle change — no re-query. Measure/Basis toggles,
rolling-6 row, auto-scaled colors, and the ⓘ panel all unchanged.

## Scope guard (NOT in V1)

- Four filter dims only (L1, customer type, country, channel). No date-range or
  cohort-start picker.
- Filters freeze at cohort start (no "as-of" time-varying dims).
- No CSV export.
- No per-filter search box beyond the multi-select itself.

## Open questions

- None blocking. Threshold resolved (display-time, post-rollup). Whether to also
  show a small "n below threshold, hidden" note in the UI is a build-time polish
  call.
