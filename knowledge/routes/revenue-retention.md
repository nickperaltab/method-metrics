# Route: Revenue Retention

**Family:** revenue-retention
**Metrics:** NRR, GRR, MRR, Paying Logos, Net New ARR/MRR, Cancellations, Expansions, Downgrades, Other In/Out
**Catalog entries:** #1-5, #50-52, #53-68, #69-70, #83-112
**Data sources:** Monthly Excel files → USD Rates KPI Deck Google Sheet → BigQuery SQL replication
**Verified queries:** `knowledge/verified-queries/` (saas-mrr, cancellation-mrr, expansion-mrr, downgrade-mrr, new-mrr, other-in-mrr, other-out-mrr, net-new-mrr, net-new-arr)

## Rules for This Family

These rules are specific to revenue retention metrics. They may NOT apply to other families.

- **CompanyAccount is the classification level; EntityRecordID is the join key.** The Excel works at customer level (CompanyAccount). CompanyAccount strings change when companies are renamed, so join by EntityRecordID (stable numeric ID) across time periods, then aggregate to CompanyAccount before classifying. This produces EXACT match with Excel output.
- **SUM(SaaSAmount) with no filters** for total revenue. SaaSAmount already includes all components. Don't try to replicate SaaSNet by filtering AccountFullName — it drops revenue.
- **Prepay expiry is deferred revenue, not real churn.** Entities whose only SaaS lines are Prepay Expiry Income go to Other In/Out, not New/Cancellations.
- **SUM before checking > 0** for paying entity logic. Sum the whitelisted account amounts per entity first, then check if positive. Never check individual transactions.
- **Spreadsheet formula chain:** KPI Deck Update Sheet → Monthly Summary → Monthly Detail → NRR By Customer tab → Customers tab.

---

## NRR/GRR Formula Chain — How the Spreadsheets Calculate Retention

## Two Timeframes, Two Spreadsheets

| Question | Use this file | SaaS Period 1 & 2 represent |
|----------|--------------|----------------------------|
| Monthly NRR/GRR | **Feb Monthly.xlsx** | Month-over-month |
| Annual NRR/GRR | **Feb Annual.xlsx** | Year-over-year (e.g. Feb '24 vs Feb '25) |

Never mix them. Both feed into the **USD Rates KPI Deck** which pulls from the appropriate one.

## Formula Chain (Monthly Example)

### Step 1: USD Rates → Monthly Detail tab → Pre-FX Cancellations (col BT area)

The Pre-FX cancellation cell sums US + CAN + UK cancellations before applying the FX rate in column B.

### Step 2: Per-currency cancellation numbers come from Feb Monthly

Specifically, the **NRR By Customer** tab in Feb Monthly.

For US cancellations:
- `= SUM of Column AN (SaaSContractionCancel) WHERE Column AP (Currency) = USD` minus Other Churn for US accounts

### Step 3: Column AN — SaaSContractionCancel

```
IF(SaaSNetPeriod2 = 0, SaaSNetPeriod1, 0)
```

Translation: "If this customer has zero SaaSNet revenue in the current period, their cancellation amount = whatever they had last period. If they also had zero last period, cancellation = 0."

### Step 4: SaaSNetPeriod2 (and SaaSNetPeriod1)

```
SaaSNet = SaaSIncomeAmountNew + SaaSIncomeAmountClassic + DiscountOtherSaaS + DiscountPrepayPortion
```

These are the API field names. In BQ TransLineFlattened, the equivalent is `SUM(SaaSAmount)` — which already includes all four components. There is NO need to filter by AccountFullName.

## PROVEN: Correct BQ Approach (validated 2026-03-27)

**Join key:** `EntityRecordID` (stable numeric ID — never changes, even when companies are renamed)
**Classification level:** `CompanyAccount` (customer level — matches Excel Customers tab)
**Revenue:** `SUM(SaaSAmount)` with NO filters, NO exclusions
**OtherChurn separation:** Customers whose ONLY SaaS lines are Prepay Expiry Income go to OtherChurn, not Cancellation

### The pattern

1. Build entity-level monthly data, resolving CompanyAccount per entity per month
2. Join P1 to P2 by **EntityRecordID** (stable link across time)
3. Resolve CompanyAccount: prefer P2 name, fall back to P1
4. **Aggregate to CompanyAccount** before classifying
5. Classify at company level: cancel, downgrade, expansion, new

This handles CompanyAccount renames (one entity has up to 69 different names over time) by using the stable EntityRecordID for the temporal join, then reporting at customer level.

