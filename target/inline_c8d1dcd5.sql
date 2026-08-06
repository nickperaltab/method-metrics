
SELECT period, value
FROM {{ source('revenue_metrics', 'v_metric__sync_conversion_rate_forecasted') }}
WHERE period >= '2026-04-01'
ORDER BY period
