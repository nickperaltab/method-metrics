# Method Metrics Catalog

Every metric Method needs — name, definition, formula, source, and BigQuery status. Organized by board deck section, then underlying/intermediate metrics, then forecast and marketing metrics.

## Metric Families

Each metric belongs to a family. Families share data sources, solving routes, and rules. Route files in `context/routes/` document how to solve each family. The skill checks this index to find related families before solving.

| Family | Route File | Metrics | Data Sources |
|--------|-----------|---------|--------------|
| revenue-retention | `routes/revenue-retention.md` | #1-5, #50-52, #53-68, #69-70, #83-112 | Monthly Excel → KPI Deck Google Sheet → BigQuery |
| financial | *(not yet created)* | #11-12, #13-35 | QuickBooks export → Google Sheets |
| forecast | *(not yet created)* | #36-47, #113-132 | RevCogs Google Sheet |
| marketing | *(not yet created)* | #133-150 | Google Ads, CampaignCookie, Marketing KPI Tracker |
| balance-sheet | *(not yet created)* | #151-155 | QuickBooks export → Google Sheets |
| efficiency | *(not yet created)* | #6-10, #71-75 | P&L + Headcount + Revenue model (cross-family) |

**Cross-family dependencies:**
- `efficiency` depends on `financial` (P&L data) + `revenue-retention` (ARR numbers) + headcount
- `forecast` depends on `revenue-retention` (actuals for forecast-vs-actual)
- `marketing` may depend on `revenue-retention` (New ARR for CAC:ARR ratios)

---

**Legend:**
- **Source**: Where the data originates
- **Currently In BQ**: Whether this can be computed from current BigQuery tables
- **Status**: `exists` = in BQ now | `derivable` = can be computed from BQ data once transforms built | `needs_ingestion` = requires new data source in BQ | `needs_definition` = formula or definition unclear

---

## 1. KPI Summary (Board Deck Page 2)

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 1 | SaaS ARR | Total annualized recurring SaaS revenue at quarter end | Total MRR × 12 (FX-adjusted) | Monthly, reported quarterly (exit month) | Revenue model (Layer 3) | Raw data yes, transform no | derivable |
| 2 | Net New ARR | Net change in ARR over the quarter (expansion - churn - downgrades) | (Expansion - Cancellation - Downgrades) × FX × 12, summed across quarter | Quarterly | Revenue model (Layers 2-3) | Raw data yes, transform no | derivable |
| 3 | Pre-FX Gross ARR % | Annual gross revenue retention, before FX adjustment | 1 - (Cancellations + Downgrades) / Start MRR, at CompanyAccount level, excluding OtherChurn (prepay-only) | Annual (YoY, same month comparison) | Revenue model (Layer 2, no FX) | **Verified** — `verified-queries/annual-grr.sql` | **verified** (exact match Nov & Dec 2025) |
| 4 | Pre-FX NRR % | Annual net revenue retention, before FX adjustment | (ARR at end of period for customers who existed at start, including expansion) / ARR at start | Annual (YoY, same month comparison) | Revenue model (Layer 2, no FX) | Raw data yes, transform no | derivable |
| 5 | Cumulative ACV | Average annual contract value across all paying customers | SaaS ARR / Paying Customer Count | Monthly, reported quarterly (exit month) | Revenue model + customer count | Raw data yes, transform no | derivable |
| 6 | S&M:Net New ARR | Sales & Marketing spend efficiency against net new ARR | S&M Expense (quarter) / Net New ARR (quarter) | Quarterly | P&L (S&M) + Revenue model | Needs P&L ingestion | needs_ingestion |
| 7 | S&M:New ARR | Sales & Marketing spend efficiency against new customer ARR only | S&M Expense (quarter) / New ARR (quarter, excludes expansion) | Quarterly | P&L (S&M) + Revenue model | Needs P&L ingestion | needs_ingestion |
| 8 | Rule of 40 | SaaS benchmark: revenue growth rate + profit margin should exceed 40% | ARR YoY Growth % + EBITDA Margin % | Quarterly | Revenue model + P&L | Needs P&L ingestion | needs_ingestion |
| 9 | Rev / Emp | Revenue per employee, annualized | (Operating Revenue for quarter × 4) / Avg Headcount | Quarterly | P&L (revenue) + Headcount | Needs headcount ingestion | needs_ingestion |
| 10 | Cost / Emp | Total cost per employee, annualized | (Total Operating Expenses for quarter × 4) / Avg Headcount | Quarterly | P&L (expenses) + Headcount | Needs headcount ingestion | needs_ingestion |
| 11 | Gross Margin % | Gross profit as percentage of operating revenue | Gross Margin / Operating Revenue | Quarterly | P&L | Needs P&L ingestion | needs_ingestion |
| 12 | Operating Exp % | Total operating expenses as percentage of operating revenue | Total Operating Expenses / Operating Revenue | Quarterly | P&L | Needs P&L ingestion | needs_ingestion |

