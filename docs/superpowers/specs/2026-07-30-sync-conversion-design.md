# Sync Conversion Rate — Sales Scorecard

**Date:** 2026-07-30
**Requester:** Nelson De Miranda (relaying a leadership-team ask)
**Owner:** Nic

## The request

Leadership asked Nelson to report conversion on **Sync** in addition to conversion on **Trials**. His ask: duplicate the Conversion Rate area of the Sales Scorecard so it reflects FirstInvoice ÷ Sync, and keep the existing trials-based area intact.

Both sections live on the same page. Neither replaces the other.

## Scope

Two things ship together.

1. A new **Sync Conversion Rate** section on the Sales Scorecard.
2. The fixes that make the *existing* Conversion Rate section correct, because two of its KPIs are known-wrong and duplicating the section would clone the errors.

Explicitly out of scope, tracked separately in [TICKETS.md](../../../TICKETS.md): the `v_customer_bom` view for Churn Rate (344), the Conversions Budget shell (279), and the semantic-layer migration of the remaining inline SQL.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Sequencing | Fix the conversion section, then duplicate | Metrics 296 and 357 are broken *inside* the section being copied |
| Sync denominator | Same-month, no lag | Matches live #301 and matches how the budget ratio is computed |
| Metric home | dbt models | Definitions belong in `config.meta`; visible to the metrics MCP |
| Budget/forecast lines | Build them, derived | Without them the section loses 3 of 7 KPIs and all four reference series |
| Placement | Directly below Conversion Rate, same page | Nelson asked to keep the trials view; adjacency is the point |

### On the denominator convention

The trials rate does not use same-month trials. It divides by `(prior-month trials + forecasted trials) / 2` — a deliberate one-month lag, because trials convert about a month later.

The sync rate uses no lag. Conversions in month M ÷ syncs in month M.

Two reasons. The sync-to-invoice gap is short, so a lag is not warranted. And the budget ratio is necessarily same-month, so actuals and budget are computed the same way.

A side benefit. Because both sides of the sync ratio are same-month, the current month is partial on the numerator *and* the denominator, so the ratio stays roughly stable through the month. The trials panel does not have that property — its numerator is partial while its lagged denominator is full-month, which is why it reads 9.60% on the 22nd and lands near 13% at month end.

**Consequence, and it must be stated on the dashboard:** the two rates are not comparable in level. The trials rate runs 9–17%, the sync rate 24–33%. They are comparable in *trend* and in *attainment versus budget*, which is what leadership is actually asking for.

## Verified inputs

The arithmetic core rests on dbt-managed, parity-matched views.

| Metric | Model | Parity | Date |
|---|---|---|---|
| Trials #54 | `v_metric__trials` | 5 months, penny-match | 2026-05-08 |
| Syncs #55 | `v_metric__syncs` | 10+ months, penny-match | 2026-05-08 |
| Conversions #56 | `v_metric__conversions` | 6 months, penny-match | 2026-05-14 |
| Sync-to-Conversion Rate #301 | `v_metric__sync_to_conversion_rate` | Range check only, 24–33% | 2026-05-14 |

`v_metric__sync_to_conversion_rate` is reused as-is for the actual monthly rate. No new model needed for it.

Note that #301's verification is weaker than its parents'. It is `status: live` on the strength of two verified inputs, not its own parity run against a source of truth. The reconciliation gate below closes that.

### Unverified input

`revenue.method_forecast` is an `EXTERNAL` table federated over a Google Sheet. No description, not a dbt source model, never parity-checked. All four budget and forecast series depend on it.

This is not new exposure — the existing trials panel already reads from it. It is recorded here so nobody claims the chain is fully verified.

### Interim fix — two forecast tables now exist

`revenue.method_forecast`'s autodetected schema types `Forecasted_Trials`, `Forecasted_Syncs`, and `Forecasted_Conversion` as `INTEGER`. BigQuery rounds every daily fractional value before it can be summed. June 2026 held 20.6667/day in the sheet; the table returned 21/day. Summed over the month, 630 became 620.

`revenue.method_forecast_typed` is the same sheet, same federation options, same column list, with those three columns typed `FLOAT64`. Verified cell-by-cell against the sheet.

