

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__sync_conversion_rate_weekly`
  OPTIONS(
      description="""Weekly sync conversion rate \u2014 conversions in an ISO week divided by\nsync events in the same week, no lag. Weeks start Monday, matching\nevery other weekly series on the Sales Scorecard. Rolling 24 months.\nEmits a decimal rate, not a percentage.\n""",
    
      labels=[('metric_id', '403'), ('layer', 'metrics'), ('type', 'ratio'), ('status', 'live'), ('verified_at', '2026-08-04'), ('source_table', ''), ('source_measure_safe', ''), ('depends_on', '56-55')]
    )
  as 

-- Canonical metric: "Sync Conversion Rate (weekly)"
-- Type: ratio (cross-model), ISO week grain
-- Formula: SAFE_DIVIDE(conversions in week, syncs in week)
--
-- Same-month convention taken down to the week: no lag, no forecast join.
-- Contrast with the trials weekly rate, which shifts SignupDate +1 month
-- and averages against Forecasted_Trials.
--
-- Week starts MONDAY, matching every other weekly series on the Sales
-- Scorecard. 24-month rolling window, matching the metrics-layer
-- convention.
--
-- Emits a decimal rate (0.28), not a percentage (28.0). The scorecard's
-- valueFormat handles display.

WITH conversions AS (
  SELECT
    DATE_TRUNC(FirstSaaSInvoiceTxnDate, WEEK(MONDAY)) AS week,
    COUNT(*) AS conversions
  FROM `project-for-method-dw`.`revenue`.`int_conversions`
  WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  GROUP BY 1
),
syncs AS (
  SELECT
    DATE_TRUNC(SyncDate, WEEK(MONDAY)) AS week,
    COUNT(*) AS syncs
  FROM `project-for-method-dw`.`revenue`.`int_syncs`
  WHERE SyncDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  GROUP BY 1
)
SELECT
  COALESCE(c.week, s.week) AS period,
  SAFE_DIVIDE(COALESCE(c.conversions, 0), s.syncs) AS value
FROM conversions c
FULL OUTER JOIN syncs s
  ON c.week = s.week
ORDER BY 1;

