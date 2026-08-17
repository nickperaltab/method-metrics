

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__annual_downgrades_mrr`
  OPTIONS(
      description="""Total MRR lost from existing-customer downgrades at annual cohort\ngrain (customers paying less than the prior year but not canceling),\nin dollars summed across all customers. Pre-FX \u2014 currencies (USD,\nCAD, UK) at face value, not USD-converted. Excludes internal Method\naccounts. Inherits the v_customer_annual_mrr Prepay Expiry methodology.\n""",
    
      labels=[('metric_id', '386'), ('layer', 'metrics'), ('type', 'simple'), ('status', 'live'), ('verified_at', '2026-05-14'), ('source_table', 'v_customer_annual_mrr'), ('source_measure_safe', 'sum_downgrades'), ('depends_on', '')]
    )
  as 

-- Canonical metric: "Annual Downgrades ($)" (#386)

SELECT
  Month AS period,
  ROUND(SUM(Downgrades), 2) AS value
FROM `project-for-method-dw`.`revenue`.`int_customer_annual_mrr`
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1;

