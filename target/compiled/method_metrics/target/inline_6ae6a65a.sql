
SELECT column_name, data_type
FROM `project-for-method-dw.revenue`.INFORMATION_SCHEMA.COLUMNS
WHERE table_name='method_forecast'
  AND column_name IN ('Forecasted_Trials','Forecasted_Syncs','Forecasted_Conversion','Budgeted_Syncs')
ORDER BY column_name