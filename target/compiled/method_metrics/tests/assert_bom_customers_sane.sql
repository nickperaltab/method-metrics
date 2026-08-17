-- Regression guard for the 2026-08-17 Churn Rate bug: int_method_monday's
-- bom_customers was pointed at the CURRENT month's int_bom_customers row,
-- which is a running, incomplete accumulation (billing transactions land
-- across the month) rather than a settled count -- Aug 2026 read 2,171
-- mid-month against July's settled 3,788, a -43% understatement that
-- inflated churn_rate_mtd/churn_rate_trajectory by roughly 75%.
--
-- The fix (see int_method_monday.sql) reads the PRIOR month's row
-- instead, matching #344's own pre-existing chart_sql. This test does NOT
-- recompute that expression (it would pass by construction and catch
-- nothing) -- it independently re-derives what the prior month's own
-- settled count actually is, straight from int_bom_customers, and checks
-- int_method_monday.bom_customers sits within a sane +/-10% band of it.
--
-- If a future edit reverts to reading the current month's row directly,
-- this fails loudly (a partial-month count deviates by ~40%+ from the
-- prior month's settled count in every month checked historically) instead
-- of silently inflating a rate on a board deck.
--
-- Returns the offending row; empty result = pass.

WITH mm AS (
  SELECT period, bom_customers
  FROM `project-for-method-dw`.`revenue`.`int_method_monday`
),
prior_month_actual AS (
  SELECT COUNT(DISTINCT bc.CompanyAccount) AS settled_bom
  FROM `project-for-method-dw`.`revenue`.`int_bom_customers` bc, mm
  WHERE DATE_TRUNC(bc.TxnDate, MONTH) = DATE_SUB(mm.period, INTERVAL 1 MONTH)
)
SELECT
  mm.period,
  mm.bom_customers,
  p.settled_bom,
  SAFE_DIVIDE(mm.bom_customers - p.settled_bom, p.settled_bom) * 100 AS pct_off
FROM mm, prior_month_actual p
WHERE p.settled_bom = 0
   OR ABS(SAFE_DIVIDE(mm.bom_customers - p.settled_bom, p.settled_bom)) > 0.10