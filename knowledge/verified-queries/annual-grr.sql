-- ============================================================
-- Annual Pre-FX GRR (Gross Revenue Retention)
-- ============================================================
-- Compares each month to the same month 12 months ago.
--
-- Approach: join by EntityRecordID (stable), classify at
-- CompanyAccount level (customer). This matches what the SaaS
-- analytics tool does — it links by stable customer ID, then
-- reports at company level.
--
-- OtherChurn: customers whose ONLY SaaS lines are Prepay
-- Expiry Income are excluded from cancellations.
--
-- Verified 2026-03-27 — EXACT MATCH to the penny:
--   Nov 2025: BQ 77.60% = Excel 77.60%
--   Dec 2025: BQ 78.49% = Excel 78.49%
--   All components (start, cancel, downgrade, expansion, new,
--   other_churn) match exactly for both months.
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

-- Join P1 to P2 by EntityRecordID (stable), resolve company name
entity_paired AS (
  -- Entities present in P2
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
      DATE_SUB(PARSE_DATE('%Y-%m', p2.month), INTERVAL 12 MONTH))
  WHERE p2.month >= '2023-01'

  UNION ALL

  -- Entities in P1 but gone in P2 (cancellations)
  SELECT
    FORMAT_DATE('%Y-%m',
      DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 12 MONTH)) AS month,
    p1.company,
    p1.total_saas AS p1_saas,
    0 AS p2_saas,
    p1.expiry_lines AS p1_expiry_lines,
    p1.saas_lines AS p1_saas_lines
  FROM entity_monthly p1
  LEFT JOIN entity_monthly p2
    ON p1.EntityRecordID = p2.EntityRecordID
    AND p2.month = FORMAT_DATE('%Y-%m',
      DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 12 MONTH))
  WHERE p2.EntityRecordID IS NULL
    AND FORMAT_DATE('%Y-%m',
      DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 12 MONTH))
        < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND FORMAT_DATE('%Y-%m',
      DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 12 MONTH))
        >= '2023-01'
),

-- Aggregate to CompanyAccount level, then classify
company_level AS (
  SELECT
    month,
    company,
    SUM(p1_saas) AS p1_saas,
    SUM(p2_saas) AS p2_saas,
    SUM(p1_expiry_lines) AS p1_expiry_lines,
    SUM(p1_saas_lines) AS p1_saas_lines
  FROM entity_paired
  GROUP BY month, company
)

SELECT
  month,
  ROUND(SUM(CASE WHEN p1_saas > 0 THEN p1_saas ELSE 0 END), 2) AS start_mrr,
  -- Adjusted cancellations (excluding OtherChurn)
  ROUND(
    SUM(CASE WHEN p1_saas > 0 AND p2_saas = 0 THEN p1_saas ELSE 0 END)
    - SUM(CASE WHEN p1_saas > 0 AND p2_saas = 0
            AND p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines
          THEN p1_saas ELSE 0 END)
  , 2) AS cancellations,
  ROUND(SUM(CASE WHEN p1_saas > 0 AND p2_saas > 0 AND p2_saas < p1_saas
    THEN p1_saas - p2_saas ELSE 0 END), 2) AS downgrades,
  ROUND(SUM(CASE WHEN p1_saas > 0 AND p2_saas > p1_saas
    THEN p2_saas - p1_saas ELSE 0 END), 2) AS expansion,
  ROUND(SUM(CASE WHEN p1_saas = 0 AND p2_saas > 0
    THEN p2_saas ELSE 0 END), 2) AS new_mrr,
  -- OtherChurn (prepay-only, excluded from GRR)
  ROUND(SUM(CASE WHEN p1_saas > 0 AND p2_saas = 0
          AND p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines
        THEN p1_saas ELSE 0 END), 2) AS other_churn,
  -- Pre-FX GRR
  ROUND(1.0 - (
    SUM(CASE WHEN p1_saas > 0 AND p2_saas = 0 THEN p1_saas ELSE 0 END)
    - SUM(CASE WHEN p1_saas > 0 AND p2_saas = 0
            AND p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines
          THEN p1_saas ELSE 0 END)
    + SUM(CASE WHEN p1_saas > 0 AND p2_saas > 0 AND p2_saas < p1_saas
        THEN p1_saas - p2_saas ELSE 0 END)
  ) / NULLIF(SUM(CASE WHEN p1_saas > 0 THEN p1_saas ELSE 0 END), 0), 4) AS pre_fx_grr
FROM company_level
GROUP BY month
ORDER BY month
