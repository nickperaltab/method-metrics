# Annual MRR-Movement Decomposition — Design / Spec (Phase 3a, data layer)

**Date:** 2026-06-04
**Status:** Design approved (brainstorming). Build gated by parity, like Phase 1. **Prod cutover held for explicit approval.**
**Repo-safe:** architecture + SQL logic only. No dollar figures, no account data.

**Companion:** this is the **data** prerequisite for the bridge-v2 UI (`2026-06-04-net-saas-bridge-v2-design.md`). Build this first.

---

## 1. Why

The deployed Net SaaS drilldown decomposes Expansion/Downgrades into **seats / apps / price** at **monthly** grain only (`int_mrr_movement_decomposed`, validated Phase 1). The bridge-v2 UI adds an **Annual** grain. Annual GRR (~mid-70s%) is the headline leak metric, so the most valuable drill is "where is the *annual* bucket leaking — seats, apps, or price?" That needs an annual decomposition model.

**Key insight (why this isn't a rollup):** annual GRR/NRR use **cohort** methodology — compare a customer's book at the start of the annual window vs the end — which is a different question than summing 12 monthly movements. A customer who churns and resubscribes within the year nets differently annually than month-by-month. So we must decompose the **annual-cohort** movement, not sum the monthly model.

## 2. What we're building

`models/intermediate/int_annual_mrr_movement_decomposed.sql` — one row per (annual window, entity_record_id) with:
- `p1_saas` (book at window start), `p2_saas` (book at window end)
- `movement_kind` (new / expansion / downgrade / cancellation / flat) — annual-cohort classification
- `seat_mrr`, `app_mrr`, `price_mrr` — the annual change decomposed via the same price–volume–mix logic as the monthly model, applied across the annual span

**Grain / window:** must mirror **exactly** how `int_customer_annual_mrr` / the validated `v_metric__annual_*` views define the annual cohort window and the CEO-confirmed symmetric Prepay-Expiry exclusion (memory: `project_annual_retention`). The build confirms the window definition by reading `int_customer_annual_mrr`'s DDL; parity is the gate.

**Source:** `int_customer_mrr_lines` (monthly per-(month, entity, item) line detail — already validated, bit-exact rollup). The annual decomposition pairs each customer's **window-start month** line set against the **window-end month** line set and runs the same PVM split (Δqty × prior rate = seats; whole-module add/drop = apps; rate/discount residual = price), then applies the annual PE exclusion to cancellations.

## 3. Architecture

- dbt model in `models/intermediate/`, `materialized: view`, built in staging (`revenue_validation`) first.
- References: `{{ ref('int_customer_mrr_lines') }}` + the annual window logic mirrored from `int_customer_annual_mrr`.
- Parallels `int_mrr_movement_decomposed` (Phase 1) in shape — reviewers and consumers already understand that contract.

## 4. Validation gates (all must pass before prod; mirror Phase 1)

1. **Identity:** `seat_mrr + app_mrr + price_mrr = p2_saas − COALESCE(p1_saas,0)` per (window, entity), within $0.01. (New parity script `scripts/parity_annual_decomposition_identity.py`.)
2. **Reconciliation:** annual decomposition aggregates reconcile to the **validated** annual metrics — `v_metric__annual_downgrades_mrr`, `v_metric__annual_expansions_mrr`, `v_metric__annual_cancellations_mrr` — within tolerance, per window. (New `scripts/parity_annual_decomposition_vs_metrics.py`.)
3. **PE exclusion:** PE-only-prior cohorts excluded from cancellation, matching the annual model (reuse the Phase-1 PE pattern + the entity-vs-company-grain guardrail test).
4. **In-progress guard:** don't synthesize the in-progress annual window.

Each parity script is committed; prod promotion held until all green + user approval (same as Phase 1 Task 6 / the `int_customers` dedup branch).

## 5. Open methodology questions (pin during build via parity)

1. **Window definition:** is the annual window trailing-12-months-ending-at-M, or fiscal-year cohorts? Mirror `int_customer_annual_mrr` exactly — confirm by reading its DDL before building.
2. **Mid-year resubscribe / multiple movements:** annual cohort sees only start vs end; a customer who downgraded then re-expanded nets to one annual movement. The decomposition reflects the **net** annual change (consistent with cohort methodology) — confirm this matches how the annual metrics treat it.
3. **Window-start month for a customer who started mid-window:** their p1 is 0 → classified `new` annually. Confirm against `v_metric__annual_*`.

## 6. Out of scope

- The UI (separate spec 3b).
- Changing the monthly decomposition (untouched).
- Annual dim splits for New/Churn — `int_customer_annual_mrr` already carries dims; the UI's annual New/Churn drill reads those directly, no new model needed. This spec is only the seats/apps/price (component) decomposition.

## 7. References

- Phase 1 pattern: `docs/superpowers/plans/2026-06-03-net-saas-validation-phase1.md`
- Monthly sibling: `models/intermediate/int_mrr_movement_decomposed.sql`
- Annual cohort model: `int_customer_annual_mrr`; validated annual metrics `v_metric__annual_*`
- Memory: `project_annual_retention` (symmetric PE exclusion, CEO-confirmed)
