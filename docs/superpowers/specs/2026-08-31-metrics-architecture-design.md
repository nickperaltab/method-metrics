# Metrics Architecture — Design

**Date:** 2026-08-31
**Status:** Draft for review (Nic; Justin for the revenue-family implications)
**Supersedes the direction sketched in:** `TICKETS.md` §"dbt as Definition Source of Truth", `docs/superpowers/specs/2026-07-10-metrics-mcp-design.md` (Phase 2 notes)

---

## 0. Where this sits

Five layers stand between a raw table and a person getting an answer:

```
PEOPLE       10 analysts · agent tooling · leadership · marketing · CS
   ▲
SURFACES     Metrics MCP · Claude skills · chart builder · scorecards · Method Monday
   ▲            ← the agent lives here; it can only point at what exists below
SEMANTICS    definitions · grain · filters-with-why · trust tier · lineage
   ▲            ← THIS DOC — today spread across five stores
MODELS       v_metric__* · fct_mrr_movement · dim_account/dim_customer · int_*
   ▲            ← THIS DOC — today the cut people want mostly doesn't exist
SOURCES      revenue · v7_classification · customer_signals · call_prep · marketing · net · ai
```

| In flight | Layer | Relationship to this doc |
|---|---|---|
| Metrics MCP (shipped 2026-07-10) | Surface | Already tiers what it serves: 20 verified, 13 approved intermediates, rest internal. Reads the dbt manifest, so it is honest — and blind to everything dbt doesn't own. |
| AI chart builder (alpha) | Surface | Restricted to verified metrics by design. Same ceiling: can show GRR, cannot show GRR by industry. |
| Claude skills for marketing / revenue | Surface | The roadmap's current bet — verified definitions delivered to people already in BQ. |
| **This document** | **Models + semantics** | The substrate all three stand on. |
| Widening the agent past 20 metrics | Surface | **Blocked by §2.2.** See §0a. |
| Composable CDP (Segment, AC, Amplitude) | Sources | Independent. But every source it lands needs this same semantics layer. |

### 0a. "Better views" or "an agent that guides people"?

Both — but they fix different failures, and the query log says which is actually happening.

| Failure | Nature | Evidence in the log |
|---|---|---|
| "I don't know where to look" | **Agent problem** — discovery, trust signals, tiering, docs | 10 undocumented core tables; 25 undocumented views in `revenue`; five definition stores |
| "I know where to look and it can't answer me" | **Model problem** — nothing to point at | 1,031 hand-rolled GRR; 1,066 join-tax queries; 2,334 re-implemented traps; 4,593 seat queries with no model |

**Failure B dominates.** The tell: `v_metric__annual_grr` has the widest audience of any metric view — 14 people. They know it exists and they use it. Then they leave it and rebuild the formula, because it returns one row per period and they needed a cut. A more helpful pointer to that view does not help them.

**And the agent inherits whatever it indexes.** The MCP is honest today because it reads `target/manifest.json` and therefore only knows the 20 dbt models. Point it at BigQuery metadata — the obvious next step for a "where should I look" agent — and it swallows the 20 hand-cut views from §2.2, all of which carry descriptions and labels, four of which claim `live` with a verification date nobody produced. It would recommend them fluently, with a citation.

So the ordering is a dependency, not a preference:

1. **Clean the shelf** (Phase 1) — trust labels start meaning something.
2. **Build the cuts people ask for** (Phase 1b) — there is something worth pointing at.
3. **Widen the agent** (Phase 5c) — index the whole warehouse, serve grain + filters-with-why + trust tier on every answer. The tiering pattern already exists in `mcp/metrics/src/tiers.ts`; it needs a substrate worth tiering.

---

## 1. The question

Metric definitions currently live in three places — dbt, Supabase, and hand-written BigQuery views. Should method-metrics become fully reliant on dbt?

**Answer: yes for definitions, no for everything else.** The split is not "dbt vs Supabase." It is **definition vs workflow**. Every definition moves to dbt. Supabase keeps the things that are genuinely application state.

The rest of this doc is the evidence, the target shape, and the enforcement that makes it hold.

---

## 2. What we actually have (measured 2026-08-31)

### 2.1 The registry

| Supabase `metrics` status | Rows |
|---|---:|
| `queued` | 111 |
| `live` | 26 |
| `directional` | 10 |
| **Total** | **147** |

### 2.2 The verified dataset is not verified

`revenue_metrics` was created to be the structural trust boundary — dbt-managed, documented, parity-checked. It currently holds **40 views. dbt owns 20 of them.**

The other 20 are hand-written directly in BigQuery:

