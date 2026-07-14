
  
    

    create or replace table `project-for-method-dw`.`revenue`.`int_customer_mrr`
      
    
    

    
    OPTIONS(
      description="""Per-customer per-month MRR with movement classification. Migrated from the\norphaned BQ view 2026-06-03 (see knowledge/verified-queries/int_customer_mrr-pre-migration-ddl.sql).\nParity-verified via scripts/parity_int_customer_mrr.py (MRR math bit-identical to legacy).\nMethodology: CEO-confirmed symmetric Prepay-Expiry exclusion (2026-04-28).\nMovements are PARALLEL columns (NewMRR/Expansions/Downgrades/Cancellations), not a single movement_kind.\n"""
    )
    as (
      -- Migrated from the orphaned BQ view of the same name.
-- Original DDL captured in knowledge/verified-queries/int_customer_mrr-pre-migration-ddl.sql.
-- Parity-verified via scripts/parity_int_customer_mrr.py (Task 5 of the validation plan).
--
-- Methodology: CEO-confirmed symmetric Prepay Expiry exclusion (2026-04-28).
-- See memory: project_annual_retention.
--
-- Grain: one row per (Month, EntityRecordID). Movement columns
-- (NewMRR, Expansions, Downgrades, Cancellations) are PARALLEL — there is no
-- single movement_kind dimension. A customer-month with all four = 0 is a
-- steady-state row.



WITH entity_monthly AS (
  SELECT
    FORMAT_DATE('%Y-%m', TxnDate) AS month_str,
    DATE_TRUNC(TxnDate, MONTH) AS Month,
    EntityRecordID,
    ARRAY_AGG(CompanyAccount ORDER BY SaaSAmount DESC, CompanyAccount ASC LIMIT 1)[OFFSET(0)] AS company,
    SUM(SaaSAmount) AS total_saas,
    COUNTIF(SaaSAmount != 0) AS saas_lines,
    COUNTIF(SaaSAmount != 0 AND AccountFullName LIKE '%Prepay Expiry Income%') AS expiry_lines
  FROM `project-for-method-dw`.`revenue`.`TransLineFlattened`
  WHERE TxnDate >= '2021-12-01'
    AND FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND CompanyAccount NOT LIKE 'm11%'
    AND CompanyAccount NOT LIKE 'm18%'
  GROUP BY 1, 2, 3
),
entity_paired AS (
  SELECT p2.Month, p2.month_str, p2.EntityRecordID,
    COALESCE(p2.company, p1.company) AS Company,
    COALESCE(p1.total_saas, 0) AS p1_saas, p2.total_saas AS p2_saas,
    COALESCE(p1.expiry_lines, 0) AS p1_expiry_lines,
    COALESCE(p1.saas_lines, 0) AS p1_saas_lines
  FROM entity_monthly p2
  LEFT JOIN entity_monthly p1
    ON p2.EntityRecordID = p1.EntityRecordID
    AND p1.month_str = FORMAT_DATE('%Y-%m', DATE_SUB(p2.Month, INTERVAL 1 MONTH))
  WHERE p2.month_str >= '2022-01'
  UNION ALL
  SELECT
    DATE_ADD(p1.Month, INTERVAL 1 MONTH) AS Month,
    FORMAT_DATE('%Y-%m', DATE_ADD(p1.Month, INTERVAL 1 MONTH)) AS month_str,
    p1.EntityRecordID, p1.company AS Company,
    p1.total_saas AS p1_saas, 0 AS p2_saas,
    p1.expiry_lines AS p1_expiry_lines, p1.saas_lines AS p1_saas_lines
  FROM entity_monthly p1
  LEFT JOIN entity_monthly p2
    ON p1.EntityRecordID = p2.EntityRecordID
    AND p2.month_str = FORMAT_DATE('%Y-%m', DATE_ADD(p1.Month, INTERVAL 1 MONTH))
  WHERE p2.EntityRecordID IS NULL
    AND FORMAT_DATE('%Y-%m', DATE_ADD(p1.Month, INTERVAL 1 MONTH)) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND FORMAT_DATE('%Y-%m', DATE_ADD(p1.Month, INTERVAL 1 MONTH)) >= '2022-01'
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
LEFT JOIN `project-for-method-dw`.`revenue`.`int_customers` vc_dim
  ON vc_dim.EntityRecordID = ep.EntityRecordID
  AND vc_dim.Month = CASE WHEN ep.p1_saas > 0 THEN DATE_SUB(ep.Month, INTERVAL 1 MONTH) ELSE ep.Month END
    );
  