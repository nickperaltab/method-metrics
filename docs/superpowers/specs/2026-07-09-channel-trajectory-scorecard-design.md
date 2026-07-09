# Channel Trajectory Scorecard — Design

**Date:** 2026-07-09
**Owner:** Nic
**Status:** Design — approved, pending spec review

## Problem

Marketing (Michelle, Sarah) tracks Trials and Syncs by channel on a Looker
dashboard. It has two tables: one for month-over-month change, one for
year-over-year change. The YoY table is broken for their purpose.

The YoY delta compares **this month's MTD actual** against **last year's
same-MTD-window actual**. Michelle wants **this month's full-month
trajectory** against **last year's full-month actual**.

Example (PPC syncs, mid-June): trajectory was 57.86, last June's full month
was 69.8. The correct YoY is -17%. Looker showed -30.5% because it compared
partial-June-this-year (30) against partial-June-last-year.

Looker can't fix this. The delta column is auto-generated — no custom
formula, no column rename. So we rebuild it in Method Metrics.

## Scope

Deliver the YoY fix as one clean, self-contained view. Fold the MoM
comparison into the same view (the only reason Looker needed two tables was
to separate MoM from YoY).

Not a full Looker replacement. Forecast and budget columns stay in Looker.

## Confirmed methodology

All definitions below were reconciled against the Looker PDF (dated Jul 9,
2026, "MTD excluding today" → window Jul 1–8). Parity evidence is in the
table.

| Metric | Definition |
|---|---|
| **Trials** | `revenue.Account` rows, `SignupDate` in window. Filters: `IsConversionException = FALSE`, `Partner != 'Method Integration'`. Fractional multi-touch attribution by channel. |
| **Syncs** | `revenue.Funnel` rows, `EventType = 'Sync'`, `Date` in window. Fractional multi-touch attribution by channel. |
| **Attribution** | The `Att_*` columns are already fractional weights (an account touched by PPC + SEO contributes 0.5 to each). Sum them directly — do **not** re-normalize, and do **not** collapse to a single channel. |
| **Trajectory** | Calendar-day linear run-rate: `MTD ÷ days_elapsed × days_in_month`. Confirmed against the dated PDF anchor (PPC Sync Trajectory `14.5 ÷ 8 × 31 = 56.19`). NOT prior-month-shape — that method gives 68.04 here and is only used for Net SaaS. |
| **YoY %** | `(Trajectory − last-year full-month actual) ÷ last-year full-month actual`. **The fix.** |
| **MoM %** | `(Trajectory − prior-month full actual) ÷ prior-month full actual`. |
| **Sync Rate** | Syncs ÷ Trials, computed at each level (MTD rate, trajectory rate, prior-month rate, last-year rate). |
| **Window** | Month-to-date excluding today, i.e. `[month_start, CURRENT_DATE())`. |

**`CustDatFirstSyncCompleted` is explicitly not used.** An earlier candidate
definition keyed syncs off that Account milestone field. It is out. Syncs
come only from Funnel sync events.

### Parity evidence (Jul 1–8, 2026)

Syncs by channel — fractional Funnel definition vs Looker:

| Channel | Ours | Looker |
|---|---|---|
| SEO | 20.0 | 20 |
| PPC | 14.5 | 14.5 |
| OPN | 12.0 | 12 |
| Direct | 4.0 | 4 |
| None | 3.0 | 3 |

Trials by channel — SEO 36.0, PPC 37.5, Email 1.5 match Looker to the
decimal. OPN / Direct / None are off by 1 due to snapshot-day timing, not
definition. Resolves once the window is pinned in Phase 1.

### Known asymmetries to surface

- **Email has no Funnel sync attribution.** `Att_Email` exists on `Account`
  (so trials have an Email channel) but not on `Funnel` (so syncs do not).
  Email syncs and Email sync rate are therefore null/zero. Show this
  honestly rather than faking a zero.
- **Grand-total quirk.** Looker's total row is a raw event count (55) while
  its channel rows are fractional (sum 53.5); it computes the total
  independently. We show a fractional total (the channel sum) so the total
  and the rows reconcile.

## Architecture