Three dbt models now read `method_forecast_typed` instead of `method_forecast`: `v_metric__sync_conversion_rate_budgeted`, `v_metric__sync_conversion_rate_forecasted`, and `v_metric__trial_conversion_rate_lagged`. Three inline queries in `sales-scorecard.js` were repointed the same way: `WEEKLY_BUDGET_SYNC_CONV_RATE_SQL`, `WEEKLY_FORECAST_SYNC_CONV_RATE_SQL`, and `WEEKLY_CONVERSION_RATE_SQL`.

`Budgeted_Conversion_Rate` and `Forecasted_Conversion_Rate` were already `FLOAT64` on `method_forecast` and are unaffected. The weekly WoW chart lines (`__wk_budget_convrate`, `__wk_forecast_convrate`) and the `FORECAST_WEEKLY`/`FORECAST_WEEKLY_CAST`/`FORECAST_WEEKLY_MAX` helpers still read those pre-computed rate columns off `method_forecast` directly. `models/marketing/int_channel_funnel_trajectory.sql` also still reads `method_forecast` and was left alone — it is out of scope here.

Measured effect. Forecasted sync conversion rate, July 2026: 27.27% before, 24.65% after. Metric 357: June 2026 moved 11.65% → 11.75% and July 2026 moved 14.14% → 14.11%, both now matching Looker. April and May were already exact and stayed exact.

This is an interim fix, not the resolution. The correct fix is to retype `method_forecast` itself, which would also correct the panels that still read it directly. That requires a BigQuery permission this work did not have. Once `method_forecast` is retyped, drop `method_forecast_typed` and point these six places back at `method_forecast`.

## Part 1 — Fix the existing section

### Metric 296, Conversions Trajectory

Ours reads ~86 where Looker reads 75. Root cause: we divide by `day_of_month - 1`.

Derived from Nelson's screenshot: Conversion = 51, Conversion Trajectory = 71.86, and `51 ÷ 22 × 31 = 71.86` exactly. So Looker counts conversions through *yesterday* and divides by `EXTRACT(DAY FROM CURRENT_DATE())`, then scales by days in month.

The fix candidate recorded in TICKETS.md guessed `day_of_month + 1`. That is wrong. It is plain `day_of_month`.

This must be confirmed against one live Looker read before it lands. The screenshot is a single data point and the arithmetic could be coincidence.

Metrics 321, 322, and 323 recompute automatically once 296 is right.

### Metric 357, Conversion Rate