| Hand-written view in `revenue_metrics` | Label `status` | Consumed by the app? |
|---|---|---|
| `v_metric__trial_conversion_rate_lagged` | `live` | Yes — metric #357 |
| `v_metric__sync_conversion_rate_budgeted` | `live` | Yes — metric #401 |
| `v_metric__sync_conversion_rate_forecasted` | `live` | Yes — metric #402 |
| `v_metric__sync_conversion_rate_weekly` | `live` | Yes — metric #403 |
| `v_metric__churn_mtd`, `_forecast_mtd`, `_trajectory`, `_rate_mtd`, `_rate_forecasted`, `_rate_trajectory` | `queued` | No |
| `v_metric__conversions_mtd`, `_forecast_mtd`, `_trajectory` | `queued` | No |
| `v_metric__syncs_mtd`, `_trajectory`, `v_metric__sync_rate_mtd` | `queued` | No |
| `v_metric__trials_mtd`, `_trajectory` | `queued` | No |
| `v_metric__sync_conversion_rate_trajectory` | `queued` | No |

Two separate problems here.

**Problem A — four views claim `status: live` and `verified_at: 2026-08-04` but have no model, no PR, and no parity record.** Nothing reviewed them. The label is self-asserted.

**Problem B — fifteen views labelled `queued` are sitting inside the dataset whose entire purpose is to mean "verified."** A `queued` metric should not have a view at all.

Every one of these 20 has a `description` and `labels`. That matters because [CLAUDE.md](../../../CLAUDE.md) tells readers (and the BQ MCP) that a description is the trust signal. **That signal is currently false.** Someone querying `revenue_metrics` today and following our own documented rule will quote an unverified number.

### 2.3 Definitions are written twice

Not one of the 20 dbt `v_metric__*` models is what the app queries. All 20 Supabase rows point somewhere else — at an `int_*` intermediate, or at nothing.

