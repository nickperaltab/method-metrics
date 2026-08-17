

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__conversions_forecast_mtd`
  OPTIONS(
      description="""The full-month conversions forecast prorated to the elapsed window\n(conversions_forecast * elapsed_days / days_in_month), so the MTD\nactual has a like-for-like comparison instead of the full-month total.\nReturns 0 (not NULL) on the 1st of the month, when elapsed_days is 0 --\nthe paired trajectory metric (#296) returns NULL in that same\nsituation, so the two do not fail the same way on day one.\n""",
    
      labels=[('metric_id', '412'), ('layer', 'metrics'), ('type', 'derived'), ('status', 'queued'), ('source_table', 'int_method_monday'), ('source_measure_safe', ''), ('depends_on', '273')]
    )
  as 

-- Canonical metric: "Conversions Forecast MTD"
-- Type: derived
--
-- The full-month conversions forecast prorated to the elapsed window:
--   conversions_forecast * elapsed_days / days_in_month
--
-- Exists so the MTD comparison bar is like-for-like. Comparing an actual
-- counted through a partial month against a full-month forecast would say
-- nothing; prorating the forecast to the same window says whether we are
-- ahead or behind. Looker's Conversions card does this.

SELECT period, CAST(conversions_forecast_mtd AS FLOAT64) AS value
FROM `project-for-method-dw`.`revenue`.`int_method_monday`;

