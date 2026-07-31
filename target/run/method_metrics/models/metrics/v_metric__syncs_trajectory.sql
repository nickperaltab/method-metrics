

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__syncs_trajectory`
  OPTIONS(
      description="""Month-end projection of sync events for the in-progress month.\nCounts syncs through yesterday, divides by the current day of month,\nand scales to the full month. Same divisor convention as Conversions\nTrajectory (#296) so the two can be divided into a rate. Returns\nexactly one row for the current month.\n""",
    
      labels=[('metric_id', '295'), ('layer', 'metrics'), ('type', 'derived'), ('status', 'queued'), ('source_table', 'int_syncs'), ('source_measure_safe', 'count_star'), ('depends_on', '55')]
    )
  as 

-- Canonical metric: "Syncs Trajectory" (#295)
-- Type: derived (single-period projection)
--
-- Month-end projection of the in-progress month. Same divisor convention
-- as v_metric__conversions_trajectory (day_of_month, counting through
-- yesterday) — the two are divided by each other to produce the Sync
-- Conversion Rate Trajectory, so they must agree on convention.
--
-- Returns exactly ONE row, keyed to the first of the current month.

WITH mtd AS (
  SELECT COUNT(*) AS syncs
  FROM `project-for-method-dw`.`revenue`.`int_syncs`
  WHERE SyncDate >= DATE_TRUNC(CURRENT_DATE(), MONTH)
    AND SyncDate < CURRENT_DATE()
)
SELECT
  DATE_TRUNC(CURRENT_DATE(), MONTH) AS period,
  SAFE_DIVIDE(
    mtd.syncs,
    EXTRACT(DAY FROM CURRENT_DATE())
  ) * EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE(), MONTH)) AS value
FROM mtd;

