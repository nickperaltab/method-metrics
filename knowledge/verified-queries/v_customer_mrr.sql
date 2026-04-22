-- ============================================================
-- v_customer_mrr — GRR primitive foundation
-- Grain: Month × EntityRecordID
-- ============================================================
-- Per-row classification columns for every MRR event type.
-- Based on Justin's verified SQL pattern (monthly-start-mrr.sql,
-- monthly-cancellations.sql, monthly-downgrades.sql,
-- monthly-expansion.sql) — all verified exact-match 2026-03-27.
--
-- Verified 2026-04-22:
--   Feb 2026: StartMRR=814,733.33  Cancellations=17,774.85
--             Downgrades=20,447.60  Expansions=18,578.84  ✓
--   Oct 2025: StartMRR=782,818.21  Cancellations=9,645.14
--             Downgrades=12,556.00  Expansions=15,290.67  ✓
--   (Cancel/Downgrades/Expansions match CSV snapshot exactly for both months)
--   (StartMRR delta of $64/$20 vs available CSV snapshot is a known
--    CSV-version artifact — Justin verified against a later spreadsheet revision)
--
-- Key design decisions:
--   1. Grain: Month × EntityRecordID (preserves EntityRecordID through churn UNION).
--   2. CompanyAccount aggregation before classification: a company with two
--      entities where one churns and one stays is a downgrade, not a cancel.
--      Classification is computed at company_classified CTE, then pro-rated
--      back to each entity by p1_saas weight. For single-entity companies
--      (the vast majority) the ratio is exactly 1.0.
--   3. Prepay-expiry exclusion (OtherChurn): cancellations where ALL prior-month
--      non-zero SaaS lines are 'Prepay Expiry Income' are excluded from
--      Cancellations (but still included in StartMRR). Matches Justin's logic
--      in monthly-cancellations.sql lines 80-82 exactly.
--   4. Dimensions sourced from v_customers: existing customers use prior-month
--      dims (so churn/downgrade rows reflect the segment they were in before
--      the event); new customers use current-month dims. v_customers covers
--      2024-01-01+, so older rows have NULL dims — acceptable.
-- ============================================================

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_customer_mrr` AS

WITH entity_monthly AS (
  SELECT
    FORMAT_DATE('%Y-%m', TxnDate)                                              AS month_str,
    DATE_TRUNC(TxnDate, MONTH)                                                 AS Month,
    EntityRecordID,
    ARRAY_AGG(CompanyAccount ORDER BY SaaSAmount DESC LIMIT 1)[OFFSET(0)]      AS company,
    SUM(SaaSAmount)                                                            AS total_saas,
    COUNTIF(SaaSAmount != 0)                                                   AS saas_lines,
    COUNTIF(SaaSAmount != 0 AND AccountFullName LIKE '%Prepay Expiry Income%') AS expiry_lines
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE TxnDate >= '2021-12-01'
    AND FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
  GROUP BY 1, 2, 3
),

-- P1/P2 pairing at EntityRecordID grain.
-- Path A: entity appeared in P2 (may or may not have a P1 row).
-- Path B: entity had P1 but no P2 — the churn event row.
entity_paired AS (
  -- Path A: entity has a row in this month (P2)
  SELECT
    p2.Month,
    p2.month_str,
    p2.EntityRecordID,
    COALESCE(p2.company, p1.company)   AS Company,
    COALESCE(p1.total_saas, 0)         AS p1_saas,
    p2.total_saas                      AS p2_saas,
    COALESCE(p1.expiry_lines, 0)       AS p1_expiry_lines,
    COALESCE(p1.saas_lines, 0)         AS p1_saas_lines
  FROM entity_monthly p2
  LEFT JOIN entity_monthly p1
    ON  p2.EntityRecordID = p1.EntityRecordID
    AND p1.month_str = FORMAT_DATE('%Y-%m',
          DATE_SUB(p2.Month, INTERVAL 1 MONTH))
  WHERE p2.month_str >= '2022-01'

  UNION ALL

  -- Path B: entity had P1 but disappeared in the next month (churn)
  SELECT
    DATE_ADD(p1.Month, INTERVAL 1 MONTH)                 AS Month,
    FORMAT_DATE('%Y-%m',
      DATE_ADD(p1.Month, INTERVAL 1 MONTH))              AS month_str,
    p1.EntityRecordID,
    p1.company                                           AS Company,
    p1.total_saas                                        AS p1_saas,
    0                                                    AS p2_saas,
    p1.expiry_lines                                      AS p1_expiry_lines,
    p1.saas_lines                                        AS p1_saas_lines
  FROM entity_monthly p1
  LEFT JOIN entity_monthly p2
    ON  p1.EntityRecordID = p2.EntityRecordID
    AND p2.month_str = FORMAT_DATE('%Y-%m',
          DATE_ADD(p1.Month, INTERVAL 1 MONTH))
  WHERE p2.EntityRecordID IS NULL
    AND FORMAT_DATE('%Y-%m', DATE_ADD(p1.Month, INTERVAL 1 MONTH))
          < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND FORMAT_DATE('%Y-%m', DATE_ADD(p1.Month, INTERVAL 1 MONTH))
          >= '2022-01'
),

-- Aggregate to CompanyAccount level for event classification.
-- Multi-entity companies must be classified as a unit: one entity cancelling
-- while another stays is a downgrade, not a cancellation.
company_level AS (
  SELECT
    month_str,
    Month,
    Company,
    SUM(p1_saas)         AS p1_saas,
    SUM(p2_saas)         AS p2_saas,
    SUM(p1_expiry_lines) AS p1_expiry_lines,
    SUM(p1_saas_lines)   AS p1_saas_lines
  FROM entity_paired
  GROUP BY 1, 2, 3
),

-- Compute classification amounts at company level (matches Justin's verified SQL exactly).
company_classified AS (
  SELECT
    month_str,
    Month,
    Company,
    p1_saas,
    p2_saas,
    -- StartMRR: any company with positive prior-month revenue
    CASE WHEN p1_saas > 0 THEN p1_saas ELSE 0 END
      AS StartMRR,
    -- Cancellations: P1>0, P2=0, excluding prepay-expiry-only (OtherChurn)
    CASE WHEN p1_saas > 0 AND p2_saas = 0
              AND NOT (p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines)
         THEN p1_saas ELSE 0 END
      AS Cancellations,
    -- Downgrades: still active but P2 < P1
    CASE WHEN p1_saas > 0 AND p2_saas > 0 AND p2_saas < p1_saas
         THEN p1_saas - p2_saas ELSE 0 END
      AS Downgrades,
    -- Expansions: still active but P2 > P1
    CASE WHEN p1_saas > 0 AND p2_saas > p1_saas
         THEN p2_saas - p1_saas ELSE 0 END
      AS Expansions,
    -- NewMRR: first appearance (P1=0, P2>0)
    CASE WHEN p1_saas = 0 AND p2_saas > 0
         THEN p2_saas ELSE 0 END
      AS NewMRR
  FROM company_level
)

-- Final output: EntityRecordID × Month grain.
-- Company-level classification amounts are distributed back to each entity
-- pro-rata by p1_saas (or p2_saas for new customers). For single-entity
-- companies (the vast majority) the ratio is exactly 1.0.
-- Monthly SUM() totals are algebraically identical to company_classified SUM().
SELECT
  ep.Month,
  ep.EntityRecordID,
  cc.Company,
  CAST(ep.p1_saas AS NUMERIC)   AS p1_saas,
  CAST(ep.p2_saas AS NUMERIC)   AS p2_saas,
  CAST(
    CASE WHEN cc.p1_saas > 0
         THEN cc.StartMRR    * SAFE_DIVIDE(ep.p1_saas, cc.p1_saas)
         ELSE 0 END
  AS NUMERIC) AS StartMRR,
  CAST(
    CASE WHEN cc.p1_saas > 0
         THEN cc.Cancellations * SAFE_DIVIDE(ep.p1_saas, cc.p1_saas)
         ELSE 0 END
  AS NUMERIC) AS Cancellations,
  CAST(
    CASE WHEN cc.p1_saas > 0
         THEN cc.Downgrades  * SAFE_DIVIDE(ep.p1_saas, cc.p1_saas)
         ELSE 0 END
  AS NUMERIC) AS Downgrades,
  CAST(
    CASE WHEN cc.p1_saas > 0
         THEN cc.Expansions  * SAFE_DIVIDE(ep.p1_saas, cc.p1_saas)
         ELSE 0 END
  AS NUMERIC) AS Expansions,
  CAST(
    CASE WHEN cc.p2_saas > 0 AND cc.p1_saas = 0
         THEN cc.NewMRR * SAFE_DIVIDE(ep.p2_saas, cc.p2_saas)
         ELSE 0 END
  AS NUMERIC) AS NewMRR,
  -- Dimensions sourced from v_customers.
  -- For existing customers (p1>0): use prior month so churn/downgrade rows
  --   get the segment they were in before the event.
  -- For new customers (p1=0): use current month.
  -- v_customers only covers 2024-01-01+; older rows will have NULL dims.
  vc_dim.Segment,
  vc_dim.UserTier,
  vc_dim.HasDEP,
  vc_dim.AttributionChannel,
  vc_dim.SignupCountry,
  vc_dim.Vertical,
  vc_dim.SyncType
FROM entity_paired ep
JOIN company_classified cc
  ON  ep.month_str = cc.month_str
  AND ep.Company   = cc.Company
LEFT JOIN `project-for-method-dw.revenue.v_customers` vc_dim
  ON  vc_dim.EntityRecordID = ep.EntityRecordID
  AND vc_dim.Month = CASE
    WHEN ep.p1_saas > 0 THEN DATE_SUB(ep.Month, INTERVAL 1 MONTH)
    ELSE ep.Month
  END
