# Acquisition Funnel — Phase 2: Motion + Lifecycle — Design Spec

**Date:** 2026-06-29
**Status:** Draft (brainstormed + data-validated, pending review)
**Base:** Evolves [`2026-06-10-acquisition-funnel-design.md`](2026-06-10-acquisition-funnel-design.md). The Trial→Sync→Converted funnel it describes is **already shipped** to Labs/Beta (`funnel-acquisition-scorecard.js`, `funnelDrill`, `funnelSql/funnelData/funnelTransform`). This doc specifies the next evolution — it does not start over.

> **Public-repo note:** this file is committed to a public repo. No dollar figures, ratios, or account names anywhere. Quantitative evidence lives in the scratchpad discovery scripts, not here.

---

## 1. Goal

Turn the acquisition funnel from a three-stage volume funnel into a **lifecycle funnel that forks on whether the prospect talked to us**. One question drives it:

> *Of the trials in cohort X, does talking to a human (demo or free consulting) change the path through convert → customization → retention — and how does that differ by who they are (industry, size, DEP, billing)?*

Two structural moves on top of the shipped funnel:
1. **Fork the funnel** into a **Talked-to-us** path and a **Self-serve** path.
2. **Extend the tail past Conversion** into customization and a multi-horizon **retention curve** — sourced from the existing survival model, not a new engine.

## 2. What's already built (the base we extend)

| Already shipped | Where |
|---|---|
| Cohort spine Trial → Sync → Converted | `funnelTransform.STAGE_DEFS`, `funnelSql.buildFunnelSpineSql` |
| Pre-stage treatment timing (`Activity.DueDateStart >= trial_date`) | `funnelSql.js` |
| `$` at conversion, DEP/Core split | `funnelSql.buildConversionMrrSql` |
| Segment breakouts + maturity cap | `funnelSql` segExpr/segJoin, `funnelTransform.isCohortMature` |
| Labs/Beta chrome, drill, account table | `funnelDrill`, `DrillBreadcrumb`, `NetSaasAccountTable` |

The demo treatment is already *partly* there: `funnelSql.js` defines demo activity types and counts attended only. Phase 2 turns that latent signal into a first-class fork + show-rate.

## 3. The big revision: lifecycle past Conversion (boundary change)

The base doc deliberately **stopped at Conversion** (§2, §11: "retention lives in SaaS MRR Movement"). Phase 2 **revises that** — the funnel now continues into customization and retention.

**Why this is safe (it does not rebuild the retention engine):** retention bars are *read* from the already-built `int_customer_survival` model, which computes survival at every tenure 0–24 months with per-tenure maturity censoring. We add bars, not math. This still honors the base doc's "don't duplicate the engine" principle — we point at the engine that exists.

**Flag for review:** this is a conscious reversal of a prior locked decision. Called out so it's deliberate, not accidental drift.

## 4. The fork and the stages

```
Trial ──→ Sync
            ├─→ TALKED TO US:  Demo/Free booked → attended → Convert → Customization → Retained 1 / 3 / 6 / 12 mo
            │                  └──── show rate ────┘
            └─→ SELF-SERVE:    Convert → Customization → Retained 1 / 3 / 6 / 12 mo
```

- The two paths are **mutually exclusive** and sum to the Sync population.
- The asymmetry is intentional: only the Talked-to-us path has booked/attended bars (self-serve has no booking to show).
- **Show rate** = attended ÷ booked, **customer grain** (of customers who booked ≥1, how many attended ≥1). Event-grain show rate is a possible later tile, not a funnel bar.
- Retention is a **curve of terminal bars** (1/3/6/12mo), each independently maturity-gated.

## 5. Locked signal definitions (data-validated 2026-06-29)

All keyed on **`EntityRecordID`** (the customer grain already used across `int_customers` / `int_customer_mrr` / `int_customer_survival`).

