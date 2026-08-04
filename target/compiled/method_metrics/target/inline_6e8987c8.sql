
WITH weekly AS (
  SELECT 'weekly' AS grain, period, value
  FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__sync_conversion_rate_weekly`
  WHERE period < DATE_TRUNC(CURRENT_DATE(), WEEK(MONDAY))
),
monthly AS (
  SELECT 'monthly' AS grain, period, value
  FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__sync_to_conversion_rate`
  WHERE period < DATE_TRUNC(CURRENT_DATE(), MONTH)
),
combined AS (
  SELECT * FROM weekly UNION ALL SELECT * FROM monthly
),
weekly_conversions AS (
  SELECT
    'weekly' AS grain,
    DATE_TRUNC(FirstSaaSInvoiceTxnDate, WEEK(MONDAY)) AS period,
    COUNT(*) AS conversions
  FROM `project-for-method-dw`.`revenue`.`int_conversions`
  WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  GROUP BY 1, 2
),
monthly_conversions AS (
  SELECT
    'monthly' AS grain,
    DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS period,
    COUNT(*) AS conversions
  FROM `project-for-method-dw`.`revenue`.`int_conversions`
  WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  GROUP BY 1, 2
),
conversions AS (
  SELECT * FROM weekly_conversions
  UNION ALL
  SELECT * FROM monthly_conversions
)
SELECT c.grain, c.period, c.value, 'null_rate_with_conversions' AS violation
FROM combined c
JOIN conversions n USING (grain, period)
WHERE c.value IS NULL AND n.conversions > 0