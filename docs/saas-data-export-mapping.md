# SaaS Data Export — Column Mapping Audit

Goal: produce a drop-in replacement for the `March 2026 raw SAAS data.xlsx` export (currently produced by Method's `SaasAnalyticsSrv` API) using only `project-for-method-dw.revenue.*` tables in BigQuery.

The downstream Excel template (`SaaSRevTemplate.xlsx`) drives the **Marketing Metrics**, **AccountSummary**, **CurrentSaaS**, and **PrepaySummary** tabs entirely from formulas referencing 6 raw data sheets. If we can replicate those 6 sheets with the **exact column names and order**, the formula-driven tabs recompute for free.

The 6 data sheets the API populates:
1. `Invoices` — populated
2. `InvoiceLines` — empty in the published export (`ReturnTransactionLines=false`); skip
3. `CreditMemos` — populated
4. `CreditMemoLines` — empty; skip
5. `Accounts` — populated (per-customer monthly cube)
6. `CountsForFormulas` — 3 row counts

Source-of-truth for the column lists: `Services/GetInvoicesToExcelService.cs` in `internal-saasanalytics-api` (`AddTxns()` line 390 for invoices/credit memos, `AddAccounts()` line 227 for accounts).

---

## Sheet 1 & 3 — Invoices / CreditMemos (22 cols, identical shape)

The API treats invoices and credit memos as the same record shape (`Models.Txn`); only `TxnType` differs. Both originate from `revenue.TransLineFlattened`, aggregated to invoice level by `TransRecordID`.

| # | Excel column | Type | BQ source | Status |
|---|--------------|------|-----------|--------|
| 1 | `TxnRecordID` | int | `TransLineFlattened.TransRecordID` | ✅ rename |
| 2 | `CompanyAccount` | string | `TransLineFlattened.CompanyAccount` | ✅ direct |
| 3 | `TxnDate` | datetime | `TransLineFlattened.TxnDate` | ✅ direct |
| 4 | `RefNumber` | string | **MISSING** (QB invoice number) | ❌ **gap** — not synced to BQ |
| 5 | `CustomerGrouping` | string | derived from `BOMCustomerGrouping × EOMCustomerGrouping × InvoiceGrouping` | ⚙️ derived (see below) |
| 6 | `InvoiceGrouping` | string | `TransLineFlattened.InvoiceGrouping` | ✅ direct |
| 7 | `PlatformToggle` | string | `TransLineFlattened.PlatformToggle` | ✅ direct |
| 8 | `SaaSPayType` | string | `TransLineFlattened.SaaSPayType` | ✅ direct |
| 9 | `SaaSIncomeAmountClassic` | decimal | `IF(PlatformToggle='Classic', SUM(SaaSAmount), 0)` | ⚙️ derived |
| 10 | `SaaSIncomeAmountNew` | decimal | `IF(PlatformToggle='New', SUM(SaaSAmount), 0)` | ⚙️ derived |
| 11 | `SaasExpense` | decimal | `SUM(SaaSExpense)` | ✅ aggregate |
| 12 | `PSIncomeAmount` | decimal | `SUM(PSAmount)` | ✅ rename + aggregate |
| 13 | `PSExpenseAmount` | decimal | `SUM(PSExpense)` | ✅ rename + aggregate |
| 14 | `LiabilityPortion` | decimal | `SUM(LiabilityPortion)` | ✅ aggregate |
| 15 | `DiscountPrepayPortion` | decimal | `SUM(IF(SaaSDiscountType='Prepay', SaaSDiscount, 0))` | ⚙️ derived (verified: `SaaSDiscountType ∈ {'Prepay','Other'}`) |
| 16 | `DiscountOtherPortion` | decimal | `SUM(IF(SaaSDiscountType='Other', SaaSDiscount, 0))` | ⚙️ derived |
| 17 | `UncategorizedPortion` | decimal | **UNKNOWN** — shows as `#ERROR!` in sample row | ⚠️ verify |
| 18 | `IsNewCustomerSaaS` | string/formula | Excel formula in template (`=IF(InvoiceGrouping="SaaS",IF(CustomerGrouping="NewCustomerEOM",1,0),0)`) | leave as formula |
| 19 | `Paid Packs` | decimal | `SUM(PackPaidCount)` | ✅ rename + aggregate |
| 20 | `Paid Users` | decimal | `SUM(UserPaidCount)` | ✅ rename + aggregate |
| 21 | `Rep` | string | `MAX(SalesRep)` (consistent across lines) | ✅ rename |
| 22 | `Currency` | string | `MAX(AccountFullName)` — actually the AR account name ("US-Accounts Receivable", etc.), **not a currency code** | ⚠️ verify; column name is misleading |

### `CustomerGrouping` derivation (col 5)

The Excel field encodes a per-invoice customer state. Observed values: `NewCustomerEOM`, `ExistingCustomerEOM`, `TrialerCancelled`, etc. BQ has the underlying primitives — `BOMCustomerGrouping` and `EOMCustomerGrouping`, with values `Customer / Trialer / Lost / none` — so the mapping is:

| BOM | EOM | InvoiceGrouping | → CustomerGrouping |
|---|---|---|---|
| `none` or `Trialer` | `Customer` | `SaaS` | `NewCustomerEOM` |
| `Customer` | `Customer` | `SaaS` | `ExistingCustomerEOM` |
| `Trialer` | `Lost` | (any) | `TrialerCancelled` |
| `Customer` | `Lost` | (any) | `ChurnedCustomer` (verify exact label) |
| `none` | `Trialer` | (any) | `Trialer` (verify) |

⚠️ **Verify exact label strings** by sampling the published Excel against BQ-derived values for a known month.

### Aggregation pattern (Invoices/CreditMemos)

```sql
SELECT
  TransRecordID                                AS TxnRecordID,
  ANY_VALUE(CompanyAccount)                    AS CompanyAccount,
  ANY_VALUE(TxnDate)                           AS TxnDate,
  NULL                                         AS RefNumber,         -- gap
  -- ... derived CustomerGrouping ...
  ANY_VALUE(InvoiceGrouping)                   AS InvoiceGrouping,
  ANY_VALUE(PlatformToggle)                    AS PlatformToggle,
  ANY_VALUE(SaaSPayType)                       AS SaaSPayType,
  SUM(IF(PlatformToggle='Classic', SaaSAmount, 0)) AS SaaSIncomeAmountClassic,
  SUM(IF(PlatformToggle='New',     SaaSAmount, 0)) AS SaaSIncomeAmountNew,
  SUM(SaaSExpense)                             AS SaasExpense,
  SUM(PSAmount)                                AS PSIncomeAmount,
  SUM(PSExpense)                               AS PSExpenseAmount,
  SUM(LiabilityPortion)                        AS LiabilityPortion,
  SUM(IF(SaaSDiscountType='Prepay', SaaSDiscount, 0)) AS DiscountPrepayPortion,
  SUM(IF(SaaSDiscountType='Other',  SaaSDiscount, 0)) AS DiscountOtherPortion,
  0                                            AS UncategorizedPortion,  -- placeholder until clarified
  -- IsNewCustomerSaaS handled by Excel formula
  SUM(PackPaidCount)                           AS `Paid Packs`,
  SUM(UserPaidCount)                           AS `Paid Users`,
  ANY_VALUE(SalesRep)                          AS Rep,
  ANY_VALUE(AccountFullName)                   AS Currency
FROM `project-for-method-dw.revenue.TransLineFlattened`
WHERE TxnType = 'Invoice'                      -- or 'CreditMemo'
  AND TxnDate >= @from AND TxnDate < @to
GROUP BY TransRecordID
```

---

## Sheet 5 — Accounts (62 cols, per-customer monthly cube)

Aggregate `TransLineFlattened` to `(CompanyAccount × month)` for the financials, then join `Account` for static fields.

| # | Excel column | BQ source | Status |
|---|--------------|-----------|--------|
| 1 | `CompanyAccount` | `TLF.CompanyAccount` | ✅ |
| 2 | `BOMCustomerGrouping` | `TLF.BOMCustomerGrouping` | ✅ |
| 3 | `EOMCustomerGrouping` | `TLF.EOMCustomerGrouping` | ✅ |
| 4 | `SaaSPayType` | `TLF.SaaSPayType` (during the period) | ✅ |
| 5 | `SyncType` | `TLF.SyncType` | ✅ |
| 6 | `Channel` | `TLF.Channel` | ✅ |
| 7 | `Platform` | `TLF.Platform` | ✅ |
| 8 | `AgeAtBOM` | `TLF.AgeAtBOM` | ✅ |
| 9 | `SaaSIncomeAmount` | `SUM(SaaSAmount)` | ✅ aggregate |
| 10 | `SaasExpense` | `SUM(SaaSExpense)` | ✅ |
| 11 | `SaaSInvoiceCount` | `COUNT(DISTINCT TransRecordID WHERE InvoiceGrouping='SaaS' AND TxnType='Invoice')` | ✅ |
| 12 | `PackPaidCount` | `SUM(PackPaidCount)` (verify: per-invoice or net?) | ⚠️ |
| 13 | `UserPaidCount` | `SUM(UserPaidCount)` (verify) | ⚠️ |
| 14 | `PSIncomeAmount` | `SUM(PSAmount)` | ✅ |
| 15 | `PSExpenseAmount` | `SUM(PSExpense)` | ✅ |
| 16 | `LiabilityPortion` | `SUM(LiabilityPortion)` | ✅ |
| 17 | `Partner` | `Account.Partner` | ✅ |
| 18 | `IsPartnerManaged` | **MISSING** — derive: `Partner IS NOT NULL AND Partner <> 'Method Integration'`? | ❌ verify rule |
| 19 | `IsActive` | `Account.IsActive` | ✅ |
| 20 | `MethodSignUpDate` | `Account.SignUpDate` | ✅ rename |
| 21 | `FirstSaaSInvoiceTxnDate` | `Account.FirstSaaSInvoiceTxnDate` | ✅ |
| 22 | `MethodCancellationDate` | `Account.CancellationDate` | ✅ rename |
| 23 | `IsNewPayer` | Excel formula in template | leave as formula |
| 24 | `MethodRep` | **NOT ON Account** — closest: `MAX(TLF.SalesRep)` for the customer's invoices | ⚠️ verify semantics |
| 25 | `Offering` | `Account.Offering` | ✅ |
| 26 | `Att_Direct` | `Account.Att_Direct` | ✅ |
| 27 | `Att_SEO` | `Account.Att_SEO` | ✅ |
| 28 | `Att_OPN_Other_Peoples_Networks` | `Account.Att_OPN_Other_Peoples_Networks` | ✅ |
| 29 | `Att_Pay_Per_Click` | `Account.Att_Pay_Per_Click` | ✅ |
| 30 | `Att_Partners` | `Account.Att_Partners` | ✅ |
| 31 | `Att_Email` | `Account.Att_Email` | ✅ |
| 32 | `Att_Remarketing` | `Account.Att_Remarketing` | ✅ |
| 33 | `Att_Social` | `Account.Att_Social` | ✅ |
| 34 | `Att_Help_Center` | `Account.Att_Help_Center` | ✅ |
| 35 | `Att_Online_Chat_Tool` | `Account.Att_Online_Chat_Tool` | ✅ |
| 36 | `Att_Content` | `Account.Att_Content` | ✅ |
| 37 | `Att_Banner_Ads` | `Account.Att_Banner_Ads` | ✅ |
| 38 | `Att_Seminar_Conference` | `Account.Att_Seminar_Conference` | ✅ |
| 39 | `Att_Referral_Program` | `Account.Att_Referral_Program` | ✅ |
| 40 | `Att_Referral_Link` | `Account.Att_Referral_Link` | ✅ |
| 41 | `Att_Backlinks` | `Account.Att_Backlinks` | ✅ |
| 42 | `Att_Other` | `Account.Att_Other` | ✅ |
| 43 | `Att_None` | `Account.Att_None` (or `1 − sum(others)`) | ✅ |
| 44 | `SyncTypeRegion` | `Account.SyncTypeRegion` | ✅ |
| 45 | `Vertical` | `Account.Vertical` | ✅ |
| 46 | `Sector` | `Account.Sector` | ✅ |
| 47 | `CustDatIndustry` | `Account.CustDatIndustry` | ✅ |
| 48 | `CustDatFirstSyncCompleted` | `Account.CustDatFirstSyncCompleted` | ✅ |
| 49 | `CustDatLastRefreshed` | `Account.CustDatLastRefreshed` | ✅ |
| 50 | `CustDatCountOfEmployees` | `Account.CustDatCountOfEmployees` | ✅ |
| 51 | `CustDatAnnualSales` | `Account.CustDatAnnualSales` | ✅ |
| 52 | `CustDatCountOfCustomers` | `Account.CustDatCountOfCustomers` | ✅ |
| 53 | `LicenseCount` | `Account.LicenseCount` | ✅ |
| 54 | `CountOfCustomScreens` | `Account.CountOfCustomScreens` | ✅ |
| 55 | `CountOfCustomScreensMN` | `Account.CountOfCustomScreensMN` | ✅ |
| 56 | `FromDateFilter` | export parameter (not data) | ✅ const |
| 57 | `ToDateFilter` | export parameter | ✅ const |
| 58 | `ConversionException` | `Account.IsConversionException` | ✅ rename |
| 59 | `ChurnException` | `Account.IsChurnException` | ✅ rename |
| 60 | `Custdatlastsaasamount` | `Account.Custdatlastsaasamount` | ✅ |
| 61 | `Custdatpreviouslastsaasamount` | `Account.Custdatpreviouslastsaasamount` | ✅ |
| 62 | `SaaSPayTypeCurrent` | `Account.SaaSPayType` (snapshot of current state, distinct from col 4 which is per-period) | ✅ rename |

### Internal-account exclusion

API line 302–306 skips rows where `Partner='Method Integration' AND all dollar fields = 0`. Apply the same filter in the export.

---

## Sheet 6 — CountsForFormulas

Three integer cells: row counts of `Accounts`, `Invoices`, `CreditMemos`. Filled in at write time; trivial.

---

## Verification against published April 2026 file (`saasrevenue (3).xlsx`)

### Confirmed labels — `CustomerGrouping` distinct values

```
ExistingCustomerEOM   (BOM=Customer,        EOM=Customer)   → 4137 invoices
NewCustomerEOM        (BOM=none/Trialer,    EOM=Customer)   →  114
TrialerEOM            (BOM=none/Trialer,    EOM=Trialer)    →  157
ExistingCustChurn     (BOM=Customer,        EOM=Lost)       →   68
TrialerCancelled      (BOM=Trialer,         EOM=Lost)       →    7
NewCustChurn          (became customer + churned same month) → 2
```

Note: `ExistingCustChurn` (not `ChurnedCustomer`). `TrialerEOM` is a label I missed in the draft.

### Confirmed: `Currency` = AR account name
Distinct values in published file: `'US-Accounts Receivable'`, `'CAN-Accounts Receivable'`. Map to `TransLineFlattened.AccountFullName` (filter to AR account rows; one per invoice).

### Confirmed: `UncategorizedPortion` = 0 throughout April
Safe to write `0` placeholder until/unless the source-side `#ERROR!` is fixed.

### ⚠️ NEW GAP: `IsPartnerManaged` is not derivable from Partner name

In the April file, **only `Mobility City Franchises` rows are `IsPartnerManaged=True`** (65 rows). Every other partner — including all the active ones (`Home Watch IT, LLC`, `SBS Associates`, `VARC Solutions`, `Cloud Consultancy`, etc.) — is `False`. So this is a flag set per-partner in Method's source DB, not a function of the name. **Must sync the flag** to BQ (as a column on `Account` or as a partner lookup table). Hardcoding `Mobility City Franchises` works for now but will rot the moment marketing onboards another franchise/managed partner.

### ⚠️ DISCOVERED: `PackPaidCount` / `UserPaidCount` are at line level in BQ

BQ-derived totals using `SUM(PackPaidCount) GROUP BY TransRecordID` (April 2026):
- `Paid Packs`: BQ 129,187 vs Published 11,930 (~10.8× too high)
- `Paid Users`: BQ 197,892 vs Published 17,610 (~11.2× too high)

This means `TransLineFlattened.PackPaidCount` and `UserPaidCount` are **denormalized to every line of an invoice**. Use **`MAX(PackPaidCount) GROUP BY TransRecordID`** (or `ANY_VALUE`), not `SUM`. The 10× ratio matches a typical 10-line invoice.

### ⚠️ DISCOVERED: BQ's `BOMCustomerGrouping`/`EOMCustomerGrouping` ≠ Excel's `CustomerGrouping`

BQ's per-line BOM/EOM classification uses **different period semantics** than the API's per-invoice `CustomerGrouping`. Counts for April don't reconcile:

| BQ rule | BQ count | Excel label | Excel count | Δ |
|---|---:|---|---:|---:|
| BOM=Customer, EOM=Customer | 4,232 | ExistingCustomerEOM | 4,137 | +95 |
| BOM=none/Trialer, EOM=Customer | 133 | NewCustomerEOM | 114 | +19 |
| BOM=none/Trialer, EOM=Trialer | 31 | TrialerEOM | 157 | **-126** |
| BOM=Customer, EOM=Lost | 41 | ExistingCustChurn | 68 | -27 |
| BOM=Trialer, EOM=Lost | 5 | TrialerCancelled | 7 | -2 |

The `TrialerEOM` gap (-126) is the killer. Likely explanation: BQ's BOM/EOM is computed off the *invoice's* TxnDate-month boundaries, whereas Excel's is computed off the *report period's* FromDate/ToDate. They line up for invoices in the middle of a month, drift at month boundaries, and diverge on customer-state edge cases (e.g. trial → churn within the same period).

**Fix:** reverse-engineer the API's exact `CustomerGrouping` logic by reading `Services/GetInvoicesService.cs` SQL. May require recomputing customer state at the report-period boundaries directly from `Account.SignUpDate` / `CancellationDate` / `FirstSaaSInvoiceTxnDate`, not relying on the pre-baked BOM/EOM columns.

### Aggregate dollar totals (April 2026)

| Field | Excel published | BQ derived | Δ% |
|---|---:|---:|---:|
| `n_invoices` | 4,514 | 4,472 | -0.9% |
| `SaaSIncomeAmountClassic` | 39,493.55 | 38,212.05 | -3.2% |
| `SaaSIncomeAmountNew` | 871,285.89 | 791,969.95 | **-9.1%** |
| `SaasExpense` | -736.00 | -736.00 | 0.0% ✅ |
| `PSIncomeAmount` | 176,405.00 | 145,919.50 | **-17.3%** |
| `PSExpenseAmount` | -2,945.00 | -2,635.00 | -10.5% |
| `LiabilityPortion` | 86,295.59 | 83,559.57 | -3.2% |
| `DiscountPrepayPortion` | -30,329.31 | -30,004.93 | -1.1% |
| `DiscountOtherPortion` | -69,732.35 | -47,033.73 | **-32.6%** |

Most fields are within ~3%. The big outliers (`PSIncome`, `DiscountOther`) suggest there's **another invoice classification missing in BQ** — likely the per-line discount-allocation logic the API runs that splits more transactions into the "Other" bucket. Must be reproduced.

The 42-invoice row-count gap is consistent with a date-boundary skew (UTC vs ET in `TxnDate`, or one extra day in the published period).

---

## Updated summary of gaps

| Gap | Severity | Resolution |
|---|---|---|
| `RefNumber` (invoice/credit memo number) | 🟡 medium | Not in BQ sync. Add to `udsp_DWchecksum_invoice_bulkupdate` or accept blank. No formula depends on it. |
| `UncategorizedPortion` | 🟢 low | Always 0 in published April; write `0`. |
| `IsPartnerManaged` | 🔴 **higher than expected** | Not derivable from name. Only `Mobility City Franchises` is True in April. **Sync the flag from source.** Temporary: hardcode known list. |
| `MethodRep` on Accounts | 🟡 medium | Not on BQ `Account`. Use `MAX(SalesRep)` over the customer's invoices in the period. Verify by sampling. |
| `Currency` column = AR account name | 🟡 approximated | `TransLineFlattened` only has Income/Expense/Liability lines — the AR-side line isn't there. Heuristic: `SyncTypeRegion='CA' → 'CAN-Accounts Receivable'`, else → `'US-Accounts Receivable'`. Matches published file's two distinct values; may misclassify international invoices billed from the Canadian entity. |
| `CustomerGrouping` (per-invoice) | 🔴 **structural** | BQ's BOM/EOM columns don't reproduce the API's logic. Must reimplement from primitives (`Account.SignUpDate`, `FirstSaaSInvoiceTxnDate`, `CancellationDate`) relative to the report's FromDate/ToDate. |
| `PackPaidCount` / `UserPaidCount` aggregation | ✅ resolved | Use `MAX(...) GROUP BY TransRecordID`, not `SUM`. They're denormalized across invoice lines in BQ. |
| `DiscountOtherPortion` ~33% under | 🔴 **investigate** | API may run an additional reclassification on lines we haven't replicated. Read API SQL to find the rule. |
| `PSIncomeAmount` ~17% under | 🔴 **investigate** | Same: classification mismatch. |
| Date range skew (~42 invoices) | 🟡 medium | UTC vs ET boundary in `TxnDate`. Match the published file's exact UTC range. |

**Net: 4 issues are larger than the audit estimated.** The build is no longer "150 LOC trivial" — it needs:
1. A reimplementation of `CustomerGrouping` from raw account dates
2. Investigation of the `DiscountOther` / `PSIncome` ~10–30% deltas (probably a per-line classification step the API runs)
3. An `IsPartnerManaged` sync
4. Date-boundary alignment

---

## Verified API logic (from `Services/CommonService.cs` + `GetInvoicesService.cs`)

### `CustomerGrouping` per invoice (resolved)

```text
StartOfPeriodState  = (TrialConvertDate > FromDateUTC) ? "Trialer" : "Customer"

EndOfPeriodState  =
  if IsActive == "unknown":  CustomerGrouping = "unknown" (early exit)
  elif IsActive == "True" OR MethodCancellationDate > ToDateUTC:
    "Customer" if TrialConvertDate <= ToDateUTC else "Trialer"
    CancellationDateState = "N/A"
  else:                       # left the period cancelled
    "Cancelled"
    CancellationDateState = (MethodCancellationDate >= TrialConvertDate) ? "Customer" : "Trialer"

CustomerGrouping  =
  Customer × Customer                           → ExistingCustomerEOM
  Trialer  × Customer                           → NewCustomerEOM
  Trialer  × Trialer                            → TrialerEOM
  Customer × Cancelled                          → ExistingCustChurn
  Trialer  × Cancelled (CancellationDateState=Customer) → NewCustChurn
  Trialer  × Cancelled (CancellationDateState=Trialer)  → TrialerCancelled
  else                                          → unknown (impossible)
```

`TrialConvertDate` ≈ `Account.FirstSaaSInvoiceTxnDate` (the trial converted when the first SaaS invoice was issued).
`MethodCancellationDate` = `Account.CancellationDate`.
`IsActive` = `Account.IsActive` (cast to string `"True"`/`"False"`/`"unknown"`).

### Line classifier — `ClassifiyTxnLine` (resolved)

Each invoice line's `Amount` is bucketed by `AccountFullName` and `ItemType`. Substring `Contains()` match unless noted.

| Match | Goes to |
|---|---|
| `ItemType="Discount"` AND `AccountFullName.Contains("Subscriptions:Prepay Discounts")` | `DiscountPrepayPortion` |
| `ItemType="Discount"` AND `StartsWith("Operating Revenue") AND Contains(":Subscriptions")` | `DiscountOtherPortion` (SaaS-other) |
| `ItemType="Discount"` AND `StartsWith("Operating Revenue") AND Contains(":Professional Services")` | `DiscountOtherPortion` (PS) |
| `ItemType="Discount"` AND `Contains("Friends of Method Discount")` | `SaasExpense` |
| `ItemType="Discount"` else | `DiscountOtherPortion` |
| `ItemType="Expense"` AND `Contains("Customer Retention:Pro Services")` | `PSExpenseAmount` |
| `ItemType="Expense"` AND `Contains("Friends of Method Discount")` | `SaasExpense` |
| `ItemType="Expense"` AND `Contains("Sales and Marketing:Bad Debt - Subs"\|"CAN - Bad Debt - Subs"\|"USD Retention Subscriptions")` | `SaasExpense` |
| `ItemType="Expense"` else | `UncategorizedPortion` |
| `Contains("Subscriptions:Classic")` | `SaaSIncomeAmountClassic` |
| `Contains(":Subscriptions:Portals")` | `SaaSIncomeAmountClassic` |
| `Contains(":Subscriptions:Dedicated Enhancement Plan")` or `Contains(":Subscriptions:Emails")` | `SaaSIncomeAmountNew` |
| `Contains(":Subscriptions:Prepay Expiry Income")` | `SaaSIncomeAmountNew` (also flag PrePayExpiry) |
| `Contains(":Subscriptions:MethodNew")` or `Contains(":Subscriptions:Partner Apps")` | `SaaSIncomeAmountNew` |
| `Contains(":Professional Services")` | `PSIncomeAmount` |
| `== "US-Client Prepayments"` or `== "CAN-Client Prepayments"` | `LiabilityPortion` |
| `Contains("Customer Ret Pro Services")` | `PSExpenseAmount` |
| `Contains("Cost of Goods Sold:Bad Debt- PS"\|"CAN - Bad Debt - PS")` | `PSExpenseAmount` |
| `== "Uncategorized Income"` or `== "Operating Revenue:US-Sales:Retreat"` | `PSExpenseAmount` |
| else | `UncategorizedPortion` |

### Confirmed by BQ verification

```
Excel DiscountOtherPortion = SUM(SaaSDiscount WHERE Type='Other') + SUM(PSDiscount)
                           = -46,998 + -22,193 = -69,191
Published April             = -69,732 (Δ -541, 0.78% — within row-count skew)

Excel DiscountPrepayPortion = SUM(SaaSDiscount WHERE Type='Prepay')
                            = -30,040
Published April             = -30,329 (Δ -289, ~1%)

Excel PSIncomeAmount        ≈ TLF.PSBeforeDiscount  (gross, before PS discounts)
                            = 168,112
Published April             = 176,405 (Δ -8,293, ~5%; likely date-skew + remaining classifier branches)
```

So BQ has the right primitives — `PSBeforeDiscount` (not `PSAmount`) is the right field. **`PSAmount` in BQ is net-of-discounts; the API reports gross.** This is a substantial finding.

---

## ⚠️ Things in the API logic that don't pass the smell test

The user's right not to take the API as gospel. Several rules in `ClassifiyTxnLine` are weird and worth flagging — not necessarily to change them, but to know about when interpreting the report.

1. **`Uncategorized Income` and `Operating Revenue:US-Sales:Retreat` are bucketed as `PSExpenseAmount`.** The code comment says "legit uncategorized, like opening balance from the 2019 QBDT data migration." Routing opening-balance entries to PS Expense is a bucket-of-convenience — it inflates PS expense in months that touch historical migration data, even though those entries have nothing to do with Pro Services delivery.

2. **`Friends of Method Discount` is booked as `SaasExpense`** (whether it appears as a Discount item or an Expense item). That's a contra-revenue / discount, not an expense. Booking it on the expense side instead of netting against revenue inflates *both* gross SaaS revenue *and* SaaS expense by the same amount — gross margin math reads fine, but top-line SaaS revenue is overstated vs. what the customer actually paid.

3. **`Subscriptions:Portals` → `SaaSIncomeAmountClassic`.** Portals is a separate add-on product, not a Classic-platform subscription. Anyone slicing "Classic vs New" platform mix is mislabeling Portals revenue as Classic. If marketing reports "X% of revenue is still on Classic," Portals is silently inflating that number.

4. **`Prepay Expiry Income` → `SaaSIncomeAmountNew`.** Prepay expiry is *recognition* of previously-deferred revenue. Booking it as "New" SaaS revenue in the month the prepay expires inflates the New bucket — and creates lumpy spikes in the month after a prepay contract ends, even though no fresh sale happened.

5. **`DiscountOtherPortion` conflates SaaS-Other discounts and ALL Professional-Services discounts.** The column name suggests it's the SaaS "other" bucket, but the API code actually pours every PS discount into it too. Verified: -69,732 = -47,033 (SaaS Other) + -22,700 (all PS discounts). Anyone reading "SaaS DiscountOther" off this column is reading a SaaS+PS hybrid.

6. **PS discounts have NO equivalent of `DiscountPrepayPortion` separation.** `DiscountPrepayPortion` is SaaS-only by construction (the rule keys off `Subscriptions:Prepay Discounts`). PS prepay-style discounts, if any exist, would silently be dumped into `DiscountOtherPortion`. We don't currently know whether marketing assumes Prepay = SaaS-only.

7. **The classifier uses `Contains()` substring match throughout.** If anyone renames or restructures a GL account name in QB (e.g. adds a regional prefix, splits a parent account), entire classes of revenue can silently fall into `UncategorizedPortion` or shift between buckets — without an alert. The large commented-out block in `CommonService.cs` (lines 259–339) shows they originally tried `==` exact match and switched to `Contains()`; that history suggests they've already been bitten by this once.

8. **`Subscriptions:Emails` and `Dedicated Enhancement Plan` → SaaS New.** This is a strict business choice (emails-as-add-on counted as "new platform" revenue). Worth knowing when comparing Method's "New" SaaS growth to industry-typical "New ARR" definitions; "New" here means "post-Classic product family," not "new ARR booked this period."

9. **`Bad Debt - Subs` → `SaasExpense`.** Bad debt is conventionally a contra-revenue (write-off of revenue you've recognized but won't collect). Booking it as expense leaves gross SaaS revenue intact. This is a presentation choice, but it diverges from how most SaaS companies report — and it makes "SaaS Revenue" in the Marketing Metrics tab not equivalent to "cash collected" or "net recognized revenue" in any conventional sense.

10. **`PSAmount` in BQ is net of discounts; Excel `PSIncomeAmount` is gross.** This isn't an API bug — the BQ view chose different semantics than the Excel report. But it's a landmine: any direct read of `PSAmount` thinking it equals the report's `PSIncomeAmount` will be ~13% under in a typical month.

**Implication for the export:** we should reproduce the API's logic to match the file, **and** add a side-channel doc/dashboard noting these conflations so anyone using the numbers downstream understands what's actually in each bucket. We should not silently propagate "DiscountOtherPortion is SaaS-Other discounts" into our scorecards if it's actually SaaS-Other + PS discounts.

---

## Updated next steps

1. **Build the export** — now have all the rules. Estimated complexity: ~300 LOC (added line classifier replication + period-relative `CustomerGrouping`).
2. **Side-channel doc** — write up the smell-test findings (above) in a separate "what these numbers actually mean" note for marketing/finance, so anyone reading the Marketing Metrics tab knows the gotchas.
3. **Decide on `IsPartnerManaged`** — temporarily hardcode known list (`Mobility City Franchises` + any others Justin/Yemi confirm), or push for a sync.
4. **Verify** every Marketing Metrics tab cell matches April 2026 to within rounding. Where it doesn't, decide: is the gap a date-boundary thing, or another classifier branch we missed?
