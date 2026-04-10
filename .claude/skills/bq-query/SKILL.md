---
name: bq-query
description: Write correct BigQuery SQL against Method's revenue dataset. Embeds schema rules, view reference, proven CTE patterns, and anti-patterns so you never hit known pitfalls.
---

# BigQuery Query Helper

You are writing SQL against Method CRM's BigQuery dataset. This skill contains the rules, views, and patterns you need to write correct queries on the first attempt.

## Dataset

- **Project:** `project-for-method-dw`
- **Dataset:** `revenue`
- **Primary table:** `revenue.TransLineFlattened` (populated nightly by SaaS Analytics Engine)
- **Data starts:** 2021-12-01

## Live BQ Views

These 8 views are actively used by scorecards. Each is a pre-filtered, pre-joined subset of the `Account` table.

| View | Date Column | Measure | What It Counts |
|------|-------------|---------|----------------|
| `v_trials` | `SignupDate` | `COUNT(*)` | Trial signups (excludes conversion exceptions, Method Integration partner, sentinel dates) |
| `v_syncs` | `SyncDate` | `COUNT(*)` | Trials that synced data |
| `v_conversions` | `FirstSaaSInvoiceTxnDate` | `COUNT(*)` | Trials that became paying customers |
| `v_cancellations` | `CancellationDate` | `COUNT(DISTINCT CompanyAccount)` | Churned customer accounts |
| `v_new_net_saas` | `TxnDate` | `SUM(SaaSAmount)` | Revenue from new customers |
| `v_new_dep_revenue` | `TxnDate` | `SUM(SaaSAmount)` | New DEP (Dedicated Enhancement Plan) revenue; filter `is_new_dep = TRUE` for new-only |
| `v_total_net_saas` | `TxnDate` | `SUM(SaaSAmount + SaaSExpense)` | Total net SaaS revenue (income + expense) |
| `v_total_dep_revenue` | `TxnDate` | `SUM(SaaSAmount)` | Total DEP revenue |

### Other Key Tables

| Table | Purpose |
|-------|---------|
| `revenue.Account` | Master account table. Used directly for conversion rate weekly calculations (has `SignupDate`, `FirstSaaSInvoiceTxnDate`, `IsConversionException`, `Partner`). |
| `revenue.method_forecast` | Daily forecast/budget numbers. Columns: `Date`, `Forecasted_Trials`, `Budgeted_Trials`, `Forecasted_Syncs`, `Budgeted_Syncs`, `Forecasted_Churn`, `Budgeted_Churn`, `Forecasted_Conversion_Rate`, `Budgeted_Conversion_Rate`, `Forecasted_New_Net_SaaS`, `Budgeted_New_Net_SaaS`, `Forecasted_Total_Net_SaaS`, `Budgeted_Total_Net_SaaS`, `Forecasted_New_DEP_Revenue`, `Budgeted_New_DEP_Revenue`, `Forecasted_Total_DEP_Revenue`, `Budgeted_Total_DEP_Revenue`, `Forecasted_NRR`, `Budgeted_NRR`, `Forecasted_Sync_Rate`, `Budgeted_Sync_Rate`, `Forecasted_Churn_Rate`. |
| `revenue.TransLineFlattened` | Raw revenue transaction data. Used for retention metrics (NRR, GRR, MRR, cancellations, expansions, downgrades). |

## TransLineFlattened Key Fields

| Field | Type | Use |
|-------|------|-----|
| `CompanyAccount` | STRING | Customer name. Correct **classification** level for retention (matches Excel). But names change on rename, so never use as join key across periods. |
| `EntityRecordID` | INT64 | Stable numeric ID per billing entity. Correct **join** key across time periods (never changes). |
| `SaaSAmount` | FLOAT | Aggregate revenue. Includes all SaaS components (MethodNew, Classic, DEP, discounts, portals, emails). Use `SUM(SaaSAmount)` for total revenue. |
| `AccountFullName` | STRING | Transaction type. Values: `Subscriptions:MethodNew`, `Subscriptions:Classic`, `Subscriptions:Prepay Expiry Income`, `Subscriptions:Dedicated Enhancement Plan`, etc. For debugging/whitelist only, NOT for filtering revenue totals. |
| `TxnDate` | DATE | Transaction date. |
| `SaaSPayType` | STRING | `Monthly` or `Prepay`. |

## 5 Critical Rules

1. **Join by `EntityRecordID`, classify at `CompanyAccount`.** EntityRecordID is the stable join key (numeric, never changes). CompanyAccount is the correct classification level (customer, matches Excel). Pattern: join entities across periods by EntityRecordID -> resolve CompanyAccount (prefer P2 name) -> aggregate to CompanyAccount -> classify.

2. **Use `SUM(SaaSAmount)` with NO filters for total revenue.** SaaSAmount already includes all SaaS components. The spreadsheet's SaaSNet formula maps directly to `SUM(SaaSAmount)` in BQ.

3. **SUM before checking > 0 for paying entity logic.** Sum the whitelisted account amounts per entity first, then check if the total is positive. Never check individual transaction lines for positivity.

4. **Exclude the current incomplete month** in retention/revenue queries:
   ```sql
   FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
   ```