---

## 2. P&L Metrics (Board Deck Page 3)

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 13 | SaaS Revenue | Recurring subscription revenue | Sum of all SaaS income (New + Classic platforms) | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 14 | P/S Revenue | Professional services revenue | Sum of PS income | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 15 | Operating Revenue | Total revenue from operations | SaaS Revenue + P/S Revenue | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 16 | Support Costs | Customer support expenses | From P&L | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 17 | Professional Services Costs | Cost of delivering PS | From P&L | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 18 | Hosting/Server/Channel Partner Costs | Infrastructure and channel partner costs | From P&L | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 19 | Gross Margin | Revenue minus cost of goods sold | Operating Revenue - (Support + PS Costs + Hosting/Channel) | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 20 | Sales & Marketing Expense | S&M department costs | From P&L | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 21 | R&D Expense | Research & development costs | From P&L | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 22 | G&A Expense | General & administrative costs | From P&L | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 23 | Total Operating Expenses | Sum of all OpEx | S&M + R&D + G&A | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 24 | Other Revenue | Non-operating revenue (interest, etc.) | From P&L | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 25 | EBITDA | Earnings before interest, taxes, depreciation, amortization | Gross Margin - Total Operating Expenses + Other Revenue | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 26 | Net Income | Bottom line including interest | EBITDA - Interest expense | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 27 | SaaS Revenue % of OR | SaaS as share of total operating revenue | SaaS Revenue / Operating Revenue | Quarterly | Derived from #13, #15 | No | needs_ingestion |
| 28 | P/S Revenue % of OR | PS as share of total operating revenue | P/S Revenue / Operating Revenue | Quarterly | Derived from #14, #15 | No | needs_ingestion |
| 29 | Support Costs % of OR | Support as share of revenue | Support Costs / Operating Revenue | Quarterly | Derived from #16, #15 | No | needs_ingestion |
| 30 | PS Costs % of OR | PS costs as share of revenue | PS Costs / Operating Revenue | Quarterly | Derived from #17, #15 | No | needs_ingestion |
| 31 | Hosting/Channel % of OR | Hosting as share of revenue | Hosting Costs / Operating Revenue | Quarterly | Derived from #18, #15 | No | needs_ingestion |
| 32 | S&M % of OR | Sales & marketing as share of revenue | S&M / Operating Revenue | Quarterly | Derived from #20, #15 | No | needs_ingestion |
| 33 | R&D % of OR | R&D as share of revenue | R&D / Operating Revenue | Quarterly | Derived from #21, #15 | No | needs_ingestion |
| 34 | G&A % of OR | G&A as share of revenue | G&A / Operating Revenue | Quarterly | Derived from #22, #15 | No | needs_ingestion |
| 35 | EBITDA Margin % | EBITDA as share of revenue | EBITDA / Operating Revenue | Quarterly | Derived from #25, #15 | No | needs_ingestion |

---

