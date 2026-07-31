
SELECT t.table_name, TIMESTAMP_MILLIS(CAST(o2.option_value AS INT64)) AS ignore_x,
  (SELECT option_value FROM `project-for-method-dw.revenue_metrics`.INFORMATION_SCHEMA.TABLE_OPTIONS o WHERE o.table_name=t.table_name AND o.option_name='labels') AS labels
FROM `project-for-method-dw.revenue_metrics`.INFORMATION_SCHEMA.TABLES t
LEFT JOIN `project-for-method-dw.revenue_metrics`.INFORMATION_SCHEMA.TABLE_OPTIONS o2 ON FALSE
WHERE t.table_name LIKE 'v_metric__sync_conversion%'