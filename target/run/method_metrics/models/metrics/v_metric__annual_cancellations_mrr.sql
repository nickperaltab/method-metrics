

  create or replace view `project-for-method-dw`.`revenue`.`v_metric__annual_cancellations_mrr`
  OPTIONS(
      description="""Total MRR lost from customer cancellations measured at annual cohort\ngrain, in dollars summed across all customers. Pre-FX \u2014 currencies\n(USD, CAD, UK) at face value, not USD-converted. Excludes internal\nMethod accounts. Uses CEO-confirmed Prepay Expiry methodology.\nFoundation for annual GRR (#388).\n""",
    
      labels=[('metric_id', '385'), ('layer', 'metrics'), ('type', 'simple'), ('status', 'live'), ('verified_at', '2026-05-14'), ('source_table', 'v_customer_annual_mrr'), ('source_measure_safe', 'sum_cancellations'), ('depends_on', '')]
    )
  as 

-- Canonical metric: "Annual Cancellations ($)" (#385)

SELECT
  Month AS period,
  ROUND(SUM(Cancellations), 2) AS value
FROM `project-for-method-dw`.`revenue`.`int_customer_annual_mrr`
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1;

