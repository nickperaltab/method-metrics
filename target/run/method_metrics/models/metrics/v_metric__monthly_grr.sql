

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__monthly_grr`
  OPTIONS(
      description="""Monthly Gross Revenue Retention \u2014 fraction of last month's MRR\nretained this month, excluding expansion. Formula: (StartMRR -\nCancellations - Downgrades) / StartMRR. Pre-FX. Typical values\n95-97%. Uses CEO-confirmed symmetric Prepay Expiry exclusion;\ndiverges from board-deck monthly GRR by ~4-6bp because the deck\nuses asymmetric methodology. For any number heading to the board,\nreconcile against the deck first.\n""",
    
      labels=[('metric_id', '382'), ('layer', 'metrics'), ('type', 'derived'), ('status', 'live'), ('verified_at', '2026-05-14'), ('source_table', ''), ('source_measure_safe', ''), ('depends_on', '378-379-380')]
    )
  as 

-- Canonical metric: "Monthly GRR %" (#382)
-- Type: derived (cross-model)
-- Formula: (StartMRR - Cancellations - Downgrades) / StartMRR

SELECT
  s.period,
  SAFE_DIVIDE(s.value - c.value - d.value, s.value) AS value
FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__monthly_start_mrr` s
JOIN `project-for-method-dw`.`revenue_metrics`.`v_metric__monthly_cancellations_mrr` c USING (period)
JOIN `project-for-method-dw`.`revenue_metrics`.`v_metric__monthly_downgrades_mrr` d USING (period)
ORDER BY s.period;