## 3. Forecast vs. Result (Board Deck Page 4)

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 36 | Syncs — Forecast | Predicted number of trial syncs | From RevCogs model | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 37 | Syncs — Actual | Actual trial syncs | From operational data | Monthly | Alocet / SaaS Analytics Engine | Likely yes (raw data) | needs_definition |
| 38 | New Customers — Forecast | Predicted new paying customers | From RevCogs model (Trials × Sync Rate × Conversion Rate) | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 39 | New Customers — Actual | Actual new paying customers | Count of customers with SaaSNetP1 = 0 and SaaSNetP2 > 0 | Monthly | Revenue model (Layer 1) | Raw data yes | derivable |
| 40 | New Subscription Revenue — Forecast (Pre-FX) | Predicted new customer revenue | New Customers × ARPC (from RevCogs) | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 41 | New Subscription Revenue — Actual (Pre-FX) | Actual new customer revenue, before FX | SUM(SaaSExpandNew) across all currencies, no FX adjustment | Monthly | Revenue model (Layer 2) | Raw data yes | derivable |
| 42 | PS Revenue Gross — Forecast (Pre-FX) | Predicted professional services revenue | From RevCogs model | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 43 | PS Revenue Gross — Actual (Pre-FX) | Actual PS revenue | From P&L or revenue data | Monthly | Accountant Google Sheets | No | needs_ingestion |
| 44 | Churn % — Forecast | Predicted monthly churn rate | From RevCogs model (cohort loss rates) | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 45 | Churn % — Actual | Actual monthly churn rate | (Cancellation + Downgrades) / Start, pre-FX | Monthly | Revenue model (Layer 2) | Raw data yes | derivable |
| 46 | SaaS Gross — Forecast (Pre-FX) | Predicted total SaaS revenue | From RevCogs model (sum of cohort SaaS) | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 47 | SaaS Gross — Actual (Pre-FX) | Actual SaaS revenue, before FX | SUM(SaaSNet) across all currencies, no FX | Monthly | Revenue model (Layer 2) | Raw data yes | derivable |

---

## 4. Enterprise Account Tracking (Board Deck Page 5)

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 48 | % Accounts Paying > $500/mth | Share of paying customers above $500 MRR | COUNT(SaaSNet > 500) / COUNT(SaaSNet > 0) | Monthly | Revenue model (Layer 1) | Raw data yes | derivable |
| 49 | % Accounts with > 10 Licenses | Share of paying customers with 10+ licenses | COUNT(LicenseCount > 10) / COUNT(paying customers) | Monthly | Account metadata (LicenseCount field) | Likely in BQ (accEntity) | derivable |

---

## 5. NRR by Customer Size (Board Deck Page 6)

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 50 | NRR — Small Accounts | Net revenue retention for accounts < $125 MRR | NRR formula applied to customers WHERE SaaSNetP1 < 125 | Quarterly (annual comparison) | Revenue model (Layer 1 filtered) | Raw data yes | derivable |
| 51 | NRR — Medium Accounts | Net revenue retention for accounts $125-$499 MRR | NRR formula applied to customers WHERE SaaSNetP1 BETWEEN 125 AND 499 | Quarterly (annual comparison) | Revenue model (Layer 1 filtered) | Raw data yes | derivable |
| 52 | NRR — Large Accounts | Net revenue retention for accounts > $500 MRR | NRR formula applied to customers WHERE SaaSNetP1 >= 500 | Quarterly (annual comparison) | Revenue model (Layer 1 filtered) | Raw data yes | derivable |

---

## 6. MRR Metrics Table (Board Deck Page 11)

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 53 | USD/CAD FX Rate | Exchange rate used for the month | Monthly average or spot rate | Monthly | FX Rate source (OFX / Bank of Canada) | No | needs_ingestion |
| 54 | F/X Change on ARR | Impact of FX movement on ARR | (Current FX Rate - Prior FX Rate) × USD ARR | Monthly | Derived from FX rate + USD revenue | Needs FX ingestion | needs_ingestion |
| 55 | ARR Start | ARR at beginning of month (FX-adjusted) | Prior month's ARR Exit | Monthly | Revenue model (Layer 3) | Raw data yes | derivable |
| 56 | New MRR | MRR from brand new customers | SUM(SaaSExpandNew) × FX | Monthly | Revenue model (Layers 1-3) | Raw data yes | derivable |
| 57 | Expand MRR | MRR from existing customer upgrades | SUM(SaaSExpansionUp) × FX | Monthly | Revenue model (Layers 1-3) | Raw data yes | derivable |
| 58 | Downgrade MRR | MRR lost from existing customer downgrades | SUM(SaaSContractionDown) × FX | Monthly | Revenue model (Layers 1-3) | Raw data yes | derivable |
| 59 | Churn MRR | MRR lost from customer cancellations | SUM(SaaSContractionCancel) × FX | Monthly | Revenue model (Layers 1-3) | Raw data yes | derivable |
| 60 | Net New MRR | Net monthly change in MRR | Expand - Churn - Downgrade (FX-adjusted) | Monthly | Revenue model (Layer 3) | Raw data yes | derivable |
| 61 | Net New ARR | Annualized net new | Net New MRR × 12 | Monthly | Derived from #60 | Raw data yes | derivable |
| 62 | Other MRR | Prepay expiry transitions (unearned → earned) | (PrepayExpiryP2 - PrepayExpiryP1) × FX | Monthly | Revenue model (Layer 2) | Raw data yes | derivable |
| 63 | Total MRR | Total monthly recurring revenue at month end | ARR Start/12 + New + Expand - Downgrade - Churn + Other + FX Change/12 | Monthly | Revenue model (Layer 3) | Raw data yes | derivable |
| 64 | ARR Exit | Total ARR at month end | Total MRR × 12 | Monthly | Derived from #63 | Raw data yes | derivable |

