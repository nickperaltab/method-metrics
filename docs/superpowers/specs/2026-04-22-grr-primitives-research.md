# GRR Primitives Research

**Date:** 2026-04-22
**Status:** Research complete — awaiting implementation round
**Author:** Claude (research agent, verified against CSV)

---

## Verification Against CSV

Source file: `USD Rates _ Board KPI Deck Preparation 2023+ - Monthly Detail.csv`
Row range: rows 2–52 (Jan 2022 – Mar 2026, 51 months)

### Column Index Reference

| Excel Col | CSV index | Header (row 1) | Description |
|-----------|-----------|----------------|-------------|
| A | 0 | (month label) | e.g. "Jan '22" |
| B | 1 | US F/X | CAD per USD exchange rate |
| C | 2 | UK F/X | CAD per GBP — **always 1.0** across the full history (no UK revenue to date) |
| D–F | 3–5 | US/CA/UK-Accounts Receivable | Native-currency Start MRR per currency |
| G–I | 6–8 | US/CA/UK-Accounts Receivable (Cancel) | Native-currency Cancellations per currency |
| J–L | 9–11 | US/CA/UK-Accounts Receivable (Downgrade) | Native-currency Downgrades per currency |
| M–O | 12–14 | US/CA/UK-Accounts Receivable (Expansion) | Native-currency Expansions per currency |
| AB–AD | 27–29 | Start of Month US/CA/UK-Adjusted | FX-adjusted Start MRR per currency |
| AE | 30 | Start of Month Total | SUM of FX-adjusted (all currencies in CAD) |
| AF–AH | 31–33 | Cancellation US/CA/UK-Adjusted | FX-adjusted Cancellations |
| AI | 34 | Cancellation Total | SUM of FX-adjusted Cancellations |
| AJ–AL | 35–37 | Downgrades US/CA/UK-Adjusted | FX-adjusted Downgrades |
| AM | 38 | Downgrades Total | SUM of FX-adjusted Downgrades |
| AN–AP | 39–41 | Expansion US/CA/UK-Adjusted | FX-adjusted Expansions |
| AQ | 42 | Expansion Total | SUM of FX-adjusted Expansions |
| BU | 72 | Start of the Month | Pre-FX total (see below) |
| BV | 73 | Total Cancellations | Pre-FX total Cancellations |
| BW | 74 | Total Downgrades | Pre-FX total Downgrades |
| BX | 75 | Total Churn | BV + BW |
| BY | 76 | Total Expansions | Pre-FX total Expansions |
| BZ | 77 | Net MRR Retention | Monthly NRR % |
| CA | 78 | Gross MRR Retention | Monthly GRR % |

---

### Gross MRR Retention (col CA)

**Formula confirmed:** `GRR = 1 − (BV + BW) / BU`

- Rows matched: **51/51**
- Max absolute error: **0.000000%** (exact to floating-point precision)
- Comments: None. Every single month from Jan 2022 through Mar 2026 matches to full precision.

The hypothesis from `knowledge/metrics-catalog.md` (metric 111: `(Cancellation + Downgrades) / Start`) is confirmed correct. GRR is the complement: `1 − (Cancellations + Downgrades) / Start`.

### Net MRR Retention (col BZ)

**Formula confirmed:** `NRR = 1 − (BV + BW − BY) / BU`  
which equals `(BU − BV − BW + BY) / BU`

- Rows matched: **51/51**
- Max absolute error: **0.000000%**
- Comments: None. Both equivalent forms are algebraically identical; use whichever is more readable.

### Per-Currency Reconciliation

**BU, BV, BW, BY are PRE-FX totals — native currency units summed directly.**

Verified formulas (all match 51/51 rows):

