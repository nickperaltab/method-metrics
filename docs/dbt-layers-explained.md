# dbt Layers Explained — Plain English

**Purpose:** Onboarding-friendly reference for anyone new to the dbt project. Explains what each layer is, what goes in it, how the layers compose, and what to do (vs not do) when adding new models.

**Audience:** PMs, analysts, future hires — anyone who'll touch the dbt project but isn't a dbt expert yet.

**Read this before:** modifying anything in `models/`, creating a new metric, or making architectural decisions about new data sources.

---

## 1. The 30-second mental model

dbt structures data the same way a restaurant kitchen organizes cooking:

```
SOURCES    →   STAGING   →   INTERMEDIATE  →   MARTS    →   METRICS
(raw          (cleaned        (sub-recipes,    (final         (numbers
ingredients)  ingredients)    reusable         dishes,        the menu
                              parts)           served to      shows)
                                                customers)
```

Data flows **downstream only**. A layer can only reference what's above it. Crossing back upstream (e.g., a source referencing a mart) is forbidden — it creates circular dependencies.

---

## 2. Layer-by-layer

### 2.1 Sources — the raw ingredients

**What it is:** Data dropped into your warehouse by someone else (upstream system, ETL tool, data engineer). You declare it; you never modify it.

**Kitchen analogy:** Eggs, flour, tomatoes sitting in the fridge. You bought them; you didn't make them.

**Method examples:**
- `Account` (Method accounts — one row per account)
- `Funnel` (lifecycle events)
- `TransLineFlattened` (invoice line items)
- `method_forecast` (Sheets-federated forecast)

**Rules:**
- Declare in `models/_sources.yml` (planned for Round 4)
- Reference via `{{ source('revenue', 'Account') }}` not hardcoded paths
- Never edit sources; if upstream schema changes, that's their decision

**Naming:** Whatever the upstream system named it.

---

### 2.2 Staging — wash, peel, dice

**What it is:** A 1:1 mirror of each source, cleaned. Rename columns, cast types, drop obviously bad rows. One staging model per source.

**Kitchen analogy:** Wash the lettuce, peel the onion, dice the carrot. Each ingredient prepped but not yet combined.

**Method status: SKIPPED.** Alocet's pipeline already does the cleanup before data lands in BQ. No need for a staging layer unless we onboard a new messy source.

**Why it exists in general:** One place to fix data quality issues. If `signup_date` arrives as a string in some rows and a date in others, you cast it once in `stg_account` and every downstream model gets the clean version.

**Naming:** `stg_<source_name>` (e.g., `stg_account`).

---

### 2.3 Intermediate — sub-recipes

**What it is:** Reusable business-logic building blocks. Filters, joins, classifications. Things that multiple downstream models share.

**Kitchen analogy:** The marinara sauce. The cooked pasta. The browned meatballs. Each is its own thing, used in multiple final dishes. You make one batch and reuse.

**Method examples (currently named `v_*`, will become `int_*` in Phase 1.5):**

| File | What it does | Reusable for |
|---|---|---|
| `int_trials` | Filters Account to rows with real SignupDate | Trial count, trials-by-channel, trial-to-conversion |
| `int_syncs` | Filters Funnel to EventType='Sync' | Sync count, sync rate, sync trajectories |
| `int_customer_mrr` | Per-customer monthly MRR with movement columns | GRR, NRR, expansion, cancellation analyses |
| `int_customer_segments` | Classifies customers by size/tier | Segment-based metrics, cohort analyses |

**Rules:**
- An intermediate exists because **2+ downstream models share its logic**. If only one consumer uses it, inline instead.
- One concept per file. Don't combine unrelated logic into a "kitchen sink" intermediate.
- Can reference sources and other intermediates. Cannot reference marts or metrics.

**Naming:** `int_<concept>` (e.g., `int_trial_signups`, `int_conversion_first_month_revenue`).

---

### 2.4 Marts — the dishes on the plate ⭐

**This is the most important layer.** Marts are what humans, dashboards, AI, and external tools consume. Everything else is preparation.

Marts come in **two flavors**:

#### `dim_*` — Dimensions = WHO/WHAT is the thing?

One row per business *entity*, with all its attributes denormalized.

