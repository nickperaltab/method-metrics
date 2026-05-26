# BigQuery Field Reference — Key Learnings

## Account-Level Fields (revenue.Account)

| Field | Type | Static/Dynamic | Notes |
|-------|------|----------------|-------|
| `CompanyAccount` | STRING | Static | Primary key. One per billing entity. Franchises have separate accounts (e.g., Mobility City has ~38). |
| `LicenseCount` | INTEGER | **Static** | Current license count. Does NOT change historically — same value on every transaction. **Do not use for historical tier analysis.** |
| `UserPaidCount` | INTEGER | **Dynamic** | Actual paid user count per transaction month. Changes over time (2,195 accounts changed in last year). **Use this for historical license tier segmentation.** |
| `PackPaidCount` | INTEGER | Dynamic | Number of packs. Changes over time. |
| `FirstSaaSInvoiceTxnDate` | DATE | Static | When they first paid. `0001-01-01` = never paid. |
| `CancellationDate` | DATE | Static | When they cancelled. `0001-01-01` or NULL = not cancelled. |
| `IsActive` | BOOLEAN | Static | Current active status. |
| `IsConversionException` | BOOLEAN | Static | Always filter `= FALSE`. |
| `Partner` | STRING | Static | Always filter `!= 'Method Integration'`. |
| `AccountSaaSPayType` | STRING | Static | 'Monthly' or 'Prepay'. Both bill monthly in practice. |
| `SignUpDate` | DATE | Static | Trial signup date. `0001-01-01` = no signup. |

## DEP (Data Enrichment Product)

**Definition:** Accounts billed for DEP, identified by `AccountFullName`:
- `LIKE '%Premium App%'` — catches discount lines (Premium App Configuration Disc)
- `LIKE '%Enhancement Plan%'` — catches revenue lines (Dedicated Enhancement Plan)

**4 line item types:**
1. `Dedicated Enhancement Plan` (US) — revenue ($2.5M total)
2. `Dedicated Enhancement Plan` (CAN) — revenue ($307K total)
3. `Premium App Configuration Disc` (US) — discount (-$205K total)
4. `Premium App Configuration Disc` (CAN) — discount (-$21K total)

**Billing pattern:** Monthly, per user. Rate varies (e.g., $145/user, $325 flat). Every discount line always has a corresponding revenue line (verified: 0 discount-only months).

**DEP customer = had a non-zero DEP line item this month.** When billing stops, they're no longer DEP.

**Edge case — refunds:** An account charged +$325 and refunded -$325 in the same month still counts as DEP because each individual line is non-zero. This matches Looker's per-line evaluation. Affects ~1-2 accounts/month. If business logic changes to "net DEP > 0", update `int_customer_segments` to use `SUM(dep_amount) != 0` instead of `MAX(non-zero line)`.

**DEP is per-account, not per-company.** A franchise can have some accounts on DEP and some not (e.g., Mobility City: 1/38 on DEP).

**NOT DEP:**
- `Dedicated Professional Services` — PS, not DEP ($0 SaaSAmount)
- `Dedicated Customization Disc` — PS discount ($0 SaaSAmount)

## Customer Status (v_accounts view)

Built from `revenue.Account` CROSS JOIN monthly spine.

| Flag | Definition | Matches |
|------|-----------|---------|
| `IsCustomer` | Paid before end of month AND not cancelled yet | End-of-month semantics. Churned customers excluded from count that month. |
| `IsNew` | `FirstSaaSInvoiceTxnDate` falls in this month | Exact match with `int_conversions` |
| `IsChurned` | `CancellationDate` falls in this month (and was paying customer) | Exact match with `int_cancellations` |
| `HasDEP` | Had a DEP transaction (Premium App or Enhancement Plan) this month | Monthly check via LEFT JOIN |

**Key identity:** `Customers(month) = Total Conversions(all time) - Total Churns(all time)`
Verified Mar 2026: 19,457 - 15,559 = 3,898 ✓

## Attribution Channel