---

## 7. Retention Charts (Board Deck Pages 13-14)

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 65 | Pre-FX Net ARR Retention (YoY) | Revenue retained from same-month cohort, year-over-year, including expansion | ARR from customers who existed 12 months ago (including their expansion) / Their ARR 12 months ago, no FX | Monthly (each month vs same month prior year) | Revenue model (Layer 2, no FX) | Raw data yes | derivable |
| 66 | Pre-FX Gross ARR Retention (YoY) | Revenue retained from same-month cohort, excluding expansion | ARR from customers who existed 12 months ago (excluding expansion) / Their ARR 12 months ago, no FX | Monthly (each month vs same month prior year) | Revenue model (Layer 2, no FX) | Raw data yes | derivable |
| 67 | Pre-FX Net ARR Retention (MoM) | Revenue retained month-over-month, including expansion | NRR Amount / Less PreExpiry (from Layer 3, no FX) | Monthly | Revenue model (Layer 3, no FX) | Raw data yes | derivable |
| 68 | Pre-FX Gross ARR Retention (MoM) | Revenue retained month-over-month, excluding expansion | (Start - Cancellation - Downgrades) / Start (no FX) | Monthly | Revenue model (Layers 2-3, no FX) | Raw data yes | derivable |

---

## 8. Customer & ACV Metrics (Board Deck Pages 15-16)

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 69 | Cumulative ACV (monthly) | Average annual contract value | SaaS ARR / Paying Customer Count | Monthly | Revenue model | Raw data yes | derivable |
| 70 | Paying Logos | Count of paying customers | COUNT(SaaSNetP2 > 0) | Monthly | Revenue model (Layer 1) | Raw data yes | derivable |

---

## 9. Efficiency Metrics (Board Deck Pages 18-19)

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 71 | Revenue / Employee | Annualized revenue per employee | (Operating Revenue × 4) / Avg Headcount | Quarterly | P&L + Headcount sheet | No | needs_ingestion |
| 72 | Costs / Employee | Annualized cost per employee | (Total Operating Expenses × 4) / Avg Headcount | Quarterly | P&L + Headcount sheet | No | needs_ingestion |
| 73 | Headcount | Total employee count | From headcount sheet | Monthly or quarterly | Accountant Google Sheets | No | needs_ingestion |

---

## 10. S&M Efficiency (Board Deck Pages 21-22)

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 74 | S&M:Net New ARR | S&M spend per dollar of net new ARR | S&M Expense / Net New ARR | Quarterly | P&L (S&M) + Revenue model | Needs P&L | needs_ingestion |
| 75 | S&M:New ARR | S&M spend per dollar of new customer ARR (excludes expansion) | S&M Expense / New ARR | Quarterly | P&L (S&M) + Revenue model | Needs P&L | needs_ingestion |

---

## 11. Scalability (Board Deck Pages 24-25)

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 76 | Gross Margin % of OR | Gross margin as share of operating revenue | Gross Margin / Operating Revenue | Quarterly | P&L | No | needs_ingestion |
| 77 | Hosting+Channel % of OR | Hosting/channel costs as share of revenue | Hosting Costs / Operating Revenue | Quarterly | P&L | No | needs_ingestion |
| 78 | P/S Costs % of OR | Professional services costs as share of revenue | PS Costs / Operating Revenue | Quarterly | P&L | No | needs_ingestion |
| 79 | Support Costs % of OR | Support costs as share of revenue | Support Costs / Operating Revenue | Quarterly | P&L | No | needs_ingestion |
| 80 | S&M % of OR | Sales & marketing as share of revenue | S&M / Operating Revenue | Quarterly | P&L | No | needs_ingestion |
| 81 | R&D % of OR | R&D as share of revenue | R&D / Operating Revenue | Quarterly | P&L | No | needs_ingestion |
| 82 | G&A % of OR | G&A as share of revenue | G&A / Operating Revenue | Quarterly | P&L | No | needs_ingestion |

