# Method Metric Definitions

**Purpose:** Every metric Method publishes has its definition documented here, using the template in §1. This is the single source of truth for *what each metric means* — not just the SQL.

**Why this exists:** SQL that compiles and parity-checks against historical values can still be answering a different question than the metric's name implies (we caught this on Syncs and Sync Rate in May 2026 — both ship as account-event counts but the name implies entity counts). This doc forces a name-vs-math reconciliation before a metric goes live.

**Rule (also in CLAUDE.md):** A metric does not get `status: live` in dbt + Supabase until it has a filled-in definition here.

---

## 1. The metric definition template

When defining or migrating a metric, fill out every field. Don't skip fields by guessing — leave them as `TBD` and resolve them before flipping the metric to `live`.

```markdown
### #<id> <Metric Name>

**What it answers in one sentence:** <plain-English business question>

**The math:**
```sql
<exact SQL: aggregation, source table, filters, grouping>
```

**Grain:** <event-level | account-level | customer-level | period-only>
  ↑ critical: a customer with 2 accounts is 2 in account-grain, 1 in customer-grain

**Filters / exclusions:**
- <each filter or exclusion, with WHY it exists>
- e.g. "IsConversionException = FALSE — excludes test accounts and internal Method Integration partner rows"

**Methodology source:**
<where the canonical definition came from — Excel file, CEO confirmation date,
Justin's verified-queries file, etc.>

**Parity-verified against:** <source + date + values matched>
  ↑ if not yet verified, say "TBD — needs solver run" and don't ship as live


**Status:** <live | queued | under_review>

**⚠️ Limitations / use-with-care:** *(leave blank if none)*
- <hard warnings about how the metric can/cannot be used — directional-only, small-sample, noisy, externally-dependent, etc.>
- e.g. "Use directionally only — Health Score algorithm not validated for absolute reporting; reliable for cohort comparison, not for single-point quotes"
- The most important entry here goes into the BQ description as the "warning sentence" (see §2a)

**Known caveats / things consumers should know:**
- <smaller things — FX, in-progress month, exclusion details>
- <e.g. "pre-FX — all currencies at face value">
- <e.g. "current month is incomplete; values for in-progress month understate">

**Used by:**
- <Method Monday section, AC audience, Looker dashboard, scorecard, etc.>
```

---

## 2. Process — when do you fill this out?

### When migrating an existing metric to dbt

