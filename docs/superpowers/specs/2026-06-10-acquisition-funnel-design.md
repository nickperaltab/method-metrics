# Acquisition Funnel — Design Spec

**Date:** 2026-06-10
**Status:** Draft (brainstormed, pending review)
**Surface:** New dashboard in the `method-metrics` builder app, shipped to the **Labs** section as **Beta** (same pattern as SaaS MRR Movement).

> **Public-repo note:** this file is committed to a public repo. No dollar figures, ratios, or account names anywhere in this doc.

---

## 1. Goal

A single view of the **acquisition journey** that shows, by cohort, where Method loses prospects between sign-up and paying — so we can find the leak and aim effort at it. Grounded in the Revenue Architecture "bowtie": this dashboard is the **left side** (units in → conversion), ending exactly where the existing **SaaS MRR Movement** dashboard (the right side, recurring-revenue retention) begins.

The diagnostic question it answers: *of the trials that started in month X, how many synced, how many converted, and what moved the rate — which treatments, which segments?*

## 2. The bowtie boundary (why this is its own dashboard)

The bowtie has one pinch point where **units become revenue: Conversion (VM6)**. Left of it = volume (trials, syncs). Right of it = recurring-revenue movement (expansion / downgrade / churn / GRR / NRR), which already lives in the SaaS MRR Movement dashboard.

- The funnel shows **dollars at exactly one stage — Conversion** — as the gross MRR that landed (split DEP/PS vs Core).
- The funnel's "Converted MRR" **is** the MRR dashboard's "New" bar — same number, two lenses. We do **not** rebuild the retention engine inside the funnel.
- A one-screen full-bowtie overview stitching both halves is a possible **Phase 3** capstone, out of scope here.

## 3. The spine (universal stages — every entity passes or drops)

Cohort-based: take the entities whose **Trial started in month X** and follow *them* forward through the stages. Period counting is explicitly rejected (it mixes cohorts and hides the leak). Recent cohorts are **capped at a maturity mark (30 / 90 days)** so incomplete months don't read as drop-off.

| # | Stage | Canonical definition | Measure |
|---|-------|----------------------|---------|
| 1 | **Trial** (VM5, mutual commit) | starts at **sign-up** | volume only |
| 2 | **Sync** (onboarding milestone) | `CustDatFirstSyncCompleted` — an early usage milestone, **not** activation / the finish line | volume only |
| 3 | **Converted** (VM6, ARR committed) | `FirstSaaSInvoiceTxnDate` (first payment) | **$ enters here:** gross SaaS MRR, **split DEP/PS vs Core** |
| 4 | **First Impact** (Sub-System 6, adoption) | first post-conversion product action that correlates with retention (e.g. first invoice/estimate sent) | volume + Δt₆ (time-to-impact) — **dependency, see §7** |

## 4. Dollars

- **Pre-conversion (Trial, Sync): none.** The left side is measured in volume/units only. Assigning expected MRR to trials would spoof pipeline visibility.
- **At Conversion: gross SaaS MRR, split DEP/PS vs Core.** Services revenue is non-/re-occurring and carries a different valuation and retention profile than true recurring software, so it is separated at the point it lands.
- Beyond conversion: out of scope (SaaS MRR Movement dashboard).

## 5. Treatments vs Segments

The organizing distinction. A **treatment** is something *we did* (a lever we can scale) — shown as **conversion lift: with vs without**, plus its effect on Δt₆. A **segment** is something the entity *is* (where we aim) — shown as **rates compared across groups**.

### Treatments ("Promised" / "Helped" layers)
| Treatment | Definition | Notes |
|-----------|-----------|-------|
| **Demo** | counted **attended only** (exclude no-shows) | the intervention only happens if experienced |
| **Free Consulting** | onboarding assist (free) | accelerates time-to-first-impact |
| **Paid PS** | onboarding assist (paid) | free/paid line is a billing distinction; both are interventions |

Source: `Activity` table (`ActivityType`, joins on `EntityRecordID`). **Tracking began ~June 2026** — sparse for older cohorts; this section fills in over time and must be labeled as such.

