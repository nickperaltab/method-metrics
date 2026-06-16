# GRR/NRR Toggle + Objective Contribution View — design (Piece A)

Date: 2026-06-16
Status: approved (brainstormed with Nic 2026-06-16)
Owner: Nic
Surface: GRR by Industry Labs page (`grr-industry` scorecard)

## What this is

Piece A of a three-part evolution of the GRR by Industry page. It adds a
GRR↔NRR metric toggle, shows each segment's contribution to the company number
objectively (dollars + the canonical rate, not derived judgments), and surfaces
the GRR and NRR definitions inline so a reader knows what the toggle means.

Pieces B (label-meaning rubric: taxonomy + operating-model + rules at point of
review) and C (evidence/confidence drill + flag/annotate) are separate specs,
out of scope here.

## Why

The page answers "how's retention by industry," but only for GRR, and only as a
rate plus absolute Start MRR. Two gaps:

1. No NRR view. GRR shows who's leaking; NRR shows whether expansion offsets it.
   "Who's bleeding most" (GRR) and "who's expanding most" (NRR) are the two
   questions a CRO asks, and the page answers only the first, indirectly.
2. No contribution view. Start MRR alone is size-dominated. The biggest segment
   tops every absolute list and teaches nothing. The reader needs the rate plus
   the dollar components that feed it, with "most/least" expressed as sort order.

## Design principle: objectivity

Every number on the page is the GRR/NRR formula itself, grouped by industry, in
dollars that provably sum to the company total. No derived index, no red/green
"good/bad" coloring, no "dragging/propping" labels in the default view. The one
percentage shown by default is the rate (the canonical `v_metric__` value). A
contribution share (a second kind of percentage) is available behind an explicit
toggle and labeled so it can never be misread as a rate.

This is what keeps it from confusing people: one percentage meaning per column,
contribution expressed in dollars, and "most/least" carried by sort order rather
than asserted by the page.

## Metric definitions (the two that ride with the toggle)

Shown inline next to the toggle, plain-English + formula. Canonical sources:
`revenue_metrics.v_metric__annual_grr` (#388) and `v_metric__annual_nrr`.

- **GRR — Gross Revenue Retention.** Of the MRR you had 12 months ago, how much
  you kept, ignoring expansion. `(Start − Churn − Downgrade) / Start`. Caps at
  100%. All-up ~76.8% (May 2026).
- **NRR — Net Revenue Retention.** Same cohort, crediting expansion.
  `(Start + Expansion − Churn − Downgrade) / Start`. Can exceed 100%. All-up
  ~88.0% (May 2026). The gap from GRR is the expansion contribution.

Both definitions are static (two stable canonical metrics), so they live as a
small constant in the frontend. The dynamic taxonomy/label rubric is Piece B.

## Behavior

### Metric toggle (page-level)

A `GRR | NRR` pill toggle near the page header, default GRR. It controls both
the industry section (L1→L2→L3) and the operating-model section together, plus
the headline KPI. Switching it:

- Swaps the headline KPI between `v_metric__annual_grr` and `v_metric__annual_nrr`
  for the selected cohort month.
- Swaps the rate shown per segment (GRR% or NRR%) and the bar width.
- Swaps the default sort: GRR → by lost $ (churn+downgrade) descending
  ("who's bleeding most" at the top); NRR → by expansion $ descending
  ("who's expanding most" at the top).
- Swaps the dollar columns shown (see below).

### Per-segment objective columns

Each segment row (bars retained as the visual rate indicator, with the numeric
columns beside them) shows, in dollars:

- **GRR mode:** Start MRR, Churn $, Downgrade $, GRR %.
- **NRR mode:** Start MRR, Expansion $, Churn $, Downgrade $, NRR %.

Dollars sum to the company total; the parity gate proves it.

### Contribution-% toggle (off by default)

A `Show contribution %` switch adds exactly one labeled column:

- **GRR mode:** `% of total $ lost` (segment churn+downgrade ÷ total churn+downgrade).
- **NRR mode:** `% of total expansion $` (segment expansion ÷ total expansion).

Computed client-side from the same rows. Off by default so casual readers never
see a second percentage; on for power users (Nic) who want the share explicitly.
No share-of-base column in V1 (that comparison is the interpretive bit; revisit
if wanted).

### Parity gate (extended)

The existing GRR parity gate extends to NRR: the page's all-up rate, recombined
from the L1 segment rows, must reconcile with the canonical metric for the
selected metric+month within 0.002, else the amber warning fires. Same mechanism
as today, now metric-aware.

## Data layer changes

- `buildGrrBySegmentSql` returns one row set serving both modes: add
  `expansion_mrr` and an `nrr` column alongside the existing `grr`. One query,
  toggle picks columns client-side. (No second round-trip on toggle.)
- `buildGrrAccountsSql` adds `expansion_mrr` so the NRR-mode account table can
  show expansion. GRR-mode account table unchanged.
- `grrIndustryData`: map the new fields; generalize the headline fetch to take a
  metric (`v_metric__annual_grr` | `v_metric__annual_nrr`); generalize the
  parity helper to compute either all-up rate from segment rows; add a small
  helper for contribution shares (lost-$ share, expansion-$ share).

## Files

| File | Change |
|---|---|
| `builder/src/lib/grrIndustrySql.js` | `buildGrrBySegmentSql` + `buildGrrAccountsSql` return expansion + nrr |
| `builder/src/lib/grrIndustryData.js` | map new fields; metric-param headline; generalized parity; contribution-share helper |
| `builder/src/components/scorecards/GrrSegmentBars.jsx` | mode-aware rate + dollar columns + optional contribution-% column |
| `builder/src/components/scorecards/GrrIndustryDrill.jsx` | metric toggle, contribution-% toggle, inline definitions, NRR headline + parity |
| `builder/src/config/grrMetricDefs.js` (new) | static GRR/NRR definition text + formula |
| `builder/tests/unit/grrIndustrySql.test.js` | tests for expansion/nrr in builders; contribution-share helper |

## Testing

- Unit tests: `buildGrrBySegmentSql` emits expansion + nrr; `buildGrrAccountsSql`
  emits expansion; contribution-share helper math (lost-$ share sums to 100%,
  expansion-$ share sums to 100%, zero-total returns null).
- Parity test: recombined all-up NRR reconciles with `v_metric__annual_nrr`
  definition for the month, same as the GRR parity test.
- Browser: toggle flips headline, rate, sort, and columns; contribution-% toggle
  adds the one labeled column; no parity warning at default; BQ spot-check one
  segment's NRR against a hand-run query.

## Out of scope (separate specs)

- **Piece B:** label-meaning rubric. Source `TAXONOMY_V7.csv` (L1/L2/L3
  description, examples, disambiguation_notes), `V7-Pipeline-Spec.md §15`
  (9 operating-model definitions), and the 16 rules from
  `classification-methodology.md §4` into something the app reads, and surface
  the right definition at point of review.
- **Piece C:** evidence/confidence drill (content_source pre_enriched vs
  web_fetch, click into accounts by confidence) + flag/annotate write path
  (Supabase).
- Share-of-base column and any over/under-index or color-coded judgment.
- Monthly GRR/NRR variant (page is annual-cohort only).

## Caveats

- NRR account-table expansion column is additive only; the NRR-mode account
  table still lists accounts (it does not become an expansion-only view).
- All-up NRR recombination uses unrounded segment sums; the canonical metric
  rounds components, so compare with the 0.002 tolerance, not equality (same as
  the existing GRR gate).
- Labels remain current-state (the existing footnote stands).