---

## 12. Underlying Revenue Model Metrics (Not on board deck — intermediate calculations)

### Layer 1: Customer-Level Classification

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 83 | SaaSNet (Period 1) | Customer's total SaaS MRR in the prior period | SaaSIncomeAmountNew + SaaSIncomeAmountClassic + DiscountOtherSaaS + DiscountPrepayPortion | Per customer, per comparison period | SaaS Analytics Engine API → BQ | Raw data yes | derivable |
| 84 | SaaSNet (Period 2) | Customer's total SaaS MRR in the current period | Same formula, current period | Per customer, per comparison period | SaaS Analytics Engine API → BQ | Raw data yes | derivable |
| 85 | SaaSExpandNew | Revenue from brand new customers (P1 = 0) | IF(SaaSNetP1 = 0, SaaSNetP2, 0) | Per customer | Derived from #83, #84 | Raw data yes | derivable |
| 86 | SaaSExpansionUp | Revenue increase from existing customers | IF(P1 > 0 AND P2 > P1, P2 - P1, 0) | Per customer | Derived from #83, #84 | Raw data yes | derivable |
| 87 | SaaSNoChange | Revenue from flat customers | IF(P1 = P2, P2, 0) | Per customer | Derived from #83, #84 | Raw data yes | derivable |
| 88 | SaaSContractionCancel | Revenue lost from full cancellations | IF(P2 = 0, P1, 0) | Per customer | Derived from #83, #84 | Raw data yes | derivable |
| 89 | SaaSContractionDown | Revenue lost from downgrades | IF(P2 > 0 AND P2 < P1, P1 - P2, 0) | Per customer | Derived from #83, #84 | Raw data yes | derivable |
| 90 | Customer Classification | Category assignment | new / expansion / no_change / contraction_cancel / contraction_down | Per customer | Derived from #85-89 | Raw data yes | derivable |
| 91 | Customer Platform | Classic vs New platform | From entity/account data | Per customer | SaaS Analytics Engine API → BQ | Yes (in accEntity) | exists |
| 92 | Customer Pay Type | Monthly vs Prepay | From entity/account data | Per customer | SaaS Analytics Engine API → BQ | Yes (in accEntity) | exists |
| 93 | Customer Currency | US-AR, CAN-AR, or UK-AR | From entity/account data | Per customer | SaaS Analytics Engine API → BQ | Yes (in accEntity) | exists |
| 94 | Customer Group | ExistingCustomerEOM, ExistingCustChurn, NewCustomerEOM, NewCustChurn, TrialerEOM, TrialerCancelled | From entity/account data | Per customer | SaaS Analytics Engine API → BQ | Yes (in accEntity) | exists |

### Layer 2: Currency-Split Aggregation

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 95 | Start of Month (by currency) | Total SaaSNet for prior period by currency | SUMIFS(SaaSNetP1, Currency = X) | Monthly, per currency | Derived from Layer 1 | Raw data yes | derivable |
| 96 | Cancellation (by currency) | Total churn by currency | SUMIFS(ContractionCancel, Currency = X) - OtherChurn | Monthly, per currency | Derived from Layer 1 | Raw data yes | derivable |
| 97 | Downgrades (by currency) | Total downgrades by currency | SUMIFS(ContractionDown, Currency = X) | Monthly, per currency | Derived from Layer 1 | Raw data yes | derivable |
| 98 | Expansion (by currency) | Total expansion by currency | SUMIFS(ExpansionUp, Currency = X) | Monthly, per currency | Derived from Layer 1 | Raw data yes | derivable |
| 99 | New ARR (by currency) | Total new customer revenue by currency | SUMIFS(ExpandNew, Currency = X) - Other | Monthly, per currency | Derived from Layer 1 | Raw data yes | derivable |
| 100 | Other (by currency) | Prepay expiry period 2 | SUMIFS(PrepayExpiryP2, Currency = X) | Monthly, per currency | Derived from Layer 1 | Raw data yes | derivable |
| 101 | OtherChurn (by currency) | Prepay expiry period 1 | SUMIFS(PrepayExpiryP1, Currency = X) | Monthly, per currency | Derived from Layer 1 | Raw data yes | derivable |
| 102 | Paying Customer Count (by currency) | Count of paying customers | COUNTIFS(SaaSNetP2 > 0, Currency = X) | Monthly, per currency | Derived from Layer 1 | Raw data yes | derivable |

