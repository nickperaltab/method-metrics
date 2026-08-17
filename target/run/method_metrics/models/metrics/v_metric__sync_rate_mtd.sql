

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__sync_rate_mtd`
  OPTIONS(
      description="""Syncs divided by trials, both counted through yesterday, expressed as\na percentage. Shares its elapsed window with everything else on the\nMethod Monday page. Distinct from Sync Rate (#300), which is the\nfull-month ratio.\n""",
    
      labels=[('metric_id', '414'), ('layer', 'metrics'), ('type', 'ratio'), ('status', 'queued'), ('source_table', 'int_method_monday'), ('source_measure_safe', ''), ('depends_on', '55-54')]
    )
  as 

-- Canonical metric: "Sync Rate MTD (through yesterday)"
-- Type: ratio
--
-- Syncs divided by trials, both counted through yesterday:
--   syncs_mtd / trials_mtd
--
-- Emits a PERCENTAGE (50.0), matching Sync Rate #300 and Forecasted Sync
-- Rate #361, so the two tiles can sit side by side without rescaling.
--
-- Distinct from #300, which is the full-month ratio. This one shares its
-- window with everything else on the Method Monday page.
--
-- NULL when trials_mtd is 0 — early in a month that is genuinely undefined,
-- not zero.

SELECT period, CAST(SAFE_DIVIDE(syncs_mtd, trials_mtd) * 100 AS FLOAT64) AS value
FROM `project-for-method-dw`.`revenue`.`int_method_monday`;

