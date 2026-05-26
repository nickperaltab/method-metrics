

  create or replace view `project-for-method-dw`.`revenue`.`v_metric__monthly_nrr`
  OPTIONS(
      description="""Monthly Net Revenue Retention \u2014 fraction of last month's MRR retained\nthis month INCLUDING expansion from existing customers. Formula:\n(StartMRR - Cancellations - Downgrades + Expansions) / StartMRR.\nPre-FX. Typical values 97-99% \u2014 expansion mostly offsets churn at\nMethod's scale. Uses CEO-confirmed symmetric Prepay Expiry exclusion.\nFor board reporting, reconcile against the board deck first\n(~4-6bp methodology gap).\n""",
    
      labels=[('metric_id', '383'), ('layer', 'metrics'), ('type', 'derived'), ('status', 'live'), ('verified_at', '2026-05-14'), ('source_table', ''), ('source_measure_safe', ''), ('depends_on', '378-379-380-381')]
    )
  as 

-- Canonical metric: "Monthly NRR %" (#383)
-- Type: derived (cross-model)
-- Formula: (StartMRR - Cancellations - Downgrades + Expansions) / StartMRR

SELECT
  s.period,
  SAFE_DIVIDE(s.value - c.value - d.value + e.value, s.value) AS value
FROM `project-for-method-dw`.`revenue`.`v_metric__monthly_start_mrr` s
JOIN `project-for-method-dw`.`revenue`.`v_metric__monthly_cancellations_mrr` c USING (period)
JOIN `project-for-method-dw`.`revenue`.`v_metric__monthly_downgrades_mrr` d USING (period)
JOIN `project-for-method-dw`.`revenue`.`v_metric__monthly_expansions_mrr` e USING (period)
ORDER BY s.period;

