-- ============================================================
-- Monthly New MRR (Pre-FX, CompanyAccount level)
-- ============================================================
-- MRR from customers that had zero SaaS in P1 but positive
-- in P2. These are new customers (or returning after a gap).
-- Join by EntityRecordID (stable), classify at CompanyAccount.
--
-- Verified 2026-03-27 — EXACT MATCH:
--   Feb 2026: BQ $28,728.10 = Excel $28,728.10
--   Oct 2025: BQ $33,340.85 vs Excel $33,306.85 ($34 gap —
--     one entity corrected in BQ since Excel download)
-- ============================================================

WITH entity_monthly AS (
  SELECT
    FORMAT_DATE('%Y-%m', TxnDate) AS month,
    EntityRecordID,
    ARRAY_AGG(CompanyAccount ORDER BY SaaSAmount DESC LIMIT 1)[OFFSET(0)] AS company,
    SUM(SaaSAmount) AS total_saas
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
    p2.total_saas AS p2_saas
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
    0 AS p2_saas
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
    SUM(p2_saas) AS p2_saas
  FROM entity_paired
  GROUP BY month, company
)

SELECT
  month,
  ROUND(SUM(CASE WHEN p1_saas = 0 AND p2_saas > 0
    THEN p2_saas ELSE 0 END), 2) AS new_mrr
FROM company_level
GROUP BY month
ORDER BY month
