-- Build actual result given inputs
WITH
            	`project-for-method-dw_revenue_method_forecast` as (SELECT *  FROM UNNEST([STRUCT(CAST('2026-09-01' AS DATE) AS date, CAST(NULL AS DATE) AS forecasted_month, CAST(NULL AS INT64) AS forecasted_trials, CAST(NULL AS INT64) AS forecasted_syncs, CAST(NULL AS INT64) AS forecasted_conversion, CAST(NULL AS FLOAT64) AS forecasted_new_net_saas, CAST(NULL AS STRING) AS forecasted_new_dep_revenue, CAST(NULL AS FLOAT64) AS forecasted_total_net_saas, CAST(NULL AS FLOAT64) AS forecasted_total_dep_revenue, CAST(NULL AS FLOAT64) AS forecasted_churn, CAST(NULL AS FLOAT64) AS forecasted_churn_rate__, CAST(NULL AS FLOAT64) AS forecasted_nrr, CAST(NULL AS FLOAT64) AS forecasted_conversion_rate, CAST(NULL AS FLOAT64) AS budgeted_trials, CAST(0.0 AS FLOAT64) AS budgeted_syncs, CAST(5.0 AS FLOAT64) AS budgeted_conversion, CAST(NULL AS FLOAT64) AS budgeted_new_net_saas, CAST(NULL AS FLOAT64) AS budgeted_new_dep_revenue, CAST(NULL AS FLOAT64) AS budgeted_total_net_saas, CAST(NULL AS FLOAT64) AS budgeted_total_dep_revenue, CAST(NULL AS FLOAT64) AS budgeted_churn, CAST(NULL AS FLOAT64) AS budgeted_churn_rate__, CAST(NULL AS FLOAT64) AS budgeted_nrr, CAST(NULL AS FLOAT64) AS budgeted_conversion_rate, CAST(NULL AS STRING) AS _file_name)])),
  	`project-for-method-dw_revenue_metrics_v_metric__sync_conversion_rate_budgeted_expect` as (SELECT *  FROM UNNEST([STRUCT(CAST('2026-09-01' AS DATE) AS period, CAST(NULL AS FLOAT64) AS value)])),
  	`project-for-method-dw_revenue_metrics_v_metric__sync_conversion_rate_budgeted_actual` as (

-- Canonical metric: "Budgeted Sync Conversion Rate"
-- Type: derived ratio
-- Formula: SUM(Budgeted_Conversion) / SUM(Budgeted_Syncs) per month
--
-- DERIVED, NOT PUBLISHED. method_forecast stores Budgeted_Conversion_Rate
-- as a pre-computed TRIALS rate. There is no stored sync equivalent, so
-- this divides the two budgeted counts. Justin owns revenue methodology
-- and has to confirm the derivation before this goes leadership-facing.
--
-- Sum the daily allocations, THEN divide. Averaging daily ratios would
-- weight a low-volume day the same as a high-volume one.
--
-- Emits a decimal rate (0.25), not a percentage (25.0).

SELECT
  DATE_TRUNC(Date, MONTH) AS period,
  SAFE_DIVIDE(
    SUM(Budgeted_Conversion),
    SUM(Budgeted_Syncs)
  ) AS value
FROM `project-for-method-dw_revenue_method_forecast`
WHERE Date IS NOT NULL
GROUP BY 1
ORDER BY 1
)
        (SELECT period, value, 'actual' AS actual_or_expected FROM `project-for-method-dw_revenue_metrics_v_metric__sync_conversion_rate_budgeted_actual`)
        UNION ALL
        (SELECT period, value, 'expected' AS actual_or_expected FROM `project-for-method-dw_revenue_metrics_v_metric__sync_conversion_rate_budgeted_expect`)
        ORDER BY period, value