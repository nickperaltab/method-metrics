

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__monthly_start_mrr`
  OPTIONS(
      description="""Total MRR at the start of each month, in dollars summed across all\ncustomers. Pre-FX \u2014 currencies (USD, CAD, UK) at face value, not\nUSD-converted. Excludes internal Method accounts. Uses CEO-confirmed\nmethodology that excludes one-time Prepay Expiry write-offs from\nboth StartMRR and Cancellations. Foundation for monthly GRR / NRR.\n""",
    
      labels=[('metric_id', '378'), ('layer', 'metrics'), ('type', 'simple'), ('status', 'live'), ('verified_at', '2026-05-12'), ('source_table', 'v_customer_mrr'), ('source_measure_safe', 'sum_startmrr'), ('depends_on', '')]
    )
  as 

-- Canonical metric: "Monthly Start MRR" (#378)
-- Type: simple SUM(StartMRR) from v_customer_mrr, rounded to 2 decimals
-- Methodology: inherits CEO-confirmed symmetric Prepay Expiry Income
--   exclusion from v_customer_mrr (see knowledge/verified-queries/v_customer_mrr.sql)
-- Materialization: rolling 24 months ending at the current day

SELECT
  Month AS period,
  ROUND(SUM(StartMRR), 2) AS value
FROM `project-for-method-dw`.`revenue`.`int_customer_mrr`
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1;