Currently returns empty. It is not `v_metric__trial_to_conversion_rate` (#302) — #302 is same-month and runs 15–20%, while the panel shows 9.60%.

The panel's number is conversions over a lagged denominator: `conversions in M ÷ ((trials in M-1 + forecasted trials in M) / 2)`. Same denominator as `WEEKLY_CONVERSION_RATE_SQL` already in the scorecard config, at monthly grain.

No month-to-date special-casing is needed. The numerator is simply whatever conversions landed in that month, which is naturally partial for the current month and complete for closed ones. That partialness is exactly why the panel reads 9.60% mid-month while closed months read 12–15%.

It gets a dbt model rather than a Supabase patch, so the definition lives in one place.

## Part 2 — New dbt models

Seven models in `models/metrics/`, landing in `revenue_metrics` per the `+schema: metrics` config. Each ships with a `.yml` carrying `config.meta` (answers, grain, filters, parity_verified, caveats) and `labels`.

All seven start `status: queued`. Nothing flips to `live` without Nic's explicit approval, and nothing flips without an entry in [docs/metric-definitions.md](../../metric-definitions.md) per the CLAUDE.md rule.

| Model | Formula | Purpose |
|---|---|---|
| `v_metric__conversions_trajectory` | conversions through yesterday ÷ `day_of_month` × days in month | Fixes 296; one row, current month |
| `v_metric__syncs_trajectory` | syncs through yesterday ÷ `day_of_month` × days in month | Sync equivalent; one row, current month |
| `v_metric__sync_conversion_rate_trajectory` | conversions trajectory ÷ syncs trajectory | Section KPI |
| `v_metric__sync_conversion_rate_budgeted` | `SUM(Budgeted_Conversion) ÷ SUM(Budgeted_Syncs)` by month | Section KPI + reference line |
| `v_metric__sync_conversion_rate_forecasted` | `SUM(Forecasted_Conversion) ÷ SUM(Forecasted_Syncs)` by month | Section KPI + reference line |
| `v_metric__sync_conversion_rate_weekly` | conversions ÷ syncs by ISO week (Monday) | WoW chart |
| `v_metric__trial_conversion_rate_lagged` | conversions in M ÷ ((trials in M-1 + forecasted trials in M) / 2) | Fixes 357 |

Two notes on the SQL.

The trajectory models return exactly one row, keyed to the current month. Trajectory is meaningless for a closed month — the actual is the answer there. Documented in each `.yml`.

The budget and forecast models sum daily allocations before dividing. `method_forecast` stores `Budgeted_Conversion` and `Budgeted_Syncs` as daily rows, so `SUM ÷ SUM` is correct. This differs from the existing panel's `MAX(Budgeted_Conversion_Rate)`, which is right for a pre-computed rate but wrong for a derived one.

### Supabase repointing

Metrics 295 and 296 get their `chart_sql` repointed at the new dbt views instead of carrying their own logic. Metric 357 likewise. This shrinks the ticket-5 debt rather than growing it.

## Part 3 — Scorecard section

New section in [builder/src/config/scorecards/sales-scorecard.js](../../../builder/src/config/scorecards/sales-scorecard.js), immediately after "Conversion Rate".

```
title: 'Sync Conversion Rate'
layout: 'scorecard-row'
```

Seven KPIs, in the same order and with the same labels as the trials section so the two columns read as a matched pair:

1. Conversion — #56, `number`, `showDelta`
2. Conversion Trajectory — new trajectory model, `number`
3. Forecasted Sync Conversion Rate — new, `decimal_rate`
4. Sync Conversion Rate — #301, `decimal_rate`, `showDelta`
5. Sync Conversion Rate Trajectory — new, `percent`
6. Forecast vs. Trajectory — derived, `percent`
7. Forecasted Attainment — derived, `percent`

KPIs 1 and 2 are identical to the trials section by design. Same numerator, and the visual parallel is what Nelson asked for.

Two charts, mirroring the existing pair exactly — same types, same colors, same `lastNMonths`:

- **Sync Conversion Rate Week Over Week** — line. Budgeted (`#a3c771`), Forecasted (`#e84393`), actual (`#2563eb`). `lastNMonths: 2`.
- **Sync Conversion Rate Month Over Month** — bar. Budgeted (`#1e3a5f`), Forecasted (`#2563eb`), actual (`#9dc3e6`). `lastNMonths: 4`.

Per the chart-builder philosophy in CLAUDE.md, no columns or series beyond these. Nothing auto-injected.

### Cross-reference requirement

Nic's acceptance condition: the new numbers must be checkable against what already exists. Three mechanisms.

**Adjacency.** Both sections on one page, identical KPI order, labels, formats, and colors. Any divergence in shape is visible without scrolling.

**A level-comparability note.** The section header carries a one-line caveat that the trials rate is lagged and the sync rate is not, so the two percentages are not the same kind of number. Trend and attainment compare; level does not.

**Looker parity.** Every KPI in both sections gets a recorded side-by-side against the live Looker Sales Scorecard before the page leaves `pending`. Values and date of comparison go in the spec's parity table.

## Part 4 — Verification

### Snapshot discipline

Per CLAUDE.md, any view whose DDL changes gets its canonical query captured before the change, re-run after, and diffed row by row. No "looks in range" — actual prior values against actual new values.

This applies to metrics 295, 296, and 357. The seven new models are net-new, so there is no prior state to diff; they get a Looker comparison instead.

### Denominator reconciliation gate

Before the sync rate goes leadership-facing, one query compares three sync definitions over 12 months:

1. Event-grain syncs — `COUNT(*)` from `int_syncs`, what #55 does today.
2. Entity-grain — `COUNT(DISTINCT EntityRecordID)` from `int_syncs`.
3. `Account.CustDatFirstSyncCompleted`.

Why this matters. #55 documents ~9–13% inflation from re-syncs: 91% of entities have exactly one sync event, 9% have two or more. Separately, [models/_sources.yml:141](../../../models/_sources.yml:141) records that the region-based sync signal undercounts completed syncs and that `CustDatFirstSyncCompleted` is the preferred completion field.

Two documented biases pointing opposite ways, net effect unmeasured. Leadership will read "conversion on Sync" as *the share of synced accounts that convert*, and an inflated denominator makes that read low.

The reconciliation does not have to change the metric. It has to be on record, with the gap quantified, so the caveat is specific instead of hand-waved. About an hour.

#### Findings — run 2026-07-31

Script: [scripts/reconcile_sync_denominators.py](../../../scripts/reconcile_sync_denominators.py). Read-only, re-runnable.

Twelve closed months, July 2025 through June 2026.

| Candidate | 12-month total | Grain | Dated by | Rate |
|---|---|---|---|---|
| 1. Sync rows — what #55 counts | 4,510 | Account | Signup | 27.27% |
| 2. Distinct entities that synced | 4,444 | Customer | Signup | 27.68% |
| 3. `Account.CustDatFirstSyncCompleted` | 4,309 | Account | Sync completion | 28.54% |
| 4. Either signal, upper bound | 4,573 | Account | Earliest evidence | 26.90% |
| 5. #55's population, re-dated | 4,245 | Account | Sync completion | 28.98% |
| Conversions (numerator) | 1,230 | Account | First SaaS invoice | — |

The two gap percentages.

- Account-vs-entity fan-in, #1 over #2: **+1.5%**
- Preferred-field gap, #3 over #1: **−4.5%**

Both are small, and neither is distorted by a single month. Fan-in ranges +0.0% to +3.2%. The field gap ranges −9.0% to +0.2%, mean −4.5%.

Candidate 1 reproduces live #301 exactly, month by month, to full float precision. So the shipped metric's basis is confirmed, not assumed.

**Candidate 5 is the one the dating finding implies, and it is the most decision-relevant of the five.**

`CustDatFirstSyncCompleted` is a `Funnel` column, populated on 94.4% of Sync rows. So re-dating the denominator by sync completion is separable from changing its population — it needs no join and no new source, just one more column in `models/intermediate/int_syncs.sql`.

Candidate 5 is exactly #55's population with only the date basis changed.

- Re-dating only, #5 over #1: **−5.9%**
- The rate moves **up 1.70 pp**, from 27.27% to 28.98%

Note the direction. Re-dating moves the rate *away* from the "inflated denominator makes the rate read low" framing this gate was opened on, not toward it.

Computed here as evidence only. Actually re-dating `int_syncs` has blast radius on live #55 and #300 and is the metric owner's call.

**The #55 yml caveat is wrong on two counts and should be corrected.**

`revenue.Funnel` is not an event log. It is a view over `revenue.Account` with three `UNION ALL` branches; the Sync branch is `SELECT SignupDate AS Date ... WHERE SyncTypeRegion != ""`. So one row per account, by construction.

There are therefore zero repeat sync events, and the "re-syncs after disconnect/reconnect" mechanism the yml describes cannot occur. The 9% of entities with two or more rows are customers who own more than one account.

The ~13% figure is also the wrong window. It is the all-time cumulative fan-in. At the monthly grain the metric actually carries, the fan-in is +1.5%.

| Window | Fan-in |
|---|---|
| All time | +12.7% |
| 12-month | +6.2% |
| Monthly grain | +1.5% |

**Only candidates 1, 3, 4 and 5 are comparable to each other.**

Candidate 2 is customer-grain. It counts a different unit from the numerator and from every other candidate. Moving the denominator to it would take the metric *away* from the leadership reading, not toward it.

`revenue.Account` is unique on `RecordID` — 146,663 rows, 146,663 IDs. The ~1.22 rows-per-`EntityRecordID` hazard in CLAUDE.md is about `EntityRecordID`, not `RecordID`. The script asserts the uniqueness on every run and exits non-zero if it ever stops holding, so the dedup cannot rot into a silent no-op.

**The `_sources.yml:141` undercount warning does apply here, and the net gap understates it.**

`int_syncs` membership is exactly `SyncTypeRegion != ""` — that is the Sync branch's `WHERE` clause. So the denominator is built on the signal that file warns about.

| All-time, filtered accounts | 2019+ | pre-2019 | Total |
|---|---|---|---|
| In `int_syncs` (region signal) | 38,363 | 28,804 | 67,167 |
| `CustDatFirstSyncCompleted` set | 36,138 | 33,098 | 69,236 |
| In both | 35,934 | 27,504 | 63,438 |
| Region only, no completion date | 2,429 | 1,300 | 3,729 |
| Completion date only, missed by #55 | 204 | 5,594 | 5,798 |

Net gap is +3.1%. Symmetric difference is 14.2%.

The two signals disagree about *which* accounts about four times more than about *how many*.

The era split explains why the gap flips sign by window — the field looks better all-time (+3.1%) but worse over the last 12 months (−4.5%). 96.5% of the field's population advantage sits in pre-2019 cohorts. Same field, different eras.

**Unanticipated: `int_syncs.SyncDate` is the signup date, not the sync date.**

This is a tautology of the `Funnel` DDL, not an empirical coincidence. The Sync branch selects `SignupDate AS Date`. It is the same column, aliased.

So Syncs #55 measures *accounts that signed up in month M and have since completed a sync*. It is a signup-cohort measure, not an event-timing measure.

Two consequences follow.

Recent months grow after they close, but only slightly. Measured directly across 15 signup cohorts, the share of a month's sync rows whose sync completed after that month ended runs **0.8% to 4.7%**.

Caveat on the blended lag figure: 18.9% of all rows complete their sync more than 30 days after signup, but that number is a pre-2019 artifact and must not be quoted. Pre-2019 cohorts sit at 43.0%; every cohort since 2019 sits at 0.3–0.6%.

The numerator is event-dated while the denominator is signup-dated. Only 50.2% of month-M conversions signed up in month M. So the shipped ratio pairs two different populations that share a month label.

This undercuts the *first* of the two reasons given above for using no lag. "The sync-to-invoice gap is short" holds only if the denominator is sync-dated. It is signup-dated — the same basis as Trials #54, which this spec deliberately lags by one month for exactly this reason.

The second reason is untouched. The budget ratio is necessarily same-month, so computing actuals the same way keeps attainment comparable. For an attainment scorecard that is arguably the binding reason, and it survives this finding intact.

Sync Rate #300 is unaffected. Syncs ÷ Trials puts signup-cohort counts on both sides.

**Practical consequence for the shipped number.**

Measured on the same accounts on both sides — of the accounts that signed up in month M and synced, the share that ever converted — the rate is 26.25% for the last 12 months, against a shipped 27.27%.

So on this window the shipped metric reads **+1.02 pp** against the "share of synced accounts that converted" reading.

That is a measurement of this window, not a standing property of the metric.

| Window | Shipped | Cohort read | Gap |
|---|---|---|---|
| Current 12 months | 27.27% | 26.25% | +1.02 pp |
| Prior 12 months | 24.00% | 23.99% | +0.02 pp |

The gap is window-dependent. It nearly vanishes on the preceding window, so the two bases agree closely in aggregate and no directional bias should be claimed from it. Quote it with the prior window beside it.

**One caveat that limits all of the above.**

Every re-dated candidate and the −4.5% gap rest on `CustDatFirstSyncCompleted`, whose operational meaning is unestablished. 63.6% of rows carry a completion date exactly equal to `SignupDate`, and 222 rows are dated *before* signup, the earliest by 2,443 days. Same-day could be genuine onboarding sync or a backfill artifact; pre-signup dates cannot be real.

Until someone who owns the field explains that distribution, treat candidates 3 and 5 as directional.

**Does the gap change the recommendation?**

No, for the denominator. Keep #55 in the shipping section. It is already account-grain, which is what leadership means by "synced accounts," and the biases measured here are +1.5%, −4.5% and −5.9% — none large enough to hold up the section.

Yes, for the caveats and the lag question. Four things must land before the section is leadership-facing.

Correct the #55 yml caveat. The mechanism is multi-account customers, not re-syncs, and the monthly-grain figure is +1.5%.

State the signup-cohort dating on the dashboard, with the 0.8–4.7% retroactive growth on recent months.

Reopen the no-lag decision with Justin. Its first stated reason does not survive the dating finding; its second does.

Get `CustDatFirstSyncCompleted`'s meaning confirmed before candidate 5 is used for anything but evidence.

### Justin sign-off

The budgeted and forecasted sync conversion rates are derived — `Budgeted_Conversion ÷ Budgeted_Syncs`. Justin never published that ratio. He is the methodology authority on the revenue family, so he confirms the derivation before the section is leadership-facing.

### Definition of done

- [ ] Metric 296 divisor confirmed against a live Looker read, then fixed
- [ ] Metric 357 returns values matching the Looker panel
- [ ] Seven new dbt models built, `dbt run` clean, descriptions rendering in BQ
- [x] Denominator reconciliation run and recorded
- [ ] `v_metric__syncs.yml` caveat corrected — mechanism and monthly-grain figure
- [ ] Signup-cohort dating and 0.8–4.7% retroactive growth stated on the dashboard
- [ ] No-lag decision reopened with Justin — first reason falls, second holds
- [ ] `CustDatFirstSyncCompleted` meaning confirmed before candidate 5 is acted on
- [ ] Every KPI in both sections compared side-by-side against Looker, values recorded
- [ ] Justin has confirmed the derived budget ratio
- [ ] Nic has approved flipping the seven models from `queued` to `live`
- [ ] `docs/metric-definitions.md` entry written for each new metric
- [ ] Scorecard flipped from `pending`, built, and pushed to GitHub Pages

## Sizing

| Part | Estimate |
|---|---|
| Fix 296 and 357 | 1 day, mostly confirming Looker's formula |
| Seven dbt models + yml | 1 day |
| Scorecard section | half a day |
| Reconciliation + Looker parity pass | half a day |

About 3 days, assuming Looker access to confirm the trajectory formula and a same-week turnaround from Justin.

## Risks

**The trajectory formula rests on one screenshot.** `51 ÷ 22 × 31 = 71.86` is exact, which is strong, but it is a single observation. If a live Looker read disagrees, part 1 reopens and the trajectory models change with it.

**`method_forecast` is a spreadsheet.** A column rename or a shifted header row breaks four series silently. Federated-sheet reads also need the Drive scope on any service-account path.

**#301's own parity is a range check.** If the reconciliation shows the event-grain denominator is materially off, the honest fix may be a new entity-grain sync metric — which is a larger change than this spec covers, and would need its own round.

## Remaining gates

Task 10 wrote the parity script, filled in `docs/metric-definitions.md` for all nine metrics (#295, #296, #357, #400–#405), corrected the two known-wrong caveats (`v_metric__syncs_trajectory.yml`'s re-sync claim, and the missing #302-exceedance caveat on `v_metric__trial_conversion_rate_lagged.yml`), fixed `display_format` on the six new Supabase metrics, and closed out the root-cause tickets. It deliberately did **not** perform any of the steps below — each needs a specific human who was not available on that run. Nothing has been flipped `live`, `pending` has not been touched, and no `parity_verified` block carries a real reading. What is left, in order:

1. **Read the live Looker Sales Scorecard and record the parity table.** Run `scripts/parity_sync_conversion_vs_looker.py`, open Looker, and fill in the blank column by hand for every row, with a timestamp — mid-month values move hour to hour. The trials-side rows (#56, #296, #357) must match Looker; the sync-side rows have no Looker counterpart and get recorded as first-observation values, not matches.
2. **Confirm the #296 divisor against that read.** The `day_of_month` derivation rests on one screenshot (`51 ÷ 22 × 31 = 71.86`). If step 1's live read disagrees, Part 1 reopens and the trajectory models change with it — do not force a match.
3. **Paste the results into the seven `parity_verified` blocks** in `models/metrics/*.yml`, replacing every `PENDING` pair with the timestamped read (or "first observation, no Looker counterpart" for the sync-only rows), and mirror the confirmed values into the corresponding `docs/metric-definitions.md` entries.
4. **Get Justin's sign-off on the derived budget ratio.** Send him step 1's output with the #401/#402 rows highlighted and ask whether `Budgeted_Conversion ÷ Budgeted_Syncs` (and the forecasted twin) is what he'd sign off on as revenue methodology authority. Do not promote #401 or #402 without his answer.
5. **Get Nic's approval to promote.** Show him the parity table, the Task 7 denominator-reconciliation output, and Justin's answer. Only on his explicit approval: flip `status: queued` → `status: live` for all nine metrics (dbt yml **and** Supabase), add `verified_at` with the parity date, then rebuild — narrowly, `--select` naming exactly these seven models plus `assert_trajectory_invariants` and `assert_sync_conversion_rate_sane` — never the wildcard.
6. **Flip the scorecard off `pending`** (`builder/src/config/scorecards/sales-scorecard.js` line 155, currently still `'pending'`) once and only once steps 1–5 are done.
7. **Build and deploy.** `cd builder && npm run build`; stage explicitly (`git add models/metrics tests docs/metric-definitions.md TICKETS.md builder/src/config/scorecards/sales-scorecard.js builder/dist` — never `-A`, the tree carries unrelated net-saas work in progress); confirm `git show --stat HEAD` has no `netSaas*` file; push to `main`; then open `https://nickperaltab.github.io/method-metrics/` and confirm both conversion sections render with real numbers on the *deployed* page before calling it live.
8. **Reply to Nelson.** Tell him what shipped, where to find it, and the two caveats in plain language: the sync denominator is signup-dated syncs (not sync-completion-dated), and the sync rate and trials rate are not comparable in level — only in trend and attainment. He is going to be asked why the sync number reads roughly 25–33% while the trials number reads roughly 9–17%, and needs the answer before someone else asks it.
