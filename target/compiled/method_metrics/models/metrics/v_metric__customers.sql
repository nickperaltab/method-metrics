

-- Canonical metric: "Customers" (#373)
-- Type: simple count_distinct of EntityRecordID from v_customers
-- Filter: IsActive = TRUE (matches Supabase semantic_filters)
-- Grain: customer (NOT account) — a customer with multiple accounts counts ONCE
-- Materialization: rolling 24 months ending at the current day

SELECT
  Month AS period,
  COUNT(DISTINCT EntityRecordID) AS value
FROM `project-for-method-dw`.`revenue`.`int_customers`
WHERE IsActive = TRUE
  AND Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1