BigQuery (dbt) computes everything. The frontend only renders. This keeps
BigQuery as the source of truth, per the project architecture rule.

```
revenue.Account  ─┐
                  ├─→ int_channel_funnel_trajectory (view) ─→ frontend scorecard
revenue.Funnel   ─┘
```

### dbt model: `int_channel_funnel_trajectory`

Materialized as a **view** so it recomputes against `CURRENT_DATE()` on every
query — the trajectory and windows are always live.

Grain: one row per `channel × metric`, where metric ∈ {`trials`, `syncs`,
`sync_rate`}.

Columns:

| Column | Meaning |
|---|---|
| `channel` | Attribution channel (SEO, PPC, OPN, Direct, None, Email, Partners, Other, Content, …) |
| `metric` | `trials` / `syncs` / `sync_rate` |
| `mtd_actual` | Current month MTD, excluding today |
| `trajectory` | Calendar-day linear projection of the full current month (`mtd ÷ days_elapsed × days_in_month`) |
| `prior_month_full` | Prior calendar month, full |
| `last_year_full` | Same month last year, full |
| `yoy_pct` | `(trajectory − last_year_full) / last_year_full` |
| `mom_pct` | `(trajectory − prior_month_full) / prior_month_full` |

Internal build:

1. **`trials_by_channel_month`** — from `Account`: `channel`, month of
   `SignupDate`, `SUM(Att_*)` fractional trial count. Same filters as
   `int_trials`.
2. **`syncs_by_channel_month`** — from `Funnel` where `EventType = 'Sync'`:
   `channel`, month of `Date`, `SUM(Att_*)` fractional sync count.
3. **`trajectory_calc`** — for the current month, compute MTD, prior-month-full,
   and last-year-full per channel per measure. Trajectory =
   `MTD / days_elapsed × days_in_month` (calendar-day linear; null-safe when
   `days_elapsed` is zero).
4. **`sync_rate`** — derive rate rows from the trials and syncs rows at each
   level (mtd, trajectory, prior-month, last-year).
5. Union the three metrics; compute `yoy_pct` and `mom_pct`.

Reuse existing attribution patterns where they fit (`int_attribution_fractional`
is Account-based and close for trials), but syncs need a Funnel-based
fractional aggregate that does not exist yet.

### Frontend: `channel-trajectory-scorecard`

A **new, separate scorecard route.** Does not touch existing pages.

- Three metric tabs: **Trials / Syncs / Sync Rate**.
- Each tab renders one compact table:

  | Channel | Trajectory | LY Full | YoY % | MoM % |
  |---|---|---|---|---|

  YoY % and MoM % are color-coded (up = green, down = red) with a direction
  arrow. A Total row sits at the bottom.
- Follows the existing bespoke-scorecard pattern (like `channel-arr-scorecard`
  with its own small SQL/data lib) rather than routing through single-value
  metric IDs. The trajectory/YoY shape does not fit the single-value metric
  model.
- Registered in `builder/src/config/scorecards/index.js`.

## Verification gates (before live)

1. **Trials attribution** — confirm fractional (not single-touch) reproduces
   Looker trial actuals once the window is pinned.
2. **Trajectory parity** — the calendar-day linear trajectory reproduces
   Looker's Trajectory number (confirmed: PPC sync `14.5/8*31 = 56.19`).
3. **Channel totals** — the by-channel trajectory sums tie to the existing
   month-level Trials Trajectory (metric 294) and Sync Trajectory (metric
   295).
4. **Definition doc** — write the full definition into
   `docs/metric-definitions.md` before flipping anything live, per the
   define-before-live rule.

## Out of scope (YAGNI)

- Forecast and budget columns (stay in Looker).
- Weekly / daily grains.
- Any change to existing scorecards or metrics.
- Migrating the sync definition debate (Funnel vs milestone) beyond this view.

## Open items for Phase 1

- Pin the exact "excluding today" window so OPN/Direct/None trial counts tie.
- Decide the Total row for Sync Rate (weighted by trials, not a channel
  average).
- Decide how minor channels (Social, Referral, Remarketing, Backlinks, etc.)
  are grouped or shown — match Looker's visible 9, or show all present.
