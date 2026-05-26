

  create or replace view `project-for-method-dw`.`revenue`.`v_metric__annual_expansions_mrr`
  OPTIONS(
      description="""Total MRR gained from existing-customer expansions at annual cohort\ngrain (customers paying more than the prior year), in dollars summed\nacross all customers. Pre-FX \u2014 currencies (USD, CAD, UK) at face\nvalue, not USD-converted. Existing customers only \u2014 net-new customer\nrevenue is tracked separately. Foundation for annual NRR (#389).\n""",
    
      labels=[('metric_id', '387'), ('layer', 'metrics'), ('type', 'simple'), ('status', 'live'), ('verified_at', '2026-05-14'), ('source_table', 'v_customer_annual_mrr'), ('source_measure_safe', 'sum_expansions'), ('depends_on', '')]
    )
  as 

-- Canonical metric: "Annual Expansions ($)" (#387)

SELECT
  Month AS period,
  ROUND(SUM(Expansions), 2) AS value
FROM `project-for-method-dw`.`revenue`.`int_customer_annual_mrr`
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1;

