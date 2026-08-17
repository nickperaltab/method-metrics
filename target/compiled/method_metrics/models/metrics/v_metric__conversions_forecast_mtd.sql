

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
FROM `project-for-method-dw`.`revenue`.`int_method_monday`