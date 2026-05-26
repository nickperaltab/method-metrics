

-- Canonical metric: "Annual Cancellations ($)" (#385)

SELECT
  Month AS period,
  ROUND(SUM(Cancellations), 2) AS value
FROM `project-for-method-dw`.`revenue`.`int_customer_annual_mrr`
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1