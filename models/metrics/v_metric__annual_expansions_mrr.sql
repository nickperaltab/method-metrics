{{ config(materialized='view') }}

-- Canonical metric: "Annual Expansions ($)" (#387)

SELECT
  Month AS period,
  ROUND(SUM(Expansions), 2) AS value
FROM {{ ref('int_customer_annual_mrr') }}
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1
