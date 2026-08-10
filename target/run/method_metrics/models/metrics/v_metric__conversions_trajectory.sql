

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__conversions_trajectory`
  OPTIONS(
      description="""Month-end projection of conversions for the in-progress month.\nCounts conversions through yesterday, divides by the current day of\nmonth, and scales to the full month. Looker-compatible: the divisor\nis day_of_month, not day_of_month - 1. Returns exactly one row for\nthe current month \u2014 trajectory has no meaning for a closed month.\n""",
    
      labels=[('metric_id', '296'), ('layer', 'metrics'), ('type', 'derived'), ('status', 'live'), ('verified_at', '2026-08-04'), ('source_table', 'int_conversions'), ('source_measure_safe', 'count_star'), ('depends_on', '56')]
    )
  as 

-- Canonical metric: "Conversions Trajectory" (#296)
-- Type: derived (single-period projection)
--
-- Month-end projection of the in-progress month, Looker-compatible.
-- Formula: conversions through TODAY
--            / EXTRACT(DAY FROM CURRENT_DATE())
--            * days in the current month
--
-- The divisor is day_of_month, NOT day_of_month - 1 (our old Supabase
-- formula, which over-projected) and NOT day_of_month + 1. Derived from a
-- 2026-07-22 Looker read: 51 conversions / 22 * 31 = 71.86, exact.
--
-- Returns exactly ONE row, keyed to the first of the current month.
-- Trajectory is meaningless for a closed month — the actual is the answer
-- there, so no historical rows are emitted.

WITH mtd AS (
  SELECT COUNT(*) AS conversions
  FROM `project-for-method-dw`.`revenue`.`int_conversions`
  WHERE FirstSaaSInvoiceTxnDate >= DATE_TRUNC(CURRENT_DATE(), MONTH)
    AND FirstSaaSInvoiceTxnDate <= CURRENT_DATE()
)
SELECT
  DATE_TRUNC(CURRENT_DATE(), MONTH) AS period,
  SAFE_DIVIDE(
    mtd.conversions,
    EXTRACT(DAY FROM CURRENT_DATE())
  ) * EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE(), MONTH)) AS value
FROM mtd;