5. **Currency assignment:** Assign each entity to the currency with the highest SaaSAmount line. Currency is derived from AccountFullName: `%US-Sales%` = US, `%CAN-Sales%` = CAN, `%UK-Sales%` = UK.

## 4 Anti-Patterns (NEVER Do These)

### 1. Prepay subtraction from cancellations
Tracking `prepay_mrr` and subtracting it from cancellation amounts. This was tried and gave $17,741 when the spreadsheet says $28,025. Prepay-only entities go to OtherChurn, not Cancellation.

### 2. Filtering AccountFullName to SaaSNet components
Filtering to only MethodNew + Classic + Discounts drops Start MRR from $814K to $673K. The API's `SaaSIncomeAmountNew` maps to MORE than just BQ's "MethodNew" account. Use full `SaaSAmount`, no filters.

### 3. Direct CompanyAccount grouping (without EntityRecordID join)
Grouping directly by CompanyAccount for both periods causes false cancellations when companies are renamed (one entity has up to 69 different names over time). Always join by EntityRecordID first, then aggregate to CompanyAccount.

### 4. Entity-level classification (without CompanyAccount aggregation)
Classifying at entity level gives different numbers than the Excel. Entities within the same company can offset each other. Always aggregate to CompanyAccount before classifying.

## Proven CTE Pattern for Retention Queries

```sql
-- Step 1: Entity-level monthly data
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
-- Step 2: Join P1 to P2 by EntityRecordID (stable link across time)
entity_paired AS (
  SELECT
    p2.month,
    p1.EntityRecordID,
    COALESCE(p2.company, p1.company) AS company,  -- prefer P2 name
    COALESCE(p1.total_saas, 0) AS p1_saas,
    COALESCE(p2.total_saas, 0) AS p2_saas
  FROM entity_monthly p1
  FULL OUTER JOIN entity_monthly p2
    ON p1.EntityRecordID = p2.EntityRecordID
    AND p2.month = FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH))
),
-- Step 3: Aggregate to CompanyAccount, then classify
company_level AS (
  SELECT month, company,
    SUM(p1_saas) AS p1_saas,
    SUM(p2_saas) AS p2_saas
  FROM entity_paired
  GROUP BY month, company
)
-- Step 4: Classify at company level
SELECT month,
  SUM(CASE WHEN p1_saas > 0 THEN p1_saas ELSE 0 END) AS start_mrr,
  SUM(CASE WHEN p1_saas > 0 AND p2_saas = 0 THEN p1_saas ELSE 0 END) AS cancellations,
  SUM(CASE WHEN p1_saas > 0 AND p2_saas > 0 AND p2_saas < p1_saas THEN p1_saas - p2_saas ELSE 0 END) AS downgrades,
  SUM(CASE WHEN p1_saas > 0 AND p2_saas > p1_saas THEN p2_saas - p1_saas ELSE 0 END) AS expansions,
  SUM(CASE WHEN p1_saas = 0 AND p2_saas > 0 THEN p2_saas ELSE 0 END) AS new_mrr
FROM company_level
GROUP BY month
ORDER BY month
```

## Paying Entity Whitelist

When determining if an entity is "paying" (for paying logos count), whitelist these AccountFullName values:

```sql
SUM(CASE WHEN AccountFullName LIKE '%MethodNew%'
          OR AccountFullName LIKE '%Dedicated Enhancement Plan%'
          OR AccountFullName LIKE '%Prepay Expiry Income%'
          OR AccountFullName LIKE '%Emails%'
     THEN SaaSAmount ELSE 0 END) AS new_platform_income
-- Then: COUNTIF(new_platform_income > 0) AS paying_logos
```

**Excluded** from paying: Portals, Prepay Discounts, MSP Free Licenses, Promo Subscription Discount, Reseller Discounts, Premium App Configuration Disc.

## Before Writing a Query

1. Read `knowledge/account-mapping.md` for the full paying entity whitelist and SQL pattern.
2. Read `knowledge/routes/revenue-retention.md` for the full retention route with verified results.
3. Check `knowledge/verified-queries/` for existing verified SQL you can adapt:
   - `monthly-start-mrr.sql`, `monthly-cancellations.sql`, `monthly-downgrades.sql`, `monthly-expansion.sql`, `monthly-new-mrr.sql`, `monthly-other-churn.sql`
   - `annual-start-mrr.sql`, `annual-cancellations.sql`, `annual-downgrades.sql`, `annual-expansion.sql`, `annual-new-mrr.sql`, `annual-other-churn.sql`, `annual-grr.sql`
4. Read `knowledge/schema.md` for the complete field reference.

## Verified Results (Exact Match to Spreadsheet)

### Monthly (Feb 2026, Jan->Feb)
| Metric | Value |
|--------|-------|
| Start MRR | $814,714 |
| Cancellations | $28,025 |
| Downgrades | $20,448 |
| Expansions | $18,579 |
| New ARR | $28,728 |

### Annual (Dec 2025, Dec '24->Dec '25)
| Metric | Value |
|--------|-------|
| Start MRR | $689,606.01 |
| Cancellations (adj) | $88,189.56 |
| OtherChurn | $10,531.00 |
| Downgrades | $60,131.72 |
| Expansion | $79,865.91 |
| New MRR | $198,077.84 |
| Pre-FX GRR | 78.49% |

Every number matches to the penny.
