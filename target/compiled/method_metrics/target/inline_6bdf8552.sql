
SELECT table_name, table_type FROM `project-for-method-dw.revenue`.INFORMATION_SCHEMA.TABLES
WHERE LOWER(table_name) LIKE '%bom%' ORDER BY 1