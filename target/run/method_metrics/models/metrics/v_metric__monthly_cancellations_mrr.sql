

  create or replace view `project-for-method-dw`.`revenue`.`v_metric__monthly_cancellations_mrr`
  OPTIONS(
      description="""Total MRR lost from customer cancellations each month, in dollars\nsummed across all customers. Pre-FX \u2014 currencies (USD, CAD, UK) at\nface value, not USD-converted. Excludes internal Method accounts.\nUses CEO-confirmed methodology that excludes one-time Prepay Expiry\nwrite-offs from both StartMRR and Cancellations. Foundation for\nmonthly GRR.\n""",
    
      labels=[('metric_id', '379'), ('layer', 'metrics'), ('type', 'simple'), ('status', 'live'), ('verified_at', '2026-05-14'), ('source_table', 'v_customer_mrr'), ('source_measure_safe', 'sum_cancellations'), ('depends_on', '')]
    )
  as 

-- Canonical metric: "Monthly Cancellations ($)" (#379)
-- Type: simple SUM(Cancellations) from v_customer_mrr, rounded to 2 decimals
-- Methodology: inherits CEO-confirmed symmetric Prepay Expiry Income
--   exclusion from v_customer_mrr (see knowledge/verified-queries/v_customer_mrr.sql)
-- Materialization: rolling 24 months ending at the current day

SELECT
  Month AS period,
  ROUND(SUM(Cancellations), 2) AS value
FROM `project-for-method-dw`.`revenue`.`int_customer_mrr`
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1;

