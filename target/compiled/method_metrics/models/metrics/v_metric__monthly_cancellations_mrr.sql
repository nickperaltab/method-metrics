

-- Canonical metric: "Monthly Cancellations ($)" (#379)
-- Type: simple SUM(Cancellations) from v_customer_mrr, rounded to 2 decimals
-- Methodology: inherits CEO-confirmed symmetric Prepay Expiry Income
--   exclusion from v_customer_mrr (see knowledge/verified-queries/v_customer_mrr.sql)
-- Materialization: rolling 24 months ending at the current day

SELECT
  Month AS period,
  ROUND(SUM(Cancellations), 2) AS value
FROM `project-for-method-dw`.`revenue`.`int_customer_mrr`
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1