Trials (#54) is the clean example:

| Where | Definition |
|---|---|
| dbt | `models/metrics/v_metric__trials.sql` — `COUNT(*)` off `int_trials`, `DATE_TRUNC(SignupDate, MONTH)` |
| Supabase | `semantic_table: int_trials`, `semantic_measure: COUNT(*)`, `semantic_date_col: SignupDate` |

Same answer today. Nothing structural keeps them equal tomorrow. Change the dbt model and the app does not notice.

Monthly GRR (#382) is the same problem in the other direction: the formula `SAFE_DIVIDE({378} - {379} - {380}, {378}) * 100` exists only in Supabase, while `v_metric__monthly_grr.sql` exists only in dbt.

### 2.4 Live metrics resolving to non-dbt tables

Six of the tables backing live metrics are hand-written BQ views:

- `int_conversions` — backs Conversions (#56)
- `int_cancellations` — backs Churned Customers (#59)
- `v_metric__trial_conversion_rate_lagged` — #357
- `v_metric__sync_conversion_rate_budgeted` / `_forecasted` / `_weekly` — #401–403

### 2.5 An orphaned Method Monday layer

Fifteen of the rogue views declare `source_table: int_method_monday`. That view exists in `revenue`. It is **not** a dbt model, and `grep` finds **zero** references to it anywhere in this repo. A whole MTD/trajectory layer was built in the warehouse and never landed in version control.

### 2.6 A fourth definition store nobody counts

`builder/src/lib/*Sql.js` — **1,577 lines of hand-written SQL** shipped in the frontend bundle:

| File | Lines |
|---|---:|
| `netSaasSql.js` | 625 |
| `intakeMixSql.js` | 319 |
| `grrIndustrySql.js` | 174 |
| `channelTrajectorySql.js` | 140 |
| `funnelSql.js` | 135 |
| `retentionTriangleSql.js` | 115 |
| `cohortSurvivalSql.js` | 39 |
| `motionFunnelSql.js` | 30 |

These are metric definitions. They are not in dbt, not in Supabase, not in the registry, and not visible to the MCP or to anyone reading the catalog. `grrIndustrySql.js` even carries a comment saying its sign convention must match `v_metric__annual_grr` — a correctness dependency held together by a code comment.

### 2.8 What people actually do by hand

Scope: hand-written queries only. Looker Studio dashboard refreshes are excluded and are out of scope for this document by decision — they are a separate migration and not what this architecture serves.

**24,632 hand-written queries, 90 days, 25 accounts.** Who writes them:

| Person | Queries | Reads | Writes / DDL | `GROUP BY` analysis | Single-entity lookups |
|---|---:|---:|---:|---:|---:|
| n.peralta-baron | 13,278 | 8,565 | 4,360 | 4,515 | 775 |
| b.saltzman | 3,763 | 2,123 | 1,214 | 310 | 1,145 |
| n.shamji | 1,873 | 1,856 | 0 | 924 | 332 |
| s.trimble | 1,577 | 1,544 | 16 | 1,081 | 160 |
| michael | 1,530 | 1,519 | 0 | 1,151 | 160 |
| n.demiranda | 1,405 | 1,405 | 0 | 1,067 | 0 |
| a.yue | 797 | 792 | 0 | 483 | 48 |
| j.poon | 662 | 654 | 0 | 400 | 29 |
| saudia | 490 | 484 | 0 | 417 | 0 |
| m.chen / m.pran / i.dhaliwal / s.antonowicz | ~1,020 | ~1,020 | 0 | ~795 | ~35 |

Three distinct workloads, and they want different things:

- **Analysts** (n.demiranda, michael, saudia, m.chen, s.antonowicz, i.dhaliwal, n.shamji, s.trimble) — almost entirely `GROUP BY` aggregation, near-zero entity lookups. They want *correct dimensional aggregates*.
- **Tooling / agents** (b.saltzman, part of Nic) — 1,145 single-entity lookups against `call_prep`, `v7_classification`, `customer_signals`. They want *fast per-account reads*.
- **Warehouse authoring** (Nic 4,360 writes, b.saltzman 1,214) — only two accounts mutate anything from ad-hoc SQL.

### 2.8a What they ask about

| Subject | Queries | People |
|---|---:|---:|
| Funnel — trials / syncs / conversions | 9,225 | 21 |
| Industry / classification | 8,298 | 19 |
| Calls, transcripts, CS records | 6,763 | 15 |
| MRR / revenue | 5,401 | 20 |
| Churn / retention | 5,250 | 19 |
| Seats / licenses / pricing | 4,593 | 17 |
| Forecast / budget | 3,959 | 14 |
| Product events | 2,762 | 20 |
| Marketing / attribution | 2,704 | 16 |
| AI / LLM ops | 1,191 | 5 |

**Industry is the #2 subject in the warehouse.** And **seats / licenses / pricing — 4,593 queries, 17 people — has no dbt model at all.** It is the largest completely unmodelled subject.

### 2.8b The finding that matters: people rebuild metrics that already exist

Counting only analytical (`GROUP BY`) hand-written queries:

| What people write by hand | Queries | People |
|---|---:|---:|
| **Hand-rolls GRR/NRR from `StartMRR` − `Cancellations` − `Downgrades`** | **1,031** | **15** |
| Joins MRR to v7 labels | 872 | 14 |
| Handles the `0001-01-01` "never paid" sentinel | 748 | 10 |
| Excludes `IsConversionException` | 608 | 12 |
| Filters out the `Method Integration` partner | 566 | 12 |
| Dedupes `Account` with `ROW_NUMBER()` | 412 | 9 |
| Seats / licenses arithmetic | 380 | 9 |
| Joins `Account` to v7 labels | 194 | 5 |

**Fifteen people rebuilt GRR by hand 1,031 times while `v_metric__monthly_grr` and `v_metric__annual_grr` sat there, correct and verified.**

That is not an adoption failure. It is a design gap. The metric views answer exactly one question — *the company number for a period* — and return a single row per period. The moment anyone needs GRR **by segment, industry, size, or cohort**, the view is useless and they drop to `int_customer_mrr` and rewrite the formula. Every rewrite is a chance to get the sign convention or the PE exclusion wrong.

The five rows below GRR are worse in kind. They are **correctness traps re-implemented by hand**: the zero-date sentinel, the conversion-exception exclusion, the internal-partner filter, and the 1.22-rows-per-customer dedup on `Account`. Each is invisible when you get it wrong; each silently shifts the number. Nine to twelve people are each carrying them in their heads.

### 2.8c Compute cost is not a problem — do not optimise it

`Account` is **0.06 GB** (147,275 rows). `Trans` is 0.26 GB. Ninety days of all human querying against `revenue` billed 3.56 TB — about **$22**.

The scarce resource is people's time and their confidence in the number. Not slots.

### 2.9 The two collisions, re-scoped to people

Both were raised by Nic independently. The hand-written data changes what the fix should be.

**Collision 1 — industry. Analysts already switched; the join is the tax.**

Among hand-written queries, v7 beats legacy `Vertical` **6,468 to 1,661** — roughly 4:1. People are not reaching for the wrong column. They already prefer v7.

What they pay instead is a join, every single time: **872 queries by 14 people join MRR to v7 labels**, and 194 more join `Account` to them. `Vertical` is a column on **20 tables** in `revenue`; v7 lives in another dataset behind `account_record_id`.

So the fix is not a rename and not education. **It is putting `industry_l1/l2/l3` directly on the models people already query,** so the join disappears.

The disagreement is still worth knowing, from `v7_classification.v_vertical_vs_l1` (15,334 accounts, $1.70M MRR):

| MWD population, two ways | Accounts | MRR |
|---|---:|---:|
| Self-reported `Vertical` contains "(MWD)" | 2,862 | $401,306 |
| v7 `l1 = 'Manufacturing & Distribution'` | 3,440 | $543,745 |
| **Both agree** | **2,062** | — |

49% overlap. Anyone still slicing by `Vertical` gets about half the right accounts and 74% of the MRR. A further 2,921 accounts ($213K MRR) are `UNCLASSIFIABLE` — they need evidence, not a default bucket.

**Collision 2 — account grain and customer grain are indistinguishable in SQL.**

`CompanyAccount` appears in 2,907 hand-written queries, `EntityRecordID` in 4,597. **791 queries count `DISTINCT CompanyAccount` and alias the result as a customer count.** One customer with three accounts reads as three customers.

Underneath it, **412 queries by 9 people hand-write a `ROW_NUMBER()` dedup on `Account`** — because it carries ~1.22 rows per `EntityRecordID` and un-deduped joins fan out on top of the grain error. Nine people independently maintaining the same defensive pattern is the definition of something that belongs in a model.

### 2.10 Summary of the mix

Five stores, no single owner:

1. dbt models — 51 models, rich `meta`, correct but largely unread by the app
2. Supabase `metrics` — 147 rows, 37 columns, mixes definition and workflow
3. Hand-written BQ views in `revenue_metrics` — 20, masquerading as verified
4. Hand-written BQ views in `revenue` — `int_method_monday`, `int_conversions`, `int_cancellations`, and 25 of 78 views with no description at all
5. Frontend SQL modules — 1,577 lines

And the layer meant to resolve all of it is used by under 4% of queries (§2.8).

---

## 3. Target architecture

### 3.1 Four tiers, one owner each

```
Tier 0  SOURCES          dbt sources over raw BQ tables
        models/_sources.yml                         → schema: revenue

Tier 1  INTERMEDIATES    int_*  — row grain, sliceable
        dbt-managed. Carries meta.semantic so the app can
        build dimensional GROUP BYs from the manifest.
        NEVER quoted directly as "the number."         → schema: revenue

Tier 2  METRICS          v_metric__*  — one row per period
        dbt-managed, ONLY dbt-managed.
        This dataset means "verified." Enforced in CI.  → schema: revenue_metrics

Tier 3  CONSUMERS        chart builder · tracker · MCP · Method Monday · Looker
        All resolve definitions from the manifest projection.
        None of them author SQL.
```

**Supabase** sits beside this, not inside it. It holds workflow state, the backlog, and application objects (saved charts, dashboards, users). It is keyed by **dbt model name**.

### 3.2 The five invariants

1. **One definition, one place.** If it changes a number or its meaning, it is in dbt. No exceptions, no caches, no "we'll sync it."
2. **The dataset is the trust boundary, and CI enforces it.** A view in `revenue_metrics` that dbt does not own fails the build. Convention that can be violated silently is not a boundary.
3. **Status is a property of the definition, so it lives with the definition.** Changing a metric to `live` is a pull request, reviewed alongside the SQL that earned it.
4. **The dbt model name is the key.** Numeric metric IDs are legacy. Keep `meta.metric_id` as an alias through the transition, then retire it.
5. **Consumers never author SQL.** The frontend composes queries from manifest metadata. It does not contain metric logic.

### 3.3 Which tier answers which question

| Question | Tier | Example |
|---|---|---|
| "What was GRR in July?" | Tier 2 | `v_metric__monthly_grr` |
| "GRR by industry in July?" | Tier 1 | `int_customer_mrr` + `meta.semantic` |
| "Who owns this metric, what's its priority?" | Supabase | workflow columns |
| "What metrics do we not have yet?" | Supabase | the 111 `queued` rows |

Rule of thumb: **Tier 2 gives the number. Tier 1 explains it. Supabase tracks the work.**


### 3.4 What the usage data says to build

Ranked by the hand-written evidence in §2.8b. This is the actual backlog.

**1 — `fct_mrr_movement`: make GRR sliceable — fixes 1,031 queries / 15 people**

One model at customer-month grain carrying the movement components *and* the dimensions already joined: `industry_l1/l2/l3`, `operating_model`, segment, size band, cohort. GRR by anything becomes a `GROUP BY` plus one ratio, instead of a re-derived formula.

Ship the ratio as a documented macro or a column so the sign convention (cancellations and downgrades are positive magnitudes, subtracted) is written once. Today it is written 1,031 times.

Keep `v_metric__monthly_grr` and `v_metric__annual_grr` as the headline number. They are not the problem — they are answering a narrower question than people ask.

**2 — Industry rides along — fixes 872 + 194 queries / 14 people**

Add `industry_l1/l2/l3`, `industry_confidence`, `industry_needs_review` to `int_customers`, `int_customer_mrr`, `int_customer_annual_mrr`, `int_trials`, `int_syncs`. **Additive only** — leave `Vertical` alone. Analysts have already stopped using it, and the remaining users are dashboards this document does not cover.

Carry `UNCLASSIFIABLE` through as itself. Never coerce it to "Other".

**3 — Apply the correctness traps once — fixes 748 + 608 + 566 + 412 queries**

Every trap currently living in people's heads becomes a filter in a model, documented in `meta.filters` with its why:

| Trap | Hand-written today | People |
|---|---:|---:|
| `FirstSaaSInvoiceTxnDate = '0001-01-01'` means never-paid, not a date | 748 | 10 |
| `IsConversionException = FALSE` | 608 | 12 |
| `Partner != 'Method Integration'` | 566 | 12 |
| `Account` is ~1.22 rows per customer — dedup before joining | 412 | 9 |

`dim_account` (one row per account, keyed `account_id`) and `dim_customer` (one row per customer, keyed `customer_id`, carrying `account_count`) are where the last one goes. Count columns are named `n_accounts` / `n_customers`, never a bare total. Every model declares `meta.grain`.

**4 — Model seats / licenses / pricing — 4,593 queries, 17 people, zero models**

The largest unmodelled subject in the warehouse. Seventeen people each derive it from `Item` / `Trans` / `Account`. Scope it with its own definition pass; this is not a quick view.

**5 — A test, so it does not decay**

A model exposing both an account key and a customer key without declaring `meta.grain` fails the build.

---

## 4. Field disposition

Every column of Supabase `metrics`, and where it goes. Frontend usage counts are `grep` hits across `builder/src` + `tracker.html`.

### 4.1 Definitional → move to dbt

| Column | Uses | Destination |
|---|---:|---|
| `chart_sql` | 44 | The dbt model's SQL |
| `semantic_table` | 26 | `meta.semantic.table` |
| `semantic_date_col` | 16 | `meta.semantic.date_col` |
| `semantic_measure` | 11 | `meta.semantic.measure` |
| `semantic_dimensions` | 8 | `meta.semantic.dimensions` |
| `semantic_filters` | 5 | `meta.semantic.filters` |
| `formula` | 65 | The dbt model's SQL; `meta.formula_display` for the human string |
| `formula_display` | 4 | `meta.formula_display` |
| `depends_on` | 61 | Derived from dbt `ref()` lineage |
| `view_name` | 127 | Replaced by the model name |
| `view_definition` | 20 | Already deprecated — drop |
| `supported_grains` | 3 | `meta.semantic.grains` |
| `metric_type` | 33 | `meta.type` (already a BQ label) |
| `description` | 62 | dbt `description` (already there) |
| `status` | 157 | `meta.status` + BQ label (already there — becomes the only copy) |
| `verified_at` | 8 | `meta.parity_verified.date` (already there) |
| `primitive_metric_id` | 5 | dbt lineage |
| `base_table`, `agg_expression`, `measure_expression`, `required_column`, `dimensions` | 0–25 | Dead or superseded — audit and drop |

### 4.2 Workflow → stays in Supabase

| Column | Uses | Why it stays |
|---|---:|---|
| `priority` | 11 | Changes without a code change |
| `assigned_to` | 10 | Ditto |
| `notes` | 20 | Working notes, not definition |
| `stage` | 38 | Funnel grouping for the UI |
| `source`, `source_url` | 40 / 9 | Provenance links for the backlog |
| `display_format`, `sort_order`, `chart_type` | 4 / 1 / 0 | Presentation |
| the 111 `queued` rows | — | A backlog of requests. No SQL exists, so there is nothing for dbt to own. |

### 4.3 New column

| Column | Purpose |
|---|---|
| `dbt_model` | Pointer to the dbt model name. The join key. Nullable — `queued` rows have no model yet. |

---

## 5. Status vocabulary

Three vocabularies are in use right now and none of them match:

- dbt labels: `live`, `queued`
- Supabase: `live`, `queued`, `directional`
- [metric-definitions.md](../../metric-definitions.md): `live`, `queued`, `under_review`

**Proposed canonical set — four states, each defined by what a consumer is allowed to do:**

| Status | Consumer may | Has a `v_metric__` view? |
|---|---|---|
| `live` | Quote externally — board decks, customer-facing | Yes |
| `directional` | Quote internally, with the caveat attached. Trend-safe, level-unsafe. | Yes |
| `under_review` | Do not quote. Was live; something is questioned. | Yes, but flagged |
| `queued` | Nothing — it does not exist yet | **No** |

`directional` earns its place: the 10 channel-attribution metrics are real and useful but not quotable, and collapsing them into `live` or `queued` loses information.

The `queued` row of that last column is the fix for §2.2 Problem B. **If it is `queued`, it has no view.** The 15 `queued` views in `revenue_metrics` either get promoted properly or get dropped.

---

## 6. Enforcement

Documentation did not prevent any of §2. These are the checks that make the architecture structural instead of aspirational. **This section is the point of the whole design.**

| # | Check | Fails when | Where |
|---|---|---|---|
| 1 | **Dataset purity** | A view exists in `revenue_metrics` that dbt does not own | CI, nightly |
| 2 | **Status source** | A BQ label `status` disagrees with the model's `meta.status` | `dbt run` post-hook |
| 3 | **No live without definition** | `meta.status: live` and any of `answers` / `grain` / `filters` / `methodology_source` / `parity_verified` is missing | dbt test |
| 4 | **Registry pointer valid** | A Supabase row with `status != queued` has a `dbt_model` that is not in the manifest | CI |
| 5 | **No new frontend SQL** | A new `*Sql.js` file appears, or an existing one grows | lint rule + ratchet |

Check 1 alone would have caught all 20 rogue views. Check 3 would have caught the four self-asserted `live` labels.

---

## 7. Migration

Ordered so that each phase leaves the system working and each phase is independently valuable. Sizings assume focused work.

### Phase 0 — Stop the bleeding (½ day)

Nothing moves. Add Check 1 and Check 3 as reporting-only (warn, do not fail). Publish the list of violations. This is the honest baseline and it makes every later phase measurable.

### Phase 1 — Reclaim `revenue_metrics` (~3 days)

**Measured 2026-09-01.** `revenue_metrics` holds **39 views. dbt owns 20. Nineteen are unmanaged** — hand-cut in the BigQuery console, carrying descriptions and labels that make them look verified.

**None of them are dead.** Every one was queried in the last 30 days:

| Unmanaged view | Queries (30d) | People |
|---|---:|---:|
| `v_metric__trial_conversion_rate_lagged` | 312 | 6 |
| `v_metric__conversions_trajectory` | 282 | 6 |
| `v_metric__sync_conversion_rate_budgeted` | 275 | 6 |
| `v_metric__syncs_trajectory` | 272 | 7 |
| `v_metric__sync_conversion_rate_forecasted` | 242 | 6 |
| `v_metric__sync_conversion_rate_trajectory` | 216 | 6 |
| `v_metric__conversions_mtd` | 119 | 6 |
| `v_metric__churn_trajectory` | 115 | 2 |
| `v_metric__churn_rate_forecasted` | 110 | 6 |
| `v_metric__churn_rate_trajectory` | 108 | 6 |
| `v_metric__trials_trajectory` | 105 | 2 |
| `v_metric__churn_rate_mtd` | 104 | 6 |
| `v_metric__churn_forecast_mtd` | 101 | 2 |
| `v_metric__churn_mtd` | 100 | 2 |
| `v_metric__conversions_forecast_mtd` | 99 | 2 |
| `v_metric__syncs_mtd` | 97 | 2 |
| `v_metric__trials_mtd` | 92 | 2 |
| `v_metric__sync_rate_mtd` | 91 | 3 |
| `v_metric__sync_conversion_rate_weekly` | 84 | 7 |

Plus the shared upstream: **`revenue.int_method_monday`** — 443 queries, 2 people (Nic, n.demiranda), not a dbt model, not a dbt source, referenced nowhere in this repo. Fifteen of the nineteen sit on it, so it is adopted first.

**Everything here is adopted into dbt, not dropped.** The earlier "drop the queued views" instruction was wrong; usage disproves it.

---

#### Definition of done — per view

A view is done when **all seven** hold. No partial credit.

1. **Model exists.** `models/metrics/<name>.sql`, materialized as a view, landing in `revenue_metrics` via the folder's `+schema: metrics`. Upstream references use `ref()` / `source()` — no hardcoded `project-for-method-dw.` strings.
2. **Definition authored.** A `.yml` with `description` plus a `meta:` block carrying every non-negotiable field from `docs/metric-definitions.md` §1: `answers`, `grain`, `filters` (each with its `why`), `methodology_source`, `parity_verified`, `caveats`, `used_by`. Fields with no honest answer are left absent, not invented — and an absent `parity_verified` blocks `live`.
3. **Parity proven, not asserted.** Snapshot the pre-change output per the CLAUDE.md rule, apply, re-run the same query, and paste the **row-by-row diff** into the PR. Bar is **exact match**. "Looks in range" fails this gate. A genuine difference is allowed only if the PR explains the cause and Nic signs it off.
4. **Builds green.** `dbt run --select <model>` and `dbt test --select <model>` both pass.
5. **The BQ relation is dbt's.** After `dbt run`, the view in `revenue_metrics` is the one dbt built — the hand-cut original is gone, not shadowed.
6. **Status reflects evidence.** The `status` label is re-derived from what the model can actually prove, never copied forward. Specifically: the four views currently self-asserting `live` with `verified_at: 2026-08-04` (#357, #401, #402, #403) start at `under_review` and only reach `live` once gate 3 produces real parity evidence.
7. **Name-vs-math audit passed.** The `docs/metric-definitions.md` §3 checklist is run and its answer recorded in the PR. A view whose name implies something its SQL does not compute ships `under_review`, not `live`.

#### Definition of done — the phase

The shelf is clean when all six hold:

1. **Zero unmanaged views.** This query returns **0 rows**:

```sql
SELECT table_name
FROM `project-for-method-dw.revenue_metrics.INFORMATION_SCHEMA.VIEWS`
WHERE table_name NOT IN (<the dbt-owned model list from the manifest>)
```

2. **All 20 accounted for.** Each of the 19 views plus `int_method_monday` is either adopted (gates 1–7 green) or dropped — and a drop requires a stated 30-day query count and a named person who confirmed they don't need it. Silent deletion fails.
3. **CI enforces it.** Check 1 (dataset purity) and Check 3 (no `live` without a complete definition) from §6 are implemented and **failing the build**, not warning.
4. **No consumer broke.** The four app-consumed views (#357, #401–403) return values identical to their pre-change snapshots, and the Sales Scorecard and Method Monday pages render with no empty series.
5. **The trust claim is true again.** `CLAUDE.md`'s "a description is the trust signal" statement holds — every view in `revenue_metrics` is dbt-managed, described, and carries a status derived from evidence.
6. **Re-measured.** The §2.2 table in this doc is re-run and shows 39 of 39 dbt-owned.

#### Explicitly not in this phase

- `int_conversions` (592 queries, 9 people) and `int_cancellations` (439, 8) — non-dbt intermediates in the live path. Real, but they live in `revenue`, not on the shelf. Phase 5.
- The 25 undocumented views in `revenue`. Phase 5b.
- Anything in Track B — `fct_mrr_movement`, the mart layer, seats/pricing.

#### Sizing

Nineteen views plus one upstream, at roughly 30–45 minutes each when the DDL transfers cleanly (snapshot, port, parity diff, definition, audit). **~2.5 days**, plus half a day for the two CI checks. Adoption order follows the usage table above, heaviest first, so the highest-traffic views are governed soonest.

### Phase 1b — Build what the usage data says people need (4–5 days)

Independent of the dbt/Supabase consolidation, and the highest-value work in this document. Ordered by how many hand-written queries each item retires.

1. **`fct_mrr_movement`** with dimensions pre-joined, plus the GRR/NRR ratio written once. Retires 1,031 hand-rolled queries across 15 people. *(2 days)*
2. **Industry columns onto the five `int_*` models** people already query. Additive. Retires 1,066 hand-written joins across 14 people. *(1 day)*
3. **`dim_account` / `dim_customer`**, with the four correctness traps applied and documented, plus the `meta.grain` test. Retires 2,334 defensive re-implementations. *(1–1.5 days)*

Re-measure §2.8b after 30 days. The metric is simple and honest: **does the hand-rolled GRR count go down?** If people still rebuild it, the model did not give them what they needed and the next step is asking the five heaviest analysts why, not building more.

### Phase 2 — Manifest carries the semantic layer (1 day)

1. Extend `projectManifest` ([builder/src/lib/dbtProjection.js](../../../builder/src/lib/dbtProjection.js)) to emit `meta`, including `meta.semantic` and `meta.status`.
2. Port the 13 live semantic definitions from Supabase columns into each model's `meta.semantic`. Snapshot values before, diff after.
3. `scripts/build_dbt_models_json.mjs` already runs on `prebuild`/`predev`, so the projection ships with no new plumbing.

### Phase 3 — Frontend reads the manifest (1 day)

1. `buildSemanticSql` ([bigquery.js:322](../../../builder/src/lib/bigquery.js:322)) and [chartDataBuilder.js:112](../../../builder/src/lib/chartDataBuilder.js:112) resolve from the manifest first, Supabase as fallback.
2. [sql/plan.js:154](../../../builder/src/lib/sql/plan.js:154) resolves derived formulas from dbt lineage rather than `depends_on` integers.
3. Remove the fallback once nothing hits it.

### Phase 4 — Registry demotion (½ day)

1. Add `dbt_model` to Supabase; backfill from `meta.metric_id`.
2. Make `status` read-through from the manifest.
3. Drop the definitional columns listed in §4.1.
4. Add Check 4.

### Phase 5 — Absorb `int_conversions` and `int_cancellations` (1 day)

Bring both into dbt as real intermediates, with parity snapshots. They back two live metrics (#56, #59) and are the last non-dbt tables in the live path.

### Phase 5c — Widen the agent (2–3 days)

Unblocked once Phase 1 lands. Extend the MCP beyond the dbt manifest to the whole warehouse, and make every answer carry `meta.grain`, `meta.filters` and trust tier. The tier machinery already exists (`mcp/metrics/src/tiers.ts`, `INTERMEDIATE_WARNING`); what is missing is a warehouse whose labels can be believed.

### Phase 5b — Describe the tables people actually use (½ day)

The ten most hand-queried tables in `revenue` have **no description at all**:

| Table | Hand queries | People |
|---|---:|---:|
| `Account` | 10,088 | 21 |
| `Entity` | 4,452 | 16 |
| `Item` | 4,407 | 13 |
| `Trans` | 4,397 | 13 |
| `method_forecast` | 2,849 | 8 |
| `Contacts` | 1,833 | 13 |
| `Activity` | 1,420 | 11 |
| `Cases` | 415 | 9 |
| `TimeTracking` | 198 | 5 |
| `demo_bookings` | 75 | 5 |

CLAUDE.md tells readers to avoid undocumented tables. Taken literally, that rules out the ten tables the company runs on. Either describe them or drop the rule — the current state teaches people to ignore the rule, which is worse than not having it.

Half a day of `persist_docs` for the highest documentation-leverage work available.

### Phase 6 — Frontend SQL, ongoing

1,577 lines is not a sprint. Add Check 5 as a ratchet so it cannot grow, then migrate opportunistically — a module moves to dbt whenever its scorecard is next touched. `netSaasSql.js` (625 lines) is the biggest and should be scheduled deliberately rather than absorbed incidentally.

**Total for Phases 0–5: roughly 11–13 focused days** (up from the first draft — Phase 1 grew when the usage data showed the rogue views must be adopted rather than dropped, and Phase 1b was added). Phase 6 is continuous.

If only one thing gets done, make it **Phase 1b step 1** — `fct_mrr_movement`. Fifteen people rebuild that metric by hand a thousand times a quarter, and each rebuild is a chance to get it wrong.

---

## 7a. Explicitly out of scope

**Looker Studio dashboards.** They generate ~30,000 queries a quarter against four raw tables and touch the governed layer zero times. That is a real problem and a separate project. This document serves the 25 people writing SQL by hand; it does not attempt to fix the dashboards.

---

## 8. What this does not solve

Stated plainly so nobody assumes otherwise.

- **It is not the agent.** This is the substrate the agent stands on. Shipping it well makes a guidance agent possible and safe; it does not build one.
- **It does not verify any metric.** Structure makes drift visible; it does not make numbers right. The `metric-solver` workflow still does that work.
- **It does not touch the 111 queued rows.** They are a backlog and stay one.
- **It does not remove BigQuery-side authoring.** Someone with console access can still create a view. Check 1 catches it within a day; it does not prevent it.
- **It adds a dbt dependency to shipping a metric.** That is the intended cost. Today a metric can ship in five minutes via the BQ console — which is exactly how §2.2 happened.

---

## 9. Open questions

1. ~~Is `int_method_monday` safe to drop?~~ **Answered: no.** It is the upstream for 15 actively-queried views. It gets adopted into dbt first, not dropped.
2. **Do the four self-asserted `live` views (#357, #401–403) have any parity evidence anywhere?** If not, do they drop to `under_review` during Phase 1, or stay `live` on Nic's judgement while the models are built?
3. **Confirm the four-status vocabulary in §5** — this becomes the dbt label enum and is annoying to change later.
4. **Who owns the conversation with paul and j.poon?** They are 51% of BigQuery traffic and have used the canonical layer 6 times combined. No amount of architecture fixes that; §2.8 is a people finding wearing a schema costume.
5. **Does `fct_mrr_movement` need cohort and size bands on day one,** or do industry + operating_model + segment cover the 1,031 hand-rolled queries? Worth sampling 20 of them before scoping.
6. **Who scopes seats / licenses / pricing?** 17 people query it, no model exists, and it needs a definition pass before any SQL. This is the biggest greenfield item and it has no owner.
7. ~~Does the `Vertical` rename need a deprecation window?~~ **Dropped** — analysts already moved to v7 on their own; the rename fixes nothing for them, or does it ship with an announcement and a one-week grace alias?