### Layer 3: FX-Adjusted Totals

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 103 | FX Rate — USD | Monthly USD to CAD rate | From FX source | Monthly | Bank of Canada / OFX | No | needs_ingestion |
| 104 | FX Rate — GBP | Monthly GBP to CAD rate | From FX source | Monthly | Bank of Canada / OFX | No | needs_ingestion |
| 105 | Start (FX-adjusted) | Total MRR start of month in CAD | SUM(Start_USD × FX_USD + Start_CAN × 1.0 + Start_GBP × FX_GBP) | Monthly | Derived from Layer 2 + FX | Raw data partial | needs_ingestion |
| 106 | Less PreExpiry | Start minus prepay expiry churn | Start - (OtherChurn × FX) | Monthly | Derived | Raw data partial | needs_ingestion |
| 107 | Net Change (FX-adjusted) | Net expansion/contraction in CAD | (Expansion - Cancellation - Downgrades) × FX | Monthly | Derived from Layer 2 + FX | Raw data partial | needs_ingestion |
| 108 | NRR Amount | Start adjusted for net churn/expansion | Less PreExpiry + Net Change | Monthly | Derived | Raw data partial | needs_ingestion |
| 109 | NRR % | Net revenue retention rate (monthly) | NRR Amount / Less PreExpiry | Monthly | Derived from #106, #108 | Raw data partial | needs_ingestion |
| 110 | Net MRR Churn % | Monthly net churn rate | (Cancellation + Downgrades - Expansion) / Start (FX) | Monthly | Derived from Layer 3 | Raw data partial | needs_ingestion |
| 111 | Gross MRR Churn % | Monthly gross churn rate | (Cancellation + Downgrades) / Start (FX) | Monthly | Derived from Layer 3 | Raw data partial | needs_ingestion |
| 112 | MRR / Account | Average MRR per paying customer | Total MRR / Total Paying Count | Monthly | Derived from Layer 3 | Raw data yes | derivable |

---

## 13. RevCogs Forecast Model Metrics

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 113 | Trials (forecast) | Predicted trial signups | From RevCogs model | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 114 | Sync Rate % | Percentage of trials that sync data | Historical conversion rate | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 115 | Syncs (forecast) | Predicted trial syncs | Trials × Sync Rate | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 116 | Conversion Rate % | Percentage of syncs that become paying | Historical conversion rate | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 117 | First Payment (forecast) | Predicted new paying customers | Syncs × Conversion Rate | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 118 | ARPC — New Customers | Average revenue per new customer | Historical average | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 119 | SaaS from Trialers | Revenue from new customers | First Payment × ARPC | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 120 | Cohort BOM Count (0-30) | Beginning-of-month customers in 0-30 day cohort | From prior month's new + retained | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 121 | Cohort BOM Count (31-60) | Beginning-of-month customers in 31-60 day cohort | From prior month's 0-30 retained | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 122 | Cohort BOM Count (61-180) | Beginning-of-month customers in 61-180 day cohort | From prior month's 31-60 retained | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 123 | Cohort BOM Count (180+) | Beginning-of-month customers 180+ days | From prior month's 61-180 retained + 180+ retained | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 124 | Cohort Loss % | Percentage of cohort that churns per month | Historical by cohort | Monthly, per cohort | RevCogs Google Sheet | No | needs_ingestion |
| 125 | Cohort ARPC | Average revenue per customer by cohort | Historical by cohort | Monthly, per cohort | RevCogs Google Sheet | No | needs_ingestion |
| 126 | Cohort SaaS Revenue | Revenue from each cohort | (BOM - Lost) × ARPC | Monthly, per cohort | RevCogs Google Sheet | No | needs_ingestion |
| 127 | SaaS w/o DEP | Total SaaS revenue excluding DEP | Sum of all cohort SaaS + Trialers SaaS | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 128 | SaaS DEP | Recurring monthly maintenance revenue | Separate line item | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 129 | PS Revenue (forecast) | Predicted professional services revenue | From RevCogs model | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 130 | Total from Operations (forecast) | Total forecasted revenue | SaaS w/o DEP + SaaS DEP + PS | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 131 | Budget vs Forecast | Variance between board-approved budget and rolling forecast | Budget value - Forecast value | Monthly | RevCogs Google Sheet | No | needs_ingestion |
| 132 | Forecast vs Actual | Variance between forecast and actual | Forecast value - Actual value | Monthly | RevCogs + Revenue model | Needs RevCogs ingestion | needs_ingestion |