### Annual verification (validated 2026-03-27 — EXACT MATCH)

Verified against Nov Annual.xlsx and Dec Annual.xlsx (straight from BigQuery):

| Metric | Nov Excel | Nov BQ | Dec Excel | Dec BQ |
|--------|-----------|--------|-----------|--------|
| Start MRR | $685,608.92 | $685,608.92 | $689,606.01 | $689,606.01 |
| Cancel (adj) | $90,465.24 | $90,465.24 | $88,189.56 | $88,189.56 |
| OtherChurn | $9,995.75 | $9,995.75 | $10,531.00 | $10,531.00 |
| Downgrades | $63,103.16 | $63,103.16 | $60,131.72 | $60,131.72 |
| Expansion | $83,704.09 | $83,704.09 | $79,865.91 | $79,865.91 |
| New MRR | $195,359.57 | $195,359.57 | $198,077.84 | $198,077.84 |
| Pre-FX GRR | 77.60% | 77.60% | 78.49% | 78.49% |

**Every number matches to the penny.**

### Monthly verification (validated 2026-03-19, needs re-verification with company-level approach)

Previously verified with EntityRecordID-only grouping:

| Metric | Spreadsheet | BQ | Match |
|--------|------------|-----|-------|
| Start MRR | $814,714 | $814,714 | EXACT |
| Cancellations | $28,025 | $28,025 | EXACT |
| Downgrades | $20,448 | $20,448 | EXACT |
| Expansions | $18,579 | $18,579 | EXACT |
| New ARR | $28,728 | $28,728 | EXACT |

## WRONG Approaches (do NOT use)

### ❌ Prepay subtraction from cancellations
The previous approach tracked `prepay_mrr` (Prepay Expiry Income + Prepay Discounts + Client Prepayments) and subtracted it from cancellation amounts using `GREATEST(prev_prepay, 0)`. This was WRONG — it reduced cancellations to $17,741 when the spreadsheet says $28,025.

### ❌ Filtering AccountFullName to SaaSNet components
Filtering to only MethodNew + Classic + Discounts drops Start MRR from $814K to $673K. The API's `SaaSIncomeAmountNew` maps to MORE than just BQ's "MethodNew" account — it includes DEP, Portals, Emails, etc. Use full `SaaSAmount`, no filters.

### ❌ Direct CompanyAccount grouping (without EntityRecordID join)
Grouping directly by CompanyAccount for both periods causes false cancellations when companies are renamed (one entity has up to 69 names). Always join by EntityRecordID first, then aggregate to CompanyAccount.

### ❌ EntityRecordID-only classification (without CompanyAccount aggregation)
Classifying at entity level gives different numbers than the Excel. Entities within the same company can offset each other — one entity cancels while another stays active. At company level this is a downgrade; at entity level it's a cancellation + continued. Always aggregate to CompanyAccount before classifying.

## Debugging Methodology

When BQ numbers don't match, work backwards through the spreadsheet chain:

1. Start at **USD Rates → Monthly Detail → Pre-FX cancellation** (or whatever metric is off)
2. Trace to **Feb Monthly → NRR By Customer tab** — this has per-customer breakdowns
3. Look at the formulas in the NRR By Customer tab (Column AN for cancellations, etc.)
4. Those formulas reference columns in the **Customers tab** — SaaSNetPeriod1, SaaSNetPeriod2, Currency, etc.
5. All underlying data also exists in BigQuery (TransLineFlattened), so you can query BQ to compare customer-by-customer

The spreadsheets are the source of truth. All three files are in the project repo:
- `Feb Monthly.xlsx` — monthly timeframe
- `Feb Annual.xlsx` — annual timeframe
- `USD Rates _ Board KPI Deck Preparation 2023+ (1).xlsx` — the rollup

## Key BQ Schema Facts

Table: `project-for-method-dw.revenue.TransLineFlattened`

- `SaaSAmount` = the aggregate field. Use this for everything. No column-level breakdown of SaaSNew vs SaaSClassic exists in BQ.
- `CompanyAccount` = correct classification level (customer level, matches Excel Customers tab)
- `EntityRecordID` = stable join key across time (IDs never change; company names do)
- Pattern: join by EntityRecordID → aggregate to CompanyAccount → classify
- `AccountFullName` = identifies transaction type (MethodNew, Classic, Prepay Expiry, DEP, discounts, etc.) — useful for debugging but NOT for filtering
- `SaaSPayType` = Monthly or Prepay
- `TxnDate` = transaction date
