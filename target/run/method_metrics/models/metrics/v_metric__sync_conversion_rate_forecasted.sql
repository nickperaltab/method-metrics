

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__sync_conversion_rate_forecasted`
  OPTIONS(
      description="""Forecasted sync conversion rate by month \u2014 forecasted conversions\ndivided by forecasted sync events, summing daily allocations before\ndividing. DERIVED, not published: method_forecast carries a\npre-computed trials-based Forecasted_Conversion_Rate but no sync\nequivalent. Emits a decimal rate, not a percentage.\n""",
    
      labels=[('metric_id', '402'), ('layer', 'metrics'), ('type', 'derived'), ('status', 'live'), ('verified_at', '2026-08-04'), ('source_table', 'method_forecast'), ('source_measure_safe', ''), ('depends_on', '')]
    )
  as 

-- Canonical metric: "Forecasted Sync Conversion Rate"
-- Type: derived ratio
-- Formula: SUM(Forecasted_Conversion) / SUM(Forecasted_Syncs) per month
--
-- DERIVED, NOT PUBLISHED — same caveat as the budgeted twin. See
-- v_metric__sync_conversion_rate_budgeted.sql for the full reasoning on
-- why this sums before dividing.
--
-- Emits a decimal rate (0.25), not a percentage (25.0).

SELECT
  DATE_TRUNC(Date, MONTH) AS period,
  SAFE_DIVIDE(
    SUM(Forecasted_Conversion),
    SUM(Forecasted_Syncs)
  ) AS value
FROM `project-for-method-dw`.`revenue`.`method_forecast`
WHERE Date IS NOT NULL
GROUP BY 1
ORDER BY 1;

