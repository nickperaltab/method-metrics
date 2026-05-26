

  create or replace view `project-for-method-dw`.`revenue`.`v_metric__annual_grr`
  OPTIONS(
      description="""Annual Gross Revenue Retention \u2014 fraction of last year's MRR retained\nthis year-end cohort, excluding expansion. Formula: (Annual StartMRR\n- Annual Cancellations - Annual Downgrades) / Annual StartMRR.\nPre-FX. Typical values 76-78%. Lower than monthly GRR because more\nchurn accumulates over 12 months. Uses CEO-confirmed methodology;\nreconcile against board deck before external use.\n""",
    
      labels=[('metric_id', '388'), ('layer', 'metrics'), ('type', 'derived'), ('status', 'live'), ('verified_at', '2026-05-14'), ('source_table', ''), ('source_measure_safe', ''), ('depends_on', '384-385-386')]
    )
  as 

-- Canonical metric: "Annual GRR %" (#388)
-- Type: derived (cross-model)
-- Formula: (Annual StartMRR - Annual Cancellations - Annual Downgrades) / Annual StartMRR

SELECT
  s.period,
  SAFE_DIVIDE(s.value - c.value - d.value, s.value) AS value
FROM `project-for-method-dw`.`revenue`.`v_metric__annual_start_mrr` s
JOIN `project-for-method-dw`.`revenue`.`v_metric__annual_cancellations_mrr` c USING (period)
JOIN `project-for-method-dw`.`revenue`.`v_metric__annual_downgrades_mrr` d USING (period)
ORDER BY s.period;

