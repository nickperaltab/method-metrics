# Data Discovery — Current State and Problems

**Purpose:** A diagnostic of where Method's data architecture stands today and what's broken across stakeholders. Reads as *"here's where we are, here's what hurts."* Stakeholders should read it and feel "yes, you've heard us."

This doc is the input for the data-initiatives backlog and the Composable CDP roadmap. It does NOT prescribe solutions — every problem in Part 2 will become either a deliverable, a process change, or a definition decision once we move to the backlog.

**Anchor:** Nic's RevOps & Systems function charter — see the standalone charter doc. The 5 capability pillars (Define / Connect / Build / Handoff / AI), the 5 progress metrics (Metric Trust Coverage, Reusable System Coverage, Lifecycle Automation Coverage, Manual Workflow Load, Critical Workflow QA Pass Rate), and the 5-tag taxonomy (unmeasured / untrusted / manual / duplicated / falling-between) are referenced throughout.

**Sources used to build this:**
- ✓ Marketing pain points meeting transcript, 2026-04-22 (Mattis, Michelle, Nic) — direct verbatim quotes used where impactful
- ✓ Method-metrics repo: Supabase metrics registry queried 2026-04-27 (20 live, 91 queued); BigQuery view metadata via MCP 2026-05-01
- ✓ Knowledge base: `knowledge/verified-queries/`, `knowledge/routes/`, `knowledge/metrics-catalog.md`
- ✓ RevOps & Systems charter (Nic, current draft as of 2026-05-04)
- ✓ Q1 2026 RevOps Roadmap, Revenue Engine Visual Framework (Obsidian vault)
- △ Justin's perspective inferred from memory entries + knowledge files (no direct interview yet — flagged where used)
- △ Sarah / leadership perspective inferred from 2026 Revenue Plan + roadmap docs (no direct interview yet)
- ✗ CS lead, sales lead, product perspective — NOT directly captured. Items inferred or extrapolated and explicitly marked.

---

# Part 1 — Current State

## 1.1 Data systems and where data lives

### In BigQuery (`project-for-method-dw`)
| System | Dataset | Notes |
|---|---|---|
| Account state | `revenue.Account` | One row per Method account / EntityRecordID. Lifecycle dates as columns (SignUpDate, SyncDate, FirstSaaSInvoiceTxnDate, CancellationDate). This is an accumulating snapshot. |
| Transaction lines | `revenue.TransLineFlattened` | Every revenue line. Atomic event-grain. |
| Customer-month MRR snapshot | (unmaterialized) | Lives as `entity_monthly` CTE inside `int_customer_mrr` and re-implemented in `int_customer_annual_mrr`. Architectural debt. |
| Lifecycle filter views | `revenue.int_trials`, `int_syncs`, `int_conversions`, `int_cancellations` | Each is `Account` filtered to one date column. Intermediate-layer derivatives. |
| Retention math | `revenue.int_customer_mrr`, `int_customer_annual_mrr` | Pair-and-classify views. CEO-confirmed symmetric PE methodology 2026-04-28 (diverges from board deck by 4–6bp on monthly numbers). |
| Customer state | `revenue.int_customers`, `int_customer_segments` | Per-(customer, month) classifications. Verified 2026-04-22. |
| DEP revenue | `revenue.v_total_dep_revenue` | Forecasts/budgets for DEP. |
| Forecasts/budgets | `revenue.method_forecast` | Federated Google Sheet. Forecasted_Trials, Forecasted_Syncs, Forecasted_Churn, Budgeted_*, etc. |
| Breakdown views | `revenue.v_trials_by_industry`, `v_trials_by_country`, `v_trials_by_channel`, `v_trials_by_sync_type` | Per-dimension pre-aggregations. |
| Forecast-by-channel | `v_trials_forecast_channel`, `v_syncs_forecast_channel`, `v_trials_trajectory_channel`, `v_syncs_trajectory_channel` | Channel-level forecast/trajectory views. |
| Scorecard MTD | `v_scorecard_mtd` | Multi-column composite; "wide" presentation table feeding the channel scorecard. |

