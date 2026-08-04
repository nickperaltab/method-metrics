-- Build actual result given inputs
WITH
            	`project-for-method-dw_revenue_metrics_v_metric__conversions_trajectory` as (SELECT *  FROM UNNEST([STRUCT(CAST('2026-07-01' AS DATE) AS period, CAST(10.0 AS FLOAT64) AS value)])),
  	`project-for-method-dw_revenue_metrics_v_metric__syncs_trajectory` as (SELECT *  FROM UNNEST([STRUCT(CAST('2026-07-01' AS DATE) AS period, CAST(0.0 AS FLOAT64) AS value)])),
  	`project-for-method-dw_revenue_metrics_v_metric__sync_conversion_rate_trajectory_expect` as (SELECT *  FROM UNNEST([STRUCT(CAST('2026-07-01' AS DATE) AS period, CAST(NULL AS FLOAT64) AS value)])),
  	`project-for-method-dw_revenue_metrics_v_metric__sync_conversion_rate_trajectory_actual` as (

-- Canonical metric: "Sync Conversion Rate Trajectory"
-- Type: ratio (cross-model)
-- Formula: SAFE_DIVIDE(conversions trajectory, syncs trajectory)
--
-- Same-month, no lag — matching v_metric__sync_to_conversion_rate. Both
-- inputs project the in-progress month to month-end using the same
-- day_of_month divisor, so the ratio is internally consistent.
--
-- Emits a decimal rate (0.28), not a percentage (28.0).

SELECT
  COALESCE(c.period, s.period) AS period,
  SAFE_DIVIDE(c.value, s.value) AS value
FROM `project-for-method-dw_revenue_metrics_v_metric__conversions_trajectory` c
FULL OUTER JOIN `project-for-method-dw_revenue_metrics_v_metric__syncs_trajectory` s
  ON c.period = s.period
ORDER BY 1
)
        (SELECT period, value, 'actual' AS actual_or_expected FROM `project-for-method-dw_revenue_metrics_v_metric__sync_conversion_rate_trajectory_actual`)
        UNION ALL
        (SELECT period, value, 'expected' AS actual_or_expected FROM `project-for-method-dw_revenue_metrics_v_metric__sync_conversion_rate_trajectory_expect`)
        ORDER BY period, value