---

## 14. Marketing Attribution Metrics

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 133 | Trials by Channel | Count of trial signups attributed to each marketing channel | Count of trials with fractional attribution to channel | Monthly, per channel (19 channels) | CampaignCookie → Attribution Service | No | needs_ingestion |
| 134 | Syncs by Channel | Count of syncs attributed to each channel | Count of synced trials × channel attribution fraction | Monthly, per channel | Attribution Service | No | needs_ingestion |
| 135 | Conversions by Channel | Count of conversions attributed to each channel | Count of converted trials × channel attribution fraction | Monthly, per channel | Attribution Service + Revenue model | No | needs_ingestion |
| 136 | New ARR by Channel | Revenue from new customers attributed to each channel | SaaSExpandNew × attribution fraction per channel | Monthly, per channel | Attribution + Revenue model | No | needs_ingestion |
| 137 | Channel Ad Spend | Marketing spend per channel | From marketing KPI tracker | Monthly, per channel | Marketing KPI Tracker Google Sheet | No | needs_ingestion |
| 138 | Channel Salary Allocation | Salary cost allocated to each channel | From CAC:ARR model | Monthly, per channel | Marketing KPI Tracker / RevCogs | No | needs_ingestion |
| 139 | Channel Sales Allocation | Sales team cost allocated to each channel | From CAC:ARR model | Monthly, per channel | Marketing KPI Tracker / RevCogs | No | needs_ingestion |
| 140 | CAC by Channel | Customer acquisition cost per channel | (Salary + Sales Allocation + Ad Spend) per channel | Monthly, per channel | Derived from #137-139 | No | needs_ingestion |
| 141 | CAC:ARR by Channel | Efficiency ratio per channel | CAC / Attributed New ARR per channel | Monthly, per channel | Derived from #136, #140 | No | needs_ingestion |
| 142 | Attribution Fraction | Fractional credit per channel per trial | Multi-touch attribution model output (sums to 1.0 per trial) | Per trial | CampaignCookie → Attribution Service | No | needs_ingestion |

### Attribution Channels (19 top-level)

| Channel | Sub-channels (53 total) |
|---------|------------------------|
| Content | Blog, Resource pages, etc. |
| Direct | Direct website traffic |
| Email | Email campaigns |
| None | No attribution captured |
| OPN | QuickBooks App Store (primary), other listings |
| Other | Miscellaneous |
| Partners | Partner referrals |
| PPC (Trial Gen) | Google PPC, Reddit ads, Facebook ads |
| PPC (Branding) | Brand awareness campaigns |
| SEO | Organic search |

---

## 15. Marketing KPI Tracker Metrics

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 143 | Trials — Total | Total trial signups across all channels | Sum of channel trials | Monthly | Marketing KPI Tracker | No | needs_ingestion |
| 144 | Syncs — Total | Total syncs across all channels | Sum of channel syncs | Monthly | Marketing KPI Tracker | No | needs_ingestion |
| 145 | Sync Rate — Total | Overall sync rate | Total Syncs / Total Trials | Monthly | Derived from #143, #144 | No | needs_ingestion |
| 146 | New Customers — Total | Total new paying customers | Sum of channel conversions | Monthly | Marketing KPI Tracker | No | needs_ingestion |
| 147 | Conversion Rate — Total | Overall conversion rate | Total New Customers / Total Syncs | Monthly | Derived from #144, #146 | No | needs_ingestion |
| 148 | Total Marketing Spend | All marketing costs | Sum of all channel spend | Monthly | Marketing KPI Tracker | No | needs_ingestion |
| 149 | Blended CAC | Overall customer acquisition cost | Total Marketing Spend / New Customers | Monthly | Derived from #146, #148 | No | needs_ingestion |
| 150 | Blended CAC:ARR | Overall acquisition efficiency | Blended CAC / (New Customer ARPC × 12) | Monthly | Derived | No | needs_ingestion |