**Method example: `dim_customers`** (Phase 1.6)
- One row per customer (118,962 in Method's data)
- Columns: customer_id, primary_company_name, signup_date_cohort, attribution_channel, vertical, lifecycle_stage, current_mrr_tier, accounts_owned_count, churn_status, primary_contact_email, ...

A single query against `dim_customers` answers "tell me about this customer."

#### `fct_*` — Facts = WHAT HAPPENED?

One row per business *event*. Has foreign keys to relevant dimensions.

**Method example: `fct_trials`** (Phase 1.6)
- One row per trial event
- Columns: trial_id, account_id (FK→dim_accounts), customer_id (FK→dim_customers), signup_date, channel, ...

A single query against `fct_trials` answers "what trials happened, sliced by anything we want."

**Rules:**
- Marts are the consumption-facing layer. Anything consuming Method's data should query a mart, not an intermediate or source.
- Can reference intermediates, sources, and other marts.
- `dim_*` can reference other `dim_*` (e.g., `dim_accounts` references `dim_customers` via FK).
- `fct_*` can reference any `dim_*` (this is the star schema pattern).
- `fct_*` can reference other `fct_*` when meaningful (e.g., `fct_conversions.trial_id` → `fct_trials`).
- `dim_*` should NOT reference `fct_*` directly. If a dim attribute needs aggregated fact data, do the aggregation in an intermediate first.

---

### 2.5 Metrics — the menu (Method-specific bridge layer)

**What it is:** Pre-computed KPI series — `(period, value)` shaped — with metadata describing what the metric means.

**Kitchen analogy:** The menu board showing "today's specials, by popularity." Not the food itself; a summary with a price and description.

**Why this layer exists in Method's stack (it's not standard dbt):** The chart builder reads BigQuery directly, so we materialize metrics as BQ views with metadata in OPTIONS labels. This makes the metric catalog queryable from any BQ tool (BI tools, Claude via MCP, ActiveCampaign, etc.) without needing a separate API service like MetricFlow.

**Method examples (3 live today):**
- `v_metric__trials` — monthly trial-signup count
- `v_metric__syncs` — monthly sync count
- `v_metric__sync_rate` — monthly sync rate (syncs / trials)

**Rules:**
- One metric per file.
- Use dbt-bigquery's native materialization (description + labels in config), not raw `CREATE OR REPLACE VIEW` DDL.
- Simple metrics (one source) attach to their primitive's semantic_model.
- Cross-model metrics (ratios, derived) live in `models/metrics/_metrics.yml` (the top-level metrics file).
- Materialized as BQ views — `dbt run` regenerates them.

**Naming:** `v_metric__<slug>` (e.g., `v_metric__trials`).

---

## 3. The star schema — how marts compose

Once `dim_*` and `fct_*` exist, business questions get answered by joining them. The pattern is called a **star schema** — facts at the center, dimensions around them like the points of a star.

```
              dim_customers
                    ↑
                    │ customer_id FK
                    │
  dim_accounts ──── ┼──── dim_channels
       ↑            │           ↑
       │ account_id │           │ channel_id
       │       FK   │           │ FK
       │            │           │
       └─────── fct_trials ─────┘
                    │
                    │ same FK pattern with:
                    ↓
              fct_conversions
              fct_syncs
              fct_support_events
              ...
```

### What this lets you do

A question like *"trial-to-conversion rate by attribution channel for the construction vertical, last 90 days"* becomes a single query:

```sql
SELECT
  t.channel,
  COUNT(DISTINCT t.trial_id) AS trials,
  COUNT(DISTINCT c.conversion_id) AS conversions,
  SAFE_DIVIDE(COUNT(DISTINCT c.conversion_id), COUNT(DISTINCT t.trial_id)) AS rate
FROM fct_trials t
LEFT JOIN fct_conversions c ON t.trial_id = c.trial_id
JOIN dim_accounts a ON t.account_id = a.account_id
WHERE t.signup_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
  AND a.vertical = 'construction'
GROUP BY t.channel
```

That query is **only possible because marts reference each other**. Without marts, you'd be re-deriving `vertical` and re-implementing trial-conversion logic in every query that needs it.

### Three new business asks, same data structure

Once `fct_trials`, `fct_conversions`, `dim_accounts`, `dim_customers` exist:

- **"How many customers signed up via Content channel last quarter?"** — count distinct customer_id from fct_trials, joined to dim_accounts for channel filter
- **"Show me MRR by signup cohort"** — sum over fct_mrr_movements, grouped by dim_customers.signup_date_cohort
- **"Which Vertical converts fastest?"** — fct_trials × fct_conversions × dim_accounts, computing date diff

Three different questions. Zero new modeling work. **This is the whole point of marts.**

---

## 4. What references what — the rules table

| What | Can reference | Example |
|---|---|---|
| `fct_*` → `dim_*` | ✅ Always | `fct_trials.customer_id` → `dim_customers` |
| `fct_*` → `fct_*` | ✅ When meaningful | `fct_conversions.trial_id` → `fct_trials` |
| `dim_*` → `dim_*` | ✅ For hierarchies | `dim_accounts.customer_id` → `dim_customers` |
| `dim_*` → `fct_*` | ⚠️ Avoid | If `dim_customers` needs `total_trials`, aggregate in an `int_*` first, then `dim_customers` consumes the intermediate |
| Marts → `int_*` | ✅ Marts are built from intermediates | `dim_customers` is built from `int_customer_attributes` + `int_customer_revenue_monthly` |
| `int_*` → marts | ❌ Never | Would break the downstream-only flow |
| Metrics → marts | ✅ Metrics summarize marts | `v_metric__sync_rate` references `fct_trials` and `fct_syncs` (or intermediates that feed them) |
| Anything → sources | ✅ Via `{{ source(...) }}` | `int_trials` reads `{{ source('revenue', 'Account') }}` |

The single rule that covers all of these: **data flows downstream**. Layers can only reference what's upstream of them.

---

## 5. Glossary — terms you'll hear

