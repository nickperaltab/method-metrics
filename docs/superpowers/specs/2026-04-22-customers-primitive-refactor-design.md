# Customers Primitive Refactor — Design Spec

**Date:** 2026-04-22
**Status:** Design — awaiting user review
**Author:** Nic + Claude (brainstorming session)

## Context

Today's `customer-segments-scorecard` is backed by metric 373 (Total Customers, entity grain) plus four per-segment "metrics" (374 Solo no DEP, 375 2-3 no DEP, 376 4+ no DEP, 377 Team AI Plus) sourced from the BQ view `int_customer_segments`.

The five-metric layout is structurally wrong under the project's semantic-layer taxonomy (`docs/semantic-layer.md`):

- **Primitive** metrics have all five semantic fields, `COUNT(…)`-like measures, and business logic in the view.
- **Dimensions** are categorical columns on that view, valid for `GROUP BY`.
- **Derivatives** are formula + `depends_on`.
- **Complex** metrics keep `chart_sql` because nobody refactored them.

Metrics 374–377 are not primitives — each is identical to metric 373 with `semantic_filters: ["Segment = '<value>'"]`. That's what `semantic_dimensions` + `groupByDimension` already does. They were promoted to metric rows instead of collapsed into one primitive with a Segment dimension.

This blocks everything downstream. We can't ask "Customers by Segment × Channel," we can't cleanly layer MRR/GRR on top, and we can't add a new segment without adding a new metric + scorecard section.

## Goal

Restructure the customers layer into a clean primitive + dimensions shape, following the semantic-layer model used for Trials/Syncs/Conversions/Churn. Ship with zero data regression (numbers must match current scorecard row-for-row). Pre-wire the view so the future GRR work lands as new primitives on the same view, not a rebuild.

## Non-goals

- Not rebuilding `v_accounts` or metrics 370–372 (account-grain Customers/New/Churned). Different grain, different purpose, works today.
- Not shipping MRR primitives or GRR derivatives this round. Blocked on reconciling per-customer MRR source against Justin's `method_forecast` model; verification will run via `/metric-solver` against `USD Rates _ Board KPI Deck Preparation 2023+ - Monthly Detail.csv` (col BU Start, col CA Gross MRR Retention) when that project begins.
- Not touching metrics 109/110/111 (NRR / Net MRR Churn / Gross MRR Churn). They stay complex until a replacement is verified.

## Model

One primitive, one BQ view, a set of independent dimensions, and one derived dimension.

```
Primitive:  Customers  (metric 373, renamed)
Measure:    COUNT(DISTINCT EntityRecordID)
Source:     int_customers   (new)
Grain:      Month × EntityRecordID
Filter:     IsActive = TRUE
Dimensions: Segment, UserTier, HasDEP,
            AttributionChannel, SignupCountry, Vertical, SyncType
```

`Segment` is derived in the view as `IF(HasDEP, 'Team AI Plus', <UserTier-based label>)`. `UserTier` is a bucket on `TotalUsers`. Both are exposed independently so analyses can use either.

Segment label values are preserved exactly from `int_customer_segments`: `'Solo no DEP' / '2-3 no DEP' / '4+ no DEP' / 'Team AI Plus'`. This is a deliberate choice to minimize churn for the deck Justin already reviewed; the UserTier labels (`Solo / Small Team / Team`) differ and are independent.

## BQ View: `int_customers`

**Grain:** `Month × EntityRecordID`.

**Columns:**

```
— Identity —
Month               DATE       first of month
EntityRecordID      INT64      stable numeric ID
EntityFullName      STRING     display attribute

— Measures —
AccountCount        INT64      # CompanyAccount rows rolled up to this entity/month
TotalUsers          INT64      sum of paid users across the entity's accounts

— Dimensions (groupable) —
HasDEP              BOOL
UserTier            STRING     'Solo' | 'Small Team' | 'Team'
Segment             STRING     'Solo no DEP' | '2-3 no DEP' | '4+ no DEP' | 'Team AI Plus'
AttributionChannel  STRING
SignupCountry       STRING
Vertical            STRING
SyncType            STRING

— Flags (for future entity-grain primitives; not registered as metrics this round) —
IsActive            BOOL       customer this month
IsNew               BOOL       first month as customer
IsChurned           BOOL       last month before exit
```

**Build logic (conceptual):**

