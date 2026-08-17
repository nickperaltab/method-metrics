

-- Canonical metric: "Conversions MTD (through yesterday)"
-- Type: simple (windowed count)
--
-- Conversions so far this month, excluding today. Pairs with
-- v_metric__conversions_trajectory, which divides this same count by complete
-- days. A tile showing a through-today figure beside a through-yesterday
-- trajectory is the inconsistency this convention exists to prevent.
--
-- Distinct from Conversions #56, which is the full-month total and must stay
-- that way — it feeds Marketing, the AI chart builder and 19 dbt consumers.
--
-- Also backs the Sales Scorecard Conversions tile, which moves 21 -> 20.

SELECT period, CAST(conversions_mtd AS FLOAT64) AS value
FROM `project-for-method-dw`.`revenue`.`int_method_monday`