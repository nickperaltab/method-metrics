

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__churn_forecast_mtd`
  OPTIONS(
      description="""The full-month accounts-churned forecast (Forecasted_Churn, an\naccount-grain forecast) prorated to the elapsed window\n(churn_forecast * elapsed_days / days_in_month), so the MTD actual\nhas a like-for-like comparison instead of the full-month total.\nReturns 0 (not NULL) on the 1st of the month, when elapsed_days is 0 --\nthe paired trajectory metric (#411) returns NULL in that same\nsituation, so the two do not fail the same way on day one.\n""",
    
      labels=[('metric_id', '413'), ('layer', 'metrics'), ('type', 'derived'), ('status', 'queued'), ('source_table', 'int_method_monday'), ('source_measure_safe', ''), ('depends_on', '274')]
    )
  as 

-- Canonical metric: "Churn Forecast MTD"
-- Type: derived
--
-- The full-month churn forecast prorated to the elapsed window:
--   churn_forecast * elapsed_days / days_in_month
--
-- Exists so the MTD comparison bar is like-for-like. Comparing an actual
-- counted through a partial month against a full-month forecast would say
-- nothing; prorating the forecast to the same window says whether we are
-- ahead or behind. Looker's Churn card does this.

SELECT period, CAST(churn_forecast_mtd AS FLOAT64) AS value
FROM `project-for-method-dw`.`revenue`.`int_method_monday`;