---

## 16. Balance Sheet Metrics (Board Deck — P&L adjacent)

| # | Metric | Definition | Formula | Granularity | Source | Currently In BQ | Status |
|---|--------|-----------|---------|-------------|--------|----------------|--------|
| 151 | Cash & Equivalents | Total cash position | From balance sheet | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 152 | Total Assets | Sum of all assets | From balance sheet | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 153 | Total Liabilities | Sum of all liabilities | From balance sheet | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 154 | Shareholders' Equity | Net assets | Total Assets - Total Liabilities | Quarterly | Accountant Google Sheets | No | needs_ingestion |
| 155 | Deferred Revenue | Prepaid but unrecognized revenue | From balance sheet | Quarterly | Accountant Google Sheets | No | needs_ingestion |

---

## Summary

| Category | Count | In BQ Today | Derivable (once transforms built) | Needs Ingestion |
|----------|-------|-------------|----------------------------------|-----------------|
| KPI Summary (Page 2) | 12 | 0 | 4 | 8 |
| P&L (Page 3) | 23 | 0 | 0 | 23 |
| Forecast vs Result (Page 4) | 12 | 0 | 4 | 8 |
| Enterprise Tracking (Page 5) | 2 | 0 | 2 | 0 |
| NRR by Size (Page 6) | 3 | 0 | 3 | 0 |
| MRR Metrics (Page 11) | 12 | 0 | 8 | 4 |
| Retention Charts (Pages 13-14) | 4 | 0 | 4 | 0 |
| Customer & ACV (Pages 15-16) | 2 | 0 | 2 | 0 |
| Efficiency (Pages 18-19) | 3 | 0 | 0 | 3 |
| S&M Efficiency (Pages 21-22) | 2 | 0 | 0 | 2 |
| Scalability (Pages 24-25) | 7 | 0 | 0 | 7 |
| Revenue Model (Layers 1-3) | 30 | 4 | 22 | 4 |
| RevCogs Forecast | 20 | 0 | 0 | 20 |
| Marketing Attribution | 10 | 0 | 0 | 10 |
| Marketing KPI Tracker | 8 | 0 | 0 | 8 |
| Balance Sheet | 5 | 0 | 0 | 5 |
| **TOTAL** | **155** | **4** | **49** | **102** |

### Key Takeaway

Of 155 metrics, only **4 exist in BigQuery today** (customer platform, pay type, currency, group — basic entity attributes). Another **49 can be derived** from existing BigQuery raw data once transforms are built. The remaining **102 need new data sources ingested** — primarily:

1. **P&L data** (23 metrics) — from Accountant's Google Sheets
2. **RevCogs forecast model** (20 metrics) — from RevCogs Google Sheet
3. **Marketing attribution** (10 metrics) — from Alocet CampaignCookie tables via Attribution Service
4. **Marketing KPI tracker** (8 metrics) — from Marketing team's Google Sheet
5. **FX rates** (4 metrics) — from Bank of Canada / OFX API
6. **Balance sheet** (5 metrics) — from Accountant's Google Sheets
7. **Headcount** (3 metrics) — from Accountant's Google Sheets
8. **Forecast vs actual comparisons** (12 metrics) — need both RevCogs ingestion and revenue transforms

### Priority Order for Ingestion

1. **FX Rates** — simple, public API, unblocks all FX-adjusted metrics (affects 20+ metrics)
2. **P&L + Balance Sheet + Headcount** — Google Sheets API, one connection pattern, unblocks 31 metrics
3. **RevCogs Forecast** — Google Sheets API, same pattern, unblocks 20 metrics
4. **Marketing Attribution** — CampaignCookie from Alocet, unblocks 10 metrics
5. **Marketing KPI Tracker** — Google Sheets API, unblocks 8 metrics
