

-- Canonical metric: "Annual GRR %" (#388)
-- Type: derived (cross-model)
-- Formula: (Annual StartMRR - Annual Cancellations - Annual Downgrades) / Annual StartMRR

SELECT
  s.period,
  SAFE_DIVIDE(s.value - c.value - d.value, s.value) AS value
FROM `project-for-method-dw`.`revenue`.`v_metric__annual_start_mrr` s
JOIN `project-for-method-dw`.`revenue`.`v_metric__annual_cancellations_mrr` c USING (period)
JOIN `project-for-method-dw`.`revenue`.`v_metric__annual_downgrades_mrr` d USING (period)
ORDER BY s.period