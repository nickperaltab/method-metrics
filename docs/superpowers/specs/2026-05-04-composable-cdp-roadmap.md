# Composable CDP Architecture — Roadmap

**Status:** Direction agreed. Phase 1 plan written (needs git-based rewrite). All other phases sketched at high level here.

**One-line summary:** BigQuery becomes the single source of truth for metric definitions, customer state, and audience segments. Definitions live in a git repo (`.sql` + `.yml` files), CI deploys to BQ, and consumers (dashboards, the chart builder, Claude via the BQ MCP, marketing tools via reverse ETL) read from there.

---

## Why this architecture

**The problem we're solving (multi-symptom):**

1. **Metric definitions drift.** Same concept (e.g., "active customer") gets re-derived in different tools, ends up with different numbers in dashboards vs. ActiveCampaign vs. spreadsheets.
2. **Marketing has no way to act on warehouse data.** Segment Connections handles event-based triggers ("user did X → fire flow"), but warehouse-derived audiences ("customers with MRR > $500 who haven't synced in 30 days") have no clean path to ActiveCampaign. They get hand-built and rot.
3. **The Supabase-based metric registry duplicates work BigQuery already does.** Description, dependencies, source SQL — BQ has all of these natively (OPTIONS, INFORMATION_SCHEMA, view chaining). Maintaining a parallel store causes drift and ongoing custom-code burden.
4. **Product behavior data is locked in Amplitude.** Method app events flow Segment → Amplitude (and AC for triggers), but don't reach BQ. So we can't join "MRR data" with "feature usage" — extremely valuable joins, currently impossible.

**The Composable CDP pattern solves all four** by making BQ the integration layer and using small, focused tools at the edges (Segment for ingestion, reverse ETL for activation, custom UI only for things uniquely valuable to us).

---

## The full architecture (target end state)

```
                                 ┌─────────────────────────────────┐
                                 │      INPUTS (data flowing IN)    │
                                 └─────────────────────────────────┘

  Method app                       Operational systems       Forecasts/budgets
   events                          (Alocet, billing,
   (clicks, signups,                subscriptions)
    syncs, feature use)
            │                              │                        │
            ▼                              │                        ▼
       ┌─────────┐                         │                  BQ federation
       │ Segment │                         │
       └────┬────┘                         │
            │                              ▼
            ├──► Amplitude (product analytics)
            ├──► ActiveCampaign (event-based triggers — kept as-is)
            └──► Segment Warehouses ────► BigQuery
                                          │
                                          ▼
              ┌──────────────────────────────────────────────┐
              │         BIGQUERY (single source of truth)    │
              │                                              │
              │  Layered architecture (dbt vocabulary):      │
              │  • sources    — raw upstream tables          │
              │  • staging    — (skipped today)              │
              │  • intermediate — joins, classifications,    │
              │      re-graining (int_customer_mrr, etc.)      │
              │  • marts — entity-grained, denormalized      │
              │      (fct_trials, fct_syncs, dim_customers)  │
              │  • metrics — aggregations + formulas         │
              │      (v_metric__monthly_grr_pct, etc.)       │
              │                                              │
              │  Every layer carries OPTIONS(description=...)│
              │  and labels (status, owner, layer, etc.).    │
              │  Marketing queries via BQ MCP / direct.      │
              └──────────┬─────────────────┬─────────────────┘
                         │                 │
            CONSUMPTION ◄┘                 └► OPERATIONAL OUTPUT
                         │                 │
        ┌────────────────┼─────────┐       ▼
        ▼                ▼         ▼   ┌─────────────────────────┐
   Method Metrics    Looker    Claude  │ Reverse ETL             │
   (chart builder    Studio    via BQ  │ (Hightouch / Census)    │
    + scorecards)    dashboards MCP    │                         │
                                       └────────┬────────────────┘
                                                │
                                  ┌─────────────┼──────────────┐
                                  ▼             ▼              ▼
                            ActiveCampaign   HubSpot         Slack alerts
                            (audience syncs)

                            ↓ (actions: emails, in-app msgs)
                            ↓ (these create new events)
                            ↓ → back to Segment → BQ
                            → loop closes
```

**Key principles:**

