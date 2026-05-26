# Method-metrics dbt Roadmap

**Purpose:** Single source of truth for "where are we, what's next, what's done." Updated as work ships.

**Last updated:** 2026-05-08

**Related docs:**
- [`docs/dbt-layers-explained.md`](dbt-layers-explained.md) — **plain-English explanation of each dbt layer** (sources, staging, intermediate, marts/dim/fct, metrics). Read this if you're new to the project.
- [`docs/dbt-marts-spec.md`](dbt-marts-spec.md) — **Phase 1.6 marts design spec** (driven by Method Monday, Looker replacement, AC integration, Claude/MCP use cases). Q1–Q9 product decisions to lock before implementation.
- [`docs/dbt-architecture.md`](dbt-architecture.md) — target architecture + layer dictionary
- [`docs/dbt-scaffold-handoff.md`](dbt-scaffold-handoff.md) — round-by-round decision log
- [`docs/dbt-setup.md`](dbt-setup.md) — Fusion install + project setup
- [`docs/metric-definitions.md`](metric-definitions.md) — **the canonical definition for every live metric.** A metric does not flip `live` until it has an entry here. See template + audit checklist at the top of that file.

---

## At a glance

| Phase | Goal | Status |
|---|---|---|
| Phase 1 — Round 1 | Initial scaffold (3 metrics, paper only) | ✅ Done |
| Phase 1 — Round 2 | Fix syntax (latest-spec) + add Sync Rate | ✅ Done |
| Phase 1 — Round 2.5 | EntityRecordID + dbt-native materialization | ✅ Done |
| Phase 1 — Round 3a | Bug fix (self-reference) + first `dbt run` | ✅ Done |
| Phase 1 — Round 3b | Pilot Customers + Monthly Start MRR | ✅ Done (2026-05-12) |
| Phase 1 — Round 4 | Annual MRR family (4) + Conversions + Churn + 2 ratios (11 total — minus 3 monthly already in 3b's actual coverage = 9 net) | ✅ Done (2026-05-14) |
| Phase 1 — Round 5 | GRR/NRR family (#382, #383, #388, #389) | ✅ Done (2026-05-14) |
| **🎯 Phase 1 complete** | **20 / 20 live metrics in dbt + BQ, parity-verified** | **✅ 2026-05-14** |
| Phase 1 — Round 4 | Bulk extend to remaining ~13 simple/ratio metrics | ⏳ Planned |
| Phase 1 — Round 5 | GRR/NRR migration (protected family) | ⏳ Planned |
| **Phase 1 done = 20 metrics reliable in BQ** | All metrics dbt-managed with correct columns + catalog metadata | 🎯 Target state |
| Phase 1.5 | `v_*` → `int_*` rename (single one-shot PR) | ⏳ Deferred until end of Phase 1 |
| Phase 1.6 | Marts layer (`dim_customers`, `dim_accounts`, `fct_*`) — designed from real query evidence | ⏳ Deferred to AFTER Phase 1 (see [marts spec](dbt-marts-spec.md) — currently speculative) |
| Phase 1.7 | Frontend migration (tracker.html, chart builder, AI catalog → BQ) | ⏳ Deferred |
| Phase 2 | Evaluate Cube.dev / MetricFlow IF external API consumers materialize | 🟦 Conditional |

---

## Phase 1 — Migrate live metrics to dbt

Goal: all 20 live metrics have dbt-managed definitions in git, with BQ INFORMATION_SCHEMA serving as a viable secondary source of truth for metric metadata.

### ✅ Round 1 (initial scaffold, ~2026-05-04)
- [x] Install dbt-agent-skills plugin
- [x] Pick 3 pilot metrics (Trials, Syncs, Sync Rate)
- [x] Decide on yml + sql file shape vs. raw BQ DDL
- [x] Write conventions mapping doc (`dbt-conventions-mapping.md`)
- [x] Scaffold v_metric__trials.{yml,sql} as the reference shape
- [x] First handoff doc

### ✅ Round 2 (fixes from round-1 review, ~2026-05-04)
- [x] Fix latest-spec syntax in `v_trials.yml` (drop `type_params`, `measures:`)
- [x] Drop `metric_ref` field
- [x] Scaffold Sync Rate as cross-model ratio metric
- [x] Create `models/metrics/_metrics.yml` for top-level metrics
- [x] Scaffold `v_syncs.yml` + materialization pair

### ✅ Round 2.5 (deferred follow-ups, ~2026-05-05)
- [x] Add `EntityRecordID` to `v_trials` and `v_syncs` BQ views
- [x] Convert raw DDL → dbt-native materialization (description + labels)
- [x] Install dbt Fusion 2.0.0-preview.175
- [x] Write `docs/dbt-setup.md` with version pin
- [x] Push to GitHub (commit `522cba4f`)

### ✅ Round 3a (bug fix + first dbt run, 2026-05-08)
- [x] Discover self-reference bug (`v_trials.sql` was passthrough that would destroy real DDL)
- [x] Inline filter logic into intermediate model files
- [x] First successful `dbt run` — 5 views materialized
- [x] Parity-verify: dbt sync_rate matches reconstructed-from-source to 6 decimals × 10 months
- [x] Add `+persist_docs` config so descriptions land on BQ views
- [x] Confirm Registry-UI-visible metadata via INFORMATION_SCHEMA query
- [x] Add pre-change snapshot rule to CLAUDE.md
- [x] Push (commits `897d3323`, `e6592a13`)

### ✅ Round 3b — Pilot 2 more metrics (2026-05-12)
- [x] Scaffold `v_metric__customers` (#373) consuming `v_customers` via `{{ source(...) }}`
  - Tests `count_distinct` aggregation pattern
  - Includes Supabase's `IsActive = TRUE` filter (was missed in initial review, caught + applied)
- [x] Scaffold `v_metric__monthly_start_mrr` (#378) consuming `v_customer_mrr`
  - Tests `SUM` with `ROUND` wrapper pattern
  - Inherits CEO-confirmed Prepay Expiry methodology from upstream `v_customer_mrr`
- [x] **NEW: `models/_sources.yml`** declaring revenue dataset sources (Account, Funnel, TransLineFlattened, method_forecast + BQ-managed `v_customers`, `v_customer_mrr`, etc.). Phase 1.5 will migrate the `v_*` intermediates to dbt-managed `int_*` models.
- [x] `dbt compile` clean (7 models | 3 metrics | 2 semantic models | 7 success)
- [x] `dbt run` succeeded — both new BQ views materialized in `revenue` dataset
- [x] Parity-check: 23 / 23 spot-checked values match exactly (12 months Customers + 11 months Monthly Start MRR — penny-match)
- [x] BQ catalog metadata propagated (description + 9 labels per view, queryable via `INFORMATION_SCHEMA.TABLE_OPTIONS`)

**Patterns now proven:** `COUNT(*)`, `COUNT(DISTINCT)`, `SUM` with `ROUND`, semantic_filters as WHERE clauses, ratio metrics, source declarations via `{{ source(...) }}`. Round 4 has the full pattern toolkit.

### 🟡 Zoom-out architecture session (IN PROGRESS — questions being walked through)
- [x] Q1: Source declarations (sources.yml) — **YES, add them in Round 4 setup**
- [x] Q2: Supabase metrics table fate — **A (retire), but staged across Phase 1 → Phase 1.7**
- [ ] Q3: Breakdowns family classification (intermediate vs mart) — **pending discussion**
- [ ] Q4: `dim_customers` timing — **answered indirectly: X (defer to Phase 1.6, build customer metrics on existing intermediates now)**
- [ ] Lock all decisions in `docs/dbt-architecture.md`
- [ ] Capture explicit technical debt list

### ⏳ Round 4 — Bulk extend (after zoom-out is locked)
Scope: scaffold the remaining ~13 simple/ratio live metrics in dbt.

Setup tasks:
- [ ] Create `models/_sources.yml` declaring `Account`, `Funnel`, `TransLineFlattened`, `method_forecast`
- [ ] Refactor existing models to use `{{ source(...) }}` instead of hard-coded paths

Metric migration (group by family):
- [ ] **Single-account-grain simple** — #56 Conversions, #59 Churn (`COUNT(DISTINCT CompanyAccount)`)
- [ ] **MRR family monthly** — #379 Monthly Cancellations $, #380 Monthly Downgrades $, #381 Monthly Expansions $ (all `ROUND(SUM(...), 2)` from `v_customer_mrr`)
- [ ] **MRR family annual** — #384 Annual Start MRR, #385 Annual Cancellations, #386 Annual Downgrades, #387 Annual Expansions (mirror of monthly)
- [ ] **Cross-model ratios** — #301 Sync-to-Conversion Rate (Conversions/Syncs), #302 Trial-to-Conversion Rate (Conversions/Trials)

Validation:
- [ ] Per-metric parity check (capture pre-change values; diff post-`dbt run`)
- [ ] All metrics return non-empty for the last 24 months
- [ ] Registry-UI metadata query returns expected labels

### ⏳ Round 5 — GRR/NRR (most carefully)
Protected: CEO methodology was just confirmed; do not change values during migration.

- [ ] Scaffold #382 Monthly GRR % as `type: derived` with 3-input formula
- [ ] Scaffold #383 Monthly NRR % as `type: derived` with 4-input formula
- [ ] Same for #388 Annual GRR %, #389 Annual NRR %
- [ ] **Snapshot-and-compare rule**: parity-check each against current production values to 6 decimals before / after
- [ ] If ANY divergence > 0.0001: stop, investigate, do not ship until resolved
- [ ] Coordinate with Justin (revenue model owner) before ship

---

## Phase 1.5 — Naming convention rename

Goal: rename `v_*` intermediates to `int_*` to match dbt convention.

**Why deferred:** scope audit (handoff §12.5) showed ~4 production code files, 10+ test files, 2 Supabase rows, 6+ doc files reference the names. A 1–2 hour dedicated change with testing. Bundling with bug fixes or migrations multiplies risk.

**Trigger to start:** all 20 metrics migrated to dbt (end of Round 5).

- [ ] Sweep all references: builder/src/lib/, builder/src/config/scorecards/, builder/tests/, knowledge/, docs/, scripts/
- [ ] Update Supabase metric rows #54, #55 (`view_name` + `semantic_table` columns)
- [ ] Rename `v_*.sql/.yml` → `int_*.sql/.yml` in `models/intermediate/`
- [ ] Update all `{{ ref('v_*') }}` to `{{ ref('int_*') }}` in dbt scaffold
- [ ] Run `dbt run` to create `int_*` views in BQ
- [ ] Drop old `v_*` views once nothing references them (after observation window)
- [ ] Update knowledge docs, planning docs, this roadmap

---

## Phase 1.6 — Marts layer

Goal: add `dim_*` (dimensions) and `fct_*` (facts) marts as the business-facing consumption layer.

**Why deferred:** marts should be designed against full evidence — knowing what queries the chart builder, scorecards, and AI need to support. We don't have that visibility until Round 5 completes.

**Trigger to start:** after Phase 1.5 rename ships and we have ~2 weeks of operating with the full dbt-managed metric set.

- [ ] Design `dim_customers` against all 9 customer-grain metric queries
  - Columns: EntityRecordID, CompanyAccount, SignupDate cohort, FirstSync date cohort, attribution channel, vertical, current MRR tier, churn status, etc.
- [ ] Design `fct_trials`, `fct_syncs`, `fct_conversions` with denormalized attribution
- [ ] Refactor customer-grain metrics from `v_customer_mrr` / `v_customers` → `dim_customers`
- [ ] Refactor event-grain metrics from `v_trials` / `v_syncs` → `fct_trials` / `fct_syncs`
- [ ] Parity-check every refactored metric
- [ ] Update semantic models to attach to marts (dbt-canonical pattern)

---

## Phase 1.7 — Frontend migration

Goal: tracker.html and chart builder read metric catalog from BigQuery, not Supabase. Final step in retiring Supabase's `metrics` table.

**Why deferred:** tracker rewrite is a real product change (~2-3 hours for the read path, + design + build for the inline-edit replacement). Doing it before Phase 1.6 marts exist means rewriting it again.

**Trigger to start:** after Phase 1.6 marts exist and the chart builder has a stable target schema.

- [ ] Build a thin "metric catalog" abstraction layer (could be an Edge Function or a frontend module)
- [ ] Migrate tracker.html's metric-list reader from Supabase REST → BQ INFORMATION_SCHEMA
- [ ] Migrate `builder/src/lib/supabase.js fetchMetrics()` → BQ INFORMATION_SCHEMA
- [ ] Migrate AI chart builder's catalog generation → BQ INFORMATION_SCHEMA
- [ ] Decide on inline-edit workflow (PR-based via Claude? backend service? direct BQ writes?)
- [ ] Migrate `/metric-solver` skill to write to dbt files + run `dbt run` instead of patching Supabase
- [ ] Plan a metric tracker UI v2 (PM-flagged requirement: "still want a nice UI to visually see all metrics and dependencies")
- [ ] Observe ~2 weeks for any silent Supabase reads
- [ ] **Drop Supabase `metrics` table** — final step
- [ ] Keep Supabase for: `saved_charts`, `dashboards`, user prefs (these stay in Supabase indefinitely)

---

## Phase 2 — Cube.dev evaluation (conditional)

**Trigger:** AT LEAST ONE of the following is true:
- ActiveCampaign / reverse-ETL needs a typed metric API
- A second internal dashboard tool (Looker, Hex, Mode) is being adopted
- Query performance becomes a bottleneck and caching is needed

**If trigger fires:**
- [ ] Evaluate Cube.dev against alternatives (Lightdash, dbt MetricFlow Cloud, custom GraphQL)
- [ ] Prototype with 2-3 metrics to verify the dbt → Cube handoff works
- [ ] Plan rollout strategy that doesn't disrupt the chart builder

**If no trigger fires within 12 months of Phase 1 completion:** revisit annually; default position is "we don't need it."

---

## How to update this doc

- When a round/phase completes: change ⏳ → ✅, check off the tasks
- When a new round is scoped: add it under the right phase with its task list
- When a decision is locked (e.g., from a zoom-out session): update the architecture doc AND add a one-line note here
- Keep the "At a glance" table at the top current — it's the only thing some readers will look at

---

## Open product-level decisions (not yet locked)

Things that affect roadmap shape but aren't engineering questions:

1. **Tracker UI v2 — when, by whom?** Phase 1.7 says we still want a visual catalog + dependency graph UI after Supabase retires, but design + build is unscoped.
2. **Should the AI chart builder migrate to read from BQ at the same time as the tracker, or separately?** Either is feasible; affects Phase 1.7 sequencing.
3. **Forecast/budget family treatment.** These metrics use Sheets-federated tables (`method_forecast`). Phase 1 does NOT include them. When do they get the dbt treatment?
4. **dbt Cloud adoption.** Currently using Fusion (preview). dbt Cloud would add semantic-manifest validation, scheduled runs, hosted docs. Cost: real $$. Value: depends on operating cadence. Not pressing.
