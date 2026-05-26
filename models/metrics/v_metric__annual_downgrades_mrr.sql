{{ config(materialized='view') }}

-- Canonical metric: "Annual Downgrades ($)" (#386)

SELECT
  Month AS period,
  ROUND(SUM(Downgrades), 2) AS value
FROM {{ source('revenue', 'int_customer_annual_mrr') }}
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1