### In Supabase (the method-metrics app DB)
| Object | Notes |
|---|---|
| `metrics` table | 111 rows total: 20 live, 91 queued. Definitions stored as `semantic_table` + `semantic_measure` + `semantic_date_col`, `chart_sql`, or `formula` + `depends_on`. **Drift risk vs BigQuery (legacy `view_definition` cache deprecated 2026-04-27 in favor of live INFORMATION_SCHEMA reads, but other columns still drift).** Roadmap target: drop the metrics table and move definitions to git+BQ. |
| Saved charts / dashboards | User-generated chart configs and dashboard layouts. Not metric definitions. Stays in Supabase post-migration. |
| Auth / users | Standard Supabase auth. |

### Outside BQ and Supabase (data NOT in our warehouse)
| System | Owns | In BQ today? | Notes |
|---|---|---|---|
| Active Campaign | Marketing engagement, contact properties, email open/click data, lead scoring config | NO | Critical gap. Marketing has no way to query AC engagement against BQ data. Mattis: *"we have so many tools... isn't a centralized place where we can go and see."* |
| YouCanBook.me | Demo booking events | NO | Demo conversion tracking blocked. Mattis: *"point in time we have no visibility into our campaign impact on demo bookings."* |
| Unbounce | Landing pages, total visit counts | NO | No time-series export. Mattis: *"I have no way at all of reporting on any kind of time series."* |
| Webinar attendance | Lead lists for past webinars | NO — lives in spreadsheets / Slack threads | Manual workflow. Mattis: *"Michelle literally sends it in a slack to like Nelson and Harsh and whoever, right and then we're going through a spreadsheet."* |
| Aliceet (Method's CRM) | Customer support data, account-level updates, possibly cancellation reasons | UNCLEAR — likely some via the Account table | Need to verify what flows into BQ vs stays in Aliceet. |
| Amplitude | Product behavior events (clicks, page views, feature usage) | NO | Cannot join "MRR + feature usage" today. Locked in Amplitude. |
| Segment | Event ingestion layer routing to Amplitude + AC | NO Warehouses turned on | Segment Warehouses is a config flip away (Phase 1.7 in the Composable CDP roadmap). |
| Google Analytics (G4) | Website behavior, on-page events | NO | Some events fire incorrectly per Mattis. |
| Google Sheets | Forecast/budget input (`method_forecast`); board deck KPIs; manual lists | Partially (the forecast sheet via federation) | Most other sheets aren't piped. |

## 1.2 Metric definitions catalog

Status definitions: **defined** = single agreed-upon definition, owned, culturally adopted. **contested** = multiple definitions in use across teams / tools. **undefined** = no agreed definition exists.

| Term | Status | Notes / blocking deliverables |
|---|---|---|
| Trial | defined | `int_trials`, semantic_date_col=`SignupDate`. Solid. |
| Sync | defined | `int_syncs`, semantic_date_col=`SyncDate`. |
| Conversion | defined | `int_conversions`, FirstSaaSInvoiceTxnDate. |
| Cancellation (event) | defined | `int_cancellations`, CancellationDate. |
| Customer | **contested** | CLAUDE.md says "join by EntityRecordID, classify at CompanyAccount" but adoption unclear. Some teams use one, some the other. Blocks: churn report, lead identity resolution, marketing dashboard. |
| MRR (per customer per month) | defined | Verified penny-exact against Justin's verified queries 2026-03-27 (monthly), 2026-04-24 (annual). |
| Start MRR (monthly) | defined | Symmetric PE methodology, CEO-confirmed 2026-04-28. |
| Cancellations $ (monthly) | defined | Symmetric PE methodology. |
| GRR % (monthly) | **defined with documented drift** | Symmetric PE; diverges from board deck Monthly Detail tab by ~4–6bp. Tolerated divergence, not a bug. The recurring "GRR scramble" the user flagged. |
| GRR % (annual) | defined | Verified penny-exact 2026-04-24 against board deck Annual Summary. |
| NRR % (monthly + annual) | defined | Same methodology family as GRR. |
| MQL | **undefined** | March 2025 doc by Christa exists but orphaned. Mattis: *"we don't really have alignment on what MQL/SQL means as a business."* Blocks: pipeline dashboard, lead quality assessment, sales handoff. |
| SQL | **undefined** | Nelson set up lead scoring in AC at some point; unclear if active or owned. Blocks: same as MQL. |
| Active customer | likely **contested** | Different definitions in dashboards vs AC vs spreadsheets. Not directly verified — flag for stakeholder check. |
| Lead | **contested / undefined** | AC contact? Demo booker? Webinar registrant? Same person could be all three. No identity resolution today. |
| Demo conversion | **undefined** | Mattis: not tracked end-to-end. Demo booking → demo attended → trial / customer is invisible. |
| Activation | likely **undefined** | "Signup → first sync" is the implicit definition but not formalized as a metric. Used in Q1 RevOps Roadmap. |
| Activation rate | not tracked | Sync rate is tracked but not framed as activation. |
| Channel attribution (trials/syncs) | partial | UTM-based, only when consistent UTMs are used. Mattis: *"we have different UTM standards across different systems."* |
| Channel attribution (everything else) | **undefined** | Demo bookings, webinar leads, etc. not consistently attributed. |
| Vertical | defined | Surfaced in scorecards. |
| Customer Segment | defined | `int_customer_segments`, verified 2026-04-22. |
| Health score | **orphaned** | Some scoring exists in AC; nobody owns / maintains it. *"Nobody's owning this. Nobody's maintaining any of it."* (Mattis) |
| ARR | defined | Justin's revenue model. |
| Net New ARR | defined | Per `metrics-catalog.md`. |
| Net New MRR | defined | Per `metrics-catalog.md`. |
| ARPC | **not tracked as metric** | Referenced in Revenue Engine framework as a target ($168 → $178). No `v_metric__arpc` exists. |
| PS Attach Rate | **not tracked as metric** | Revenue Engine target (23% → TBD). No measurement infrastructure. |
| 180+ day cohort churn | **not tracked as metric** | Revenue Engine identifies it as 68% of MRR loss (599 accounts). No segmentation infrastructure today. |
| Win rate | likely **not tracked** | Sales metric. Not in BQ. Probably in Aliceet or sales tooling. |
| Pipeline velocity | likely **not tracked** | Same as above. |
| Decision turnaround time | not tracked | Charter measures this but no system to record it. |

## 1.3 Authoritative artifacts catalog

Where definitions / metrics / lists live OUTSIDE the BQ data layer. These cause the recurring "BQ vs deck doesn't match" drift problem. The 2026-04-28 GRR methodology change is the canonical example.

| Artifact | Type | Owner | Authoritative? | Reconciles with BQ? | Drift risk |
|---|---|---|---|---|---|
| Board deck (KPI Deck PDF) | PDF + spreadsheet | Justin | Yes — what the board sees | Partially. Annual GRR penny-exact; monthly GRR diverges 4–6bp post-2026-04-28. | High — public-facing, periodic reconciliation needed |
| 2026 Revenue Plan PDF | Strategic doc | Sarah / leadership | Yes — defines targets (GRR 81%, NRR 95%, ARR +25%) | Indirectly — defines goals, not measurement. | Medium — targets shift across versions |
| Q1 2026 RevOps Roadmap | Markdown (Obsidian) | Nic | Yes — defines RevOps initiatives + framework | Indirectly — references metrics that should exist. | Low (actively maintained by Nic) |
| Justin's verified-queries SQL | Repo (`knowledge/verified-queries/`) | Justin | Yes — penny-exact methodology | Yes — these ARE the BQ definitions for retention metrics. | Low (in git) |
| Justin's retention spreadsheet | Spreadsheet | Justin | Working source for verification | Yes — verifies against `int_customer_annual_mrr` periodically | Low (actively maintained) |
| Christa's MQL definition doc | Markdown (March 2025) | Originally Christa, now nobody | No — orphaned | N/A — never implemented | High — will get rediscovered with no context, may inform a divergent rebuild |
| Lead scoring rules in Active Campaign | Vendor config | Nelson (set up); current owner unclear | Unclear — possibly active, possibly orphaned | NO — not in BQ, opaque from outside AC | High — undocumented behavior may be affecting AC sends today |
| Webinar lead lists in Slack threads | Slack DMs | Whoever ran the webinar (Mattis, Michelle) | No — no system of record | NO — not in any system | Critical — data evaporates as Slack messages age out |
| AC contact / engagement data | Vendor SaaS | Marketing | Yes — what marketing actually sends emails based on | NO — read-only from BQ side | Medium — segments diverge from BQ-defined segments |
| Forecast/budget spreadsheet | Google Sheets | Nic (admin); Mattis & Michelle update | Yes — drives forecasts surfaced in scorecards | ✓ federated as `revenue.method_forecast` | Low (linked, not duplicated) |
| Marketing one-pagers / campaign briefs | Various docs | Marketing | Yes — strategic context | No — narrative, not data | Low (informational only) |
| L10 meeting reports | Spreadsheets, ad hoc | Mattis (assembles) | Yes — what's reported each week to leadership | Indirectly — built FROM BQ + manual sources | Medium — manual assembly creates drift each week |
| Sync Insights Email templates / logic | Marketing automation | Marketing team | Yes for execution; data flow unclear | Unclear | Medium |

## 1.4 Active workflows and processes

Concrete workflows that consume time today and where data flows (or doesn't).

| Workflow | Manual? | Pain level | Notes |
|---|---|---|---|
| Weekly L10 data prep | Yes (heavy) | High | Mattis logs into Unbounce, YouCanBook.me, AC, Aliceet, etc., exports CSVs, builds spreadsheet. Sometimes skipped: *"sometimes I just don't do it... what's the point?"* |
| Webinar lead handoff | Yes (heavy) | High | Marketing emails Slack list to Nelson + Harsh; outcomes annotated in spreadsheet; not surfaced anywhere queryable. |
| GRR / retention reconciliation | Yes (periodic) | Medium-high | Justin verifies BQ retention against board deck; methodology drift triggers reconciliation work (the 2026-04-28 PE change is the latest). |
| New metric onboarding | Yes | Medium | Add row to Supabase; verify; promote to live; sometimes update CLAUDE.md / memory; depending on phase, also create BQ view. Two systems to keep in sync. |
| Cancellation analysis | Manual / blocked | Medium-high | Cancellation reasons (likely in Aliceet or as free text somewhere) not in BQ. Churn report in progress; reasons data is one of the gaps. |
| Lead routing | Unclear | Unknown | Some routing happens in AC; rules orphaned. Charter calls out as owned but state unclear. |
| Active Campaign segment building | Manual | Medium | Marketing builds segments inside AC's UI based on event data + manual rules. Diverges from BQ. *"we're blindly emailing people."* |
| Looker Studio dashboard maintenance | Manual | Low-medium | Built dashboards exist; no formal QA on changes. |
| Method Metrics chart-builder (chart authoring) | Self-serve via UI | Low | Works for the team that uses it; reads Supabase metric registry. |
| Scorecard reviews | Self-serve | Low | The 13 scorecards in `builder/src/config/scorecards/` are checked into the repo. Updated via PR. |
| Metric registry data cleanup | Periodic (Nic-driven) | One-time per cycle | Last done 2026-04-27 (13 metrics renamed/formatted/grouped, snapshot/diff harness). |

## 1.5 Charter progress baselines

Honest current-state estimates for the 5 progress metrics in the RevOps charter. No formal targets yet — those come with the backlog. These are baselines to measure improvement against.

| Charter metric | Current baseline (estimate) | Reasoning |
|---|---|---|
| **Metric Trust Coverage** — % of priority revenue metrics with agreed definitions, owners, sources of truth, QA status | **~25%** | Of 111 registry metrics, 20 are live. Of those, fewer than half have formal verification + owner (`verified_at` was largely NULL until cleanup; many "live" lack rigorous audit trails). MQL/SQL/activation/lead/health-score etc. are undefined entirely. Definitions live across BQ + spreadsheets + decks, often diverging. |
| **Reusable System Coverage** — % of recurring reports / campaign lists / automations / dashboards powered by reusable approved logic | **~40%** | Scorecards (13 of them) ARE reusable approved dashboards. AC event triggers are reusable for live triggers. But marketing's L10 reports, webinar lead handoffs, cancellation analysis, board deck assembly — all manual / one-off. |
| **Lifecycle Automation Coverage** — # of priority customer lifecycle stages supported by automated triggers, emails, alerts, or routing | **~30%** | Trial signup → email sequence: works (AC). Sync milestone: triggers exist. Demo booking → followup: partial. Activation: not measured, no trigger. Renewal alerts: unclear. Churn risk alerts: orphaned health score. Warehouse-derived audiences: zero coverage (no reverse ETL). |
| **Manual Workflow Load** — Hours/month spent manually pulling lists, reconciling numbers, updating spreadsheets, triggering follow-up | **High, no formal measurement** | Mattis describes it as cripplingly high (*"mental load that is not trivial"*). No single hour count today. First instrumentation step: track time spent on weekly L10 prep + monthly board deck reconciliation + webinar lead handoff. Conservative guess: 20–40 hours/month across team. |
| **Critical Workflow QA Pass Rate** — % of critical reports / lists / automations passing QA before launch | **~0%** | No formal QA framework exists. Things ship; if they break, they get fixed. Sometimes the breakage is silent (chart_sql drift, view_definition cache drift before 2026-04-27 fix). The Phase 1 audit harness from 2026-04-27 is the start of formalization. |

These baselines establish the "where we are" line. The roadmap's job is to define targets and the path to them.

---

# Part 2 — Problems

## 2.1 By stakeholder

Each section cites the source: ✓ direct (interview, transcript, conversation) / △ inferred from artifacts / ✗ not yet captured.

### Marketing (Mattis, Michelle) — ✓ direct (transcript 2026-04-22)

| # | Problem | Direct quote / evidence |
|---|---|---|
| M1 | No funnel visibility past trials/syncs | *"What I care about is understanding what our funnel looks like and where our funnel is getting squeezed."* |
| M2 | Demo bookings invisible → perverse incentive | *"I'm optimizing for an arbitrary button click... like which may not actually be as effective as as trying to optimize for for the real behavior that we kind of drive."* |
| M3 | Manual webinar lead handoff via Slack + spreadsheet | *"Michelle literally sends it in a slack to like Nelson and Harsh and whoever right and then we're going through a spreadsheet... harsh is adding notes inside of the spreadsheet."* |
| M4 | Tool sprawl forces manual report building | *"the only way for me to get any of that information is to literally log into book you you can book me and export a spreadsheet."* Tools enumerated: Unbounce, YouCanBook.me, AC, Aliceet, Zoom, Zapier. |
| M5 | MQL/SQL undefined; can't assess lead quality | *"we don't have alignment on what MQL/SQL means as a business... we need to know if we're bringing in garbage into the funnel or not."* |
| M6 | Time-series reporting missing on key tools | *"Unbounce... I have no way at all of reporting on any kind of time series. It's like you made a landing page. Here's your total visits. Okay."* |
| M7 | UTM standards inconsistent across systems | *"we have different UTM standards across different systems."* |
| M8 | Sometimes skip data analysis tasks | *"sometimes I just don't do it... what's the point? Because we're only looking at this narrow thing."* |
| M9 | Business risk if key team members leave | *"if let's say like half of the team disappear tomorrow uh and somebody has to pick up the pieces here like this is a giant business risk."* Lead-tracking system unmaintainable; orphaned automations; nobody owns lead scoring. |
| M10 | Active Campaign engagement data not query-able | *"we're blindly emailing people."* No way to know who's engaged. |
| M11 | Website CRO blind | Updated jobs page 2-3 weeks ago; no way to know impact. Cannot A/B test. **Lower priority per their own prioritization** (closer-to-revenue work comes first). |

**#1 priority per Mattis + Michelle, agreed in transcript:** marketing-to-sales pipeline visibility. Lead → demo booking → demo attended → trial / customer flow as a single dashboard. Their explicit Q2 target.

### Finance / Board (Justin, Sarah, leadership) — △ inferred from artifacts + memory

| # | Problem | Evidence |
|---|---|---|
| F1 | Recurring GRR / retention reconciliation between BQ and board deck | The 2026-04-28 CEO-confirmed PE methodology change is the third major reconciliation in the last quarter. Symptom of definitions living in deck + spreadsheets without being linked to BQ. Memory entry: *"Both int_customer_mrr (monthly) and int_customer_annual_mrr now use CEO-confirmed symmetric PE exclusion (2026-04-28). Diverges from board-deck monthly numbers by ~4–6bp."* |
| F2 | Verification work happens in spreadsheets first, then ports to BQ | Justin's process per knowledge files: verify in Excel/spreadsheet → translate to BQ → check penny-match. High craft; not scalable to every metric. |
| F3 | Customer Segments live but unverified | Memory entry from 2026-04-21: *"Metrics 373–377 live but unverified... priority: audit int_customer_segments then approve."* Several months later still not formally validated. |
| F4 | Annual vs monthly retention mental model split | Memory: *"Board-deck GRR (78% for Feb'26) uses 12-month cohort... monthly GRR (~96%) is a different view."* Two retention numbers, both correct, used for different purposes — but the difference confuses any non-Justin viewer. |
| F5 | New methodology drift risk on every change | Each retention methodology change requires reconciling old reports, updating board deck commentary, and explaining the gap. No process for "how we change a definition." |
| F6 | (Inferred) Metric onboarding latency | A new revenue metric requires Justin to build it in Excel, verify, then someone to translate to BQ. Time-to-trustworthy is high. |

**Needs validation with Justin directly.** Questions worth asking him: which metric drift would you most pay to never see again? What's the most painful scramble in the last 90 days?

### Customer Success — ✗ not directly captured

| # | Problem (inferred) | Source / reasoning |
|---|---|---|
| C1 | Churn signals not surfaced systematically | Q1 RevOps Roadmap calls out "Health Score v1" as an active project. Implies current health visibility is poor. |
| C2 | Health score orphaned | Mattis transcript referenced AC lead scoring; CS health may be similarly orphaned. *"Nobody's owning this."* |
| C3 | Cancellation reasons not in BQ | Churn report in progress is blocked partly on this. Likely in Aliceet (free-text) or nowhere. |
| C4 | Customer activation not measured cleanly | Activation = signup → first sync, or signup → first valuable action. Not formalized. |
| C5 | 180+ day cohort behavior not tracked as a slice | Revenue Engine framework calls out 180+ day cohort = 68% of MRR loss. No segmentation infrastructure today to support targeted intervention. |

**Needs interview with CS lead.** This entire section is inference. Confidence: low.

### Sales — △ inferred from marketing transcript + roadmap

| # | Problem (inferred) | Source / reasoning |
|---|---|---|
| S1 | Lead quality varies; no MQL/SQL framework adopted | Marketing transcript surfaced this; sales is the receiver of those leads. Same definition gap, sales-side impact. |
| S2 | Pipeline visibility unclear from sales perspective too | Marketing transcript says marketing can't see the funnel; sales likely has a view of *part* of it (the part in their CRM) but it's also probably siloed. |
| S3 | Lead scoring exists but unclear if applied to sales workflow | Mattis: *"there's lead scoring in place that Nelson... set up."* Whether sales acts on it is unknown. |
| S4 | Demo-to-conversion tracking unclear | Demo bookings exist (YouCanBook.me); whether sales tracks demo → opportunity → close consistently is unknown. |

**Needs interview with sales lead (Nelson? someone else?).** Confidence: low.

### Product — ✗ not directly captured

| # | Problem (inferred) | Source / reasoning |
|---|---|---|
| P1 | Feature adoption locked in Amplitude | Amplitude has product event data; not joinable with BQ data (MRR, customer state). Cannot answer "do customers paying $500+ use Feature X?" |
| P2 | Activation rate unmeasured | Tied to C4 / S1. Signup → first valuable action not formalized. |
| P3 | (Possible) Product-led growth signals not surfaced | If product is iterating on activation flows, they need fast feedback on whether changes improve conversion. Currently dependent on marketing's reporting, which is broken. |

**Needs interview with product / engineering lead.** Confidence: low.

### Internal — analytics & data work (Justin & Nic) — ✓ direct

| # | Problem | Evidence |
|---|---|---|
| I1 | Two parallel definition stores: BQ views + Supabase metrics | Drift incidents (view_definition cache, chart_sql), maintenance burden of keeping both in sync. Phase 1 of Composable CDP roadmap addresses this. |
| I2 | Custom semantic-layer SQL builder vs canonical BQ views | Reinventing the wheel; dbt + BQ INFORMATION_SCHEMA does this natively. |
| I3 | New metric onboarding requires touching two systems | High friction; each metric needs a Supabase row AND BQ work. |
| I4 | The unmaterialized snapshot pattern (entity_monthly CTE) | Same logic duplicated in `int_customer_mrr` and `int_customer_annual_mrr`. Architectural debt; surfaced multiple times in design conversations. |
| I5 | Multiple measurement paths for the same event | E.g., "Churn" (count from `int_cancellations`) vs "Cancellations $" (sum from `int_customer_mrr`) — both measure customer attrition but read from different views with different exclusions. May not reconcile to same customer set. |
| I6 | Custom UI maintenance burden | Method Metrics chart builder + scorecards work but require ongoing dev. Has unique value (AI chart authoring) so worth keeping; the metric-registry layer beneath it is the part that should retire. |
| I7 | Metric registry definitions drift from BQ | Pre-2026-04-27 the cached `view_definition` could lag BQ; chart_sql still has this risk. |

## 2.2 Cross-cutting structural issues

Things that show up across multiple stakeholders and aren't owned by any one team.

| # | Issue | Why it matters |
|---|---|---|
| X1 | Definitions live in BQ + spreadsheets + AC + heads simultaneously | Any of the four can drift without the others knowing. The recurring "GRR scramble" is the canonical example. |
| X2 | Source data not in BQ for most marketing-relevant tools | AC engagement, demo bookings, webinar attendance, Unbounce visits, Amplitude product events — all locked outside BQ. Cannot join with operational data. |
| X3 | No identity resolution layer | Same person is a contact in AC, a demo booker in YouCanBook.me, an account in Aliceet, an EntityRecordID in BQ. No systematic way to stitch these. |
| X4 | No formal QA framework for data work | Reports, dashboards, automations ship without QA. Bugs found by users, often silently. |
| X5 | No formal definition ownership | Definitions exist (or don't) but nobody owns them. When the term drifts, nobody is responsible for noticing or reconciling. Charter explicitly calls this out as NOT-owned-alone, but the gap is real. |
| X6 | Data in workflow tooling that isn't in any system | Webinar leads in Slack threads are the cleanest example. Even with a perfect ingestion architecture, this data doesn't make it in unless workflows change. |
| X7 | Different tools have different "lead" definitions | AC contact ≠ MQL ≠ SQL ≠ trial signup ≠ demo booker. Each tool has its own model. |
| X8 | Two retention numbers (annual vs monthly) for the same business question | Both correct, used differently by board vs CRO; confuses anyone outside Justin. |
| X9 | Reverse ETL gap: warehouse → operational tools | Cannot push warehouse-derived audiences to AC. Marketing builds segments by hand inside AC, which drift from BQ. |
| X10 | No way to measure RevOps function progress today | Charter has 5 progress metrics; baselines estimated in Section 1.5. No instrumentation to actually track them yet. |

## 2.3 Process / workflow problems by charter taxonomy

Mapping problems to Nic's *"come to me when..."* classifier from the charter.

### Manual
- Weekly L10 data prep (Mattis logs into 5+ tools, exports, builds spreadsheet) (M4, M8)
- Webinar lead tracking via Slack + spreadsheet (M3)
- Reconciling BQ vs board deck (F1)
- Marketing reports that aren't automated (M4)
- MQL pulls (Mattis stopped doing them)
- Active Campaign segment building inside AC UI

### Untrusted
- Recent GRR scramble drifted methodology (F1)
- Active Campaign data fidelity — *"we're blindly emailing people"* (M10)
- Lead scoring in AC — orphaned, status unclear (M9)
- Activation metrics — undefined (P2)
- Customer Segments metrics — live but unverified (F3)

### Unmeasured
- Pipeline post-trial: what happens after trials/syncs is invisible (M1)
- Demo bookings → conversion (M2)
- Campaign attribution beyond trials/syncs (M7, X7)
- Website conversion rates per page (M11)
- Lead quality (M5, S1)
- Customer activation rate (P2)
- 180+ day cohort behavior (C5)
- ARPC, PS Attach Rate (Revenue Engine targets)

### Duplicated
- Definitions in BQ + spreadsheets + AC + heads (X1)
- Multiple GRR formulas (board deck asymmetric vs BQ symmetric) (F1)
- Multiple "customer" definitions (CompanyAccount vs EntityRecordID) (X3)
- Customer-month MRR snapshot logic in two views (I4)
- Multiple measurement paths for the same event (I5)
- Cached `view_definition` in Supabase vs live BQ DDL (now resolved 2026-04-27)

### Falling-between
- Webinar lead handoff (marketing → sales: spreadsheet) (M3)
- Demo booking attribution (marketing wants credit; partially tracked) (M2)
- Cancellation reason (CS owns? Sales owns? Nobody?) (C3)
- Lead scoring (Nelson set up; current owner unclear) (M9)
- Health score (orphaned) (C2)
- The metric registry's "queued" workflow (who picks up unsolved metrics?)

## 2.4 Definition disagreements (current state of contested terms)

| Term | Disagreement | Status / next step |
|---|---|---|
| **Customer** | CompanyAccount vs EntityRecordID | Resolved technically in CLAUDE.md ("join by EntityRecordID, classify at CompanyAccount") but cultural adoption unclear. Each team should confirm they use the same mental model. |
| **GRR methodology** | Asymmetric (board deck) vs symmetric PE exclusion (BQ) | Resolved methodology-wise 2026-04-28 (CEO-confirmed). Drift documented. Process gap: how do future methodology changes get communicated? |
| **MQL** | March 2025 doc by Christa exists but orphaned. Nelson's lead scoring may encode a different definition. | Two divergent sources both unmaintained. Need a single owned definition. |
| **SQL** | Lead scoring config in AC may encode some implicit definition. | Same as MQL. |
| **Churn** | Time-window varies (1-month, 3-month, 12-month). Some include prepay-expiry; some don't. | Multiple churn definitions in active use. Need to align which definition serves which question. |
| **Active customer** | Likely contested across tools. | Not directly verified. Flag for stakeholder check. |
| **Lead** | AC contact, demo booker, webinar registrant, trial — same person can be all four. | No identity resolution. Needs structural fix (X3) plus a definition. |
| **Activation** | "First sync" implied; not formalized. | Could be: signup → first sync, signup → first paying customer, signup → first valuable action. Not yet decided. |
| **Sync rate** | Defined and tracked, but what counts as a "successful" sync (vs partial / failed) is implicit. | Worth verifying definition holds. |

---

# What's missing from this doc (acknowledged gaps)

These are explicitly NOT captured here and should be filled by the next round of stakeholder conversations:

- **Justin direct interview.** Section 2.1 Finance is inferred from artifacts. We need: (a) which metric reconciliation work is most painful? (b) what would he automate first if given the choice? (c) is the 4–6bp GRR drift OK forever, or does it need to be fixed?
- **Sarah / leadership perspective.** What decisions can she NOT make today because of data confusion? What would make board reporting easier?
- **CS lead interview.** Health score, cancellation reasons, customer activation — where's the bleeding edge of CS data pain?
- **Sales lead interview (Nelson?).** Lead quality framework, demo-to-close tracking, pipeline visibility from their side. Who owns Nelson's old lead-scoring config?
- **Product / engineering perspective.** Amplitude joins, activation flow tracking, what's blocked by data scatter.
- **Honest hour count for "Manual Workflow Load"** baseline — currently a guess. First instrumentation step would be a 2-week timekeeping log across the team to ground-truth the estimate.
- **Aliceet inventory.** What data flows from Aliceet → BQ? What stays in Aliceet only? Specifically: cancellation reasons, support touch counts, account-level state changes.
- **Active Campaign data inventory.** Beyond engagement/contact properties, what configurations / automations / segments live there that aren't documented anywhere?

---

# How this doc gets used

1. **Stakeholders read Part 2** and tell us what's missing or wrong. Each new pain point gets added to the relevant subsection.
2. **The interviews surfaced as gaps** (above) get scheduled and conducted; their output flows back into Part 2 with citations updated from △ to ✓.
3. **Each problem becomes either** (a) a deliverable in the data-initiatives backlog, (b) a process change request, or (c) a definition decision to be made. The backlog is the next artifact, derived from this one.
4. **Part 1 stays a living catalog** — new tools, new definitions, new artifacts get added as they appear. Reviewing Part 1 quarterly is a small habit that prevents drift.
5. **Charter progress baselines (Section 1.5)** become the dashboard for "is RevOps function winning?" — re-estimated quarterly.

This is the diagnostic. The backlog is the prescription. The roadmap is the sequence.