```
BU (col 72) = US_native_start (col 3) + CA_native_start (col 4) + UK_native_start (col 5)
BV (col 73) = US_native_cancel (col 6) + CA_native_cancel (col 7) + UK_native_cancel (col 8)
BW (col 74) = US_native_down   (col 9) + CA_native_down  (col 10)+ UK_native_down  (col 11)
BY (col 76) = US_native_exp   (col 12) + CA_native_exp   (col 13)+ UK_native_exp   (col 14)
```

**The "Pre-FX" section (BU–CA) is NOT FX-adjusted.** This is distinct from cols 30/34/38/42 which are FX-adjusted CAD totals. The GRR/NRR % formulas use the pre-FX numbers, so GRR is computed in native mixed currency, not CAD-normalized. This is consistent with the `verified-queries/monthly-*.sql` files which also compute in pre-FX native currency and match exactly.

**Per-currency FX relationship (cols 27–42):**

- `US_adjusted = US_native × US_FX` (col B) — verified 43/51 rows exactly, 8 rows off by $5–$24 (rounding in the spreadsheet's FX column — the implied FX rate differs in the 5th–6th decimal place from the displayed rate). This is a display-precision artifact, not a formula difference.
- `CA_adjusted = CA_native` (1:1, no FX) — verified 51/51 exactly.
- `UK_adjusted = UK_native × UK_FX` (col C) — verified 51/51. UK FX = 1.0 for all 51 months (no GBP revenue yet).
- `Total_adjusted = US_adjusted + CA_adjusted + UK_adjusted` — verified 51/51.

**Key finding:** The GRR/NRR denominators (BU) use the simpler pre-FX sum. The FX-adjusted totals (col 30) are used for ARR reporting in board decks but NOT for the retention % calculation. The verified BQ queries (`monthly-start-mrr.sql`, etc.) already produce the pre-FX numbers. This means the GRR primitive aggregates are directly obtainable from the existing verified query pattern.

---

## Proposed Primitives

All four primitives are on view `v_customers` (new view, defined in `docs/superpowers/specs/2026-04-22-customers-primitive-refactor-design.md`). They extend that view with MRR-related columns that are deferred to the GRR round.

### Grain

`v_customers` is `Month × EntityRecordID` (one row per customer per month). For GRR we need monthly aggregates — `SUM()` over all rows in a month. This is exactly what `buildSemanticSql` does for any primitive with `semantic_measure = 'ROUND(SUM(col), 2)'`.

### Classification logic (from verified BQ queries)

At company level (CompanyAccount), using the P1/P2 paired pattern from `knowledge/verified-queries/`:

| Classification | Condition | Contribution column |
|---|---|---|
| **New** | P1 = 0, P2 > 0 | NewAmount = P2 |
| **Expansion** | P1 > 0, P2 > P1 | ExpansionAmount = P2 − P1 |
| **No change** | P1 > 0, P2 = P1 | — |
| **Downgrade** | P1 > 0, P2 > 0, P2 < P1 | DowngradeAmount = P1 − P2 |
| **Cancellation** | P1 > 0, P2 = 0, NOT prepay-only | ChurnAmount = P1 |
| **OtherChurn** | P1 > 0, P2 = 0, prepay-only | excluded from GRR denominator |
| **Start MRR** | P1 > 0 | StartMRR = P1 |

"Prepay-only" = all non-zero SaaS lines in P1 are `AccountFullName LIKE '%Prepay Expiry Income%'`.

This classification is identical to `knowledge/verified-queries/monthly-cancellations.sql` lines 76–84 and `monthly-start-mrr.sql`. It is **already verified to exact-match** against Feb 2026 and Oct 2025.

---

### Primitive 1 — Start MRR (`metric_id TBD`)

| Field | Value |
|---|---|
| `name` | `Start MRR` |
| `semantic_table` | `v_customers` |
| `semantic_measure` | `ROUND(SUM(StartMRR), 2)` |
| `semantic_date_col` | `Month` |
| `semantic_filters` | `['StartMRR > 0']` |
| `semantic_dimensions` | `['Segment', 'UserTier', 'HasDEP', 'AttributionChannel', 'SignupCountry', 'Vertical', 'SyncType', 'Currency']` |
| `status` | `queued` |
| `notes` | Sum of prior-month MRR for all customers who had positive revenue last month. Pre-FX (native currency). OtherChurn entities are included in Start MRR — they had real revenue last month. Filter `StartMRR > 0` eliminates new customers (P1 = 0). |

**Verification anchor:** Col BU. `SUM(StartMRR)` across all rows in a month must equal col BU ± $0.01 for each of the 51 months.

---

### Primitive 2 — Cancellations ($) (`metric_id TBD`)

| Field | Value |
|---|---|
| `name` | `Cancellations ($)` |
| `semantic_table` | `v_customers` |
| `semantic_measure` | `ROUND(SUM(ChurnAmount), 2)` |
| `semantic_date_col` | `Month` |
| `semantic_filters` | `['ChurnAmount > 0']` |
| `semantic_dimensions` | `['Segment', 'UserTier', 'HasDEP', 'AttributionChannel', 'SignupCountry', 'Vertical', 'SyncType', 'Currency']` |
| `status` | `queued` |
| `notes` | MRR lost from customers that had positive SaaS last month but zero this month, excluding OtherChurn (prepay-only cancels). Pre-FX. Maps to col BV. |

**Verification anchor:** Col BV. `SUM(ChurnAmount)` per month must equal col BV ± $0.01.

---

### Primitive 3 — Downgrades ($) (`metric_id TBD`)

| Field | Value |
|---|---|
| `name` | `Downgrades ($)` |
| `semantic_table` | `v_customers` |
| `semantic_measure` | `ROUND(SUM(DowngradeAmount), 2)` |
| `semantic_date_col` | `Month` |
| `semantic_filters` | `['DowngradeAmount > 0']` |
| `semantic_dimensions` | `['Segment', 'UserTier', 'HasDEP', 'AttributionChannel', 'SignupCountry', 'Vertical', 'SyncType', 'Currency']` |
| `status` | `queued` |
| `notes` | MRR lost from customers who stayed active but reduced their spend (P2 > 0, P2 < P1). Amount = P1 − P2. Pre-FX. Maps to col BW. |

**Verification anchor:** Col BW. `SUM(DowngradeAmount)` per month must equal col BW ± $0.01.

---

### Primitive 4 — Expansions ($) (`metric_id TBD`)

| Field | Value |
|---|---|
| `name` | `Expansions ($)` |
| `semantic_table` | `v_customers` |
| `semantic_measure` | `ROUND(SUM(ExpansionAmount), 2)` |
| `semantic_date_col` | `Month` |
| `semantic_filters` | `['ExpansionAmount > 0']` |
| `semantic_dimensions` | `['Segment', 'UserTier', 'HasDEP', 'AttributionChannel', 'SignupCountry', 'Vertical', 'SyncType', 'Currency']` |
| `status` | `queued` |
| `notes` | MRR gained from existing customers who increased spend (P1 > 0, P2 > P1). Amount = P2 − P1. Pre-FX. Maps to col BY. |

**Verification anchor:** Col BY. `SUM(ExpansionAmount)` per month must equal col BY ± $0.01.

---

## View Column Additions

`v_customers` (currently being built per the customers-primitive-refactor-design.md) needs these columns added in its second revision for the GRR round.

The existing verified query pattern in `knowledge/verified-queries/monthly-*.sql` already computes these values — they need to be materialized as columns on the view rather than computed at query time.

```sql
-- Classification columns (per CompanyAccount per Month, after P1/P2 pairing)
StartMRR         NUMERIC    -- P1 amount when P1 > 0. NULL or 0 for new customers.
ChurnAmount      NUMERIC    -- P1 when (P1 > 0 AND P2 = 0 AND NOT prepay_only). Else 0.
DowngradeAmount  NUMERIC    -- (P1 - P2) when (P1 > 0 AND P2 > 0 AND P2 < P1). Else 0.
ExpansionAmount  NUMERIC    -- (P2 - P1) when (P1 > 0 AND P2 > P1). Else 0.
Currency         STRING     -- 'USD' | 'CAD' | 'GBP' — from entity/account source data
```

### Implementation notes

**P1/P2 pairing:** `v_customers` will need to self-join (or use `LAG`) to get the prior month's `SaaSAmount`. The verified queries use a UNION ALL pattern (entity_paired CTE) to capture both "P2 exists, P1 may not" and "P1 exists, P2 does not." That same pattern should drive the view.

**CompanyAccount aggregation before classification:** Per `knowledge/routes/revenue-retention.md`, classification must happen at CompanyAccount level (not entity level). A company with two entities where one cancels and one stays is a downgrade, not a cancel+continue. The view must aggregate to CompanyAccount before computing ChurnAmount, DowngradeAmount, ExpansionAmount.

**OtherChurn exclusion:** A CompanyAccount whose P1 lines are exclusively `AccountFullName LIKE '%Prepay Expiry Income%'` contributes to OtherChurn, not ChurnAmount. The verified query pattern in `monthly-cancellations.sql` (lines 76–84) is the authoritative implementation. OtherChurn entities should have `ChurnAmount = 0` on the view (their contribution is tracked separately if needed, but they are excluded from GRR).

**Currency column:** Per metric 93 in the catalog, currency is already available from the entity/account source data (`accEntity`). The per-currency breakdown in the CSV (cols 3–14) confirms that US-AR accounts contribute to USD, CAN-AR to CAD, UK-AR to GBP. This needs to be surfaced as a `Currency` STRING dimension on the view for per-currency primitive breakdowns.

**Grain clarification:** `v_customers` is currently `Month × EntityRecordID`. The P1/P2 classification is at `CompanyAccount` level (after aggregating entities). The view may need a dual representation: one row per EntityRecordID (for the customer count primitive, metric 373) and one row per CompanyAccount/month (for the MRR primitives). This is an open design question — see Open Questions below.

---

## Proposed Derivatives

Once the four primitives above are registered with their Supabase IDs, the derivative metrics can be registered using the project's formula syntax.

Let the four primitive IDs be:
- `{A}` = Start MRR metric id
- `{B}` = Cancellations ($) metric id  
- `{C}` = Downgrades ($) metric id
- `{D}` = Expansions ($) metric id

### Gross MRR Retention %

```
formula: SAFE_DIVIDE({A} - {B} - {C}, {A}) * 100
depends_on: [A, B, C]
```

Algebraic equivalent to `1 − (B + C) / A`. `SAFE_DIVIDE` handles the edge case where `Start MRR = 0` (returns NULL instead of division error). Multiply by 100 to express as a percentage.

Alternative form that more directly expresses the formula:
```
formula: (1 - SAFE_DIVIDE({B} + {C}, {A})) * 100
```

Both are equivalent. The first matches the pattern used by `SAFE_DIVIDE({55},{54})*100` (Sync Rate) — keep consistent with existing derivatives.

### Net MRR Retention %

```
formula: SAFE_DIVIDE({A} - {B} - {C} + {D}, {A}) * 100
depends_on: [A, B, C, D]
```

Algebraic equivalent to `(A − B − C + D) / A = 1 − (B + C − D) / A`.

---

## Reconciliation Plan for Implementation

When the GRR round begins, verification steps in order:

1. **Add the view columns above** to `v_customers` (second revision of the view).
2. **Run the P1/P2 classification logic** and confirm the view produces non-null StartMRR, ChurnAmount, DowngradeAmount, ExpansionAmount for a sample month.
3. **Register the four primitives** as new Supabase metric rows with `status = 'queued'`.
4. **Run `/metric-solver` on Start MRR (primitive A):** for each month Jan 2022–Mar 2026, `SUM(StartMRR) FROM v_customers` must equal col BU ± $0.01 (51 rows).
5. **Run `/metric-solver` on Cancellations ($):** monthly `SUM(ChurnAmount)` must equal col BV ± $0.01.
6. **Run `/metric-solver` on Downgrades ($):** monthly `SUM(DowngradeAmount)` must equal col BW ± $0.01.
7. **Run `/metric-solver` on Expansions ($):** monthly `SUM(ExpansionAmount)` must equal col BY ± $0.01.
8. **Register GRR %** as a derivative with the formula above. Compute GRR % for each month and compare to col CA ± 0.01%.
9. **Register NRR %** as a derivative. Compute NRR % for each month and compare to col BZ ± 0.01%.
10. **Promote all six metrics to `live`** only after all nine checks pass.

**Note:** Steps 4–7 each have a verified query equivalent in `knowledge/verified-queries/monthly-*.sql`. Those queries already match to the penny for Feb 2026 and Oct 2025. The main risk is not the formula but the view implementation details (CompanyAccount aggregation, OtherChurn exclusion, grain design).

---

## Open Questions / Risks

### 1. View grain: EntityRecordID vs CompanyAccount

`v_customers` is currently designed at `Month × EntityRecordID` grain for the customer-count primitive (metric 373). The MRR classification logic requires aggregating to `CompanyAccount` level before classifying — one entity per company can cancel while another stays, and that should count as a downgrade at company level.

**Two options:**
- **Option A:** Add a second grain to `v_customers` — keep EntityRecordID rows for COUNT(DISTINCT) but add CompanyAccount-level rows (or a companion view `v_customers_mrr`) for the MRR columns. Risk: two grains in one view is confusing.
- **Option B:** Create a separate view `v_mrr` at `Month × CompanyAccount` grain. Cleaner separation, slightly more views to maintain.
- **Option C:** Store MRR columns at EntityRecordID grain (pre-CompanyAccount-aggregation) and let the primitive's `semantic_measure` do the CompanyAccount aggregation via `SUM()`. This only works if a company's entity-level MRR values are additive across entities, which they are for Start/Expansion/Downgrade/Churn because classification already ensures mutual exclusivity at entity level once companyAccount aggregation happens.

Justin's input needed: which grain makes most sense given how `method_forecast` structures per-customer revenue data?

### 2. MRR source in BQ

The verified queries read from `project-for-method-dw.revenue.TransLineFlattened` using `SUM(SaaSAmount)`. The `v_customers` spec defers identifying the exact BQ source table — it currently references `<same base source v_customer_segments uses>`. Before adding MRR columns to `v_customers`, confirm:
- Is `TransLineFlattened` the right source (already proven for monthly-*.sql), or does `v_customers` use a different source table?
- Does Justin's `method_forecast` dataset have a pre-computed per-customer MRR table that's more up to date than querying `TransLineFlattened` directly?

### 3. Currency dimension source

The per-currency breakdown (US-AR / CAN-AR / UK-AR) is available in the entity/account source data (metric 93 in catalog references `accEntity`). Confirm the exact column name in the BQ source used by `v_customers`. The dimension name `Currency` with values `'USD' / 'CAD' / 'GBP'` is a proposal — if the source uses `'US-AR' / 'CAN-AR' / 'UK-AR'` those labels should be preserved (or transformed in the view) to avoid introducing a new naming convention.

### 4. OtherChurn treatment in GRR denominator

The CSV's col BV ("Total Cancellations") explicitly excludes OtherChurn (prepay-expiry-only cancels). Col BU ("Start of Month") **includes** those customers in the denominator because they had real revenue in P1. This is confirmed by the verified queries. When building the view, ensure:
- Prepay-only cancellations → `ChurnAmount = 0` (excluded from GRR numerator)
- Prepay-only start MRR → `StartMRR = P1` (included in GRR denominator)

If OtherChurn amounts are needed as a separate metric later, add `OtherChurnAmount NUMERIC` as a fifth column.

### 5. UK business

UK FX = 1.0 for all 51 months in the CSV. If Method ever starts billing GBP customers at non-1 CAD parity, the GRR formula (which uses pre-FX native currency sum) will mix USD + CAD + GBP in one number. At that point, the pre-FX GRR may no longer be the primary board metric — the FX-adjusted GRR (using cols 30/34/38 with the CAD-adjusted totals) would become necessary. Flag this to Justin before UK revenue launches.

---

## Appendix: Sample Data (Jan 2022 – Mar 2026)

Full 51-month verified values for reference during implementation:

| Month | Start (BU) | Cancel (BV) | Downgrade (BW) | Expansion (BY) | NRR% (BZ) | GRR% (CA) |
|-------|-----------|-------------|----------------|----------------|-----------|-----------|
| Jan '22 | 423,204.80 | 9,197.00 | 8,514.80 | 7,647.61 | 97.62% | 95.81% |
| Feb '22 | 421,047.19 | 8,847.40 | 7,328.05 | 10,455.40 | 98.64% | 96.16% |
| Mar '22 | 427,311.39 | 7,197.75 | 6,946.55 | 7,754.54 | 98.50% | 96.69% |
| Apr '22 | 435,087.63 | 8,183.00 | 8,609.65 | 9,725.10 | 98.38% | 96.14% |
| May '22 | 440,764.83 | 7,413.00 | 7,452.21 | 8,487.67 | 98.55% | 96.63% |
| Jun '22 | 450,026.30 | 15,772.75 | 8,294.10 | 10,474.22 | 96.98% | 94.65% |
| Jul '22 | 448,858.17 | 10,526.00 | 6,962.57 | 10,632.60 | 98.47% | 96.10% |
| Aug '22 | 452,614.20 | 10,288.96 | 6,650.37 | 8,850.28 | 98.21% | 96.26% |
| Sep '22 | 459,820.90 | 8,613.75 | 7,138.16 | 9,217.50 | 98.58% | 96.57% |
| Oct '22 | 464,938.99 | 8,143.75 | 8,349.41 | 9,254.29 | 98.44% | 96.45% |
| Nov '22 | 466,766.12 | 10,038.22 | 8,694.85 | 9,932.70 | 98.11% | 95.99% |
| Dec '22 | 473,751.50 | 8,415.44 | 9,820.65 | 8,708.10 | 97.99% | 96.15% |
| Jan '23 | 474,087.70 | 4,803.32 | 9,570.24 | 10,458.86 | 99.17% | 96.97% |
| Feb '23 | 483,805.50 | 8,716.10 | 10,896.37 | 11,552.68 | 98.33% | 95.95% |
| Mar '23 | 489,579.01 | 9,523.50 | 11,569.17 | 13,294.79 | 98.41% | 95.69% |
| Apr '23 | 496,511.38 | 7,683.50 | 9,752.27 | 13,838.78 | 99.28% | 96.49% |
| May '23 | 503,776.39 | 9,790.02 | 9,357.37 | 12,723.61 | 98.72% | 96.20% |
| Jun '23 | 509,022.61 | 9,052.65 | 10,524.77 | 10,912.91 | 98.30% | 96.15% |
| Jul '23 | 511,160.60 | 8,769.05 | 8,794.92 | 11,698.76 | 98.85% | 96.56% |
| Aug '23 | 521,353.64 | 8,006.75 | 10,502.06 | 18,126.90 | 99.93% | 96.45% |
| Sep '23 | 534,463.48 | 9,756.50 | 9,717.01 | 18,598.44 | 99.84% | 96.36% |
| Oct '23 | 544,797.41 | 9,216.05 | 9,397.18 | 17,046.71 | 99.71% | 96.58% |
| Nov '23 | 555,626.64 | 10,304.57 | 11,287.43 | 17,960.46 | 99.35% | 96.11% |
| Dec '23 | 563,558.35 | 8,630.05 | 9,838.52 | 15,506.58 | 99.47% | 96.72% |
| Jan '24 | 571,641.86 | 9,973.75 | 10,785.89 | 13,184.29 | 98.67% | 96.37% |
| Feb '24 | 588,788.51 | 12,683.30 | 15,876.67 | 18,112.19 | 98.23% | 95.15% |
| Mar '24 | 597,038.61 | 8,516.08 | 12,928.88 | 18,462.29 | 99.50% | 96.41% |
| Apr '24 | 611,383.65 | 7,076.80 | 14,698.97 | 21,266.89 | 99.92% | 96.44% |
| May '24 | 622,145.62 | 7,784.16 | 13,502.40 | 18,671.81 | 99.58% | 96.58% |
| Jun '24 | 633,823.87 | 6,941.40 | 12,734.11 | 15,798.57 | 99.39% | 96.90% |
| Jul '24 | 644,416.43 | 9,808.65 | 11,999.20 | 17,323.79 | 99.30% | 96.62% |
| Aug '24 | 651,280.62 | 8,394.55 | 13,560.91 | 17,290.70 | 99.28% | 96.63% |
| Sep '24 | 660,045.86 | 11,559.00 | 10,287.61 | 17,082.51 | 99.28% | 96.69% |
| Oct '24 | 667,325.01 | 9,731.05 | 12,486.24 | 13,947.68 | 98.76% | 96.67% |
| Nov '24 | 677,629.40 | 10,508.95 | 14,927.78 | 15,037.84 | 98.47% | 96.25% |
| Dec '24 | 685,603.92 | 11,277.86 | 12,418.68 | 12,427.13 | 98.36% | 96.54% |
| Jan '25 | 689,601.01 | 7,848.59 | 15,889.54 | 15,061.58 | 98.74% | 96.56% |
| Feb '25 | 697,384.07 | 13,054.90 | 13,291.36 | 17,711.38 | 98.76% | 96.22% |
| Mar '25 | 708,031.58 | 12,158.35 | 13,971.28 | 14,586.34 | 98.37% | 96.31% |
| Apr '25 | 715,409.99 | 8,791.35 | 13,520.86 | 20,855.72 | 99.80% | 96.88% |
| May '25 | 736,820.05 | 8,308.75 | 11,546.21 | 16,388.57 | 99.53% | 97.31% |
| Jun '25 | 749,502.66 | 13,136.55 | 11,997.26 | 17,656.53 | 99.00% | 96.65% |
| Jul '25 | 758,524.33 | 12,564.60 | 11,234.98 | 14,309.04 | 98.75% | 96.86% |
| Aug '25 | 761,997.10 | 10,069.60 | 15,956.53 | 21,378.20 | 99.39% | 96.58% |
| Sep '25 | 772,277.10 | 9,988.85 | 11,997.76 | 16,310.21 | 99.26% | 97.15% |
| Oct '25 | 782,754.21 | 9,645.14 | 12,556.00 | 15,290.67 | 99.12% | 97.16% |
| Nov '25 | 799,011.59 | 10,724.30 | 15,049.29 | 14,721.13 | 98.62% | 96.77% |
| Dec '25 | 801,091.93 | 10,125.10 | 11,725.80 | 14,056.45 | 99.03% | 97.27% |
| Jan '26 | 808,688.48 | 10,128.85 | 14,423.51 | 14,974.41 | 98.82% | 96.96% |
| Feb '26 | 814,713.53 | 17,774.85 | 20,447.60 | 18,578.84 | 97.59% | 95.31% |
| Mar '26 | 813,584.27 | 12,013.50 | 13,911.17 | 19,267.49 | 99.18% | 96.81% |
