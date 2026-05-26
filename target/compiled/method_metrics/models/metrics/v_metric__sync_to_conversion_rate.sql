

-- Canonical metric: "Sync-to-Conversion Rate" (#301)
-- Type: ratio (cross-model)
-- Formula: SAFE_DIVIDE(conversions, syncs) per period

SELECT
  COALESCE(c.period, s.period) AS period,
  SAFE_DIVIDE(c.value, s.value) AS value
FROM `project-for-method-dw`.`revenue`.`v_metric__conversions` c
FULL OUTER JOIN `project-for-method-dw`.`revenue`.`v_metric__syncs` s
  ON c.period = s.period
ORDER BY 1