- **One trusted source of truth.** Definitions live in BQ, in one place, pointed at by everything else.
- **Inputs and outputs are loosely coupled.** Segment handles event ingestion; reverse ETL handles activation. Either can be swapped without touching BQ.
- **Custom UI only where it adds unique value.** The chart builder + scorecards stay (unique value). The metric registry as a separate store goes away (BQ does this natively).
- **Definitions are in git.** Repo holds `.sql` + `.yml` files; CI deploys to BQ. PR review = explicit approval workflow. Notes evolve via commits.

---

## Phase plan

### Phase 0 — already shipped
- Live BigQuery DDL fetch in the Registry/Inspector UI. The `view_definition` cache in Supabase no longer read; drift killed at the source.
- Live-metrics data cleanup: 13 metrics renamed/formatted/grouped, snapshot/diff harness in `scripts/audit/`.
- New "Revenue Engine" admin scorecard (testing ground for the three-pillar framework).

### Phase 1 — BigQuery as canonical metric definition source (current focus)
**Goal:** Every live metric has a `v_metric__<slug>` view in `revenue.*` with full description and labels in `OPTIONS(...)`. Definitions live in a git repo at `metrics/<slug>.sql` + `metrics/<slug>.yml`. CI deploys on merge to main.

**Effects:**
- Marketing/Claude can ask "what's monthly cancellations?" via BQ MCP and get the full description back.
- The chart builder still runs through Supabase metadata (no breakage); only the `v_metric__*` views are net-new.
- The metric registry data layer in Supabase becomes a synced cache, not the source of truth.

