{{ config(materialized='view') }}

-- Entity-grain firmographic dims for customer-level analysis. One row per
-- EntityRecordID, deduped from revenue.Account (~1.22 rows per entity).
-- Centralizes derivations previously retyped ad-hoc: cleaned annual sales,
-- size band, US flag, cleaned lifecycle dates, tenure, and current-MRR rank.

WITH acct AS (
  SELECT
    EntityRecordID,
    MAX(IF(CustDatAnnualSales BETWEEN 1 AND 1e10, CustDatAnnualSales, NULL)) AS annual_sales,
    ARRAY_AGG(SignupCountry IGNORE NULLS ORDER BY SignUpDate, RecordID LIMIT 1)[SAFE_OFFSET(0)] AS signup_country,
    MIN(IF(SignUpDate BETWEEN '2000-01-01' AND CURRENT_DATE(), SignUpDate, NULL)) AS signup_date,
    MIN(IF(FirstSaaSInvoiceTxnDate BETWEEN '2000-01-01' AND CURRENT_DATE(), FirstSaaSInvoiceTxnDate, NULL)) AS first_invoice_date
  FROM {{ source('revenue', 'Account') }}
  WHERE EntityRecordID IS NOT NULL
  GROUP BY 1
),
current_mrr AS (  -- latest complete month's annual GRR base, for MRR ranking
  SELECT EntityRecordID, SUM(StartMRR) AS start_mrr
  FROM {{ ref('int_customer_annual_mrr') }}
  WHERE Month = (SELECT MAX(Month) FROM {{ ref('int_customer_annual_mrr') }})
    AND StartMRR > 0
  GROUP BY 1
),
ranked AS (
  SELECT EntityRecordID, start_mrr,
    PERCENT_RANK() OVER (ORDER BY start_mrr DESC) AS mrr_rank_pct
  FROM current_mrr
)
SELECT
  a.EntityRecordID,
  a.annual_sales,
  CASE
    WHEN a.annual_sales IS NULL THEN NULL
    WHEN a.annual_sales < 500000 THEN '<$500K'
    WHEN a.annual_sales < 1000000 THEN '$500K-$1M'
    WHEN a.annual_sales < 5000000 THEN '$1M-$5M'
    WHEN a.annual_sales < 10000000 THEN '$5M-$10M'
    ELSE '$10M+'
  END AS size_band,
  a.signup_country,
  COALESCE(a.signup_country IN ('United States', 'USA', 'US'), FALSE) AS is_us,
  a.signup_date,
  a.first_invoice_date,
  ROUND(DATE_DIFF(CURRENT_DATE(), a.first_invoice_date, MONTH) / 12, 2) AS tenure_years,
  r.start_mrr AS current_start_mrr,
  r.mrr_rank_pct,
  COALESCE(r.mrr_rank_pct <= 0.30, FALSE) AS is_top30_mrr
FROM acct a
LEFT JOIN ranked r USING (EntityRecordID)
