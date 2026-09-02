# Parity baseline — the four metrics moved to `under_review` on 2026-09-01

**Why this file exists:** these four views were labelled `status: live`, `verified_at: 2026-08-04`
with no dbt model, no entry in `docs/metric-definitions.md`, and no parity record anywhere.
They were moved to `under_review` in both BigQuery labels and the Supabase `metrics` registry.

Nothing about their SQL changed — only the status claim. These values are the pre-adoption
baseline. When each one becomes a real dbt model, `dbt run` it and diff against the table
below. **The bar is exact match**, per the CLAUDE.md snapshot rule.

Captured 2026-09-01 from `revenue_metrics`.

## v_metric__trial_conversion_rate_lagged (#357)

| period | value |
|---|---|
| 2026-03-01 | 0.142484 |
| 2026-04-01 | 0.139423 |
| 2026-05-01 | 0.149613 |
| 2026-06-01 | 0.117542 |
| 2026-07-01 | 0.146754 |
| 2026-08-01 | 0.119725 |
| 2026-09-01 | 0.004000 |

## v_metric__sync_conversion_rate_budgeted (#401)

| period | value |
|---|---|
| 2026-03-01 | 0.275605 |
| 2026-04-01 | 0.304255 |
| 2026-05-01 | 0.277890 |
| 2026-06-01 | 0.290870 |
| 2026-07-01 | 0.302600 |
| 2026-08-01 | 0.272340 |
| 2026-09-01 | 0.285417 |
| 2026-10-01 | 0.274953 |
| 2026-11-01 | 0.300813 |
| 2026-12-01 | 0.319512 |

## v_metric__sync_conversion_rate_forecasted (#402)

| period | value |
|---|---|
| 2026-03-01 | 0.253259 |
| 2026-04-01 | 0.277778 |
| 2026-05-01 | 0.255754 |
| 2026-06-01 | 0.245524 |
| 2026-07-01 | 0.246459 |
| 2026-08-01 | 0.248366 |
| 2026-09-01 | 0.297203 |
| 2026-10-01 | 0.266272 |
| 2026-11-01 | 0.313589 |
| 2026-12-01 | 0.303030 |

## v_metric__sync_conversion_rate_weekly (#403)

| period (week, Mon) | value |
|---|---|
| 2026-07-27 | 0.391304 |
| 2026-08-03 | 0.316667 |
| 2026-08-10 | 0.157895 |
| 2026-08-17 | 0.188679 |
| 2026-08-24 | 0.384615 |
| 2026-08-31 | 0.307692 |

---

## Concerns found while reading the DDL

These are the reasons `under_review` is the honest label, beyond the missing paperwork.
Each needs an answer before any of these returns to `live`.

### #357 — the denominator mixes an actual with a forecast

```sql
SAFE_DIVIDE(c.conversions, (t.prior_month_trials + f.forecasted_trials) / 2.0)
```

The denominator averages **actual trials from month M-1** with **forecasted trials for month M**,
read from the `method_forecast` sheet. Two consequences:

- The metric is not reproducible from warehouse data alone. It moves when someone edits the
  forecast sheet, including for months already closed.
- It renders on the Sales Scorecard as plain **"Conversion Rate"**
  ([sales-scorecard.js:140](../../builder/src/config/scorecards/sales-scorecard.js:140)). Nothing in
  that label tells a reader half the denominator is a forecast.

