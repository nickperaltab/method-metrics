{{ config(materialized='view') }}

-- Canonical metric: "Monthly Start MRR" (#378)
-- Type: simple SUM(StartMRR) from v_customer_mrr, rounded to 2 decimals
-- Methodology: inherits CEO-confirmed symmetric Prepay Expiry Income
--   exclusion from v_customer_mrr (see knowledge/verified-queries/v_customer_mrr.sql)
-- Materialization: rolling 24 months ending at the current day

SELECT
  Month AS period,
  ROUND(SUM(StartMRR), 2) AS value
FROM {{ source('revenue', 'int_customer_mrr') }}
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1