### Segments (GTM market segments)
| Segment | Definition | Why |
|---------|-----------|-----|
| **Company Size / License Count** (must-have V1) | VSB / SMB / etc. by seats | GTM motion + retention benchmark are set by ACV, which size drives |
| **DEP** | **both** — lead with the segment lens (DEP vs non-DEP baseline), then the treatment lens (did the required consulting hours accelerate activation?) | DEP changes the revenue model (annual lock-in) *and* forces an onboarding intervention |
| **Payment Type** (Monthly / Prepay Annual) | contract cadence | Monthly vs Annual retention differ sharply; blending them corrupts retention metrics |
| **Pay-per-use** | consumption monetization | a distinct monetization strategy with a different risk/retention profile |
| Channel / Vertical / Country | from `Funnel` table | available for free; nice-to-have |

## 6. Data sources

- **`revenue.Funnel`** — one row per entity-event, `EventType ∈ {Trial, Sync, Conversion}`, back to 2008, carrying `CustDatLastSaasAmount` (MRR), `FirstSaaSInvoiceTxnDate`, attribution (`Att_*`), `SyncType`, `Vertical`, `SignupCountry`, `SaaSPayType`. The spine's backbone.
- **`revenue.Activity`** — demo / consulting treatments (`ActivityType`, `EntityRecordID`, `DueDateStart`). June 2026+.
- **`revenue.Account` / `int_conversions`** — license count, DEP signal, conversion date, MRR split.
- DEP detection and DEP/Core MRR split reuse the logic already proven in the SaaS MRR Movement work (`int_customer_mrr_lines` item classification).

## 7. First Impact — explicit dependency (does NOT gate V1)

First Impact is required by the framework ("recurring revenue is the result of recurring impact") but **is not in BigQuery**. The `CustDat*` namespace is firmographics + first sync only; there is no "first invoice/estimate sent" timestamp in the warehouse.

- **Source of record: Amplitude** (product events). This is its own sourcing track, and the **Amplitude-id ↔ `EntityRecordID` join is unvalidated** (flagged in the syncs-redefinition work).
- **Plan:** build stages 1–3 from BQ now; render **First Impact as a known-pending stage** (clearly marked), and land it once the Amplitude join is validated. It ships *first* among follow-ons, not "someday."

## 8. Visualization

- **Stepped funnel** (Trial → Sync → Converted → First Impact): bar width = entities remaining; drop-off % between steps; $ annotation (DEP/Core) at Converted only.
- **Treatment-lift table**: per treatment — % of cohort who got it, convert-with vs convert-without, lift, and effect on Δt₆.
- **Segment compare**: switch/split the funnel by a segment (company size first); compare drop-off and conversion across groups.
- Cohort selector + maturity cap; consistent with the app's existing scorecard chrome. Labs / Beta pill.

## 9. Scope / phasing

- **V1 (BQ-only, buildable now):** cohort spine Trial → Sync → Converted, $ at conversion (DEP/Core split), Company-Size segment, cohort + maturity capping. Labs/Beta.
- **Fast-follow:** treatment-lift table (Demo/Free/Paid PS) as Activity data matures; remaining segments (DEP both-lenses, payment type, pay-per-use, channel/vertical).
- **Phase 2:** First Impact stage via Amplitude (after join validation) + Δt₆.
- **Phase 3 (optional):** one-screen full-bowtie overview linking this funnel to the SaaS MRR Movement dashboard.

## 10. Open questions / risks

- **Cohort entity grain:** funnel is keyed on `EntityRecordID`; confirm it behaves under the multi-CompanyAccount-per-entity pattern that has bitten dim/lifecycle work before.
- **Pay-per-use identification:** needs a canonical definition in billing before it can be a segment (term TBD; will probe data once defined).
- **Treatment attribution timing:** a demo/PS that happened *after* conversion shouldn't count as a conversion treatment — treatments must be filtered to *before* the stage they're credited with influencing.
- **Amplitude join** (First Impact) — unvalidated; Phase 2 gate.

## 11. Non-goals

- Not rebuilding retention/expansion/churn (that's the SaaS MRR Movement dashboard).
- No pre-trial / lead stages (mature top-of-funnel; no lead data today).
- No expected/pipeline dollars on pre-conversion stages.
