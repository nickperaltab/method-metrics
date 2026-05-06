-- ============================================================
-- v_customer_annual_mrr — Annual GRR/NRR primitive foundation
-- Grain: Month × EntityRecordID (12-month cohort comparison)
-- ============================================================
-- Identical structure to v_customer_mrr, but compares P2 to P1 =
-- 12 MONTHS prior instead of 1 month prior. Produces the annual
-- cohort values used by the Customer Segments scorecard.
--
-- ------------------------------------------------------------
-- METHODOLOGY (CEO-confirmed, 2026-04-28)
-- ------------------------------------------------------------
-- Prepay Expiry Income is a one-time write-off of unused prepay
-- balance when Method's accounting closes out a long-dormant
-- relationship (typically 1–3 years after the customer actually
-- stopped paying). It is NOT subscription revenue and must not
-- influence any retention primitive.
--
-- A customer whose ENTIRE Period-1 SaaS revenue was Prepay
-- Expiry Income is excluded from BOTH StartMRR and Cancellations
-- (symmetric exclusion). Their churn was already captured at the
-- time they actually left, in whichever earlier cohort spanned
-- their last actively-paying month.
--
-- This is the "engine methodology" — matches the SaaS Analytics
-- Engine's `SaaS Totals` formula (denominator = Start − PreExpiry).
-- It DIFFERS from the historical board-deck methodology, which
-- left PE-only customers in StartMRR (asymmetric, inflating GRR
-- by ~32bp).
--
-- ------------------------------------------------------------
-- RECONCILIATION vs SaaS Analytics Engine
-- ------------------------------------------------------------
-- Source of truth for verification: the GetPeriodComparisonToExcel
-- API (https://internal1.methodintegration.com/SaasAnalyticsSrv/
-- api/GetPeriodComparisonToExcel) — see scripts/fetch_saas_analytics.py.
--
-- After this methodology change, BQ matches the engine to within
-- ~2bp on Pre-FX GRR for any annual period (Feb 2026: BQ 77.91%
-- vs engine 77.89%). Down/Exp/OtherChurn are penny-exact.
--
-- The residual ~$160 net Start/Cancel diff comes from a structural
-- difference in customer identity:
--   * Engine groups by CompanyAccount string (the customer's
--     account name on each invoice).
--   * BQ groups by EntityRecordID (stable numeric customer ID).
--
-- When a customer renames their CompanyAccount mid-cohort, the
-- engine sees "old name cancelled $X + new name added $Y" and
-- counts the old name as a cancellation. BQ correctly recognizes
-- the same EntityRecordID continuing across the rename. On this
-- specific point BQ is more correct — the engine docs themselves
-- note "viewing NRR by Customer is more accurate, since it handles
-- customers who close one account in order to switch to a new
-- account."
--
-- Net effect: the engine slightly over-counts cancellations from
-- renamed customers; BQ does not. Live with the 2bp residual.
--
-- ------------------------------------------------------------
-- VERIFIED VALUES (post-methodology change, 2026-04-28)
-- ------------------------------------------------------------
-- Feb 2026 Pre-FX (sum of US + CAN, native currency):
--   Start MRR (excl. PE):         $697,629
--   Cancellations (excl. PE):     $93,002
--   Downgrades:                   $61,141
--   Expansions:                   $86,313
--   Annual Pre-FX GRR:            77.91%
--   (Engine equivalent: 77.89% — 2bp residual is rename handling)
-- ============================================================

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_customer_annual_mrr` AS

WITH entity_monthly AS (
  SELECT
    FORMAT_DATE('%Y-%m', TxnDate)                                              AS month_str,
    DATE_TRUNC(TxnDate, MONTH)                                                 AS Month,
    EntityRecordID,
    -- ORDER BY adds CompanyAccount ASC as a deterministic tie-breaker.
    -- Without it, equal-revenue CompanyAccounts under one entity caused the
    -- view to pick different "winning" names on different query plans, which
    -- then broke the final JOIN ON Company.
    ARRAY_AGG(CompanyAccount ORDER BY SaaSAmount DESC, CompanyAccount ASC LIMIT 1)[OFFSET(0)] AS company,
    SUM(SaaSAmount)                                                            AS total_saas,
    COUNTIF(SaaSAmount != 0)                                                   AS saas_lines,
    COUNTIF(SaaSAmount != 0 AND AccountFullName LIKE '%Prepay Expiry Income%') AS expiry_lines
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE TxnDate >= '2021-12-01'
    AND FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    -- Exclude internal Method accounts (m11/m18 prefixes) — matches Looker
    -- and SaaS Analytics Engine filters.
    AND CompanyAccount NOT LIKE 'm11%'
    AND CompanyAccount NOT LIKE 'm18%'
  GROUP BY 1, 2, 3
),

-- P1/P2 pairing at EntityRecordID grain (12-month shift).
-- Path A: entity appeared in P2 (may or may not have a P1 row 12m ago).
-- Path B: entity had P1 12m ago but no P2 now — the churn event row.
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
          DATE_SUB(p2.Month, INTERVAL 12 MONTH))
  WHERE p2.month_str >= '2023-01'

  UNION ALL

  -- Path B: entity had P1 12m ago but disappeared 12m later (churn)
  SELECT
    DATE_ADD(p1.Month, INTERVAL 12 MONTH)                 AS Month,
    FORMAT_DATE('%Y-%m',
      DATE_ADD(p1.Month, INTERVAL 12 MONTH))              AS month_str,
    p1.EntityRecordID,
    p1.company                                            AS Company,
    p1.total_saas                                         AS p1_saas,
    0                                                     AS p2_saas,
    p1.expiry_lines                                       AS p1_expiry_lines,
    p1.saas_lines                                         AS p1_saas_lines
  FROM entity_monthly p1
  LEFT JOIN entity_monthly p2
    ON  p1.EntityRecordID = p2.EntityRecordID
    AND p2.month_str = FORMAT_DATE('%Y-%m',
          DATE_ADD(p1.Month, INTERVAL 12 MONTH))
  WHERE p2.EntityRecordID IS NULL
    AND FORMAT_DATE('%Y-%m', DATE_ADD(p1.Month, INTERVAL 12 MONTH))
          < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND FORMAT_DATE('%Y-%m', DATE_ADD(p1.Month, INTERVAL 12 MONTH))
          >= '2023-01'
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

-- Compute classification amounts at company level.
-- StartMRR and Cancellations BOTH apply the all-PE exclusion (symmetric).
company_classified AS (
  SELECT
    month_str,
    Month,
    Company,
    p1_saas,
    p2_saas,
    CASE WHEN p1_saas > 0
              AND NOT (p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines)
         THEN p1_saas ELSE 0 END
      AS StartMRR,
    CASE WHEN p1_saas > 0 AND p2_saas = 0
              AND NOT (p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines)
         THEN p1_saas ELSE 0 END
      AS Cancellations,
    CASE WHEN p1_saas > 0 AND p2_saas > 0 AND p2_saas < p1_saas
         THEN p1_saas - p2_saas ELSE 0 END
      AS Downgrades,
    CASE WHEN p1_saas > 0 AND p2_saas > p1_saas
         THEN p2_saas - p1_saas ELSE 0 END
      AS Expansions,
    CASE WHEN p1_saas = 0 AND p2_saas > 0
         THEN p2_saas ELSE 0 END
      AS NewMRR
  FROM company_level
)

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
  -- For existing customers (p1>0): use 12-month-prior dims (reflects the
  --   segment the customer was in at the start of the annual cohort).
  -- For new customers (p1=0): use current-month dims.
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
    WHEN ep.p1_saas > 0 THEN DATE_SUB(ep.Month, INTERVAL 12 MONTH)
    ELSE ep.Month
  END
