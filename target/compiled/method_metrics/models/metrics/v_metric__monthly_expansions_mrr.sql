

-- Canonical metric: "Monthly Expansions ($)" (#381)
-- Type: simple SUM(Expansions) from v_customer_mrr, rounded to 2 decimals

SELECT
  Month AS period,
  ROUND(SUM(Expansions), 2) AS value
FROM `project-for-method-dw`.`revenue`.`int_customer_mrr`
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1