-- ============================================================
-- int_customer_mrr — Monthly GRR/NRR primitive foundation
-- Grain: Month × EntityRecordID  (1-month P1/P2 cohort)
-- ============================================================
-- Per-row classification columns for every MRR event type.
-- Based on Justin's verified SQL pattern (monthly-start-mrr.sql,
-- monthly-cancellations.sql, monthly-downgrades.sql, monthly-expansion.sql).
--
-- ------------------------------------------------------------
-- METHODOLOGY (CEO-confirmed 2026-04-28)
-- ------------------------------------------------------------
-- Prepay Expiry Income is a one-time write-off of unused prepay
-- balance when Method's accounting closes out a long-dormant
-- relationship (typically 1–3 years after the customer actually
-- stopped paying). It is NOT subscription revenue and must not
-- influence retention primitives.
--
-- A customer whose ENTIRE Period-1 SaaS revenue was Prepay Expiry
-- Income is excluded from BOTH StartMRR and Cancellations
-- (symmetric exclusion). Their actual churn was already captured
-- in an earlier monthly cohort (the one whose P1 spanned their
-- last actively-paying month).
--
-- ------------------------------------------------------------
-- HOW THIS DIFFERS FROM BOARD MONTHLY REPORTING
-- ------------------------------------------------------------
-- The USD Rates KPI Deck "Monthly Detail" / "Monthly Summary" tabs
-- use the asymmetric methodology: PE-only customers are excluded
-- from Cancellations (categorized as OtherChurn) but LEFT IN
-- StartMRR. That artificially inflates monthly GRR by ~4–6bp.
--
-- This view (post-2026-04-28) uses the symmetric methodology
-- consistent with int_customer_annual_mrr and the SaaS Analytics
-- Engine's SaaS Totals formula. So:
--
--   Monthly GRR (this view, NEW): ~95–97% Pre-FX
--   Monthly GRR (board deck, OLD): ~95–97% Pre-FX, but ~4–6bp HIGHER
--
-- The two will not penny-match. If someone references the deck's
-- monthly retention number, expect a few bp gap.
--
-- ------------------------------------------------------------
-- RECONCILIATION vs SaaS Analytics Engine
-- ------------------------------------------------------------
-- Source of truth: GetPeriodComparisonToExcel API, monthly mode.
-- See scripts/fetch_saas_analytics.py.
--
-- BQ groups by EntityRecordID (stable customer ID); engine groups
-- by CompanyAccount string. Customer renames cause small paired
-- diffs that net to ~$100–$1000 on Start/Cancel; on this point BQ
-- is more correct (engine treats renames as cancellations). See
-- int_customer_annual_mrr.sql for the full reconciliation note.
--
-- ------------------------------------------------------------
-- VERIFIED VALUES (post-methodology change, 2026-04-28)
-- ------------------------------------------------------------
-- Feb 2026 monthly:
--   StartMRR (excl. PE):   ~$804.5K  (was $814.7K under old methodology)
--   Cancellations:         ~$17.8K   (unchanged — already excluded PE)
--   Downgrades:            ~$20.4K
--   Expansions:            ~$18.6K
--   Monthly Pre-FX GRR:    ~95.25%   (was 95.31% — dropped ~6bp)
--
-- Cancel/Downgrades/Expansions remain consistent with Justin's verified
-- exact-match values (2026-03-27): Feb 2026 Cancel $17,775, Down $20,448,
-- Exp $18,579 (within rounding).
--
-- ------------------------------------------------------------
-- KEY DESIGN DECISIONS
-- ------------------------------------------------------------
--   1. Grain: Month × EntityRecordID (preserves EntityRecordID through churn UNION).
--   2. CompanyAccount aggregation before classification: a company with two
--      entities where one churns and one stays is a downgrade, not a cancel.
--      Classification is computed at company_classified CTE, then pro-rated
--      back to each entity by p1_saas weight. For single-entity companies
--      (the vast majority) the ratio is exactly 1.0.
--   3. Prepay-expiry exclusion (symmetric): cancellations where ALL prior-month
--      non-zero SaaS lines are 'Prepay Expiry Income' are excluded from BOTH
--      StartMRR and Cancellations. (Justin's monthly-cancellations.sql lines
--      80-82 implements only the Cancellation half — this view extends it
--      to StartMRR per the CEO-confirmed methodology.)
--   4. Dimensions sourced from int_customers: existing customers use prior-month
--      dims (so churn/downgrade rows reflect the segment they were in before
--      the event); new customers use current-month dims. int_customers covers
--      2024-01-01+, so older rows have NULL dims — acceptable.
-- ============================================================

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.int_customer_mrr` AS

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

-- Compute classification amounts at company level.
-- StartMRR and Cancellations BOTH apply the all-PE exclusion (symmetric).
-- This is the CEO-confirmed methodology and DIFFERS from the board deck
-- monthly tabs, which leave PE-only customers in StartMRR (asymmetric).
company_classified AS (
  SELECT
    month_str,
    Month,
    Company,
    p1_saas,
    p2_saas,
    -- StartMRR: positive prior-month revenue, EXCLUDING PE-only customers
    CASE WHEN p1_saas > 0
              AND NOT (p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines)
         THEN p1_saas ELSE 0 END
      AS StartMRR,
    -- Cancellations: P1>0, P2=0, EXCLUDING PE-only customers (OtherChurn)
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
  -- Dimensions sourced from int_customers.
  -- For existing customers (p1>0): use prior month so churn/downgrade rows
  --   get the segment they were in before the event.
  -- For new customers (p1=0): use current month.
  -- int_customers only covers 2024-01-01+; older rows will have NULL dims.
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
LEFT JOIN `project-for-method-dw.revenue.int_customers` vc_dim
  ON  vc_dim.EntityRecordID = ep.EntityRecordID
  AND vc_dim.Month = CASE
    WHEN ep.p1_saas > 0 THEN DATE_SUB(ep.Month, INTERVAL 1 MONTH)
    ELSE ep.Month
  END
