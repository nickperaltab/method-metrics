
SELECT column_name, data_type FROM `project-for-method-dw.revenue`.INFORMATION_SCHEMA.COLUMNS
WHERE table_name IN ('method_forecast','method_forecast_typed')
  AND column_name='Forecasted_Syncs' ORDER BY table_name