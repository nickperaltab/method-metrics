

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__conversions_mtd`
  OPTIONS(
      description="""Conversions with a FirstSaaSInvoiceTxnDate in the current month,\nstrictly before today. Pairs with the complete-days trajectory.\nDistinct from Conversions (#56), which is the full-month total and\nstays that way. Also backs the Sales Scorecard Conversions tile,\nwhich moves 21 -> 20.\n""",
    
      labels=[('metric_id', '408'), ('layer', 'metrics'), ('type', 'simple'), ('status', 'queued'), ('source_table', 'int_method_monday'), ('source_measure_safe', ''), ('depends_on', '56')]
    )
  as 

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
FROM `project-for-method-dw`.`revenue`.`int_method_monday`;