| Signal | Definition | Source | Grain note |
|---|---|---|---|
| **Talked to us** | entity has ≥1 *attended* demo or free-consulting activity, dated (`DueDateStart`) before its convert month | `revenue.Activity` | one source for both touches |
| **Demo — attended** | `ActivityType` ∈ {`Demo`, `Pre-sales Demo`} | `revenue.Activity` | excludes `Demo booked`, `Demo Missed` |
| **Demo — booked** | `ActivityType` = `Demo booked` (+ `Phone Call Demo Booked`) | `revenue.Activity` | for show-rate denominator |
| **Free hour — attended** | `ActivityType` = `Free Consulting Session` | `revenue.Activity` | excludes `…Booked`, `…Missed` |
| **Free hour — booked** | `ActivityType` = `Free Consulting Booked` | `revenue.Activity` | show-rate denominator |
| **Customization (did they buy hours)** | entity has any billing line with `InvoiceGrouping = 'PS'` and `PSBeforeDiscount > 0` | `revenue.TransLineFlattened` | **first PS revenue in dbt**; uses `PSBeforeDiscount` (gross), NOT `PSAmount` (net landmine). Populated. |
| **Project hours (magnitude)** — **V2, not buildable now** | `SUM(DurationHours)` on delivered PS time | `revenue.TimeTracking` | **`revenue.TimeTracking` is EMPTY in BQ (0 rows, 2026-06-29).** Hours live in the source CRM (Method-consultant data), not the warehouse mirror. Needs a sync before it can enter dbt. V1 ships customization as yes/no + PS $ only. |
| **DEP** | `AccountFullName LIKE '%Enhancement Plan%' OR '%Premium App%'` with `SaaSAmount != 0` | `int_customers.HasDEP` (reuse) | account-grain rolled to entity |
| **Prepay vs regular** | customer has any `SaaSPayType = 'Prepay'` **SaaS subscription** line that month | `revenue.TransLineFlattened` | measured on the subscription, NOT the DEP line — see §6 |

**Activity date = `DueDateStart`.** `CreatedDate` is NULL on the large majority of rows — using it would silently drop most touches. `DueDateStart` is fully populated. Future-dated rows (scheduled demos) are capped at the convert date for the pre-convert test.

## 6. DEP and Prepay are independent (validated, killed a wrong coupling)

The working assumption was "DEP requires prepay, which expires after a year." The billing data does **not** support the strong form:
- Most DEP customers are billed **Monthly from the start** — DEP does not force prepay.
- The kernel of truth: prepay share **decays with tenure**, consistent with annual prepay contracts converting to monthly at renewal.
- `SaaSPayType` is per-line, and DEP is a monthly-billed product by design, so the DEP *line* is usually Monthly even when the main subscription is prepaid.

**Therefore:** DEP and Prepay are carried as **two independent lenses**, and "prepay vs regular" is defined on the **SaaS subscription line**, not the DEP line.

## 7. Lenses (breakdowns — the "group by" knobs)

These are *not* funnel stages. They are dimensions any stage can be sliced/filtered by — the same interaction as the shipped segment breakouts. This keeps the building-block philosophy (CLAUDE.md): the user picks bars + a lens; nothing is auto-injected.

| Lens | Source | Coverage caveat |
|---|---|---|
| **Industry (V7)** | `v7_classification.v_entity_primary_label` (entity grain: `customer_record_id`=EntityRecordID, `l1`/`l2`/`l3`, `operating_model`) — already a declared source, same view GRR-by-Industry uses | strong at converted end; **sparse at trial end** — large "Unclassified" bucket up top |
| **DEP** (yes/no) | `int_customers.HasDEP` | — |
| **Prepay vs regular** | `SaaSPayType` on subscription | — |
| **Customization** (bought hours: yes/no) | PS billing | — |
| Company size / channel / vertical / country | already in base funnel | reused |

**V7 join is entity-grain.** `v_entity_primary_label.customer_record_id` = `EntityRecordID` — one row per customer already. No account→entity fan-out to manage (the original account-`RecordID` join concern is moot).

## 8. dbt architecture (answering "are we doing it right for dbt")

The shipped V1 builds SQL live in `funnelSql.js` off `revenue.Funnel`. Phase 2 logic (motion classification, retention horizons, PS, V7 join) is heavier and reused, so it moves into **dbt models** — which is also where Nic wants project hours to finally land.

**New models:**