**Status:** Plan written at `docs/superpowers/plans/2026-04-28-bq-as-metric-source-of-truth-phase1.md`. **Needs rewrite** to reflect the git-based workflow (the original plan used a Supabase-as-cache shape we've since rejected).

### Phase 1.5 — Clean up the view layer
- Label every existing intermediate view with `OPTIONS(layer="intermediate")` and a meaningful description.
- Extract the `entity_monthly` snapshot CTE (currently embedded in `int_customer_mrr` and `int_customer_annual_mrr`) into its own view `int_customer_monthly_mrr_snapshot`. Both retention views read from it. Solves the architectural-debt smell that's surfaced ~5 times in design conversations.
- Update `docs/primitives-vs-derivatives.md` with the corrected dbt vocabulary (sources / intermediate / marts / metrics, no L0/L1/L2/L3 numbering).

### Phase 1.6 — Build the marts layer
**Goal:** Solve marketing's self-service problem. Today they can't get the field they need (e.g., a sync query is stuck with SignupDate when they want SyncDate). Marts fix this by exposing wide, denormalized tables per entity:
- `fct_trials` — one row per trial with all relevant dimensions joined in (signup date, channel, vertical, country, conversion status, MRR if any, etc.)
- `fct_syncs` — same shape, sync events
- `fct_conversions`
- `fct_cancellations`
- `dim_customers` — current state per CompanyAccount

Marketing queries these directly (or via the BQ MCP). No more JOIN-heavy ad-hoc queries.

### Phase 1.7 — Turn on Segment Warehouses
**Goal:** Product events flow into BigQuery alongside operational data. Unlocks "MRR + feature usage" joins.
**Effort:** Small — Segment configuration change. No code on our side.
**Result:** A `segment_events` (or similar) dataset appears in BQ; can be staged/intermediate'd same as any other source.

### Phase 1.8 — Reverse ETL pilot
**Goal:** Close the operational loop. Pick one warehouse-derived audience, define it as a BQ view, sync to ActiveCampaign via Hightouch (free tier: 2 syncs).
**Candidates for the first sync:** "Trial users 7+ days no sync" (re-engagement campaign). "Customers with MRR > $500 approaching renewal" (CSM alert). Pick whichever has highest pain.
**Effort:** ~1 week (define the view, set up Hightouch, configure the sync, validate).
**Cost:** $0 on free tier. Real money only when 2 syncs isn't enough.

### Phase 2 — Chart builder reads BigQuery directly
**Goal:** Retire the semantic-layer SQL builder. The chart builder reads `v_metric__*` views directly via INFORMATION_SCHEMA + simple `SELECT period, value FROM ...` queries.
**Files affected:** `lib/sql/semantic.js` (deleted), `lib/sql/plan.js` (simplified), `hooks/useScorecardData.js` (reads BQ catalog), `Chart.jsx` + `KpiColumn.jsx` (work off the simpler shape).
**User-facing UX:** unchanged. The AI prompt construction stays the same.
**Effort:** ~1–2 weeks. Bounded refactor.

### Phase 3 — Drop the Supabase metrics table
**Goal:** Definitions and workflow metadata live entirely in the git repo's YAML files. Supabase metric registry retired.
**What stays in Supabase elsewhere:** the existing scorecard storage (saved charts, dashboards) keeps working — that's user data, separate from the metric registry.
**Effort:** Small once Phase 2 stabilizes — a migration that exports remaining Supabase columns into YAML and drops the table.

---

## What lives where (target end state)

| Concern | Location | Notes |
|---|---|---|
| Canonical metric SQL + description | BQ view body + `OPTIONS(description, labels)` | Source: the `.sql` + `.yml` pair in git |
| Workflow metadata (status, owner, notes, format, grain options) | Repo YAML files | Edited via PRs |
| Notes / methodology / collaboration context | Repo YAML files | Concatenated into BQ description on deploy for MCP discoverability |
| Approval workflow | Git PR review | Merge to main = promotion to live |
| Scorecard configs (dashboard layouts) | JS files in `builder/src/config/scorecards/` | Same as today |
| Saved charts / dashboards (user data) | Supabase | Same as today |
| Audience definitions for AC syncs | BQ views (`audience_*` or `mart_audience_*`) | Reverse ETL reads these |
| Product event data | BQ via Segment Warehouses | After Phase 1.7 |

---

## What's deferred / explicitly NOT in this roadmap

- **Segment replacement.** Segment Connections (event ingestion) is solid; we don't touch it. Segment Warehouses just gets turned on.
- **Amplitude replacement.** Amplitude stays as the product-analytics tool. Once Segment Warehouses is on, we have the option to do product analytics in BQ too, but no pressure to.
- **dbt the tool.** We're using dbt's *vocabulary* (sources/intermediate/marts/metrics) and conventions (`stg_*`, `int_*`, `fct_*`) but not adopting dbt as a runtime. Plain git + Python deploy script. Can adopt dbt the tool later if it earns its keep — the migration is mechanical because we've already adopted the conventions.
- **Looker / advanced BI tooling.** The custom chart builder + Looker Studio are sufficient for now. If we outgrow, a paid BI tool can connect to the `v_metric__*` views without changes.
- **Replacing the Supabase saved-chart store.** Charts and dashboards are user data, not metric definitions. They stay where they are.

---

## Decision log (key choices made)

1. **BigQuery is the canonical source for metric definitions, not Supabase.** Reason: drift between BQ and Supabase has been a recurring problem; BQ has native metadata (OPTIONS, labels, INFORMATION_SCHEMA) that does what the custom Supabase registry does, with no second system to keep in sync.

2. **Definitions live in a git repo as `.sql` + `.yml` files; CI deploys to BQ.** Reason: PR review IS the approval workflow (per the standing "no auto-promote" rule); git history is the audit trail; no DB to drift.

3. **Use dbt's vocabulary (sources / staging / intermediate / marts / metrics) without adopting dbt the tool yet.** Reason: dbt is the de facto authority on warehouse-layered architecture in 2026; using their vocabulary makes the architecture recognizable and migration to dbt-the-tool cheap if we ever choose to. Skipping `staging` because our raw tables are already cleaned upstream of BQ.

4. **Don't replace Segment for event ingestion; do turn on Segment Warehouses.** Reason: Segment Connections already handles event-based triggers well (event → AC). The gap is warehouse-derived audiences. Segment Warehouses + reverse ETL closes that without ripping out what works.

5. **Reverse ETL via Hightouch (or Census), starting on a free tier.** Reason: closes the marketing-drift loop without a major new contract. Validate with 1–2 audience syncs before committing to a paid plan.

6. **Phase the work; don't try to ship everything at once.** Each phase delivers value standalone and is reversible. Phase 1 is the foundation; subsequent phases compound on it.

---

## Open items / things to confirm before deeper execution

- **Does Justin agree with this direction?** This is a non-trivial architectural shift. Worth a 30-minute review with him before Phase 1.5+ work begins.
- **Marketing's #1 audience-sync pain point** — pick this carefully for Phase 1.8 so the first reverse ETL sync delivers real value, not just a tech demo.
- **Segment Warehouses tier** — confirm Method's Segment plan supports it (most plans do; verify before promising Phase 1.7 effort estimate).
- **Permissions story** — once marts exist, how exactly do we partition BQ access so marketing sees only `mart_*` and not raw tables? IAM / row-level security on a per-dataset basis is the answer; details when we get there.
