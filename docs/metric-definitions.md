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

**Known caveats / things consumers should know:**
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

## 3. Audit checklist — "does the math match the name?"

Run through every question for every metric before flipping `live`:

- [ ] **Grain match.** If the name implies "customers" but the math counts "accounts," that's a mismatch. Either rename the metric or refactor the math.
- [ ] **Event vs entity match.** If the name implies "people who did X" but the math counts "events of type X," there's likely re-event inflation. Verify the inflation is acceptable, or refactor.
- [ ] **Numerator and denominator match (for ratios).** "Sync Rate" = `syncs / trials` only makes sense as a "fraction who synced" if both numerator and denominator are entity counts at the same grain. Event-count ratios drift.
- [ ] **Filter match.** Does the metric exclude the same things the source-of-truth report excludes? (E.g., internal accounts, exception flags, sentinel dates.)
- [ ] **Currency / FX match.** Pre-FX vs FX-adjusted. Methodology source should specify.
- [ ] **Cohort definition match.** "Trials" by SignupDate cohort vs by AcquisitionMonth cohort — different.
- [ ] **Methodology consistency.** If `v_customer_mrr` uses symmetric Prepay Expiry exclusion, ALL derived metrics should inherit that — not silently drop it.

---

## 4. Currently dbt-managed metrics (5)

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
FROM `project-for-method-dw.revenue.v_trials`
WHERE SignupDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
```

Where `v_trials` is the filter `SELECT * FROM revenue.Account WHERE IsConversionException = FALSE AND Partner != 'Method Integration' AND SignupDate != DATE('0001-01-01')`.

**Grain:** **account-level** (by design — see §4 top note). One row per Method account that began a trial. A customer with 2 trial accounts contributes 2 trials. This is canonical for Method's funnel reporting, not a flaw.

**Filters / exclusions:**
- `IsConversionException = FALSE` — excludes accounts flagged as not real conversions (test accounts, exception cases)
- `Partner != 'Method Integration'` — excludes internal Method Integration partner rows
- `SignupDate != DATE('0001-01-01')` — excludes the "no trial" sentinel value

**Methodology source:** Existing BQ view `v_trials`, pre-dbt convention. Definition unchanged in migration; dbt now owns the view.

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
FROM `project-for-method-dw.revenue.v_syncs`
WHERE SyncDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
```

Where `v_syncs` is `SELECT * FROM revenue.Funnel WHERE EventType = 'Sync'`.

**Grain:** **account-grain by intent** (per §4 top note — Method tracks funnel metrics at account level). Each row in Funnel is a sync milestone event. See caveats for the data-vs-intent nuance.

**Filters / exclusions:**
- `EventType = 'Sync'` — filters Funnel to sync milestone events only (not all activity)

**Methodology source:** Existing BQ view `v_syncs`, pre-dbt convention. Definition unchanged in migration.

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
FROM `project-for-method-dw.revenue.v_customers`
WHERE IsActive = TRUE
  AND Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
```

Where `v_customers` is the existing BQ view that aggregates `TransLineFlattened` to (EntityRecordID, Month) grain with `IsActive` classification.

**Grain:** **customer-level** (EntityRecordID). A customer with multiple Method accounts counts ONCE per month.

**Filters / exclusions:**
- `IsActive = TRUE` — applied to match Supabase's canonical filter. NOTE: this is **redundant** in practice — `v_customers` only contains customer-months with revenue activity, so all rows have `IsActive = TRUE`. Filter applied anyway for definitional consistency.
- Internal Method partner accounts already excluded upstream in v_customers (Partner != 'Method Integration' filter).

**Methodology source:** Existing BQ view `v_customers` + Supabase metric #373 semantic definition.

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
FROM `project-for-method-dw.revenue.v_customer_mrr`
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
```

Where `v_customer_mrr` computes per-(EntityRecordID, Month) MRR using Justin's P1/P2 cohort pattern with symmetric Prepay Expiry Income exclusion.

**Grain:** period-level (one $ value per month). Underlying aggregation is customer-month.

**Filters / exclusions (inherited from `v_customer_mrr`):**
- Internal Method accounts (`CompanyAccount NOT LIKE 'm11%' AND NOT LIKE 'm18%'`) — matches Looker and SaaS Analytics Engine filters
- **Symmetric Prepay Expiry Income exclusion** (CEO-confirmed 2026-04-28): customers whose entire Period-1 SaaS revenue was Prepay Expiry Income are excluded from BOTH StartMRR and Cancellations. Their actual churn was captured in an earlier monthly cohort.
- TxnDate >= '2021-12-01' (data quality floor)
- Excludes current incomplete month

**Methodology source:** `knowledge/verified-queries/v_customer_mrr.sql` — Justin's verified pattern. CEO methodology confirmation logged 2026-04-28.

**Parity-verified against:** Pre-migration BQ values for 11 months (Jun 2025 – Apr 2026), all penny-match (Round 3b, 2026-05-12).


**Status:** **live**

**Known caveats:**
- **Pre-FX** — all currencies at face value (USD, CAD, UK). If you want USD-equivalent, that's a different metric.
- Diverges from board-deck monthly retention by ~4–6bp because this view uses symmetric methodology while the board deck uses asymmetric (PE-only customers left in StartMRR but excluded from Cancellations).
- Current month NOT shown (v_customer_mrr excludes in-progress month).

**Used by:**
- Method Monday (Revenue section, foundation for Monthly GRR/NRR)
- Monthly GRR (#382), Monthly NRR (#383) as denominator
- AC reverse-ETL (potential — declining-MRR cohort audiences)

---

## 5. Live in Supabase but not yet dbt-managed (15)

These metrics ship as live to Method consumers today (chart builder reads them from Supabase). Each needs migration to dbt — including the definition pass per this doc — before Phase 1 is complete.

For each, the current Supabase definition is the starting point. Migration is **Round 4** (most metrics) or **Round 5** (GRR/NRR specifically).

| # | Name | Source | Status |
|---|---|---|---|
| 56 | Conversions | v_conversions | TBD — define in Round 4 |
| 59 | Churn | v_cancellations | TBD — define in Round 4 |
| 301 | Sync-to-Conversion Rate | derived (#56, #55) | TBD — define in Round 4 |
| 302 | Trial-to-Conversion Rate | derived (#56, #54) | TBD — define in Round 4 |
| 379 | Monthly Cancellations ($) | v_customer_mrr | TBD — define in Round 4 |
| 380 | Monthly Downgrades ($) | v_customer_mrr | TBD — define in Round 4 |
| 381 | Monthly Expansions ($) | v_customer_mrr | TBD — define in Round 4 |
| 384 | Annual Start MRR | v_customer_annual_mrr | TBD — define in Round 4 |
| 385 | Annual Cancellations ($) | v_customer_annual_mrr | TBD — define in Round 4 |
| 386 | Annual Downgrades ($) | v_customer_annual_mrr | TBD — define in Round 4 |
| 387 | Annual Expansions ($) | v_customer_annual_mrr | TBD — define in Round 4 |
| 382 | Monthly GRR % | derived (#378, #379, #380) | TBD — define in **Round 5** (protected) |
| 383 | Monthly NRR % | derived (#378, #379, #380, #381) | TBD — define in **Round 5** (protected) |
| 388 | Annual GRR % | derived (#384, #385, #386) | TBD — define in **Round 5** (protected) |
| 389 | Annual NRR % | derived (#384, #385, #386, #387) | TBD — define in **Round 5** (protected) |

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
