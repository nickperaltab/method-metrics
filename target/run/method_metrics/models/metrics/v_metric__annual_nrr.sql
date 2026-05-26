

  create or replace view `project-for-method-dw`.`revenue`.`v_metric__annual_nrr`
  OPTIONS(
      description="""Annual Net Revenue Retention \u2014 fraction of last year's MRR retained\nthis year-end cohort INCLUDING expansion from existing customers.\nFormula: (Annual StartMRR - Annual Cancellations - Annual Downgrades\n+ Annual Expansions) / Annual StartMRR. Pre-FX. Typical values\n88-90%. Lower than monthly NRR because more churn accumulates over\n12 months. Uses CEO-confirmed methodology; reconcile against board\ndeck before external use.\n""",
    
      labels=[('metric_id', '389'), ('layer', 'metrics'), ('type', 'derived'), ('status', 'live'), ('verified_at', '2026-05-14'), ('source_table', ''), ('source_measure_safe', ''), ('depends_on', '384-385-386-387')]
    )
  as 

-- Canonical metric: "Annual NRR %" (#389)
-- Type: derived (cross-model)
-- Formula: (Annual StartMRR - Annual Cancellations - Annual Downgrades + Annual Expansions) / Annual StartMRR

SELECT
  s.period,
  SAFE_DIVIDE(s.value - c.value - d.value + e.value, s.value) AS value
FROM `project-for-method-dw`.`revenue`.`v_metric__annual_start_mrr` s
JOIN `project-for-method-dw`.`revenue`.`v_metric__annual_cancellations_mrr` c USING (period)
JOIN `project-for-method-dw`.`revenue`.`v_metric__annual_downgrades_mrr` d USING (period)
JOIN `project-for-method-dw`.`revenue`.`v_metric__annual_expansions_mrr` e USING (period)
ORDER BY s.period;