```sql
WITH entity_month AS (
  SELECT
    Month, EntityRecordID, EntityFullName,
    COUNT(DISTINCT CompanyAccount) AS AccountCount,
    SUM(PaidUsers)                 AS TotalUsers,
    BOOL_OR(HasDEP)                AS HasDEP,
    -- earliest-signup account wins for entity-level dims (see Rollup Rule below)
    ARRAY_AGG(AttributionChannel ORDER BY SignupDate LIMIT 1)[OFFSET(0)] AS AttributionChannel,
    ARRAY_AGG(SignupCountry      ORDER BY SignupDate LIMIT 1)[OFFSET(0)] AS SignupCountry,
    ARRAY_AGG(Vertical           ORDER BY SignupDate LIMIT 1)[OFFSET(0)] AS Vertical,
    ARRAY_AGG(SyncType           ORDER BY SignupDate LIMIT 1)[OFFSET(0)] AS SyncType
  FROM <same base source int_customer_segments uses>
  GROUP BY Month, EntityRecordID, EntityFullName
),
with_tiers AS (
  SELECT *,
    CASE
      WHEN TotalUsers = 1              THEN 'Solo'
      WHEN TotalUsers BETWEEN 2 AND 3  THEN 'Small Team'
      ELSE                                  'Team'
    END AS UserTier,
    IF(HasDEP, 'Team AI Plus',
       CASE
         WHEN TotalUsers = 1              THEN 'Solo no DEP'
         WHEN TotalUsers BETWEEN 2 AND 3  THEN '2-3 no DEP'
         ELSE                                  '4+ no DEP'
       END) AS Segment
  FROM entity_month
)
SELECT
  w.*,
  TRUE AS IsActive,
  LAG(TRUE) OVER (PARTITION BY EntityRecordID ORDER BY Month) IS NULL AS IsNew,
  LEAD(TRUE) OVER (PARTITION BY EntityRecordID ORDER BY Month) IS NULL AS IsChurned
FROM with_tiers w
```

### Rollup Rule (document in `docs/semantic-layer.md`)

An entity can own multiple `CompanyAccount` rows with different `AttributionChannel`, `SignupCountry`, `Vertical`, and `SyncType` values. When rolling up to `EntityRecordID`, we use the **earliest-signup account** as the entity's canonical value for those four dimensions. Consequence: entity-grain channel/country/etc. counts will not perfectly reconcile to account-grain counts from `v_accounts`. This is expected and should be documented alongside the existing "Dimensions vs Attributes" section of the semantic-layer doc.

### Parity Contract

The view ships only when the following query returns an empty result set against historical data:

```sql
WITH a AS (SELECT Month, Segment, COUNT(*) n FROM int_customers         GROUP BY 1,2),
     b AS (SELECT Month, Segment, COUNT(*) n FROM int_customer_segments GROUP BY 1,2)
SELECT * FROM a FULL JOIN b USING (Month, Segment)
WHERE a.n != b.n OR a.n IS NULL OR b.n IS NULL
```

This is the launch gate.

## Supabase Registry Changes

### Metric 373 — update in place

| Field | Before | After |
|---|---|---|
| `name` | `Total Customers (Entity)` | `Customers` |
| `view_name` | `int_customer_segments` | `int_customers` |
| `semantic_table` | `int_customer_segments` | `int_customers` |
| `semantic_measure` | `COUNT(DISTINCT EntityRecordID)` | unchanged |
| `semantic_date_col` | `Month` | unchanged |
| `semantic_filters` | `NULL` | `['IsActive = TRUE']` |
| `semantic_dimensions` | `['Segment','HasDEP']` | `['Segment','UserTier','HasDEP','AttributionChannel','SignupCountry','Vertical','SyncType']` |
| `status` | `live` | unchanged (still live after parity passes) |
| `verified_at` | set | **cleared** — re-stamp after scorecard QA |

### Metrics 374–377 — deprecate (do not delete)

| Field | Change |
|---|---|
| `status` | `live` → `queued` (invisible to AI; UI actions gated per RLS memory) |
| `name` | append ` (deprecated — use metric 373 + Segment dim)` |
| `semantic_dimensions` | leave as-is so any stray external reference still renders |

Hard-delete in a later pass after any saved charts referencing these IDs are migrated.

### No new metrics this round

The view exposes `IsNew`, `IsChurned`, and (later) `MRR`, `MRR_prev_month`, `ChurnAmount`, `DowngradeAmount`, `ExpansionAmount`, `Currency` — but no new metric rows are registered now. Adding them later is one `INSERT INTO metrics` per primitive; there is no code or view change required to unlock them.

## Scorecard Restructure: `customer-segments-scorecard`

All existing sections preserved. Metric IDs collapse to 373 with dimension filters.

```
Overview
├─ 5 KPI tiles — metric 373
│     Total Customers    (no filter)
│     Solo no DEP        (dimensionFilter: { Segment: 'Solo no DEP' })
│     2-3 no DEP         (dimensionFilter: { Segment: '2-3 no DEP' })
│     4+ no DEP          (dimensionFilter: { Segment: '4+ no DEP' })
│     Team AI Plus       (dimensionFilter: { Segment: 'Team AI Plus' })
├─ 1 stacked bar — metric 373, groupByDimension: 'Segment'      [NEW, Justin Slack ask #1]
└─ 1 line chart — metric 373, groupByDimension: 'Segment'       [replaces today's "373 + 377" chart]

Solo no DEP          — 1 bar, metric 373, dimensionFilter: { Segment: 'Solo no DEP' }
Small Team no DEP    — 1 bar, metric 373, dimensionFilter: { Segment: '2-3 no DEP' }
Team no DEP          — 1 bar, metric 373, dimensionFilter: { Segment: '4+ no DEP' }
Team AI Plus         — 1 bar, metric 373, dimensionFilter: { Segment: 'Team AI Plus' }

Customer List        — rawTable on 373 (unchanged)
```