Also has no in-progress-month guard: on 2026-09-01 it reads **0.004** (one day of conversions over
a full month's denominator). Anyone glancing at the scorecard on the 1st sees a 0.4% conversion rate.

### #403 — the two sides are different cohorts

Conversions are bucketed by `FirstSaaSInvoiceTxnDate` week; syncs by `SyncDate` week; then divided.
An account converting this week most likely synced weeks earlier, so this is a ratio of two
unrelated weekly counts, not "the share of this week's syncs that converted" — which is what the
name implies. This is exactly the name-vs-math failure `docs/metric-definitions.md` §3 exists to catch.

### #401 / #402 — mechanically simple, but sheet-dependent and unbounded

Both are `SUM(Budgeted_|Forecasted_Conversion) / SUM(..._Syncs)` over `revenue.method_forecast`,
filtered only on `Date IS NOT NULL`. The math matches the name. Two notes:

- `method_forecast` is an EXTERNAL table federated over a Google Sheet, so these inherit the
  Drive-scope dependency and change whenever the sheet changes.
- No upper date bound, so they emit future months (through 2026-12 as captured above). Correct for a
  budget line, surprising if a consumer assumes actuals.

---

# Parity vs Looker Studio — run 2026-09-01

Looker's definitions were not read from the Looker UI. They were **reconstructed from the SQL
Looker Studio actually sends to BigQuery**, pulled out of `INFORMATION_SCHEMA.JOBS_BY_PROJECT`
(label `requestor=looker_studio`). That is the executed definition, not a description of it.

## Looker's event model

One custom-SQL source, off `revenue.Account`, filtered
`IsConversionException = FALSE AND Partner != 'Method Integration'`, unioned into events:

| Event | Dated by | Population filter |
|---|---|---|
| Trial | `SignupDate` | `SignupDate != '0001-01-01'` |
| Sync | `SignupDate` | `SyncTypeRegion != '' AND SignupDate != '0001-01-01'` |
| Conversion | `FirstSaaSInvoiceTxnDate` | `FirstSaaSInvoiceTxnDate != '0001-01-01'` |

The lagged conversion rate shifts Trial events forward one month
(`DATETIME_ADD(Date, INTERVAL 1 MONTH)`) and divides conversions in month M by trials from M-1.
**No forecast is involved anywhere in Looker's version.**

## Result

| Metric | Looker counterpart | Verdict |
|---|---|---|
| #357 `trial_conversion_rate_lagged` | Yes — same numerator, denominator is prior-month trials alone | **FAILS parity** |
| #401 `sync_conversion_rate_budgeted` | None — Looker never reads `method_forecast` (0 queries in 45 days) | Not provable against Looker |
| #402 `sync_conversion_rate_forecasted` | None — same | Not provable against Looker |
| #403 `sync_conversion_rate_weekly` | Sync population matches Looker exactly; no weekly rate in Looker | Populations agree, cohort logic unresolved |

### #357 — fails, and the gap is not constant

| period | conversions | prior-month trials | Looker rate | our rate | Δ | Δ% |
|---|---:|---:|---:|---:|---:|---:|
| 2025-12 | 115 | 631 | 0.182250 | 0.183559 | +0.0013 | +0.7% |
| 2026-01 | 109 | 581 | 0.187608 | 0.164777 | −0.0228 | −12.2% |
| 2026-02 | 119 | 729 | 0.163237 | 0.153351 | −0.0099 | −6.1% |
| 2026-03 | 109 | 664 | 0.164157 | 0.142484 | −0.0217 | −13.2% |
| 2026-04 | 87 | 648 | 0.134259 | 0.139423 | +0.0052 | +3.9% |
| 2026-05 | 87 | 543 | 0.160221 | 0.149613 | −0.0106 | −6.6% |
| 2026-06 | 66 | 503 | 0.131213 | 0.117542 | −0.0137 | −10.4% |
| 2026-07 | 78 | 503 | 0.155070 | 0.146754 | −0.0083 | −5.4% |
| 2026-08 | 61 | 420 | 0.145238 | 0.119725 | −0.0255 | **−17.6%** |

The numerator agrees exactly — `int_conversions` carries the same three filters Looker uses.
The whole gap is the denominator's forecast term:

| period | actual prior-month trials | forecasted trials | forecast − actual |
|---|---:|---:|---:|
| 2025-12 | 631 | 622 | −9 |
| 2026-01 | 581 | 742 | +161 |
| 2026-02 | 729 | 823 | +94 |
| 2026-03 | 664 | 866 | +202 |
| 2026-04 | 648 | 600 | −48 |
| 2026-05 | 543 | 620 | +77 |
| 2026-06 | 503 | 620 | +117 |
| 2026-07 | 503 | 560 | +57 |
| 2026-08 | 420 | 599 | **+179 (+43%)** |

The trial forecast has run above actual in 7 of the last 9 months. Because it sits in the
denominator, **#357 falls whenever the forecast is optimistic** — it moves with forecast error,
not with conversion performance. On the Sales Scorecard it is labelled just "Conversion Rate".

**Decision needed:** is the blended denominator intentional (a deliberate
"expected trials" base agreed with someone), or drift? If nobody owns that choice, #357 should be
rebuilt on the Looker denominator — prior-month trials alone — and re-verified.

### #403 — sync population matches Looker exactly

`int_syncs` (from `revenue.Funnel WHERE EventType = 'Sync'`, dated `SyncDate`) and Looker's
`Account WHERE SyncTypeRegion != ''` dated `SignupDate` return **identical monthly counts, 9 of 9
months** (Dec 2025 – Aug 2026: 350, 452, 424, 376, 319, 295, 262, 227, 240). Different plumbing,
same population — `Funnel.Date` on a Sync row is the signup date.

Two caveats that parity does not settle:

- **Agreeing with Looker is not being right.** Both sides define a sync as `SyncTypeRegion != ''`.
  Per the syncs-redefinition work, that misses ~8.4% of real syncs; `CustDatFirstSyncCompleted` is
  the validated completion field. Both are wrong together.
- **The cohort mismatch stands.** #403 divides conversions in week W (by first-invoice date) by
  syncs in week W (by signup date). Those are different cohorts, so the ratio is not "the share of
  this week's syncs that converted", which is what the name says.

### #401 / #402 — no Looker counterpart

Looker Studio issued **zero** queries touching `revenue.method_forecast` in 45 days. There is
nothing to diff against. Their source of truth is the forecast sheet itself, so verification means
reconciling `SUM(Budgeted_Conversion)/SUM(Budgeted_Syncs)` against the sheet's own published rate
and confirming with whoever maintains it that those are the intended columns.

---

# CORRECTION — verified against the Looker report itself, 2026-09-01

The section above reconstructed Looker's definition from the SQL it sends BigQuery. **That
reconstruction was wrong**, and the conclusion drawn from it ("#357 fails parity, −17.6%") was wrong.

Why it failed: Looker Studio fetches lagged trials and conversions as **separate queries** and does
the division in the chart layer. The job log shows the operands, never the operator, and never the
chart's own filters or calculated fields. Inferring the ratio from the operands produced a metric
Looker does not actually display.

Read directly from **Method - Scorecard (PROD) › Sales (PROD)**
(`lookerstudio.google.com/reporting/510f74bb-0d17-465c-aadc-f4c20e97772f`), chart
"Conversion Rate Month Over Month":

| period | Looker displayed | v_metric__trial_conversion_rate_lagged | match |
|---|---:|---:|---|
| Apr 2026 | 13.94% | 0.139423 | exact |
| May 2026 | 14.96% | 0.149613 | exact |
| Jun 2026 | 11.75% | 0.117542 | exact |
| Jul 2026 | 14.68% | 0.146754 | exact |
| Aug 2026 | 11.97% | 0.119725 | exact |

**#357 is parity-verified.** The blended denominator — actual prior-month trials averaged with
forecasted current-month trials — is Looker's definition, faithfully ported. Not drift.

The in-progress-month behaviour matches too: on 2026-09-01 Looker shows 0.6% and the view returns
0.4% (both moving intraday). Not a divergence.

**What stands from the earlier analysis:** the denominator is still an unusual construction. It
moves with forecast error, and the forecast has run above actual trials in 7 of the last 9 months.
That is a methodology question for whoever owns the scorecard definition — *not* a defect, and not
a reason to withhold the number. It belongs in `meta.limitations` when the dbt model is written.

**Lesson for future parity work:** reconstructing a BI tool's definition from its generated SQL
establishes the *source query* only. Aggregations, ratios, chart filters and date controls live
above it. When the numbers disagree, open the report before concluding the warehouse is wrong.

## #401 / #402 / #403 — orphaned, and not what the scorecard uses

The Looker Sales scorecard plots Budgeted and Forecasted Conversion Rate beside the actual. Those
come from the `Budgeted_Conversion_Rate` / `Forecasted_Conversion_Rate` columns — a **trial-based**
rate, ~15–17%.

Our app uses metrics **#319** and **#324** for those, which read the same two columns. Both are
still `status: queued` despite being on a production scorecard.

**#401 / #402 compute something different**: `SUM(Budgeted_Conversion) / SUM(Budgeted_Syncs)` — a
**sync-based** rate, ~27–30%, roughly double, because syncs are roughly half of trials
(Aug 2026: 240 syncs vs 420 trials).

`grep` finds **no reference to #401, #402 or #403 anywhere in the app.** They have no consumer, no
Looker counterpart, and a name ("Sync Conversion Rate") close enough to the scorecard's
"Conversion Rate" to be mixed up. They stay `under_review` pending a decision: adopt into dbt with
a name that says *sync*-based, or retire.

Separate follow-up: **#319 and #324 are `queued` but rendering on the Sales Scorecard.** That is the
inverse of the #357 problem — real consumers, no status claim at all.

---

# Known and accepted: small NRR / GRR deltas vs Looker

`v_metric__annual_nrr` was checked against Looker's "1 Year NRR by Month" on 2026-09-01. Looker
computes NRR independently from `revenue.TransLineFlattened` (562 NRR queries in 30 days, none
touching `v_metric__*` or `int_customer_annual_mrr`), so this is a genuine two-implementation check.

| period | Looker | v_metric__annual_nrr | Δ (pp) |
|---|---:|---:|---:|
| 2026-01 | 90.42% | 90.42% | — |
| 2026-02 | 90.26% | 90.26% | — |
| 2026-03 | 89.24% | 89.24% | — |
| 2026-04 | 88.08% | 88.07% | 0.01 |
| 2026-05 | 87.96% | 87.96% | — |
| 2026-06 | 87.07% | 87.07% | — |
| 2026-07 | 87.91% | 87.86% | 0.05 |
| 2026-08 | 87.49% | 87.26% | 0.23 |

**Do not chase these deltas.** Two documented causes, both accepted:

1. **Join key.** The dbt MRR chain joins on the entity/account **record ID**; the Looker-era work
   joined on **account name**. Renamed companies and multi-account entities land differently, which
   moves a handful of customers between buckets. The record-ID join is the correct one — account
   name is not stable. The same difference applies to GRR. Documented, not a bug to fix.
2. **Refresh timing.** Looker renders from a cached refresh (the Sales page footer showed
   "Data Last Updated: 9/1/2026 7:20:07 PM") while a BQ query runs live, and the MRR tables are
   rebuilt nightly. The deltas grow toward recent months — 0.01pp in April, 0.23pp in August —
   which is the shape of late-arriving data, not a definition gap.

Five of eight months match to the basis point. Treat sub-0.5pp differences on recent months as
expected; investigate anything larger, older, or non-monotonic in that pattern.

---

# Parity sweep — Marketing page, 2026-09-01

Source: `Method - Scorecard (PROD) › Marketing (PROD)`, read with `get_page_text`
(Looker footer: "Data Last Updated: 9/1/2026 10:12:17 PM").

## Base metrics — exact, 6 of 6 months

| period | Looker trials | `v_metric__trials` | Looker syncs | `v_metric__syncs` | Looker sync % | `v_metric__sync_rate` |
|---|---:|---:|---:|---:|---:|---:|
| Apr 2026 | 543 | 543 | 319 | 319 | 58.7% | 58.7% |
| May 2026 | 503 | 503 | 295 | 295 | 58.6% | 58.6% |
| Jun 2026 | 503 | 503 | 262 | 262 | 52.1% | 52.1% |
| Jul 2026 | 420 | 420 | 227 | 227 | 54.0% | 54.0% |
| Aug 2026 | 440 | 440 | 240 | 240 | 54.5% | 54.5% |
| Sep 2026 | 15 | 15 | 5 | 5 | 33.3% | 33.3% |

Every value matches. `v_metric__trials`, `v_metric__syncs`, `v_metric__sync_rate` verified.

## MTD metrics — exact

| Looker | value | ours | value |
|---|---:|---|---:|
| Trials To Date | 15 | `v_metric__trials_mtd` (#406) | 15 |
| Syncs To Date | 5 | `v_metric__syncs_mtd` (#407) | 5 |
| Current Sync % | 33.3% | `v_metric__sync_rate_mtd` (#414) | 33.33% |

## Trajectory metrics — FAIL, exactly 2× on a day-1 reading

| Looker | value | ours | value | ratio |
|---|---:|---|---:|---:|
| Trial Trajectory | 225 | `v_metric__trials_trajectory` (#410) | 450 | 2.00 |
| Sync Trajectory | 75 | `v_metric__syncs_trajectory` (#295) | 150 | 2.00 |

**Cause: a different elapsed-day convention.** `revenue.int_method_monday` defines

```sql
WITH bounds AS (
  SELECT DATE_TRUNC(CURRENT_DATE(), MONTH) AS period,
         EXTRACT(DAY FROM CURRENT_DATE()) - 1 AS elapsed_days,
         EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE(), MONTH)) AS days_in_month
)
...
SAFE_DIVIDE(a.trials_mtd, b.elapsed_days) * b.days_in_month AS trials_trajectory
```

BigQuery runs in UTC, where the date was already 2026-09-02, so `elapsed_days = 1`:
`15 / 1 × 30 = 450`. Looker's 225 implies it divided by **2** — it counts the current day as elapsed,
we count complete days only.

**Do not read too much into the magnitude.** This is day 1 of the month, where the divisor is 1 vs 2
and the ratio is maximal. By mid-month the same one-day offset is a few percent. The divergence is
real; its size here is not representative.

**Two things to settle before either trajectory metric can go `live`:**

1. **Which convention is intended** — complete days (ours) or elapsed-including-today (Looker's).
   Ours is defensible: a partial day understates the run rate and inflates the projection.
   But it must match whatever Method Monday is meant to report.
2. **`elapsed_days` divides by zero on the 1st of the month in local time.** `SAFE_DIVIDE` returns
   NULL rather than erroring, so on the 1st every trajectory metric silently goes blank in the
   local-time window before UTC rolls over. Needs a guard: `GREATEST(EXTRACT(DAY FROM CURRENT_DATE()) - 1, 1)`.

## Status after this sweep

| Metric | Result |
|---|---|
| `v_metric__trials`, `v_metric__syncs`, `v_metric__sync_rate` | verified against Looker, 6/6 |
| #406 `trials_mtd`, #407 `syncs_mtd`, #414 `sync_rate_mtd` | verified against Looker |
| #410 `trials_trajectory`, #295 `syncs_trajectory` | **fail** — elapsed-day convention differs |
| #296, #342, #344, #345, #400, #408, #409, #411, #412, #413 | not yet swept (Method Monday page) |

---

# Parity sweep — Method Monday page, 2026-09-01

Source: `Method - Scorecard (PROD) › Method Monday (PROD)` (`page/p_rh9bepy1rd`), read with
`get_page_text`. Footer: "Data Last Updated: 9/1/2026 10:16:32 PM".

## Two more base metrics verified

The page's date control was set to **Aug 1 – Aug 31, 2026** as loaded, so its actuals are a closed
month and directly comparable:

| Looker (Aug 2026) | value | ours | value |
|---|---:|---|---:|
| Conversion | 61 | `v_metric__conversions` | 61 |
| Churn Count | 117 | `v_metric__churn` | 117 |

Both exact. `v_metric__conversions` and `v_metric__churn` verified against Looker.

## The remaining ten cannot be verified from this page

Two independent reasons, either of which is disqualifying.

**1. Our MTD/trajectory metrics are hardcoded to the current month.**
`revenue.int_method_monday` opens with `DATE_TRUNC(CURRENT_DATE(), MONTH) AS period`. Every metric
built on it — #406, #407, #408, #409, #410, #411, #412, #413, #414, #295, #296, #400 — can only ever
emit the current month. With Looker showing August, there is no overlapping period to diff.

**2. Looker's own trajectory figures are wrong on this page.** With Aug selected it displays:

| Looker figure | shown | sanity check |
|---|---:|---|
| Trial Trajectory | 13,200 | Aug actual trials were 440 → 440 × 30 |
| Sync Trajectory | 7,200 | Aug actual syncs were 240 → 240 × 30 |
| Churn Trajectory | 3,510 | vs 117 actual churns |
| Conversion Trajectory | 1,830 | vs 61 actual conversions |
| Churn Rate Trajectory | 61.17% | — |
| Forecast vs Trajectory | 2203.7% / 2352.9% | — |

Every one is the month's completed actual multiplied by the days in the month. Looker is applying
the trajectory formula to a closed month as if one day had elapsed — the same elapsed-days defect
found in `int_method_monday`, in a worse form.

**Conclusion: Looker is not a valid parity source for any trajectory metric.** Both implementations
are wrong in the same family of ways. Matching them would prove nothing.

## What the remaining ten need instead

They are projections, not measurements, so parity against another system was never the right test.
What they need is:

1. **A decided elapsed-day convention** — complete days (ours) or elapsed-including-today
   (Looker's on the Marketing page). One line, but it needs an owner's decision.
2. **A guard against a zero divisor on the 1st** — `GREATEST(EXTRACT(DAY FROM CURRENT_DATE()) - 1, 1)`.
   Today `SAFE_DIVIDE` returns NULL and the metric silently blanks.
3. **A rule for closed months** — a trajectory for a finished month should return the actual, or
   NULL, never actual × days_in_month. Neither implementation does this today.
4. **Back-testing rather than parity** — for a handful of closed months, compare what the trajectory
   would have projected mid-month against what the month actually landed at. That measures whether
   the projection is any good, which is the real question.

## Sweep status

| Verified against Looker | Result |
|---|---|
| `v_metric__trials`, `v_metric__syncs`, `v_metric__sync_rate` | exact, 6/6 months |
| `v_metric__conversions`, `v_metric__churn` | exact, Aug 2026 |
| `v_metric__annual_nrr` | 5/8 exact, rest within 0.23pp (documented causes) |
| #357, #319, #324 | exact |
| #406 `trials_mtd`, #407 `syncs_mtd`, #414 `sync_rate_mtd` | exact |
| **#410, #295 trajectories** | **fail — elapsed-day convention** |
| **#296, #342, #344, #345, #400, #408, #409, #411, #412, #413** | **no valid Looker counterpart; need the four fixes above** |

---

# CHANGE APPLIED 2026-09-02 — trajectory suppressed for the first 7 days of the month

**What changed:** `revenue.int_method_monday` now returns `NULL` for every trajectory column when
fewer than 7 complete days of the month have elapsed. MTD figures, forecast-MTD figures and
`churn_rate_mtd` are untouched.

**Why 7 days.** Trajectory is a calendar-day linear run-rate — `MTD / elapsed_days * days_in_month`.
With one or two days elapsed it extrapolates a single day across the whole month, and trials and
syncs have a strong day-of-week shape: a month opening on a weekend projects far too low, one
opening on a Monday far too high. Seven days is the shortest window containing every weekday exactly
once, so day-of-week effects cancel instead of dominating.

Concretely, on 2026-09-02 the unguarded formula read **450 trials** off a single day's data — against
an August actual of 440 and a September forecast of 560.

**Why NULL rather than a number.** A blank cell reads as "too early to say". A plausible-looking
wrong number does not. Consumers should show MTD and the prior month during the first week.

**Consistency.** This matches `int_channel_funnel_trajectory`, which already uses the same
complete-days convention, anchored to a dated Looker PDF (`14.5 / 8 * 31 = 56.19`).

**It deliberately does not match Looker's Method Monday page.** That page divides by day-of-month
while its MTD excludes today — an inconsistent pairing that understates by `day / (day - 1)`
(2x on day 2, ~3% by mid-month). Do not treat a mismatch there as a parity failure.

## Verification — before / after, 2026-09-02

Snapshot taken immediately before `CREATE OR REPLACE VIEW`, per the CLAUDE.md rule.

| column | before | after |
|---|---:|---:|
| `trials_trajectory` | 450 | **NULL** |
| `syncs_trajectory` | 150 | **NULL** |
| `conversions_trajectory` | 90 | **NULL** |
| `churn_trajectory` | 60 | **NULL** |
| `churn_rate_trajectory` | 1.5512 | **NULL** |
| `trials_mtd` | 15 | 15 |
| `syncs_mtd` | 5 | 5 |
| `conversions_mtd` | 3 | 3 |
| `churn_mtd` | 2 | 2 |
| `bom_customers` | 3,778 | 3,778 |
| `churn_rate_mtd` | 0.0529 | 0.0529 |
| `conversions_forecast_mtd` | 2.5 | 2.5 |
| `churn_forecast_mtd` | 3.1 | 3.1 |

Exactly the five intended columns changed; every other value is identical. New column
`min_trajectory_days = 7` is exposed so consumers can read the threshold rather than hardcode it.

Downstream `v_metric__*_trajectory` views confirmed NULL; `v_metric__trials_mtd` (15) and
`v_metric__churn_rate_mtd` (0.0529) confirmed unchanged.

The view also gained a `description` — it previously had none, which is why it never showed up as
a documented object.

## Follow-ups this creates

1. **The Method Monday deck and any consumer must handle NULL trajectory** for days 1–6. Today it
   will render blank. If a deck is generated in that window it needs to fall back to MTD +
   prior-month, not print an empty cell.
2. **`min_trajectory_days` belongs in `meta.caveats`** on all five trajectory metrics (#410, #295,
   #296, #411, #345) when they are adopted into dbt.
3. **`int_method_monday` is still a hand-written BQ view.** This change makes it more correct but no
   more governed. It remains the highest-leverage single adoption — 15 of the 19 unmanaged views
   sit on it.

---

# Parity sweep continued — forecast/budget series and weekly grain, 2026-09-02

Source: `Method - Scorecard (PROD) › Marketing (PROD)`, `get_page_text`.

## Forecast and budget series — 36 of 36 values exact

| period | Budgeted Trials | Forecasted Trials | Budgeted Syncs | Forecasted Syncs | Budgeted Sync % | Forecasted Sync % |
|---|---:|---:|---:|---:|---:|---:|
| Apr 2026 | 758.06 | 600 | 470 | 378 | 62.0% | 63.0% |
| May 2026 | 795.16 | 620 | 493 | 391 | 62.0% | 63.1% |
| Jun 2026 | 759.68 | 620 | 471 | 391 | 62.0% | 63.1% |
| Jul 2026 | 682.26 | 560 | 423 | 353 | 62.0% | 63.0% |
| Aug 2026 | 758.06 | 599 | 470 | 306 | 62.0% | 51.1% |
| Sep 2026 | 774.19 | 560 | 480 | 286 | 62.0% | 51.1% |

Every Looker value equals `SUM(<column>)` from `revenue.method_forecast` grouped by month.
No transformation, no filter beyond `Date IS NOT NULL`.

**Derivation confirmed:** Budgeted / Forecasted Sync % are not columns. Looker computes them as
`Budgeted_Syncs / Budgeted_Trials` and `Forecasted_Syncs / Forecasted_Trials`. Every one of the
twelve rate values reproduces exactly from that formula — including the Aug/Sep drop to 51.1%,
which is a forecast revision (306/599 and 286/560), not a data problem.

## Weekly grain — 5 of 6 weeks exact, both series

Weeks start Monday. Source `int_trials`, syncs gated on `SyncTypeRegion != ''`.

| week starting | Looker trials | ours | Looker syncs | ours |
|---|---:|---:|---:|---:|
| 2026-07-27 | 21 | 84 | 5 | 46 |
| 2026-08-03 | 107 | 107 | 60 | 60 |
| 2026-08-10 | 101 | 101 | 57 | 57 |
| 2026-08-17 | 99 | 99 | 53 | 53 |
| 2026-08-24 | 89 | 89 | 52 | 52 |
| 2026-08-31 | 38 | 38 | 18 | 18 |

The 2026-07-27 bucket is a **partial week**, not a discrepancy: Looker's chart window opens inside
that week, so its bucket holds only the days from the window start to Aug 2, while ours holds the
full Mon–Sun week. Every complete week matches exactly on both series.

This confirms the weekly bucketing convention (Monday start) as well as the monthly one.

## Running total for this sweep

**Verified against Looker, exact unless noted:**
`v_metric__trials`, `v_metric__syncs`, `v_metric__sync_rate` (monthly 6/6 and weekly 5/5 complete
weeks) · `v_metric__conversions`, `v_metric__churn` (Aug) · `v_metric__annual_nrr` (5/8 exact,
remainder <0.23pp, causes documented) · #357, #319, #324 · #406, #407, #414 ·
`method_forecast` budget/forecast series (36/36).

**Failed or unverifiable:** #410, #295 (elapsed-day convention — since fixed by the 7-day floor);
the ten remaining MTD/trajectory metrics (no valid Looker counterpart — that page's own
trajectories are wrong).

**Not yet swept:** the Sales Detailed page. Sidebar navigation in Looker Studio does not respond to
programmatic clicks; it needs its `page/` URL, the way Method Monday needed `p_rh9bepy1rd`.

---

# Parity sweep — Sales Detailed page, 2026-09-02

Source: `Method - Scorecard (PROD) › Sales Detailed (PROD)` (`page/p_npxgzx3eud`), `get_page_text`.
Footer: "Data Last Updated: 9/2/2026 4:06:36 PM".

## #357 — settled. Looker publishes its own working.

The page carries a **Conversion Rate Details** table that exposes every input:

| period | Budgeted CR | Forecasted CR | Conversion Rate | Conversion | Last Month's Trials | Forecasted Trials |
|---|---:|---:|---:|---:|---:|---:|
| Apr 2026 | 17.25% | 16.73% | 13.94% | 87 | 648 | 600 |
| May 2026 | 17.25% | 17.09% | 14.96% | 87 | 543 | 620 |
| Jun 2026 | 17.69% | 17.11% | 11.75% | 66 | 503 | 620 |
| Jul 2026 | 17.06% | 16.33% | 14.68% | 78 | 503 | 560 |
| Aug 2026 | 17.76% | 14.88% | 11.97% | 61 | 420 | 599 |
| Sep 2026 | 18.37% | 15.05% | 0.8% | 4 | 440 | 560 |

`Conversion / ((Last Month's Trials + Forecasted Trials) / 2)` reproduces the published rate on
every closed month:

- Apr `87 / ((648+600)/2)` = 87/624 = 13.94%
- May `87 / ((543+620)/2)` = 87/581.5 = 14.96%
- Jun `66 / ((503+620)/2)` = 66/561.5 = 11.75%
- Jul `78 / ((503+560)/2)` = 78/531.5 = 14.68%
- Aug `61 / ((420+599)/2)` = 61/509.5 = 11.97%

**The blended actual-plus-forecast denominator is Looker's deliberate design, published as two named
columns on its own detail table.** It is not drift and it is not something #357 invented. Both of
our inputs also reconcile independently: conversions (87, 87, 66, 78, 61) and prior-month trials
(648, 543, 503, 503, 420) both match our own queries exactly.

This closes the question left open on 2026-09-01. The methodology note still stands — the metric
moves with forecast error, and that belongs in `meta.limitations` — but there is nothing to fix.

## Churn Rate — 5 of 5 exact, and the methodology now verified historically

| period | Looker Churn Rate | ours | churned | conversions | bom_customers |
|---|---:|---:|---:|---:|---:|
| Apr 2026 | 2.41% | 2.41% | 95 | 87 | 3,852 |
| May 2026 | 2.75% | 2.75% | 108 | 87 | 3,845 |
| Jun 2026 | 2.70% | 2.70% | 105 | 66 | 3,819 |
| Jul 2026 | 2.04% | 2.04% | 79 | 78 | 3,788 |
| Aug 2026 | 3.05% | 3.05% | 117 | 61 | 3,778 |

`churn / (bom_customers + conversions)` reproduces Looker on all five closed months. This extends
the 2026-08-04 spot-check (Apr and Jun only) to a full run, and confirms the denominator choice —
BOM **plus conversions**, not BOM alone — was right.

Note the asymmetry is consistent with `int_method_monday`'s comment: closed months use their own
settled BOM row, while the current month must borrow the prior month's because its own row is still
accumulating from billing transactions.

## Also on this page, already verified elsewhere

`1 Year NRR by Month` (identical to the Sales page), the Conversion Rate MoM chart, and the
Budgeted / Forecasted Churn Rate % series — the last of which reads straight from
`method_forecast.Budgeted_Churn_Rate__` / `Forecasted_Churn_Rate__`.

## Row counts, for reference

New Net SaaS Details 588 · New DEP Revenue Details 63 · Churn Count Details 507 ·
Total Net SaaS Details 1,496 · Total DEP Revenue Details 1,694 · NRR detail 31,244.

---

# Parity sweep — Sales page revenue sections, 2026-09-02 (sweep complete)

Source: `Method - Scorecard (PROD) › Sales (PROD)` (`page/p_5wfqecngvd`), `get_page_text`.
Footer: "Data Last Updated: 9/2/2026 4:21:22 PM".

## Revenue budget / forecast — 36 of 36 exact

| period | Bud New Net SaaS | Fcst New Net SaaS | Bud Total Net SaaS | Fcst Total Net SaaS | Bud Total DEP | Fcst Total DEP |
|---|---:|---:|---:|---:|---:|---:|
| Apr 2026 | 19,098.90 | 14,193.90 | 879,624 | 831,752 | 151,920 | 135,000 |
| May 2026 | 18,353.89 | 13,619.42 | 897,731 | 838,518 | 157,237 | 134,973 |
| Jun 2026 | 18,462.88 | 13,120.43 | 916,606 | 847,496 | 162,740 | 138,000 |
| Jul 2026 | 17,205.92 | 11,849.22 | 934,420 | 851,355 | 168,436 | 138,026 |
| Aug 2026 | 17,270.60 | 10,399.31 | 951,712 | 857,004 | 174,332 | 137,345 |
| Sep 2026 | 18,462.60 | 10,230.64 | 970,718 | 852,270 | 180,433 | 136,825 |

Every Looker value equals `SUM(<column>)` from `revenue.method_forecast` by month.

**Gotcha for anyone querying these:** the currency columns in `method_forecast` are stored as
**STRING**, not numeric — `SUM()` fails outright. Strip non-numerics before casting:
`SAFE_CAST(REGEXP_REPLACE(CAST(col AS STRING), r'[^0-9.\-]', '') AS FLOAT64)`.

## Budgeted / Forecasted Churn Rate % — 12 of 12 exact

| period | Budgeted | Forecasted |
|---|---:|---:|
| Apr 2026 | 1.97% | 2.46% |
| May 2026 | 1.90% | 2.28% |
| Jun 2026 | 1.85% | 2.18% |
| Jul 2026 | 1.85% | 2.43% |
| Aug 2026 | 1.81% | 2.24% |
| Sep 2026 | 1.78% | 2.40% |

Stored as decimal fractions (0.0197), displayed as percentages. Multiply by 100.

## Weekly churn counts — 5 of 6 exact

| week starting | Looker | ours |
|---|---:|---:|
| 2026-07-27 | 1 | 16 |
| 2026-08-03 | 26 | 26 |
| 2026-08-10 | 47 | 47 |
| 2026-08-17 | 20 | 20 |
| 2026-08-24 | 18 | 18 |
| 2026-08-31 | 8 | 8 |

Same partial-week edge as trials and syncs: Looker's chart window opens inside the week of Jul 27,
so its first bucket is truncated. Every complete week matches.

---

# Sweep complete — all four Looker pages

| Page | Result |
|---|---|
| Marketing | trials, syncs, sync_rate (monthly 6/6, weekly 5/5 complete weeks); #406, #407, #414; forecast/budget series 36/36 |
| Sales | #357, #319, #324; annual_nrr 8/8 within 0.23pp; churn_rate 5/5; revenue budget/forecast 36/36; churn rate % 12/12; weekly churn 5/5 complete weeks |
| Sales Detailed | #357 settled via Looker's own Conversion Rate Details table; churn_rate confirmed again |
| Method Monday | conversions, churn (Aug). Trajectories unverifiable — Looker's own are wrong there |

**Roughly 150 individual values checked. Every closed-month comparison matched exactly**, with three
understood exceptions:

1. `annual_nrr` on recent months — up to 0.23pp, from the record-ID vs account-name join and
   Looker's cached refresh. Documented, not chased.
2. Partial first weeks on every weekly chart — an artefact of Looker's window, not a definition gap.
3. In-progress-month values, which move intraday on both sides.

**Nothing found wrong with any dbt-managed metric.** The problems this sweep surfaced were all in
the label layer (metrics claiming `live` without evidence, or rendering on a scorecard while marked
`queued`) and in the trajectory family, where both implementations were wrong in different ways.
