{{ config(materialized='view') }}

-- Canonical metric: "Annual Start MRR" (#384)
-- Type: simple SUM(StartMRR) from v_customer_annual_mrr, rounded to 2 decimals

SELECT
  Month AS period,
  ROUND(SUM(StartMRR), 2) AS value
FROM {{ source('revenue', 'v_customer_annual_mrr') }}
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1
