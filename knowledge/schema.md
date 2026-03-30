# BigQuery Schema Reference

## Primary Table

`project-for-method-dw.revenue.TransLineFlattened`

Populated nightly by the SaaS Analytics Engine API (`/api/revtobigquery`). Source system: Alocet.

## Key Fields

| Field | Type | Meaning |
|-------|------|---------|
| `CompanyAccount` | STRING | Customer/company name. **This is the correct grouping level for retention** (customer level, matches Excel Customers tab). However, CompanyAccount strings change when companies are renamed, so you must join by `EntityRecordID` first (stable numeric ID), then aggregate to CompanyAccount for classification. See the proven approach in `knowledge/routes/revenue-retention.md`. |
| `EntityRecordID` | INT64 | Stable numeric identifier for each billing entity (account level). Use this for **joining** across time periods — it never changes. Then aggregate to CompanyAccount for classification. Do NOT classify at entity level — that gives different (wrong) retention numbers vs the Excel. |
| `SaaSAmount` | FLOAT | The aggregate revenue field. Includes all SaaS components (MethodNew, Classic, DEP, discounts, portals, emails). Use `SUM(SaaSAmount)` for total revenue. |
| `AccountFullName` | STRING | Transaction type identifier. Values like `Subscriptions:MethodNew`, `Subscriptions:Classic`, `Subscriptions:Prepay Expiry Income`, etc. Useful for debugging and whitelist filtering, NOT for filtering revenue totals. |
| `TxnDate` | DATE | Transaction date. Data starts 2021-12-01. |
| `SaaSPayType` | STRING | `Monthly` or `Prepay`. |

## Critical Rules

1. **Join by `EntityRecordID`, classify at `CompanyAccount` level.** EntityRecordID is the stable join key (numeric, never changes). CompanyAccount is the correct classification level (customer, matches Excel). The pattern: join entities across periods by EntityRecordID → resolve CompanyAccount (prefer P2 name) → aggregate to CompanyAccount → classify. This produces EXACT match with Excel output.

2. **Use `SUM(SaaSAmount)` with no filters** for total revenue. SaaSAmount already includes all SaaS components. The spreadsheet's `SaaSNet = SaaSIncomeAmountNew + SaaSIncomeAmountClassic + DiscountOtherSaaS + DiscountPrepayPortion` is equivalent to `SUM(SaaSAmount)` in BQ.

3. **Never filter on SaaSAmount directly.** When you need to identify specific transaction types (like paying logos), whitelist by `AccountFullName` first, then sum.

4. **Exclude the current incomplete month** in queries: `FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())`

5. **Currency assignment:** Assign each entity to the currency with the highest SaaSAmount line. This handles cross-currency discounts (e.g., MSP Free License discounts booked under CAN-Sales for a US customer). Currency is derived from AccountFullName: `%US-Sales%` = US, `%CAN-Sales%` = CAN, `%UK-Sales%` = UK.

## Common Query Pattern

Most retention metrics follow this structure:

```sql
-- Step 1: Entity-level monthly data (with CompanyAccount resolved per entity)
WITH entity_monthly AS (
  SELECT
    FORMAT_DATE('%Y-%m', TxnDate) AS month,
    EntityRecordID,
    ARRAY_AGG(CompanyAccount ORDER BY SaaSAmount DESC LIMIT 1)[OFFSET(0)] AS company,
    SUM(SaaSAmount) AS total_saas
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE TxnDate >= '2021-12-01'
    AND FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
  GROUP BY month, EntityRecordID
),
-- Step 2: Join by EntityRecordID (stable), resolve company name
entity_paired AS (
  -- Join P1 to P2 by EntityRecordID, take P2 company name (or P1 if gone)
),
-- Step 3: Aggregate to CompanyAccount, then classify
company_level AS (
  SELECT month, company, SUM(p1_saas) AS p1_saas, SUM(p2_saas) AS p2_saas
  FROM entity_paired GROUP BY month, company
)
-- Step 4: Classify at company level (cancel, downgrade, expansion, new)
```

## Verified Results (Feb 2026, Jan→Feb comparison)

| Metric | Spreadsheet | BQ | Match |
|--------|------------|-----|-------|
| Start MRR | $814,714 | $814,714 | EXACT |
| Cancellations | $28,025 | $28,025 | EXACT |
| Downgrades | $20,448 | $20,448 | EXACT |
| Expansions | $18,579 | $18,579 | EXACT |
| New ARR | $28,728 | $28,728 | EXACT |