**KPI delta semantics:** `showDelta` on a `dimensionFilter`ed KPI compares the current period's filtered value to the prior period's filtered value (same segment). Implementation sits in `computeDelta` operating on the per-segment series returned by the grouped query.

## Engine Extension: `KpiColumn.jsx`

New optional field on KPI config:

```js
{
  metricId: 373,
  label: 'Solo no DEP',
  dimensionFilter: { Segment: 'Solo no DEP' },  // new
  ...
}
```

Behavior:

- When `dimensionFilter` is set, `KpiColumn` reads from `dataMap.get(${metricId}:grouped:${dim})` (the same grouped series Chart.jsx already consumes at line 312) and picks the row where `<dim>` matches the filter value.
- When absent, current behavior is unchanged (`dataMap.get(metricId)`).
- `useScorecardData` must ensure the grouped fetch happens when any KPI *or* chart in the scorecard uses the dimension. (Existing logic likely already handles this because the scorecard already contains Segment charts; confirm during implementation.)
- `computeDelta` is grain-agnostic — it operates on `{period, value}` pairs regardless of filter source. No change needed.

Approval is mild ("sure for now") — the change is small and scoped, and no alternatives were evaluated in depth. If a cleaner pattern emerges (e.g. filtered-KPIs getting their own data fetch key), revisit then.

## Rollout Plan

Strict order. Each step gated on the previous.

1. Create `int_customers` in BQ (non-destructive; no frontend impact).
2. Run parity gate (the SQL above). Fix-and-retry until empty result set.
3. Supabase: update metric 373 as specified.
4. Supabase: deprecate metrics 374–377 (status → `queued`, name suffix).
5. Rewrite `builder/src/config/scorecards/customer-segments-scorecard.js` to use 373 + `dimensionFilter`.
6. Implement `dimensionFilter` support in `builder/src/components/scorecards/KpiColumn.jsx`.
7. Local QA: all six scorecard sections render; values match screenshots of current production; raw-table customer list unchanged.
8. Commit and push. GitHub Pages auto-deploys.
9. Alias: `CREATE OR REPLACE VIEW int_customer_segments AS SELECT * FROM int_customers` (back-compat for one release cycle).
10. Re-stamp `verified_at` on metric 373 after Nic eyeballs the deployed scorecard.

## Rollback

Per-step reversibility:

- Steps 1–2: BQ-only, drop `int_customers`.
- Step 3: `UPDATE metrics SET view_name='int_customer_segments', semantic_table='int_customer_segments', semantic_dimensions='{Segment,HasDEP}', semantic_filters=NULL WHERE id=373;`
- Step 4: `UPDATE metrics SET status='live' WHERE id IN (374,375,376,377);`
- Steps 5–6: `git revert` the commit.
- Step 9: Replace the alias with the original `int_customer_segments` definition.

Abort triggers:

- Parity gate fails and can't be resolved within one working session.
- Any deployed KPI value diverges from the current scorecard by more than rounding noise.
- Customer-list raw table loses columns or rows.

## Out of Scope / Deferred to GRR Project

- Per-customer MRR column on `int_customers`
- Per-customer M−1 lag columns (`MRR_prev_month`, `Segment_prev_month`)
- Per-month ChurnAmount / DowngradeAmount / ExpansionAmount pre-computed columns
- `Currency` dimension on `int_customers`
- GRR primitives (Start MRR, Cancellations, Downgrades, Expansions — per-customer-grain with Segment + Currency dims)
- GRR derivative metric (`1 − (Cancellations + Downgrades) / Start MRR`)
- Reconciliation to Justin's `method_forecast` model
- Verification via `/metric-solver` against `USD Rates _ Board KPI Deck Preparation 2023+ - Monthly Detail.csv` (col BU Start, col CA Gross MRR Retention)

When that project starts, `int_customers` will get a second revision to add the MRR/cohort columns. The view, metric 373, and the scorecard built in this spec remain unchanged.

## Known Caveats

- **Earliest-signup dimension rollup is lossy.** See Rollup Rule. Entity-grain Channel counts will not match account-grain Channel counts. Document in `docs/semantic-layer.md`.
- **`verified_at` is cleared on metric 373** until Nic re-verifies after deploy.
- **Aliasing `int_customer_segments`** is temporary. Schedule a follow-up to drop it after any saved charts or stray references are confirmed migrated.
