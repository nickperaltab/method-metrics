-- int_customer_annual_mrr — pre-migration DDL (orphaned BQ view, NOT dbt-managed)
-- Captured: 2026-06-04
-- Reason: migrate orphaned annual view to a dbt-managed TABLE for performance.
-- Source object: project-for-method-dw.revenue.int_customer_annual_mrr
-- Annual cohort: pairs month M vs M-12 (same symmetric Prepay-Expiry exclusion as int_customer_mrr).
-- This is a verbatim reference copy of the live view_definition at capture time.
--
WITH entity_monthly AS (
  SELECT
    FORMAT_DATE('%Y-%m', TxnDate) AS month_str,
    DATE_TRUNC(TxnDate, MONTH) AS Month,
    EntityRecordID,
    ARRAY_AGG(CompanyAccount ORDER BY SaaSAmount DESC, CompanyAccount ASC LIMIT 1)[OFFSET(0)] AS company,
    SUM(SaaSAmount) AS total_saas,
    COUNTIF(SaaSAmount != 0) AS saas_lines,
    COUNTIF(SaaSAmount != 0 AND AccountFullName LIKE '%Prepay Expiry Income%') AS expiry_lines
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE TxnDate >= '2021-12-01'
    AND FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND CompanyAccount NOT LIKE 'm11%' AND CompanyAccount NOT LIKE 'm18%'
  GROUP BY 1, 2, 3
),
entity_paired AS (
  SELECT p2.Month, p2.month_str, p2.EntityRecordID,
    COALESCE(p2.company, p1.company) AS Company,
    COALESCE(p1.total_saas, 0) AS p1_saas, p2.total_saas AS p2_saas,
    COALESCE(p1.expiry_lines, 0) AS p1_expiry_lines, COALESCE(p1.saas_lines, 0) AS p1_saas_lines
  FROM entity_monthly p2
  LEFT JOIN entity_monthly p1
    ON p2.EntityRecordID = p1.EntityRecordID
    AND p1.month_str = FORMAT_DATE('%Y-%m', DATE_SUB(p2.Month, INTERVAL 12 MONTH))
  WHERE p2.month_str >= '2023-01'
  UNION ALL
  SELECT
    DATE_ADD(p1.Month, INTERVAL 12 MONTH) AS Month,
    FORMAT_DATE('%Y-%m', DATE_ADD(p1.Month, INTERVAL 12 MONTH)) AS month_str,
    p1.EntityRecordID, p1.company AS Company,
    p1.total_saas AS p1_saas, 0 AS p2_saas,
    p1.expiry_lines AS p1_expiry_lines, p1.saas_lines AS p1_saas_lines
  FROM entity_monthly p1
  LEFT JOIN entity_monthly p2
    ON p1.EntityRecordID = p2.EntityRecordID
    AND p2.month_str = FORMAT_DATE('%Y-%m', DATE_ADD(p1.Month, INTERVAL 12 MONTH))
  WHERE p2.EntityRecordID IS NULL
    AND FORMAT_DATE('%Y-%m', DATE_ADD(p1.Month, INTERVAL 12 MONTH)) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND FORMAT_DATE('%Y-%m', DATE_ADD(p1.Month, INTERVAL 12 MONTH)) >= '2023-01'
),
company_level AS (
  SELECT month_str, Month, Company,
    SUM(p1_saas) AS p1_saas, SUM(p2_saas) AS p2_saas,
    SUM(p1_expiry_lines) AS p1_expiry_lines, SUM(p1_saas_lines) AS p1_saas_lines
  FROM entity_paired GROUP BY 1, 2, 3
),
company_classified AS (
  SELECT month_str, Month, Company, p1_saas, p2_saas,
    CASE WHEN p1_saas > 0 AND NOT (p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines) THEN p1_saas ELSE 0 END AS StartMRR,
    CASE WHEN p1_saas > 0 AND p2_saas = 0 AND NOT (p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines) THEN p1_saas ELSE 0 END AS Cancellations,
    CASE WHEN p1_saas > 0 AND p2_saas > 0 AND p2_saas < p1_saas THEN p1_saas - p2_saas ELSE 0 END AS Downgrades,
    CASE WHEN p1_saas > 0 AND p2_saas > p1_saas THEN p2_saas - p1_saas ELSE 0 END AS Expansions,
    CASE WHEN p1_saas = 0 AND p2_saas > 0 THEN p2_saas ELSE 0 END AS NewMRR
  FROM company_level
)
SELECT
  ep.Month, ep.EntityRecordID, cc.Company,
  CAST(ep.p1_saas AS NUMERIC) AS p1_saas,
  CAST(ep.p2_saas AS NUMERIC) AS p2_saas,
  CAST(CASE WHEN cc.p1_saas > 0 THEN cc.StartMRR * SAFE_DIVIDE(ep.p1_saas, cc.p1_saas) ELSE 0 END AS NUMERIC) AS StartMRR,
  CAST(CASE WHEN cc.p1_saas > 0 THEN cc.Cancellations * SAFE_DIVIDE(ep.p1_saas, cc.p1_saas) ELSE 0 END AS NUMERIC) AS Cancellations,
  CAST(CASE WHEN cc.p1_saas > 0 THEN cc.Downgrades * SAFE_DIVIDE(ep.p1_saas, cc.p1_saas) ELSE 0 END AS NUMERIC) AS Downgrades,
  CAST(CASE WHEN cc.p1_saas > 0 THEN cc.Expansions * SAFE_DIVIDE(ep.p1_saas, cc.p1_saas) ELSE 0 END AS NUMERIC) AS Expansions,
  CAST(CASE WHEN cc.p2_saas > 0 AND cc.p1_saas = 0 THEN cc.NewMRR * SAFE_DIVIDE(ep.p2_saas, cc.p2_saas) ELSE 0 END AS NUMERIC) AS NewMRR,
  vc_dim.Segment, vc_dim.UserTier, vc_dim.HasDEP, vc_dim.AttributionChannel,
  vc_dim.SignupCountry, vc_dim.Vertical, vc_dim.SyncType
FROM entity_paired ep
JOIN company_classified cc ON ep.month_str = cc.month_str AND ep.Company = cc.Company
LEFT JOIN `project-for-method-dw.revenue.int_customers` vc_dim
  ON vc_dim.EntityRecordID = ep.EntityRecordID
  AND vc_dim.Month = CASE WHEN ep.p1_saas > 0 THEN DATE_SUB(ep.Month, INTERVAL 12 MONTH) ELSE ep.Month END
