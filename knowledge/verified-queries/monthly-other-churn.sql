-- ============================================================
-- Monthly OtherChurn (Pre-FX, CompanyAccount level)
-- ============================================================
-- MRR from customers that went to zero, but whose ONLY SaaS
-- lines were Prepay Expiry Income. These are deferred revenue
-- recognition, not real churn. Separated from Cancellations.
-- Join by EntityRecordID (stable), classify at CompanyAccount.
--
-- Verified 2026-03-27 — EXACT MATCH:
--   Feb 2026: BQ $10,249.75 = Excel $10,249.75
--   Oct 2025: BQ $10,280.00 = Excel $10,280.00
-- ============================================================

WITH entity_monthly AS (
  SELECT
    FORMAT_DATE('%Y-%m', TxnDate) AS month,
    EntityRecordID,
    ARRAY_AGG(CompanyAccount ORDER BY SaaSAmount DESC LIMIT 1)[OFFSET(0)] AS company,
    SUM(SaaSAmount) AS total_saas,
    COUNTIF(SaaSAmount != 0) AS saas_lines,
    COUNTIF(SaaSAmount != 0 AND AccountFullName LIKE '%Prepay Expiry Income%') AS expiry_lines
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE TxnDate >= '2021-12-01'
    AND FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
  GROUP BY month, EntityRecordID
),

entity_paired AS (
  SELECT
    p2.month,
    COALESCE(p2.company, p1.company) AS company,
    COALESCE(p1.total_saas, 0) AS p1_saas,
    p2.total_saas AS p2_saas,
    COALESCE(p1.expiry_lines, 0) AS p1_expiry_lines,
    COALESCE(p1.saas_lines, 0) AS p1_saas_lines
  FROM entity_monthly p2
  LEFT JOIN entity_monthly p1
    ON p2.EntityRecordID = p1.EntityRecordID
    AND p1.month = FORMAT_DATE('%Y-%m',
      DATE_SUB(PARSE_DATE('%Y-%m', p2.month), INTERVAL 1 MONTH))
  WHERE p2.month >= '2022-01'

  UNION ALL

  SELECT
    FORMAT_DATE('%Y-%m',
      DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) AS month,
    p1.company,
    p1.total_saas AS p1_saas,
    0 AS p2_saas,
    p1.expiry_lines AS p1_expiry_lines,
    p1.saas_lines AS p1_saas_lines
  FROM entity_monthly p1
  LEFT JOIN entity_monthly p2
    ON p1.EntityRecordID = p2.EntityRecordID
    AND p2.month = FORMAT_DATE('%Y-%m',
      DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH))
  WHERE p2.EntityRecordID IS NULL
    AND FORMAT_DATE('%Y-%m',
      DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH))
        < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND FORMAT_DATE('%Y-%m',
      DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH))
        >= '2022-01'
),

company_level AS (
  SELECT month, company,
    SUM(p1_saas) AS p1_saas,
    SUM(p2_saas) AS p2_saas,
    SUM(p1_expiry_lines) AS p1_expiry_lines,
    SUM(p1_saas_lines) AS p1_saas_lines
  FROM entity_paired
  GROUP BY month, company
)

SELECT
  month,
  ROUND(SUM(CASE WHEN p1_saas > 0 AND p2_saas = 0
          AND p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines
        THEN p1_saas ELSE 0 END), 2) AS other_churn
FROM company_level
GROUP BY month
ORDER BY month