| Model | Materialization / schema | Responsibility |
|---|---|---|
| `int_customer_proserv` | view, `revenue` | First PS/customization signal in dbt: `is_customized`, first PS date, PS $ per `EntityRecordID`, from `TransLineFlattened` (`InvoiceGrouping='PS'`). Project-hours magnitude deferred to V2 (`revenue.TimeTracking` empty). |
| `int_presale_touches` | view, `revenue` | Per-entity demo/free booked + attended states & dates from `Activity`, for the fork and show-rate. |
| `int_motion_funnel` | **table**, `revenue` | One row per resolved customer: `signup_month, motion (talked/self_serve), synced, converted, is_customized, project_hours, has_dep, pay_type, retained_1/3/6/12mo, tenure, mrr`, + V7 industry. Pure assembly over the spine + §5 signals + survival. |
| `v_motion_funnel` | view, `revenue`, `status: directional` | Aggregated counts + conversion % by `signup_month × motion × stage`, plus a trailing-window snapshot variant. **The chart reads this.** |

**Placement decision — `revenue`, not `revenue_metrics`.** Inputs are directional (Activity tracking starts 2024; V7 coverage partial). Per the migration skill, anything not fully verified stays in `revenue` with `status: directional` (same treatment as `v_channel_arr`) — **not** `v_metric__*` in `revenue_metrics`. It graduates later once inputs are verified. (This overrides the original spec's `v_metric__motion_funnel` name.)

**Reuse, don't rebuild:** retention horizons read `int_customer_survival`; DEP/segment dims read `int_customers`; convert anchor reads `int_customer_mrr`. No retention engine is duplicated.

## 9. Visualization (extend `funnelDrill`, don't fork it)

- Extend `funnelTransform.STAGE_DEFS` to the lifecycle stages; render the two paths side by side from the same model.
- Show-rate drop drawn between booked → attended on the Talked-to-us path.
- Retention curve as the terminal bars; each greyed when its cohort is too young for that horizon (reuse `isCohortMature`, generalized per-horizon).
- Lens selector drives the §7 breakdowns; clicking a stage → accounts (reuse `NetSaasAccountTable`).
- Labs/Beta pill retained.

## 10. Scope / phasing

- **V1 (this spec, BQ-only, buildable now):** the fork (talked-to-us vs self-serve), demo/free show-rate, customization (yes/no + PS $), multi-horizon retention, lenses (industry/DEP/prepay/customization). dbt models in §8.
- **V2 (deliberate fast-follows, each blocked on a data source not yet in BQ):**
  - **Project-hours magnitude** — needs `TimeTracking` synced into BQ (currently 0 rows). Cheapest of the two.
  - **Product activation** as a stage between Sync and Convert — blocked on validating the product-event→`EntityRecordID` join (Segment `net` / Amplitude, unvalidated — same join the syncs-redefinition work needs).

## 11. Caveats / risks (must surface in the UI)

- **Activity tracking effectively starts 2024.** Pre-2024 cohorts have almost no activity and would falsely read as all-self-serve. → **hard-gate the fork to 2024+ cohorts**, not just a label.
- **Enrichment is sparse at the top of the funnel.** Industry breakdown is reliable for converts, thin for trials. Show an explicit "Unclassified" bucket; don't imply full coverage.
- **Demo at customer grain:** "attended" = attended ≥1; "no-show" = booked but never attended (a customer can book, miss, then attend a later one).
- **Multi-account-per-entity fan-out** on the V7 account→entity join — the pattern that has bitten dim work before. Dedup accounts before counting.
- **Public repo:** no dollar figures / ratios / account names in committed code, configs, or docs.

## 12. Non-goals

- Not rebuilding retention/expansion/churn math — retention bars *read* `int_customer_survival`.
- No pre-trial / lead stages.
- No expected/pipeline dollars on pre-conversion stages (carried from base doc).
- Not modifying the SaaS MRR Movement dashboard.

## 13. Decisions (resolved 2026-06-29)

1. **Retention horizons: 1 / 3 / 6 / 12 months.** Full early-life curve.
2. **Show rate: customer-grain only.** Of customers who booked ≥1, how many attended ≥1. No event-grain ops tile in V1.
3. **Sign-off: deferred.** Ships as a Labs / `directional` experiment. No methodology authority gate now; revisit before any graduation to `live`. Nothing is blocked.
