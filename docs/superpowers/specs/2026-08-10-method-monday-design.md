# Method Monday scorecard

**Date:** 2026-08-10
**Requester:** Nic
**Source page:** Looker Studio report `510f74bb`, page `p_rh9bepy1rd` ("Method Monday (PROD)")

## What this is

A compact Monday-morning page: how is the month pacing, on eight metric groups, readable in one screen.

It is a **rebuild**, not a replica. Same metrics, corrected conventions, honest labels. It will deliberately not tie to the Looker page on the derived figures — see Conventions.

## Scope

Looker's seven groups, plus Sync Conversion Rate:

Sync %, Trials, Syncs, Conversions, Conversion Rate, **Sync Conversion Rate**, Churn, Churn Rate.

Not included: the Revenue and Retention families. Nineteen dbt `.yml` files list Method Monday under `used_by` for GRR, NRR and the MRR movements, but no such section exists on the page today and nobody asked for one. Those `used_by` entries are aspirational and should be corrected separately.

## Conventions

Three decisions, all deliberate departures from what is live today.

### Trajectory divides only complete days

```
trajectory = MTD through yesterday ÷ (day_of_month − 1) × days in month
```

Looker's Method Monday page already does this. Looker's Sales page does something different — through today ÷ day_of_month — which treats a partial day as whole and therefore reads low every morning.

We unify on complete days. Verified against the live page on 2026-08-10, four times independently:

| Metric | MTD through Aug 9 | ÷9 ×31 | Looker |
|---|---|---|---|
| Trials | 132 | 454.7 | 455 |
| Syncs | 64 | 220.4 | 220 |
| Conversions | 20 | 68.9 | 69 |
| Churn | 27 | 93.0 | 93 |

**Consequence for the Sales Scorecard.** `v_metric__conversions_trajectory` and `v_metric__syncs_trajectory` change convention. Conversion Trajectory moves 65.1 → 68.9, and metrics 321, 322 and 323 follow. Those four tiles stop matching Looker's Sales page, on purpose.

### Any actual sitting beside a trajectory excludes today

A tile reading 21 next to a trajectory that divided 20 is the exact inconsistency fixed on 2026-08-10. The two must share a window.

**The primitives do not change.** Trials #54, Syncs #55, Conversions #56 and Churn #59 stay as month totals. They feed Marketing, the AI chart builder and nineteen dbt consumers, none of which asked for a partial-month definition.

Instead, new MTD-through-yesterday metrics back every tile that sits beside a trajectory. The Sales Scorecard's Conversions tile switches to one, going 21 → 20, and the two pages finally agree.

### Attainment is called attainment

Looker labels two tiles "Forecast vs Trajectory" and then computes trajectory ÷ forecast — 455/620 renders as 73.3%, 220/391 as 56.4%. That is attainment. The absolute tiles beside them (−165, −171) are the real forecast-vs-trajectory.

We keep both quantities and name them correctly.

## Architecture

### One wide intermediate, thin pointers

Every tile is date arithmetic over eight primitives. Sixteen near-identical models would put `elapsed / days_in_month` in sixteen places, and drift between near-identical definitions is what cost a day of debugging on 2026-08-10.

`models/intermediate/int_method_monday.sql` emits **one row for the current month** carrying every quantity:

- `elapsed_days`, `days_in_month`
- `{trials,syncs,conversions,churn}_mtd` — through yesterday
- `{trials,syncs,conversions,churn}_forecast` — full month, from `method_forecast`
- `{trials,syncs,conversions,churn}_trajectory` — mtd × days_in_month ÷ elapsed_days
- `{conversions,churn}_forecast_mtd` — forecast × elapsed_days ÷ days_in_month

The elapsed-days logic appears once. Thin `v_metric__*` views select one column each, so every tile still has a registered metric with its own definition and caveats.

### Metrics

Ten new `v_metric__*` views over the intermediate, plus a convention change to two existing ones:

