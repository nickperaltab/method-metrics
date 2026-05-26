{{ config(materialized='view') }}

-- Canonical metric: "Monthly NRR %" (#383)
-- Type: derived (cross-model)
-- Formula: (StartMRR - Cancellations - Downgrades + Expansions) / StartMRR

SELECT
  s.period,
  SAFE_DIVIDE(s.value - c.value - d.value + e.value, s.value) AS value
FROM {{ ref('v_metric__monthly_start_mrr') }} s
JOIN {{ ref('v_metric__monthly_cancellations_mrr') }} c USING (period)
JOIN {{ ref('v_metric__monthly_downgrades_mrr') }} d USING (period)
JOIN {{ ref('v_metric__monthly_expansions_mrr') }} e USING (period)
ORDER BY s.period