1. Pull the canonical definition from Supabase (`semantic_table`, `semantic_measure`, `semantic_date_col`, `semantic_filters`, `chart_sql`).
2. **Snapshot the current values** per the CLAUDE.md "Snapshot before changing any BQ view DDL" rule.
3. Build the dbt model.
4. **Run `dbt run`, parity-check** against the snapshot.
5. **Fill out the metric definition in this doc** (you're not done until this is done).
6. **Audit the definition for "does the math match the name?"** — see §3 for the audit checklist.
7. If the audit finds ambiguity, mark `under_review` and surface for review (typically Nic for product/funnel questions, Justin for revenue methodology). Don't flip `live` until resolved.
8. Update Supabase `metrics` row to point at the new view + verified date.

### When creating a new metric from scratch

1. Start by filling out the definition in this doc. **Don't write SQL first** — write the business question first.
2. Get sign-off on the definition (especially the "what it answers" sentence and the methodology source) — typically a quick Justin review for revenue metrics, otherwise Nic decides.
3. Implement the dbt model that matches the definition.
4. Parity-verify against the source of truth (Excel, Justin's report, etc.).
5. Flip to `live` after parity is verified.

---

## 2a. How to write the BQ description (the thing consumers actually see)

The `description:` field in each `models/metrics/v_metric__*.yml` propagates to BigQuery's `INFORMATION_SCHEMA.TABLE_OPTIONS` at `dbt run` time. **This is the English explanation that every consumer sees** — anyone querying via Claude/MCP, the BQ console, BI tools, reverse-ETL pipelines. It's the first (and often only) thing they read about the metric.

### Who is this written for?

Imagine the person querying is one of these, and write so each can use the metric correctly without asking anyone:

- **A CRO or revenue leader** seeing a number in a dashboard, wondering "does this match the board deck?"
- **A salesperson** asking Claude "how many trials did we get this month?"
- **A marketing person** trying to figure out "is this just paid signups or all signups?"
- **A new analyst** writing their first ad-hoc query

These readers don't know about `intermediate/int_trials.yml`, "Registry UI", semantic_models, or what `simple` means in MetricFlow terminology. **No internal jargon. No file paths. No dbt vocabulary.**

### The format (2-5 sentences, ~50-100 words)

A good description has these parts, in order. The first three are mandatory; the fourth is only for metrics with real use limitations; the fifth is optional context.

1. **What it counts/measures — one plain sentence.** Start with "Monthly count of…" or "Dollar value of…" or "Fraction of…". Use the metric name's plain meaning. No SQL.
2. **The grain, explicitly.** "Account-grain — a customer with 2 accounts contributes 2 trials." Or "Customer-grain — one row per unique customer." Or "Pre-FX dollar values." This is the #1 source of confusion; it goes second so it's hard to miss.
3. **One key caveat or pointer.** "Excludes test accounts." Or "Current month is incomplete." Or "For unique-customer counts, use Customers (#373)." Pick the one most likely to bite a consumer.
4. **⚠️ Limitation / "use with care" warning, when applicable.** For metrics that should only be used a certain way — directional-only, small-sample, lagged, externally-dependent, etc. Treat this like a warning label on medication: short, sharp, in front of the consumer.
   - Examples: "Use directionally only — algorithm not validated for absolute reporting." • "Sample size <100; trust quarter-over-quarter, not month-over-month." • "Refreshed nightly; intra-day changes won't appear until tomorrow." • "Pulled from Forecast Sheet; if the Sheet is wrong, this is wrong." • "Aggregated only — do not export individual customer identifiers."
   - Start the sentence with the warning, not the explanation. The point is to catch the eye of someone about to misuse the metric.
5. *(optional)* **One sentence on consumer use** — "Appears in Method Monday's Acquisition section." Helps people understand the metric's role.

### Examples — bad vs. good

**Bad (current Trials description):**
> "Monthly trial-signup count, materialized for Registry UI and dashboard consumption. Materialization of the 'Trials' metric (#54), defined in intermediate/int_trials.yml as a `simple` metric (COUNT(*) of int_trials grouped by SignupDate)."
>
> ❌ Mentions internal file path (`intermediate/int_trials.yml`)
> ❌ Mentions dbt jargon ("`simple` metric")
> ❌ Mentions internal UI ("Registry UI")
> ❌ Doesn't mention the grain at all (an account-vs-customer landmine)
> ❌ Doesn't point to the alternative for unique customers

**Good (rewritten Trials description):**
> "Monthly count of Method accounts that began a trial. Account-grain — a customer with 2 trial accounts contributes 2 trials, by design. Excludes test accounts, internal Method Integration partner rows, and the '0001-01-01' sentinel. For unique-customer counts, use Customers (#373)."
>
> ✓ Plain English, no jargon
> ✓ Grain stated explicitly with a concrete example
> ✓ Filters mentioned at a high level
> ✓ Points to alternative metric to prevent misuse

### Rules

- **Never** mention dbt file paths, model names, or dbt-specific terminology (`simple`, `ratio`, `semantic_model`, etc.).
- **Always** state the grain explicitly with a one-clause example ("A customer with X has Y").
- **Always** mention the most likely confusion-causing caveat (FX, in-progress month, exclusions, account-vs-customer).
- **Add a "use with care" warning if the metric has real limitations** (directional-only, noisy, small-sample, externally-dependent). This is what prevents misuse in board decks and customer-facing reports.
- **Keep it short** (2-5 sentences, target ~50-100 words). The richer detail lives here in `metric-definitions.md`, not in BQ.
- **No SQL.** The math is in the SQL file; consumers don't read SQL.

The longer detail (full filter list with rationale, methodology source, parity-verified-against, etc.) stays in `metric-definitions.md` only — that's for the team building/maintaining metrics, not for consumers reading BQ.

---

## 3. Audit checklist — "does the math match the name?"

Run through every question for every metric before flipping `live`:

- [ ] **Grain match.** If the name implies "customers" but the math counts "accounts," that's a mismatch. Either rename the metric or refactor the math.
- [ ] **Event vs entity match.** If the name implies "people who did X" but the math counts "events of type X," there's likely re-event inflation. Verify the inflation is acceptable, or refactor.
- [ ] **Numerator and denominator match (for ratios).** "Sync Rate" = `syncs / trials` only makes sense as a "fraction who synced" if both numerator and denominator are entity counts at the same grain. Event-count ratios drift.
- [ ] **Filter match.** Does the metric exclude the same things the source-of-truth report excludes? (E.g., internal accounts, exception flags, sentinel dates.)
- [ ] **Currency / FX match.** Pre-FX vs FX-adjusted. Methodology source should specify.
- [ ] **Cohort definition match.** "Trials" by SignupDate cohort vs by AcquisitionMonth cohort — different.
- [ ] **Methodology consistency.** If `int_customer_mrr` uses symmetric Prepay Expiry exclusion, ALL derived metrics should inherit that — not silently drop it.

---

## 4. Currently dbt-managed metrics (20 — ALL live metrics complete 🎯)

These metrics are live in `revenue.v_metric__*` views, parity-verified, with full catalog metadata in BQ INFORMATION_SCHEMA.

> **🔑 Funnel-metric grain (locked 2026-05-12):** Method's funnel metrics — **Trials (#54), Syncs (#55), Sync Rate (#300), Conversions (#56)** — are intentionally tracked at **account-grain**, NOT customer-grain. A customer with 2 Method accounts that both signed up for trials shows as 2 trials. This is by design for funnel reporting.
> For customer-level analyses (unique companies, distinct customer counts), use **Customers (#373)** or — in the future — customer-grain marts (Phase 1.6).
> See §6 for the data-vs-intent caveat on Syncs.

---

### #54 Trials

**What it answers in one sentence:** How many Method accounts began a trial in each month?

**The math:**
```sql
SELECT
  FORMAT_DATE('%Y-%m', SignupDate) AS period,
  COUNT(*) AS value
FROM `project-for-method-dw.revenue.int_trials`
WHERE SignupDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
```

Where `int_trials` is the filter `SELECT * FROM revenue.Account WHERE IsConversionException = FALSE AND Partner != 'Method Integration' AND SignupDate != DATE('0001-01-01')`.

**Grain:** **account-level** (by design — see §4 top note). One row per Method account that began a trial. A customer with 2 trial accounts contributes 2 trials. This is canonical for Method's funnel reporting, not a flaw.

**Filters / exclusions:**
- `IsConversionException = FALSE` — excludes accounts flagged as not real conversions (test accounts, exception cases)
- `Partner != 'Method Integration'` — excludes internal Method Integration partner rows
- `SignupDate != DATE('0001-01-01')` — excludes the "no trial" sentinel value

**Methodology source:** Existing BQ view `int_trials`, pre-dbt convention. Definition unchanged in migration; dbt now owns the view.

**Parity-verified against:** Pre-migration BQ values for the 5 most recent months (Sep 2025 – May 2026), all penny-match (Round 3a, 2026-05-08).


**Status:** **live**

**Known caveats:**
- Account-grain by design — customers with multiple accounts contribute multiple trials. This is intentional. Use Customers (#373) for unique-customer counts.
- Current month is incomplete; partial values for the in-progress month.

**Used by:**
- Method Monday (Acquisition section)
- AI chart builder
- Trial-to-Conversion Rate (#302) as denominator

---

### #55 Syncs

**What it answers in one sentence:** How many sync milestone events were recorded in the Funnel pipeline in each month? (At account-grain by intent — see caveat below.)

**The math:**
```sql
SELECT
  FORMAT_DATE('%Y-%m', SyncDate) AS period,
  COUNT(*) AS value
FROM `project-for-method-dw.revenue.int_syncs`
WHERE SyncDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
```

Where `int_syncs` is `SELECT * FROM revenue.Funnel WHERE EventType = 'Sync'`.

**Grain:** **account-grain by intent** (per §4 top note — Method tracks funnel metrics at account level). Each row in Funnel is a sync milestone event. See caveats for the data-vs-intent nuance.

**Filters / exclusions:**
- `EventType = 'Sync'` — filters Funnel to sync milestone events only (not all activity)

**Methodology source:** Existing BQ view `int_syncs`, pre-dbt convention. Definition unchanged in migration.

**Parity-verified against:** Pre-migration BQ values (Round 3a, 2026-05-08), penny-match for 10+ months.


**Status:** **live** (per Nic confirmation 2026-05-12 that account-grain funnel tracking is canonical)

**Known caveats:**
- **Account-grain by intent — but Funnel's data keys events to `EntityRecordID`, not `RecordID`.** Funnel doesn't carry per-account identifiers. In practice this works out because most customers have one account, and Funnel events are tied to the lifecycle of an entity. A customer with 2 accounts will typically produce 1 sync event (one of their accounts hit the milestone), not 2.
- ~13% inflation from re-sync events: 91% of entities have exactly 1 sync event, 9% have 2+ (re-syncs after disconnect/reconnect). Method accepts this as part of the metric definition — re-syncs count.
- For an exact "count of unique entities that ever synced this month," use `COUNT(DISTINCT EntityRecordID)` instead — that's a different metric not currently in the live set.

**Used by:**
- Method Monday (Engagement section)
- Sync Rate (#300) as numerator
- AI chart builder

---

### #300 Sync Rate

**What it answers in one sentence:** What fraction of trial accounts produced a sync milestone in each month?

**The math:**
```sql
SELECT
  COALESCE(s.period, t.period) AS period,
  SAFE_DIVIDE(s.value, t.value) AS value
FROM revenue.v_metric__syncs s
FULL OUTER JOIN revenue.v_metric__trials t
  ON s.period = t.period
```

So: `SUM(sync events in month) / SUM(trial events in month)`.

**Grain:** **account-grain by intent** (per §4 top note). Period-level output (one value per month). Both numerator (Syncs) and denominator (Trials) are intended at account-grain — see Syncs (#55) caveats for the Funnel-data nuance.

**Filters / exclusions:** inherits filters from Trials (#54) and Syncs (#55).

**Methodology source:** Cross-model ratio defined in Supabase (#300). Numerator = #55 Syncs; denominator = #54 Trials.

**Parity-verified against:** Reconstructed-from-source for 10 months — `SAFE_DIVIDE(SUM(syncs), SUM(trials))` matches `v_metric__sync_rate` to 6 decimal places (Round 3a, 2026-05-08).


**Status:** **live** (per Nic confirmation 2026-05-12 that account-grain funnel tracking is canonical)

**Known caveats:**
- Account-grain by intent (denominator is account-grain Trials; numerator is Funnel-entity-grain Syncs — close enough for funnel reporting since most customers have one account).
- ~13% inflation in numerator from re-sync events (see Syncs #55 caveats). This is part of the metric definition — re-syncs contribute to the rate.
- "Sync Rate" here is "syncs per trial" volume ratio at account/event grain. Not the same as "% of unique customers who ever synced" — that's a different metric.

**Used by:**
- Method Monday (Conversion section)
- AI chart builder
- Forecast / budget comparison

---

### #373 Customers

**What it answers in one sentence:** How many unique paying Method customers had revenue activity in each month?

**The math:**
```sql
SELECT
  Month AS period,
  COUNT(DISTINCT EntityRecordID) AS value
FROM `project-for-method-dw.revenue.int_customers`
WHERE IsActive = TRUE
  AND Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
```

Where `int_customers` is the existing BQ view that aggregates `TransLineFlattened` to (EntityRecordID, Month) grain with `IsActive` classification.

**Grain:** **customer-level** (EntityRecordID). A customer with multiple Method accounts counts ONCE per month.

**Filters / exclusions:**
- `IsActive = TRUE` — applied to match Supabase's canonical filter. NOTE: this is **redundant** in practice — `int_customers` only contains customer-months with revenue activity, so all rows have `IsActive = TRUE`. Filter applied anyway for definitional consistency.
- Internal Method partner accounts already excluded upstream in int_customers (Partner != 'Method Integration' filter).

**Methodology source:** Existing BQ view `int_customers` + Supabase metric #373 semantic definition.

**Parity-verified against:** Pre-migration BQ values for 12 months (Jun 2025 – May 2026), all penny-match (Round 3b, 2026-05-12).


**Status:** **live**

**Known caveats:**
- Customer-grain. A customer with multiple Method accounts counts ONCE.
- Includes any customer with revenue activity in the month — not separately broken out into "new customer this month" vs "existing." For new customers specifically, use New Customers — Actual (#39).
- Current month is incomplete; partial values for the in-progress month.

**Used by:**
- Method Monday (Revenue section)
- ARPC calculations
- Customer count for ratio metrics

---

### #378 Monthly Start MRR

**What it answers in one sentence:** What was Method's total MRR at the start of each month, summed across all customers?

**The math:**
```sql
SELECT
  Month AS period,
  ROUND(SUM(StartMRR), 2) AS value
FROM `project-for-method-dw.revenue.int_customer_mrr`
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
```

Where `int_customer_mrr` computes per-(EntityRecordID, Month) MRR using Justin's P1/P2 cohort pattern with symmetric Prepay Expiry Income exclusion.

**Grain:** period-level (one $ value per month). Underlying aggregation is customer-month.

**Filters / exclusions (inherited from `int_customer_mrr`):**
- Internal Method accounts (`CompanyAccount NOT LIKE 'm11%' AND NOT LIKE 'm18%'`) — matches Looker and SaaS Analytics Engine filters
- **Symmetric Prepay Expiry Income exclusion** (CEO-confirmed 2026-04-28): customers whose entire Period-1 SaaS revenue was Prepay Expiry Income are excluded from BOTH StartMRR and Cancellations. Their actual churn was captured in an earlier monthly cohort.
- TxnDate >= '2021-12-01' (data quality floor)
- Excludes current incomplete month

**Methodology source:** `knowledge/verified-queries/int_customer_mrr.sql` — Justin's verified pattern. CEO methodology confirmation logged 2026-04-28.

**Parity-verified against:** Pre-migration BQ values for 11 months (Jun 2025 – Apr 2026), all penny-match (Round 3b, 2026-05-12).


**Status:** **live**

**Known caveats:**
- **Pre-FX** — all currencies at face value (USD, CAD, UK). If you want USD-equivalent, that's a different metric.
- Diverges from board-deck monthly retention by ~4–6bp because this view uses symmetric methodology while the board deck uses asymmetric (PE-only customers left in StartMRR but excluded from Cancellations).
- Current month NOT shown (int_customer_mrr excludes in-progress month).

**Used by:**
- Method Monday (Revenue section, foundation for Monthly GRR/NRR)
- Monthly GRR (#382), Monthly NRR (#383) as denominator
- AC reverse-ETL (potential — declining-MRR cohort audiences)

---

---

### #379 Monthly Cancellations ($)

**What it answers in one sentence:** How much MRR did Method lose from customer cancellations in each month?

**The math:**
```sql
SELECT Month AS period, ROUND(SUM(Cancellations), 2) AS value
FROM `project-for-method-dw.revenue.int_customer_mrr`
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
```

**Grain:** period-level. Underlying aggregation is customer-month.

**Filters / exclusions (inherited from `int_customer_mrr`):**
- Internal Method accounts (CompanyAccount NOT LIKE 'm11%' AND NOT LIKE 'm18%')
- **Symmetric Prepay Expiry Income exclusion** (CEO-confirmed 2026-04-28)
- TxnDate >= '2021-12-01'; excludes current incomplete month

**Methodology source:** `knowledge/verified-queries/int_customer_mrr.sql`. Justin-verified pattern.

**Parity-verified against:** Pre-migration BQ values for 6 months, all penny-match (Round 4, 2026-05-14).

**Status:** **live**

**Known caveats:**
- Pre-FX. Each currency at face value.
- Excludes one-time Prepay Expiry write-offs (per CEO methodology) — diverges from board-deck monthly retention by ~4-6bp.
- Current month NOT shown.

**Used by:**
- Method Monday (Revenue / Retention section)
- Monthly GRR (#382) as input
- Monthly NRR (#383) as input

---

### #380 Monthly Downgrades ($)

**What it answers in one sentence:** How much MRR did Method lose from existing customers paying less than the prior month (but not canceling) in each month?

**The math:**
```sql
SELECT Month AS period, ROUND(SUM(Downgrades), 2) AS value
FROM `project-for-method-dw.revenue.int_customer_mrr`
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
```

**Grain:** period-level.

**Filters / exclusions:** Same as #379 (inherited from int_customer_mrr).

**Methodology source:** `knowledge/verified-queries/int_customer_mrr.sql`. Justin-verified.

**Parity-verified against:** 6 months, penny-match (Round 4, 2026-05-14).

**Status:** **live**

**Known caveats:**
- Pre-FX.
- Distinction from Cancellations: downgrade = customer pays less; cancellation = customer pays zero. Both reduce MRR; tracked separately.
- Current month NOT shown.

**Used by:**
- Method Monday (Revenue / Retention section)
- Monthly GRR (#382) as input
- Monthly NRR (#383) as input

---

### #381 Monthly Expansions ($)

**What it answers in one sentence:** How much MRR did Method gain from existing customers paying more than the prior month in each month?

**The math:**
```sql
SELECT Month AS period, ROUND(SUM(Expansions), 2) AS value
FROM `project-for-method-dw.revenue.int_customer_mrr`
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
```

**Grain:** period-level.

**Filters / exclusions:** Same as #379 (inherited from int_customer_mrr).

**Methodology source:** `knowledge/verified-queries/int_customer_mrr.sql`. Justin-verified.

**Parity-verified against:** 6 months, penny-match (Round 4, 2026-05-14).

**Status:** **live**

**Known caveats:**
- Pre-FX.
- Existing customers ONLY — net-new customer revenue lives in a different metric (Start MRR contributes new customers separately).
- Current month NOT shown.

**Used by:**
- Method Monday (Revenue / Retention section)
- Monthly NRR (#383) as input — the "N" (net) part of NRR comes from expansions
- (Not used in GRR — gross retention excludes expansion)

---

---

### #56 Conversions

**What it answers:** How many Method accounts converted from trial to paying (received their first SaaS invoice) in each month?

**The math:** `COUNT(*) FROM int_conversions GROUP BY FirstSaaSInvoiceTxnDate (month)`

**Grain:** account-level. A customer with 2 converted accounts contributes 2 conversions.

**Filters:** Inherits from int_conversions — excludes IsConversionException accounts and Method Integration partners.

**Parity-verified:** 6 months, penny-match (Round 4, 2026-05-14).

**Status:** **live**

**Known caveats:** Account-grain by design. For unique-customer conversion counts, use Customers (#373) cohort analyses.

**Used by:** Method Monday (Conversion section), Sync-to-Conversion Rate (#301), Trial-to-Conversion Rate (#302).

---

### #59 Churn

**What it answers:** How many distinct Method customers canceled in each month?

**The math:** `COUNT(DISTINCT CompanyAccount) FROM int_cancellations GROUP BY CancellationDate (month)`

**Grain:** customer-level (uses DISTINCT). A customer with multiple canceling accounts in the same month counts ONCE.

**Filters:** Inherits from int_cancellations.

**Parity-verified:** 6 months, penny-match (Round 4, 2026-05-14).

**Status:** **live**

**Known caveats:** Account-count churn, not dollar churn. For MRR-lost-to-cancellations, use Monthly Cancellations ($) (#379).

**Used by:** Method Monday (Retention section).

---

### #301 Sync-to-Conversion Rate

**What it answers:** What fraction of sync milestones progressed to conversion that month?

**The math:** `SAFE_DIVIDE(conversions, syncs)` per period.

**Grain:** Period-level ratio. Both numerator and denominator are account/event counts.

**Parity-verified:** Sanity-checked against the live chart builder; values in 24-33% range.

**Status:** **live**

**Known caveats:** Uses event-grain Syncs (#55) in the denominator. Not a clean "% of sync cohort that converted" — see #55 caveats.

**Used by:** Funnel-stage analysis.

---

### #302 Trial-to-Conversion Rate

**What it answers:** What fraction of trials progressed to conversion that month?

**The math:** `SAFE_DIVIDE(conversions, trials)` per period.

**Grain:** Period-level ratio.

**Parity-verified:** Sanity-checked; values in 15-20% range.

**Status:** **live**

**Known caveats:** Conversions and Trials in the same month don't share a cohort — most conversions come from earlier-month trials. For cohort-locked conversion rate, a different metric is needed.

**Used by:** Method Monday (Acquisition / Conversion section), funnel-stage analysis.

---

### #384 Annual Start MRR + #385 Annual Cancellations ($) + #386 Annual Downgrades ($) + #387 Annual Expansions ($)

**What they answer:** Same as the monthly MRR family (#378-381), but at annual cohort grain — reported monthly via trailing comparison.

**The math:** `ROUND(SUM(X), 2) FROM int_customer_annual_mrr GROUP BY Month`, where X is StartMRR / Cancellations / Downgrades / Expansions.

**Grain:** Period-level (annual cohort comparison, reported monthly).

**Filters / methodology:** Same as int_customer_mrr — CEO-confirmed symmetric Prepay Expiry exclusion, internal Method accounts excluded.

**Parity-verified:** 5 months × 4 metrics = 20 / 20 penny-match (Round 4, 2026-05-14).

**Status:** **live** (all 4)

**Known caveats:**
- Pre-FX.
- Annual = trailing 12-month cohort comparison.
- Current month NOT shown.
- Diverges from board-deck annual retention by ~4-6bp per the symmetric methodology.

**Used by:** Method Monday (Revenue section, foundation for Annual GRR #388 / NRR #389).

---

### #382 Monthly GRR % + #383 Monthly NRR % + #388 Annual GRR % + #389 Annual NRR %

> 🛡️ **CEO-protected family.** Methodology was explicitly confirmed by Method's CEO on 2026-04-28 (symmetric Prepay Expiry exclusion). MUST NOT change without explicit CEO + Justin sign-off.

**What they answer:**
- **#382 Monthly GRR %** — Fraction of last month's MRR retained this month, excluding expansion. `(StartMRR - Cancellations - Downgrades) / StartMRR`. Typical 95-97%.
- **#383 Monthly NRR %** — Same with expansion. `(StartMRR - Cancellations - Downgrades + Expansions) / StartMRR`. Typical 97-99%.
- **#388 Annual GRR %** — Annual version. Typical 76-78%.
- **#389 Annual NRR %** — Annual NRR. Typical 88-90%.

**The math:** Cross-model `derived` metrics combining the MRR family inputs. See each `v_metric__*_grr.sql` / `_nrr.sql` for the formula.

**Grain:** Period-level fraction. Outputs as decimal (e.g., 0.965817 = 96.5817%).

**Parity-verified:** 5 months × 4 metrics = 20 / 20 spot-check match to 6 decimal places (Round 5, 2026-05-14).

**Status:** **live** (all 4)

**Known caveats:**
- Pre-FX.
- Symmetric Prepay Expiry methodology — diverges from board-deck retention by ~4-6bp.
- **For any number heading to the board or external reporting, reconcile against the board deck first.** These numbers will not penny-match the deck.
- Current month NOT shown.

**Used by:** Method Monday (Retention section, headline metrics). Board reporting (with deck reconciliation).

---

## 4b. Directional metrics (NOT live, NOT in revenue_metrics)

These are dbt-managed and documented, but deliberately **not** verified-grade. They live in `revenue` (not `revenue_metrics`), carry `status: directional`, and must never be quoted as accounting-grade.

### Channel ARR — `revenue.v_channel_arr` (directional)

**What it answers in one sentence:** For new customers acquired each month, what's the run-rate ARR by marketing attribution channel? (Replicates the marketing Looker "Revenue by Channel" dashboard.)

**The math:** per `(channel × first-invoice month)`, `SaaS = SUM(Custdatlastsaasamount × Att_<channel>)`; `ARPC = SaaS / SUM(Att)`; `ARR = ARPC × 12`; `CAD ARR = ((saas_us_portion × rate + saas_nonus_portion) / SUM(Att)) × 12`. FX rate applied downstream (the app page), so the view emits the pre-FX US/non-US split.

**Grain:** `(attribution channel × month)`. Month = `DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH)` — the new-customer acquisition cohort. Account-grain underneath (a company with 2 accounts contributes twice), attribution-fraction-weighted.

**Filters / exclusions:** `IsConversionException = FALSE`; `Partner != 'Method Integration'`; converted accounts only (`FirstSaaSInvoiceTxnDate` set); current incomplete month excluded; 24-month window.

**Methodology source:** reverse-engineered from the marketing Looker "Revenue by Channel" dashboard and penny-matched (see `scripts/parity_v_channel_arr.py`). Built on the **`int_attribution_fractional`** primitive — real multi-touch attribution (each customer's 1.0 of credit spread across the channels that touched them, weights sum to 1.0), distinct from the single-touch `AttributionChannel` dimension on int_trials/int_conversions.

**Parity-verified against:** the Looker dashboard, May 2026 — customers, SaaS, CAD ARR, and Avg First Invoice Revenue all match across all 8 channels (2026-06-01).

**Status:** **directional — verified** (parity-confirmed vs the Looker dashboard 2026-06-02 across all columns incl. the 3-mo rolling; metrics #390–399 stamped `verified_at`, scorecard `channel-arr` approved). Intentionally **NOT `live`** and NOT in `revenue_metrics`. ⚠️ Uses `Custdatlastsaasamount` (run-rate snapshot), a **documented exception** to the canonical-revenue-column rule (`SaaSAmount`). The exception is justified because ARR wants a recurring *rate*, not invoiced revenue — see the "run-rate / ARR carve-out" in `migrate-metric-to-dbt/SKILL.md`. It is directional, not accounting-grade, and will NOT reconcile to RevCogs/QuickBooks. The canonical run-rate would be `int_customer_mrr`-derived; this replicates the live marketing artifact instead.

**Known caveats:**
- Directional run-rate, ~10% fuzzy vs invoiced (plan-rate field misses discounts/prorations).
- Pre-FX; CAD conversion is currency-aware (US × rate, CAN/Other × 1) and applied by the consumer.
- "Avg First Invoice Revenue" is the only invoice-based column (attribution-weighted).

**Registered metric family (directional, ids #390–399):** Channel New SaaS run-rate (#390), US/Non-US SaaS (#391/#392), Attribution Value (#393), Unique Customers (#394), First Invoice weighted (#395) — all semantic measures on `int_attribution_fractional` grouped by `channel`; plus derived **Avg First Invoice (#396), ARPC (#397), ARR (#398), CAD ARR (#399)** (formula metrics → drill-down resolves the derivation chain). All `queued`/directional, stage `revenue`.

**Used by:** the **Channel ARR** scorecard (`/scorecards/channel-arr`) — a `channelTable` section (dimension rows × metric columns, month + USD→CAD filters, grand total, sortable, per-cell drill-down to the MetricInspector).

---

## 4c. MRR-movement decomposition (Seats / Apps / Price) — staging, NOT live

These three components split each customer-month's MRR change into Seats, Apps, and Price using a price–volume–mix decomposition. They become consumer-facing in the Net SaaS drilldown dashboard (the L2 split under Expansion and Downgrades). All three come from one model — `models/intermediate/int_mrr_movement_decomposed.sql` — and share the same grain, filters, methodology source, and parity evidence; the per-component sections below cover only what differs.

**Shared grain:** customer-month. One value per `EntityRecordID × month`, attributed to a `movement_kind` of new / expansion / downgrade / cancellation / flat. The three columns (`seat_mrr`, `app_mrr`, `price_mrr`) sum to the customer-month's total MRR change by construction: `seat_mrr + app_mrr + price_mrr = p2_saas - p1_saas`.

**Shared filters / exclusions (inherited from `int_customer_mrr_lines` and the model):**
- `TxnDate >= '2021-12-01'` — data-quality floor.
- Current incomplete month excluded — mid-month data shows false cancellations.
- Internal Method accounts excluded (`CompanyAccount NOT LIKE 'm11%' AND NOT LIKE 'm18%'`).
- **Symmetric Prepay-Expiry exclusion** applied to cancellations: a customer-month whose prior book was entirely "Prepay Expiry Income" is reclassified out of cancellation (to `flat`), matching the verified `int_customer_mrr` model. WHY: phantom prepay-expiry books were never real recurring SaaS, so their expiry is not a real loss. CEO-confirmed methodology, 2026-04-28.

**Shared methodology source:** price–volume–mix decomposition. Reference implementation: `scripts/decompose_mrr_movements.py`. Model: `models/intermediate/int_mrr_movement_decomposed.sql`.

**Shared parity-verified against (2026-06-03):**
- Identity (`seat + app + price = p2_saas - p1_saas`): `scripts/parity_mrr_decomposition_identity.py` — holds on all rows within $0.01.
- Reconciliation to the verified `int_customer_mrr` movement totals: `scripts/parity_mrr_decomposition_vs_customer_mrr.py` — $0.00 across all 96 (month, movement_kind) pairs over the trailing 24 months.
- Feeder line-rollup: `scripts/parity_customer_mrr_lines.py` — bit-exact (177,241 (month, entity) pairs, $0.00).

**Shared status:** **staging — validated 2026-06-03, NOT live.** The model lives in `revenue`/staging, not promoted to `revenue_metrics`, and is not yet wired to a live consumer.

**Shared caveats (apply to all three):**
- The Prepay-Expiry exclusion is currently evaluated at **entity grain**; it matches the verified company-grain definition only because every all-PE company is presently single-entity. The dbt guardrail test `tests/assert_no_mixed_multientity_pe_company_months.sql` fails loudly if that ever stops being true.
- The components decompose **Expansion and Downgrade** movements meaningfully. For New and Cancellation the change is the full book appearing or disappearing — the split still sums correctly but "seats vs apps vs price" is less analytically meaningful there.

---

### MRR Movement — Seats (`seat_mrr`)

**What it answers in one sentence:** How much of a customer-month's MRR change came from buying or dropping paid users on a module they kept?

**The math:** For a module (Service `ItemFullName`) present in both the prior and current month, `Δqty × prior unit-rate` — the change in paid-user quantity valued at the prior month's per-seat rate.

**Grain:** customer-month (see shared grain above).

**Filters / exclusions:** see shared filters above.

**Methodology source:** see shared methodology source above.

**Parity-verified against:** see shared parity evidence above.

**Status:** staging — validated 2026-06-03, NOT live (see shared status).

**Known caveats:**
- A quantity change on a continuing module is "seats"; a module added or dropped entirely is "apps" (see Apps).
- For a module with simultaneous quantity and rate changes, the price–volume–mix convention values Δqty at the prior rate (seats); the remainder is price. See the Price caveat.
- Plus all shared caveats above.

---

### MRR Movement — Apps (`app_mrr`)

**What it answers in one sentence:** How much of a customer-month's MRR change came from adding or dropping an entire module?

**The math:** For a module (Service `ItemFullName`) added or dropped entirely between the two months, the full `+/-` of that module's SaaS amount.

**Grain:** customer-month (see shared grain above).

**Filters / exclusions:** see shared filters above.

**Methodology source:** see shared methodology source above.

**Parity-verified against:** see shared parity evidence above.

**Status:** staging — validated 2026-06-03, NOT live (see shared status).

**Known caveats:**
- A module added or dropped entirely is "apps"; a quantity change on a continuing module is "seats" (see Seats).
- A plan migration that swaps one module for another reads as an app-drop + an app-add, not a price change.
- Plus all shared caveats above.

---

### MRR Movement — Price (`price_mrr`)

**What it answers in one sentence:** How much of a customer-month's MRR change came from a change in the per-seat rate on a module they kept, plus any change in discounts?

**The math:** For a module (Service `ItemFullName`) present in both months, the change in unit-rate — computed as the residual after the seat component — plus any change in Discount-line amounts.

**Grain:** customer-month (see shared grain above).

**Filters / exclusions:** see shared filters above.

**Methodology source:** see shared methodology source above.

**Parity-verified against:** see shared parity evidence above.

**Status:** staging — validated 2026-06-03, NOT live (see shared status).

**Known caveats:**
- Price is computed as a **residual** (total module change minus the seat component, plus discount-line changes). For a module with simultaneous quantity and rate changes, attribution between seats and price follows the price–volume–mix convention: Δqty valued at the prior rate is seats, the remainder is price.
- Plus all shared caveats above.

---

## 5. Status — Phase 1 complete 🎯

All 20 live metrics are now dbt-managed with consumer-facing descriptions and BQ catalog metadata. Parity-verified across all metrics.

The remaining work is structural, not metric-by-metric:
- **Phase 1.5** — Rename `v_*` intermediates to `int_*` (single one-shot PR)
- **Phase 1.6** — Marts layer (`dim_customers`, `dim_accounts`, `fct_*`) once evidence justifies it
- **Phase 1.7** — Frontend migration (tracker.html, chart builder read from BQ instead of Supabase)
- **Phase 2** — Cube / MetricFlow evaluation (only if external consumers materialize)

See `docs/dbt-roadmap.md` for the full plan.

---

## 6. Open definition questions

Things from the audit that need a business decision before the relevant metric flips `live`.

(Currently empty — Q1, Q2, Q3 below were resolved 2026-05-12.)

### Resolved questions

**Q1 — Sync Rate (#300) definition — RESOLVED 2026-05-12**
Account-grain (event-ratio) is canonical. Nic confirmed Method tracks Sync Rate at account-grain, not customer-grain. The current `SUM(syncs) / SUM(trials)` is the right math. Metric flipped to `live`. Documented as the canonical interpretation in §4. The "% of unique customers who ever synced" interpretation is a different metric, not currently in the live set.

**Q2 — Syncs (#55) naming/math alignment — RESOLVED 2026-05-12**
Same resolution. Sync events at account-grain are the canonical metric. The ~13% inflation from re-syncs is part of the definition by design — re-syncs count. Metric flipped to `live`.

**Q3 — Trials (#54) account vs customer grain — RESOLVED 2026-05-12**
Account-grain is canonical for Method's funnel reporting. A customer with 2 trial accounts = 2 trials, by design. Already documented in §4.

**Net effect of resolutions:** All 5 currently dbt-managed metrics are now `status: live`. Funnel-grain is documented at the top of §4 so future metrics (Conversions #56, Churn #59, ratios) inherit the same convention.

---

## 7. Cross-references

- [`knowledge/glossary.md`](../knowledge/glossary.md) — definitions of EntityRecordID, CompanyAccount, SaaSAmount, etc.
- [`knowledge/verified-queries/`](../knowledge/verified-queries/) — Justin's verified canonical SQL patterns
- [`knowledge/metrics-catalog.md`](../knowledge/metrics-catalog.md) — historical metrics index (155 metrics across all statuses)
- [`docs/dbt-layers-explained.md`](dbt-layers-explained.md) — what makes a metric vs a dim vs a fact
- [`docs/dbt-roadmap.md`](dbt-roadmap.md) — what's done, what's next, when each metric is scheduled for migration
- [`docs/dbt-marts-spec.md`](dbt-marts-spec.md) — Phase 1.6 (deferred) — designed once metrics are reliable

---

*Started 2026-05-12 after audit of the first 5 dbt-managed metrics surfaced definitional ambiguity in Syncs and Sync Rate. To be extended as each remaining metric is migrated to dbt.*
