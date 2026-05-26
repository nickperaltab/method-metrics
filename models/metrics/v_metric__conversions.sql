{{ config(materialized='view') }}

-- Canonical metric: "Conversions" (#56)
-- Type: simple COUNT(*) from v_conversions, by FirstSaaSInvoiceTxnDate

SELECT
  DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS period,
  COUNT(*) AS value
FROM {{ source('revenue', 'v_conversions') }}
WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1
