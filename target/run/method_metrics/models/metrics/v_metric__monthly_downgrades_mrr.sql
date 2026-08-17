

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__monthly_downgrades_mrr`
  OPTIONS(
      description="""Total MRR lost from customer downgrades each month (existing customers\npaying less than the previous month, but not canceling), in dollars\nsummed across all customers. Pre-FX \u2014 currencies (USD, CAD, UK) at\nface value, not USD-converted. Excludes internal Method accounts.\nInherits the v_customer_mrr Prepay Expiry methodology.\n""",
    
      labels=[('metric_id', '380'), ('layer', 'metrics'), ('type', 'simple'), ('status', 'live'), ('verified_at', '2026-05-14'), ('source_table', 'v_customer_mrr'), ('source_measure_safe', 'sum_downgrades'), ('depends_on', '')]
    )
  as 

-- Canonical metric: "Monthly Downgrades ($)" (#380)
-- Type: simple SUM(Downgrades) from v_customer_mrr, rounded to 2 decimals

SELECT
  Month AS period,
  ROUND(SUM(Downgrades), 2) AS value
FROM `project-for-method-dw`.`revenue`.`int_customer_mrr`
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1;

