

-- Canonical metric: "Churn" (#59)
-- Type: simple COUNT(DISTINCT CompanyAccount) from v_cancellations, by CancellationDate

SELECT
  DATE_TRUNC(CancellationDate, MONTH) AS period,
  COUNT(DISTINCT CompanyAccount) AS value
FROM `project-for-method-dw`.`revenue`.`int_cancellations`
WHERE CancellationDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1