Computed CASE statement on Account table `Att_*` columns, NOT the raw `Channel` field:
```sql
CASE
  WHEN Att_SEO = 1 THEN 'SEO'
  WHEN Att_Pay_Per_Click = 1 THEN 'PPC'
  WHEN Att_OPN_Other_Peoples_Networks = 1 THEN 'OPN'
  WHEN Att_Social = 1 THEN 'Social'
  WHEN Att_Email = 1 THEN 'Email'
  WHEN Att_Referral_Link = 1 THEN 'Referral'
  WHEN Att_Direct = 1 THEN 'Direct'
  WHEN Att_Partners = 1 THEN 'Partners'
  WHEN Att_Content = 1 THEN 'Content'
  WHEN Att_Remarketing = 1 THEN 'Remarketing'
  WHEN Att_Other = 1 THEN 'Other'
  WHEN Att_None = 1 THEN 'None'
  ELSE 'Unknown'
END AS AttributionChannel
```
All funnel views (int_trials, int_syncs, int_conversions) and entity views (v_accounts, v_total_dep_revenue) must use this same CASE logic.

## Standard Filters

Always apply on queries from Account/TransLineFlattened:
```sql
WHERE IsConversionException = FALSE
  AND Partner != 'Method Integration'
```

For churn calculations, also add `IsChurnException = FALSE` (separate flag from `IsConversionException` — not currently applied everywhere; audit before using on churn metrics).

For paying customers only, also add:
```sql
  AND FirstSaaSInvoiceTxnDate IS NOT NULL
  AND FirstSaaSInvoiceTxnDate != DATE('0001-01-01')
```

## Restore Accounts

Accounts with names like `packagingoptionsusaRestore20190718` are database backups, not real customers. They have `FirstSaaSInvoiceTxnDate = 0001-01-01` and are filtered out by the paying-customer filter above.

## TransLineFlattened vs Account

- `TransLineFlattened` = one row per transaction line item. Use for revenue sums, identifying DEP transactions, getting `UserPaidCount` per month.
- `Account` = one row per account. Use for entity-level attributes (signup date, cancellation, attribution). `LicenseCount` here is static/current only.

To get **historical** user counts, use `UserPaidCount` from `TransLineFlattened` grouped by month — NOT `LicenseCount` from `Account`.

## Additional Trans-Level Fields

These columns live on the parent invoice/credit memo (repeated across line items in `TransLineFlattened`). Aggregate with `MAX` per transaction when you don't want them multiplied by line count.

| Field | Type | Values | Use |
|-------|------|--------|-----|
| `BOMCustomerGrouping` | STRING | None / Trailer / Customer / Lost | Status at **Beginning** of the month this invoice was generated. Pre-computed retention state. |
| `EOMCustomerGrouping` | STRING | None / Trailer / Customer / Lost | Status at **End** of the month. Combined with BOM, this encodes the month's transition (e.g. `Customer → Lost` = churn). Could replace some of our EntityRecordID-join retention logic — audit before using. |
| `IsNewPayerThisMonth` | BOOLEAN | — | Pre-computed "became paying account this month" flag, derived from BOM/EOM. Compare against our `FirstSaaSInvoiceTxnDate` derivation; if they match, this is a cheaper primitive. |
| `SaaSPayType` (on Trans) | STRING | Monthly / Prepay / Unknown | Pay type **at time of invoice** (not current). Differs from `Account.AccountSaaSPayType`, which is current only. |
| `InvoiceGrouping` | STRING | SaaS / PS | Direct flag to separate SaaS revenue from Professional Services. Avoids whitelisting `AccountFullName`. |
| `PlatformToggle` | STRING | Classic / New / Unknown | Derived from line items. Enables Classic-vs-New segmentation at transaction level. |
| `AgeAtBOM` | INTEGER | months | Account age at the beginning of the month. Unlocks cohort analysis by tenure without computing it yourself. |
| `PackPaidCount` | INTEGER | — | Packs on this invoice. Repeated across line items — use `MAX` per transaction, not `SUM`. |
| `UserPaidCount` | INTEGER | — | Paid users on this invoice. Repeated across line items — use `MAX` per transaction, not `SUM`. |
| `SalesRep` | STRING | — | Sales rep on the invoice/credit memo. |

### Line-level (Trans.Line.*)

| Field | Use |
|-------|-----|
| `Line.SaaSExpense` | Bad-debt write-offs / retention credit memos. Negative impact on net SaaS. Needed if we want "net revenue after write-offs" metrics. |
| `Line.PSExpense` | Same, for PS. |
| `Line.LiabilityPortion` | Prepay liability accounting (cash into liability, drawn down as invoices apply). Only relevant if we ever report cash-basis vs accrual. |
| `Line.SaaSDiscountType` | `Prepay` or `Other`. Lets us separate prepay discounts from other discounts without string-matching item names. |
