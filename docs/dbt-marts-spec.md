# Method dbt Marts — Design Spec (Phase 1.6)

**Status:** ⚠️ **SPECULATIVE / DEFERRED** (revised 2026-05-12 — see §0 below).
**Author:** Drafted by Claude under Nic's direction in design pass conversation.
**Implementation target:** TBD. Re-evaluate AFTER all 20 live metrics ship to dbt (Round 5 done).

## 0. Why this is deferred

This spec was written as a top-down design pass for Phase 1.6 marts. On review, Nic identified that several of the "open questions" were inventing problems that already had answers (lifecycle stages defined in the metrics catalog, sync attribution working fine in existing scorecards) or designing capabilities ahead of need (MRR trend columns, NPS, support tickets — no upstream pipeline yet).

The actual near-term priority is narrower: **make all 20 live metrics reliable in BQ for current consumers (Claude via MCP, chart builder, future reverse-ETL).** That's Round 3b → 4 → 5, all metric-layer work, no marts required.

Marts STILL matter — they unlock composable cross-cutting queries (Voice of Customer, complex BI). But they should be designed against **real observed query patterns**, not speculatively. After all 20 metrics ship, we'll know what queries people actually run, and the mart design will be evidence-based instead of forward-looking guesses.

**What to keep from this doc:**
- §3 mart schemas as a starting reference (the customer/account/fact-table shapes are likely right)
- §6 open questions Q1, Q3 — already answered (Q1: use the existing metrics-catalog definitions; Q3: use customer_id, account-level sync attribution isn't a real need)

**What to discard:**
- The whole "Voice of Customer / AC reverse-ETL / Looker replacement" framing as a Phase 1.6 driver — those are real future goals, but they shouldn't drive mart timing
- §3 columns for NPS, support_tickets_30d, etc. — no data source yet
- §6 questions Q2, Q4-Q9 — too speculative

When Phase 1.6 actually starts, revisit this doc and prune to the parts that survive the "do real consumers need this?" filter.

---



**Related docs:**
- [`docs/dbt-layers-explained.md`](dbt-layers-explained.md) — what marts/dims/facts are
- [`docs/dbt-architecture.md`](dbt-architecture.md) — target architecture
- [`docs/dbt-roadmap.md`](dbt-roadmap.md) — phase checklist

---

## 1. Why this spec exists

Three concrete business goals are driving the Phase 1.6 marts:

1. **Replace Method Monday** — the weekly leadership KPI deck currently built manually
2. **Replace Looker** — Method's current BI tool
3. **Feed downstream consumers** — ActiveCampaign (reverse-ETL marketing), Claude via MCP (already connected), future BI tools

Plus secondary: support per-customer "Voice of Customer" lookups (PM/CS use cases).

Each consumer has different needs. This spec synthesizes them into a unified mart schema so we build the marts **once** and serve all four. We design top-down (from the consumer use cases) and implement bottom-up (sources → intermediates → marts).

---

## 2. The four driving consumers — concrete requirements

### 2.1 Method Monday replacement (leadership weekly)

**What it currently does:** Weekly slide deck. Leadership reviews Acquisition (Trials, Syncs, Conversions), Retention (NRR, GRR, Churn), Revenue (MRR by tier/channel), and Forecast attainment.

**Likely format target:** A web page or dashboard with the same structure, auto-updated from BQ. Possibly with AI-generated narrative summaries (one-paragraph "this week vs. last week" per section).

**What it needs from marts:**
- `(period, value)` time series for ~20 KPIs at week/month grain (already in `v_metric__*`)
- WoW / MoM / YoY change calculations (derived from `v_metric__*`)
- Optionally: vs forecast/budget comparison (requires forecast data integration)
- Grouped by theme (Acquisition / Engagement / Conversion / Retention / Revenue / Forecast)
- Probably aggregate-only (no per-customer detail in the deck itself)

**What this implies for marts:** Mostly served by the **metric layer** (`v_metric__*`). The marts that support it are upstream — `fct_trials`, `fct_syncs`, `fct_conversions`, `fct_mrr_movements`. No customer-level grain needed for this consumer.

### 2.2 Looker replacement (analyst / PM self-service)

**What Looker currently does:** Ad-hoc analysis. Drill-down dashboards. "Show me trials by channel, filtered to verticals X and Y, last 6 months."

**Replacement candidate:** Method's existing chart builder, extended. Or Hex/Mode for analyst-driven analysis if chart builder isn't enough.

**What it needs from marts:**
- **Star schema** — `fct_*` (events) joinable to `dim_customers` and `dim_accounts` so users can slice metrics by any dim attribute
- Denormalized attributes on facts so simple joins answer most questions (channel on `fct_trials`, vertical on `fct_syncs`, cohort on `fct_mrr_movements`)
- Stable column names + descriptions in BQ (Registry UI reads `INFORMATION_SCHEMA`)
- Both customer-grain and account-grain marts (so "X by customer" and "X by account" both work)

**What this implies for marts:** Needs the **full mart layer** — both dims and facts. This is the biggest driver of mart richness.

### 2.3 ActiveCampaign reverse-ETL (marketing automation)

**What it does:** Push customer-level attributes and segments to AC, then AC runs automation (re-engagement campaigns, lifecycle messaging, sales handoff).

**How:** Hightouch (or Census, or custom Python) reads BQ on schedule and pushes to AC.

**What it needs from marts:**
- **`dim_customers`** with per-customer attributes:
  - Lifecycle state (active, trialing, churned, at-risk)
  - Last activity dates
  - Trend signals (MRR growing/declining/flat)
  - Cohort attribution (channel, vertical, signup quarter)
  - Contact info (email, name) — note: PII handling considerations
- Behavioral facts (`fct_trials`, `fct_syncs`, etc.) with `customer_id` for filtering
- Pre-computed audience segments (could be views or just SQL queries the reverse-ETL job runs)

**What this implies for marts:** Heavy emphasis on **`dim_customers`** richness. The more attributes denormalized onto it, the simpler AC integrations become.

### 2.4 Claude via MCP (already connected)

**What it does:** Ad-hoc natural-language Q&A. Engineers and PMs query "how is Acme doing" or "what's our trial volume this month" via Claude with BQ tool access.

**What it needs from marts:**
- **Discoverable metadata** — descriptions and labels in `INFORMATION_SCHEMA` so Claude understands what each view contains
- Clean naming — `dim_customers` reads obviously as "customer dimension"
- Composability — Claude builds joins on the fly, so the star schema must work cleanly
- One row per entity / event grain so Claude doesn't get confused about cardinality

**What this implies for marts:** Same requirements as Looker replacement, with extra emphasis on description quality (Claude reads descriptions to understand what's there).

### 2.5 Consumer matrix — what each needs from each mart

| Mart | Method Monday | Looker repl | AC ETL | Claude |
|---|---|---|---|---|
| `dim_customers` | low | high | **critical** | high |
| `dim_accounts` | low | high | medium | high |
| `fct_trials` | medium (via metrics) | **critical** | medium | high |
| `fct_syncs` | medium | **critical** | medium | high |
| `fct_conversions` | medium | high | medium | high |
| `fct_mrr_movements` | high (via NRR/GRR metrics) | **critical** | high (declining-MRR audiences) | high |
| `fct_cancellations` | high (via churn metrics) | high | high (save campaigns) | medium |
| `v_metric__*` (existing layer) | **critical** | medium | low | high |

This justifies the full mart investment — each mart serves multiple consumers.

---

## 3. The mart schema — proposed

### 3.1 `dim_customers` — one row per customer

**Grain:** One row per `EntityRecordID` (~118,962 today).
**FK to:** Nothing (top of the entity hierarchy).
**Built from:** `int_customer_attributes` (aggregates Account attrs) + `int_customer_revenue_summary` (aggregates TransLineFlattened) + `int_customer_engagement_summary` (aggregates Funnel).

**Proposed columns:**

| Column | Type | Source | Why |
|---|---|---|---|
| `customer_id` | INT64 | EntityRecordID (the stable PK) | Join key everywhere |
| `primary_company_name` | STRING | latest CompanyAccount across their accounts | Display label |
| `signup_date` | DATE | earliest SignUpDate across their accounts | When they first joined Method |
| `signup_cohort_month` | DATE | DATE_TRUNC(signup_date, MONTH) | Cohort analysis |
| `first_conversion_date` | DATE | earliest FirstSaaSInvoiceTxnDate | When they became paying |
| `is_paying_customer` | BOOL | has any active SaaS revenue | Filter for "real" customers |
| `is_active` | BOOL | has SaaS activity in last 30 days | Lifecycle state |
| `lifecycle_stage` | STRING | derived: 'trial', 'active_paying', 'at_risk', 'churned' | AC audience filter |
| `cancellation_date` | DATE | latest CancellationDate (if any) | Churn date |
| `days_since_last_activity` | INT64 | from latest Funnel event or TransLine | Engagement signal |
| `total_accounts` | INT64 | COUNT(DISTINCT RecordID) for this customer | Multi-account flag |
| `active_accounts` | INT64 | COUNT(DISTINCT active RecordIDs) | Multi-account active |
| `current_mrr` | FLOAT64 | latest month's SUM(SaaSAmount) from v_customer_mrr | $ value today |
| `mrr_30d_ago` | FLOAT64 | 30-day-ago snapshot | Trend signal |
| `mrr_90d_ago` | FLOAT64 | 90-day-ago snapshot | Longer trend |
| `mrr_trend_30d` | STRING | derived: 'growing'/'declining'/'flat' | AC declining-MRR audience |
| `lifetime_revenue` | FLOAT64 | SUM(SaaSAmount) all time | LTV proxy |
| `primary_attribution_channel` | STRING | channel of earliest account's signup | Channel cohort |
| `primary_vertical` | STRING | most common Vertical across accounts | Segment |
| `primary_country` | STRING | SignupCountry of earliest account | Geo cohort |
| `health_score` | FLOAT64 | latest HealthScore from Account | Health signal |
| `nps_score` | FLOAT64 | (if Intercom NPS data joined) | Sentiment |
| `support_tickets_30d` | INT64 | (if Intercom data joined) | Support load |
| `last_sync_date` | DATE | latest SyncDate across accounts | Engagement |
| `total_lifetime_syncs` | INT64 | COUNT from v_syncs | Engagement total |
| `industry` | STRING | CustDatIndustry (latest) | Segment |
| `employee_count` | INT64 | CustDatCountOfEmployees (latest) | Firmographic |
| `annual_sales` | FLOAT64 | CustDatAnnualSales (latest) | Firmographic |

**Notes:**
- "Latest" rules need a deterministic tie-breaker per `v_customer_mrr`'s pattern (e.g., ORDER BY signup_date ASC).
- Intercom-derived fields (NPS, support tickets) only land once Intercom→BQ pipeline exists. Listed for design completeness; can be deferred.
- Some fields require new intermediates (e.g., `int_customer_engagement_summary` aggregating Funnel by EntityRecordID).

### 3.2 `dim_accounts` — one row per account

**Grain:** One row per `RecordID` (~144,862 today).
**FK to:** `dim_customers.customer_id` (via EntityRecordID).
**Built from:** `int_account_attributes` (essentially the existing v_trials/v_conversions/v_cancellations logic but UNIONed across all accounts, not just by lifecycle stage).

**Proposed columns:**

| Column | Type | Source | Why |
|---|---|---|---|
| `account_id` | INT64 | RecordID (the stable PK) | Join key for account-level |
| `customer_id` | INT64 | EntityRecordID | FK to dim_customers |
| `company_account_name` | STRING | CompanyAccount (latest) | Display label |
| `signup_date` | DATE | SignUpDate | When this specific account started |
| `signup_cohort_month` | DATE | DATE_TRUNC(signup_date, MONTH) | Cohort |
| `first_invoice_date` | DATE | FirstSaaSInvoiceTxnDate | When this account converted (if did) |
| `is_converted` | BOOL | FirstSaaSInvoiceTxnDate != sentinel | Trial-to-paying flag |
| `cancellation_date` | DATE | CancellationDate (or NULL) | When this account churned |
| `is_active` | BOOL | IsActive from Account | Currently active |
| `account_status` | STRING | derived: 'trial', 'active_paying', 'churned' | Lifecycle |
| `attribution_channel` | STRING | AttributionChannel | The CASE-derived channel |
| `signup_country` | STRING | SignupCountry | Geo |
| `vertical` | STRING | Vertical | Segment |
| `sync_type` | STRING | SyncType | QuickBooks variant |
| `sync_type_region` | STRING | SyncTypeRegion | Regional QB variant |
| `industry` | STRING | CustDatIndustry | Segment |
| `sector` | STRING | Sector | Segment |
| `partner` | STRING | Partner | Reseller relationship (filter out 'Method Integration') |
| `saas_pay_type` | STRING | SaaSPayType | Monthly/Annual |
| `offering` | STRING | Offering | Product variant |
| `platform` | STRING | Platform | Cloud/Desktop |
| `latest_mrr_display` | FLOAT64 | Custdatlastsaasamount | **Display only — NOT for aggregation; drifts.** |
| `license_count` | INT64 | LicenseCount | Seat count |
| `custom_screens_count` | INT64 | CountOfCustomScreens | Power-user signal |
| `health_score` | FLOAT64 | HealthScore | Account-level health |
| `cancellation_reason` | STRING | CancellationReason | Why churned |
| `cancellation_category` | STRING | CancellationReasonCategory | Churn bucket |
| `is_conversion_exception` | BOOL | IsConversionException | Exclusion flag for funnel |
| `is_churn_exception` | BOOL | IsChurnException | Exclusion flag for retention |
| `att_seo`, `att_ppc`, ... | FLOAT64 × 13 | All Att_* boolean columns | For multi-touch attribution |

**Notes:**
- Account is fundamentally a snapshot table. dim_accounts inherits that — it's the "current state" of each account, not history.
- Adding `att_*` columns preserves multi-touch attribution capability (the `v_trials_by_attribution` use case).
- Some fields will move to a future `fct_attribution_events` if we want clean multi-touch fact-grained data.

### 3.3 `fct_trials` — one row per trial event

**Grain:** One row per trial signup event = one row per account that began a trial.
**FK to:** `dim_customers`, `dim_accounts`.
**Built from:** Existing `v_trials` intermediate.

**Proposed columns:**

| Column | Type | Source |
|---|---|---|
| `trial_id` | STRING | Synthetic: CONCAT(account_id, '_trial') or just RecordID since each account has one trial event |
| `account_id` | INT64 | RecordID |
| `customer_id` | INT64 | EntityRecordID |
| `signup_date` | DATE | SignupDate |
| `signup_cohort_month` | DATE | DATE_TRUNC(SignupDate, MONTH) |
| `attribution_channel` | STRING | AttributionChannel |
| `signup_country` | STRING | SignupCountry |
| `vertical` | STRING | Vertical |
| `is_converted` | BOOL | did this trial eventually become paying |
| `days_to_first_sync` | INT64 | CustDatFirstSyncCompleted - SignupDate |
| `days_to_conversion` | INT64 | FirstSaaSInvoiceTxnDate - SignupDate (NULL if never converted) |
| `days_to_churn` | INT64 | CancellationDate - SignupDate (NULL if not churned) |

**Use cases enabled:**
- "Trials by channel" — `SELECT channel, COUNT(*) FROM fct_trials GROUP BY 1`
- "Trial-to-sync rate by vertical" — `SELECT vertical, AVG(days_to_first_sync IS NOT NULL) FROM fct_trials JOIN dim_accounts ...`
- "Unique customers who trialed" — `SELECT COUNT(DISTINCT customer_id) FROM fct_trials`

### 3.4 `fct_syncs` — one row per sync event

**Grain:** One row per sync event from Funnel.
**FK to:** `dim_customers`, `dim_accounts`.
**Built from:** Existing `v_syncs` intermediate.

| Column | Type | Source |
|---|---|---|
| `sync_event_id` | STRING | Synthetic: HASH(EntityRecordID, Date, EventType) or surrogate key |
| `account_id` | INT64 | RecordID — needs surfacing (TBD: which RecordID? See "Open questions") |
| `customer_id` | INT64 | EntityRecordID (already in Funnel) |
| `sync_date` | DATE | Date |
| `signup_date` | DATE | SignupDate (denormalized for cohort joins) |
| `attribution_channel` | STRING | AttributionChannel |
| `sync_type` | STRING | SyncType |
| `event_type` | STRING | EventType (always 'Sync' in this fact, but kept for consistency) |

**Open question:** Funnel doesn't currently surface `RecordID`. If we want `account_id` on `fct_syncs`, we need to either: (a) add it to v_syncs from Funnel if Funnel has it, or (b) accept that `fct_syncs` is customer-grained only (with account_id NULL for some events). Need to check Funnel schema.

### 3.5 `fct_conversions` — one row per conversion event

**Grain:** One row per account that converted (had `FirstSaaSInvoiceTxnDate` set).
**FK to:** `dim_customers`, `dim_accounts`, optional `fct_trials` (which trial led to this conversion).
**Built from:** Existing `v_conversions` intermediate + TransLineFlattened (for first-month MRR).

| Column | Type | Source |
|---|---|---|
| `conversion_id` | STRING | CONCAT(account_id, '_conv') |
| `account_id` | INT64 | RecordID |
| `customer_id` | INT64 | EntityRecordID |
| `trial_id` | STRING | FK to fct_trials (account_id_trial) — usually same account_id |
| `conversion_date` | DATE | FirstSaaSInvoiceTxnDate |
| `conversion_cohort_month` | DATE | DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) |
| `attribution_channel` | STRING | AttributionChannel |
| `vertical` | STRING | Vertical |
| `signup_country` | STRING | SignupCountry |
| `first_month_mrr` | FLOAT64 | SUM(SaaSAmount) from TransLineFlattened in conversion month |
| `days_from_signup_to_conversion` | INT64 | FirstSaaSInvoiceTxnDate - SignupDate |

**Use cases enabled:**
- The CRO's "New SaaS from trialers" question: `SELECT SUM(first_month_mrr) FROM fct_conversions WHERE conversion_cohort_month = '2026-01-01'`
- "Conversion rate by channel" via join with `fct_trials`

### 3.6 `fct_mrr_movements` — one row per (customer, month, movement type)

**Grain:** One row per (EntityRecordID, Month, movement_type). Most complex fact.
**FK to:** `dim_customers`, `dim_accounts` (account_id of the relevant account for that month).
**Built from:** Existing `v_customer_mrr` (which already has the methodology).

| Column | Type | Source |
|---|---|---|
| `movement_id` | STRING | Synthetic: CONCAT(customer_id, '_', month, '_', movement_type) |
| `customer_id` | INT64 | EntityRecordID |
| `account_id` | INT64 | RecordID of the relevant account (TBD: how to pick when customer has multi-accounts — see open questions) |
| `month` | DATE | Month |
| `start_mrr` | FLOAT64 | from v_customer_mrr |
| `cancellations_mrr` | FLOAT64 | v_customer_mrr.Cancellations |
| `downgrades_mrr` | FLOAT64 | v_customer_mrr.Downgrades |
| `expansions_mrr` | FLOAT64 | v_customer_mrr.Expansions |
| `new_mrr` | FLOAT64 | v_customer_mrr.NewMrr |
| `end_mrr` | FLOAT64 | start + new - cancellations - downgrades + expansions |

**Notes:**
- This is the canonical retention primitive. GRR/NRR metrics derive from this.
- Inherits the symmetric Prepay Expiry exclusion methodology (CEO-confirmed 2026-04-28).
- `fct_cancellations` might be a derived view of this (cancellations_mrr > 0).

### 3.7 `fct_cancellations` — one row per cancellation event

**Grain:** One row per account-month where the account canceled.
**FK to:** `dim_customers`, `dim_accounts`.
**Built from:** Subset of `fct_mrr_movements` where cancellations_mrr > 0, plus enriched with reason data from Account.

| Column | Type | Source |
|---|---|---|
| `cancellation_id` | STRING | Synthetic |
| `customer_id` | INT64 | EntityRecordID |
| `account_id` | INT64 | RecordID |
| `cancellation_month` | DATE | Month |
| `mrr_lost` | FLOAT64 | cancellations_mrr from fct_mrr_movements |
| `cancellation_reason` | STRING | from dim_accounts |
| `cancellation_category` | STRING | from dim_accounts |
| `tenure_months_at_cancel` | INT64 | derived: cancellation_month - signup_date |

---

## 4. Implementation sequence

In dependency order. Each must pass parity verification (CLAUDE.md snapshot rule) before the next starts.

### Wave 1 — Foundation (Phase 1.6a)

1. **`int_customer_attributes`** — aggregates Account-level attrs to customer grain (most common Vertical, latest CompanyAccount with deterministic tie-break, earliest signup date, etc.). Built from `Account`.
2. **`int_customer_revenue_summary`** — current/30d/90d MRR + lifetime revenue per customer. Built from `TransLineFlattened` + `v_customer_mrr`.
3. **`dim_customers`** — combines (1) and (2). First mart shipped.

**Why first:** Unlocks immediate Voice-of-Customer queries. Foundation for everything else. Validates the dim pattern works end-to-end.

### Wave 2 — Account-grain dim

4. **`dim_accounts`** — Account snapshot with `customer_id` FK to `dim_customers`. Built from `Account`.

**Why second:** Cheap addition once dim_customers exists. Required as FK target for all facts.

### Wave 3 — Funnel facts

5. **`fct_trials`** — built from existing `v_trials` (after surfacing RecordID).
6. **`fct_conversions`** — built from `v_conversions` + TransLineFlattened first-month revenue.
7. **`fct_syncs`** — built from `v_syncs` (after addressing the Funnel.RecordID question).

**Why third:** Unlocks Acquisition section of Method Monday. Unlocks Looker-style funnel analyses.

### Wave 4 — Retention fact

8. **`fct_mrr_movements`** — built from `v_customer_mrr`. Most complex; built last after the other patterns are proven.
9. **`fct_cancellations`** — derived from `fct_mrr_movements`.

**Why last:** Most complex; unlocks Retention/Revenue sections of Method Monday + the heaviest AC integration audiences (declining-MRR).

### Wave 5 — Refactor existing metrics to consume marts

10. Refactor `v_metric__trials` to query `fct_trials` (was `v_trials`)
11. Refactor `v_metric__syncs` to query `fct_syncs`
12. Refactor `v_metric__sync_rate` to compute from `fct_trials` + `fct_syncs`
13. Phase out direct v_metric__ → intermediate dependency

**Why after marts:** Mart-based metrics are simpler to define (denormalized attributes are right there). Refactor is mechanical + parity-checkable.

---

## 5. What's explicitly NOT in Phase 1.6

Things this design defers, to avoid scope creep:

- **Snapshots** (`snapshot_*` SCD-2 tables) — point-in-time customer state tracking. Useful for "what was Acme's tier on 2025-03-15?" but premature without a clear use case.
- **Multi-touch attribution fact table** (`fct_attribution_events`) — the fan-out from `v_trials_by_attribution`. Defer until someone needs multi-touch attribution at fact grain.
- **Engagement event log** (`fct_engagement_events`) — Intercom conversations, AC campaign sends, product feature usage. Requires upstream pipelines (Intercom → BQ etc.) that don't exist yet.
- **Forecast comparison facts** — `fct_forecast_vs_actual`. Requires Sheets-federated `method_forecast` to be properly modeled. Defer until Phase 2.
- **Product/feature-usage facts** — `fct_feature_usage`, `fct_login_events`. Requires product-side instrumentation. Out of scope.

---

## 6. Open product decisions (need Nic to lock)

These affect mart content and prioritization. Listing in priority order — the first 3 actually block implementation.

### Q1 — `dim_customers.lifecycle_stage` definition (blocks `dim_customers`)

The "trial / active_paying / at_risk / churned" categorization is critical for AC audiences. What are the exact rules?

Proposed defaults, lock or revise:
- **`trial`**: Has SignupDate but no FirstSaaSInvoiceTxnDate
- **`active_paying`**: Has revenue in the last 30 days
- **`at_risk`**: Was active_paying but no revenue in 30-60 days (a "warning shot" category)
- **`churned`**: Has CancellationDate set, OR no revenue in 90+ days
- **`inactive`** (?): Has SignupDate but never converted AND no activity 60+ days

### Q2 — `dim_customers` MRR trend signal (blocks `dim_customers`)

Specifically `mrr_trend_30d`. Three options:
- **(a) Compare current_mrr vs mrr_30d_ago, %change buckets**: 'growing' (>5% up), 'flat' (-5% to +5%), 'declining' (>5% down), 'churned' (zero)
- **(b) Justin's existing methodology** if there's one already in `v_customer_mrr` — preferable for consistency
- **(c) Skip from MVP; add later when AC audiences need it**

### Q3 — `fct_syncs.account_id` (blocks `fct_syncs`)

`Funnel` table has `EntityRecordID` but apparently not `RecordID`. Two paths:
- **(a) Add RecordID to v_syncs's underlying Funnel** — requires upstream pipeline change OR a join from Funnel to Account by EntityRecordID picking "primary" account
- **(b) Accept `fct_syncs` is customer-grained only** (account_id NULL) — limits per-account sync analyses
- **(c) Pick the account that was active in the sync's month** — derive account_id from MRR-bearing relationship

### Q4 — Method Monday section structure (informs metric prioritization)

What sections does Method Monday actually have? Affects which metrics get Round 4 priority. Best guess (correct if wrong):
- **Acquisition**: Trials, Syncs, Sync Rate, Conversions, Trial-to-Conversion Rate
- **Engagement**: ? (sync volume? feature usage?)
- **Retention**: Monthly GRR, Monthly NRR, Churn, Cancellations
- **Revenue**: Monthly Start MRR, New MRR, Expansion, Net New
- **Forecast**: vs target / budget attainment

### Q5 — Looker dashboards to replicate (informs `dim_accounts` columns)

Which Looker dashboards are highest-priority to replace? Each suggests which dim attributes matter most. E.g., "Marketing Channel Performance" needs `attribution_channel`, `dim_accounts.signup_cohort`. "Customer Health" needs `health_score`, `lifecycle_stage`.

### Q6 — AC audiences to ship first (informs prioritization of `fct_mrr_movements`)

Which AC integrations are first? Top candidates:
- **Declining MRR cohort** — re-engagement campaigns
- **At-risk cohort** — save campaigns
- **High-value new signups** — sales handoff
- **Stale trials** — nudge campaigns

Each implies which `fct_*` becomes critical to ship first.

### Q7 — Intercom/Gong integration timing

When do these external sources land in BQ? Affects when `dim_customers.support_tickets_30d`, `nps_score` etc. become real. If "not in next 6 months," design `dim_customers` to OMIT them (rather than have NULL placeholder columns).

### Q8 — Currency/FX handling

`v_customer_mrr` is pre-FX. Should `dim_customers.current_mrr` be pre-FX or FX-adjusted? Affects AC integration (does AC want USD-equivalent or local currency?). Best practice: store BOTH (`current_mrr_local`, `current_mrr_usd`).

### Q9 — PII handling on `dim_customers`

`primary_contact_email` and similar — does BQ allow PII columns? Should they be hashed? Is there a Method PII policy that affects what we materialize?

---

## 7. Acceptance criteria for Phase 1.6 marts

Before declaring Phase 1.6 done:

- [ ] `dim_customers` shipped, parity-verified (totals match `v_customers` and v_customer_mrr's customer count)
- [ ] `dim_accounts` shipped, FK relationship to `dim_customers` validated (orphan check: every account row has a valid customer_id)
- [ ] `fct_trials`, `fct_syncs`, `fct_conversions` shipped, FKs to both dims validated
- [ ] `fct_mrr_movements` shipped, parity-verified against `v_customer_mrr` (penny-match for sample months)
- [ ] `fct_cancellations` shipped, parity-verified against current Cancellation metric values
- [ ] All marts have descriptions + labels propagated to BQ (visible via INFORMATION_SCHEMA)
- [ ] All marts have `meta.owner` set in the YAML
- [ ] At least one round of integration test: query that joins fct_trials + dim_customers + dim_accounts returns expected results
- [ ] `v_metric__*` metrics refactored to consume marts where appropriate (parity-checked)
- [ ] Documentation updated: `dbt-layers-explained.md` shows actual mart schemas; `dbt-architecture.md` reflects shipped state

---

## 8. Estimated effort

- **Wave 1 (dim_customers + supporting intermediates):** ~1 focused day. Most complex single mart due to multi-account rollup logic and lifecycle derivation.
- **Wave 2 (dim_accounts):** ~half day. Mostly mechanical Account → mart mapping.
- **Wave 3 (fct_trials, fct_conversions, fct_syncs):** ~1 day total. Each is a refactor of an existing intermediate.
- **Wave 4 (fct_mrr_movements + fct_cancellations):** ~half day. Most logic exists in `v_customer_mrr`; mostly schema shaping.
- **Wave 5 (refactor metrics to consume marts):** ~half day. Mechanical.
- **Plus testing, parity verification, documentation, and review:** ~half day buffer.

**Total: ~3-4 focused dev days** for Phase 1.6 implementation. Plus the open-question lock-down (this spec review, est. ~1-2 hours of your time + maybe Justin) before implementation.

---

## 9. Path forward

1. **You review this spec and lock the open decisions** (Q1–Q9 above). Pace however suits — could be one focused session or spread across days. Maybe loop in Justin on Q3, Q4, Q8.
2. **Round 3b ships in parallel** (pilot Customers + Monthly Start MRR — doesn't depend on Phase 1.6 work).
3. **Phase 1.6 implementation begins** once Q1–Q3 (the implementation-blockers) are locked. Q4–Q9 can be answered during implementation as they come up.
4. **Round 4** starts after Phase 1.6 ships. Bulk-extends remaining metrics, now able to consume marts where appropriate.
5. **Round 5 (GRR/NRR)** comes last as planned.

Total timeline from today to "all 20 metrics migrated and marts in place": probably 2-3 weeks of focused work, depending on Q1–Q3 lock-in time.

---

*Spec drafted 2026-05-12 during top-down design pass. To be refined as Q1–Q9 get locked. Implementation starts when spec is approved.*