| Term | Plain English | Example |
|---|---|---|
| **Source** | Raw data dropped in by an upstream system | `Account`, `Funnel`, `TransLineFlattened` |
| **Staging** (`stg_*`) | 1:1 cleanup of a source (Method skips this) | Would be `stg_account` if we had one |
| **Intermediate** (`int_*` / today's `v_*`) | Reusable building block; business logic shared by multiple downstream models | `int_trials`, `int_customer_mrr` |
| **Mart** | Business-facing model; consumers query these directly | Anything in `models/marts/` |
| **Dimension** (`dim_*`) | One row per entity (customer, account, channel) with attributes | `dim_customers` |
| **Fact** (`fct_*`) | One row per event with FKs to dimensions | `fct_trials`, `fct_syncs` |
| **Metric** (`v_metric__*`) | Pre-computed KPI time series with metadata | `v_metric__sync_rate` |
| **Grain** | The level of detail in a row (event-level, account-level, customer-level, etc.) | `fct_trials` is event-grain; `dim_customers` is customer-grain |
| **Foreign key (FK)** | A column that points to another table's primary key | `fct_trials.customer_id` is an FK to `dim_customers` |
| **Star schema** | Facts in the center, dims around them via FKs | The pattern that makes marts composable |
| **Semantic model** | YAML metadata declaring entities, dimensions, measures on a model | What `models/intermediate/int_trials.yml` declares |

---

## 6. Customer vs Account in Method (foundational)

This is THE most-important distinction in Method's data model:

| | Identifier | Count | What it is |
|---|---|---|---|
| **Account** | `RecordID` (INT64) | ~144,862 | A Method billing entity. One row per account. |
| **Customer** | `EntityRecordID` (INT64) | ~118,962 | The parent entity that owns one-or-more accounts. |
| **Company name** | `CompanyAccount` (STRING) | matches account count | Display name for the account. Can drift over time via renames. |

**About 18% of accounts belong to multi-account customers.** Many real Method customers have 2, 3, or more accounts. So:
- "Account-level metric" = grouped by RecordID
- "Customer-level metric" = grouped by EntityRecordID (rolls up multiple accounts into one customer)

Both are legitimate; both are needed for different business questions. Phase 1.6 will build BOTH `dim_customers` and `dim_accounts` as separate marts, with FK from accounts → customers.

**Rule:** Always join by `EntityRecordID` for stable customer-level aggregation (because `CompanyAccount` strings drift). Use `RecordID` for account-level grain.

---

## 7. Where Method is in this stack today

| Layer | Method status (2026-05-12) |
|---|---|
| Sources | Implicit (Account, Funnel, TransLineFlattened). To be formalized in `_sources.yml` in Round 4. |
| Staging | Skipped (Alocet pre-cleans). |
| Intermediate | ~15 `v_*` views in BQ. Will be renamed `int_*` in Phase 1.5. |
| Marts | **None today.** Phase 1.6 builds `dim_customers`, `dim_accounts`, `fct_trials`, `fct_syncs`, `fct_conversions`. |
| Metrics | 3 live (`v_metric__trials`, `v_metric__syncs`, `v_metric__sync_rate`). 17 more in Phase 1. |

For the canonical phase list with status, see [`dbt-roadmap.md`](dbt-roadmap.md).
For the full target architecture, see [`dbt-architecture.md`](dbt-architecture.md).

---

## 8. When you're adding a new model — decision tree

```
Is the data dropped in by an upstream system (Alocet, Fivetran, manual upload)?
  → YES: it's a SOURCE. Declare in _sources.yml. Don't modify it.
  → NO: continue ↓

Is it a 1:1 cleanup of a source (rename, recast, drop bad rows)?
  → YES: it's a STAGING model. Name it stg_<source>.
  → NO: continue ↓

Is it a business entity (customer, account, deal, lead)?
  → YES: it's a dim (mart). Name it dim_<entity>.
  → NO: continue ↓

Is it a business event (trial, sync, conversion, ticket)?
  → YES: it's a fact (mart). Name it fct_<event>.
  → NO: continue ↓

Is it shared logic that 2+ marts/metrics will consume?
  → YES: it's an INTERMEDIATE. Name it int_<concept>.
  → NO: continue ↓

Is it a pre-computed (period, value) KPI series?
  → YES: it's a METRIC. Name it v_metric__<slug>.
  → NO: probably shouldn't exist as its own model. Inline into the consumer instead.
```

When in doubt, ask in the project's #data-engineering channel (or open a quick discussion in the relevant doc) before adding the model.

---

## 9. Key takeaway

**The marts layer is where business answers live.** Sources, staging, and intermediates are all just *preparation* to get clean, reusable building blocks ready. Metrics are *summaries* of marts. Consumers (humans, dashboards, AI, integrations) hit the marts directly.

Method's current state — heavy on intermediates, no marts — is the chrysalis stage. Phase 1.6's marts (`dim_customers`, `fct_trials`, etc.) are when Method's data becomes truly queryable by anyone, for anything. That's why pulling Phase 1.6 forward (before bulk-extending Round 4 metrics) was the right architectural call.

---

*Written 2026-05-12 from teaching conversation with Nic. Update this doc as conventions evolve.*
