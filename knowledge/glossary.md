# Glossary

## Data Room

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Data Room** | The validated, documented query layer + metric catalog + dashboard. The entire system, not just the UI. | "dashboard project", "reporting tool" |
| **Metric Definition** | A documented entry for a single KPI: name, formula, BQ SQL reference, source of truth, validation status. | "metric spec", "KPI doc" |
| **Test Fixture** | Known-good output values for a specific query + time period, used for automated validation against BQ results. | "test case", "golden file" |
| **Metrics Catalog** | The CSV file documenting all metric definitions. Handed off to colleague for Supabase import. | "metrics database", "KPI list" |

## Revenue Model

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **SaaSAmount** | The aggregate revenue field in BigQuery's TransLineFlattened table. Includes all SaaS components (MethodNew, Classic, DEP, discounts, portals, emails). Use this for everything — no filtering needed. | "SaaSNet" (that's the spreadsheet term), "MRR" (MRR is derived from SaaSAmount) |
| **SaaSNet** | The spreadsheet equivalent of SaaSAmount. Formula: `SaaSIncomeAmountNew + SaaSIncomeAmountClassic + DiscountOtherSaaS + DiscountPrepayPortion`. In BQ, use `SUM(SaaSAmount)` instead. | "revenue", "income" |
| **EntityRecordID** | The correct grouping key for retention calculations in BigQuery. Groups at the customer/entity level. | "CompanyAccount" (different granularity — do NOT use for retention), "CustomerID" |
| **CompanyAccount** | A customer identifier in BigQuery. Different granularity from EntityRecordID. Do NOT use for retention calculations. | Don't confuse with EntityRecordID |
| **Pre-FX** | Revenue metrics before foreign exchange conversion. All currencies at face value. | "raw", "local currency" |
| **FX-Adjusted** | Revenue metrics after applying USD/CAD exchange rates. US entities multiplied by the monthly OFX rate; CAN entities × 1.0. | "converted", "CAD-equivalent" |

## Retention Metrics

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **NRR (Net Revenue Retention)** | (Start MRR - Cancellations - Downgrades + Expansions) / Start MRR. Measures how much revenue is retained from existing customers including growth. | "net retention", "NDR" (net dollar retention) |
| **GRR (Gross Revenue Retention)** | (Start MRR - Cancellations - Downgrades) / Start MRR. Measures how much revenue is retained excluding growth. Always ≤ NRR. | "gross retention" |
| **Monthly Retention** | Month-over-month comparison (e.g., Jan '26 → Feb '26). Source: Feb Monthly.xlsx. | Don't mix with annual |
| **Annual Retention** | Year-over-year comparison (e.g., Feb '25 → Feb '26). Source: Feb Annual.xlsx. | Don't mix with monthly |
| **Cancellation** | A customer whose SaaSNet drops to $0 in the current period. Amount = their prior period SaaSNet. | "churn" (churn = cancellations + downgrades) |
| **Downgrade** | A customer whose SaaSNet decreased but is still > $0. Amount = prior - current. | "contraction" |
| **Expansion** | A customer whose SaaSNet increased. Amount = current - prior. | "upsell", "growth" |
| **Churn** | Cancellations + Downgrades combined. Total revenue lost from existing customers. | Don't use alone when you mean specifically cancellations or downgrades |

## RevCogs

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **RevCogs** | Revenue Cost of Goods Sold model. Bottom-up revenue forecast by customer cohort with estimate vs. actual columns. | "forecast model", "budget" |
| **Cohort** | Customer grouping by tenure: 0-30 days, 31-60 days, 61-180 days, 180+ days. Each cohort has its own loss rate, ARPC, and retention. | "segment" (that's enterprise segmentation) |
| **ARPC** | Average Revenue Per Customer. Used in RevCogs to project SaaS revenue per cohort. | "ARPU" (we use ARPC at Method) |
| **DEP** | Dedicated Enhancement Plan. Recurring monthly maintenance cost. New line item, not in all views yet. | "maintenance", "support" |
| **Forecast/Budget** | Manually entered numbers in Google Sheets. Non-queryable from BQ — must pull via Sheets API. | "projections", "estimates" |

## Infrastructure

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **TransLineFlattened** | The BigQuery table containing all revenue transaction data. Schema: `project-for-method-dw.revenue.TransLineFlattened`. Populated nightly by the SaaS Analytics Engine API. | "revenue table", "transactions" |
| **SaaS Analytics Engine** | The API that syncs Alocet data to BigQuery nightly via `/api/revtobigquery`. Also provides `/api/GetPeriodComparisonToExcel` for on-demand period comparisons. Owned by Paul Jackson. | "the API", "Alocet API" |
| **Colleague's App** | The existing Vercel app + Supabase metrics catalog built by Justin's colleague. We extend it, don't rebuild it. Our metrics CSV will be imported into their Supabase catalog. | "the Vercel app" (be specific about whose) |