| View | Today | Note |
|---|---|---|
| `v_metric__trials_mtd` | 132 | new |
| `v_metric__syncs_mtd` | 64 | new |
| `v_metric__conversions_mtd` | 20 | new; also replaces #56 on the Sales Conversions tile |
| `v_metric__churn_mtd` | 27 | new |
| `v_metric__trials_trajectory` | 455 | new |
| `v_metric__churn_trajectory` | 93 | new |
| `v_metric__conversions_trajectory` | 68.9 | **convention change** (was 65.1) |
| `v_metric__syncs_trajectory` | 220 | **convention change** |
| `v_metric__conversions_forecast_mtd` | 31 | new |
| `v_metric__churn_forecast_mtd` | 29 | new |
| `v_metric__sync_rate_forecast` | 63.1% | new — syncs_forecast ÷ trials_forecast |
| `v_metric__sync_rate_mtd` | 48.5% | new — syncs_mtd ÷ trials_mtd |

Reused unchanged: `v_metric__sync_conversion_rate_forecasted` (#402, 27.11% — already `SUM(Forecasted_Conversion) ÷ SUM(Forecasted_Syncs)`, which is exactly this tile).

The four full-month forecast totals — trials 620, syncs 391, conversions 106, churn 99 — are already registered metrics reading `method_forecast`; the Marketing and Sales scorecards use them today. The plan must identify them by id rather than create duplicates.

Forecast-vs-trajectory and attainment tiles are **Supabase formula metrics** over the above, following the pattern used for #404 and #405 — not extra dbt models.

### A note on the sync conversion rate

On this convention its trajectory equals its actual. Numerator and denominator both scale by `days_in_month ÷ elapsed_days`, so the ratio is scale-invariant: 20 ÷ 64 = 31.25%, and 68.9 ÷ 220.4 = 31.25%.

One tile, not two. This is **not** true of the trials Conversion Rate, whose denominator is the lagged full-month figure (~523) and does not scale with elapsed days — which is why Looker shows 18.0% forecast against 13.2% trajectory there.

### Page layout

Three sections using the existing `scorecard-row` primitive. No new shared rendering code — that surface is where both the 3289% scale bug and the NULL-as-0% bug live.

| Section | Groups |
|---|---|
| Acquisition | Sync %, Trials, Syncs |
| Conversion | Conversions, Conversion Rate, Sync Conversion Rate |
| Churn | Churn, Churn Rate |

Each section header states that all figures exclude today.

## Acceptance test

Twelve values, every one already read from the live Looker page on 2026-08-10:

| Tile | Target |
|---|---|
| Trials Trajectory | 455 |
| Syncs Trajectory | 220 |
| Conversions Trajectory | 69 |
| Churn Trajectory | 93 |
| Sync % Forecast | 63.1% |
| Sync % Actual | 48.5% |
| Trials Forecast vs Trajectory | −165 |
| Syncs Forecast vs Trajectory | −171 |
| Trials Attainment | 73.3% |
| Syncs Attainment | 56.4% |
| Conversions Forecast MTD | 31 |
| Churn Forecast MTD | 29 |

Plus the sync group, which has no Looker counterpart and is recorded as first observation: Sync Conversion Rate 31.25%, Forecasted 27.11%, +4.1pp, 115.3%.

Verification must be done in the browser against the running app, not only in tests. Both display bugs found on 2026-08-10 passed their unit tests.

## Risks

**The Sales Scorecard changes.** Four tiles move and stop matching Looker. Anyone comparing the two will see it. The section description must say so.

**Elapsed days is 0 on the first of the month.** Trajectory divides by `day_of_month − 1`. On the 1st that is zero, so every trajectory must return NULL, not an error and not zero. This is the single most likely defect and needs an explicit test.

**Sixteen tiles, one intermediate.** If `int_method_monday` is wrong, everything is wrong together. That is the point — one place to check — but it also means the intermediate needs its own tests rather than relying on the tiles looking plausible.

**`method_forecast` is a Google Sheet.** Four of the eight primitives read it. A column rename breaks the page silently. Same exposure as every other forecast metric.
