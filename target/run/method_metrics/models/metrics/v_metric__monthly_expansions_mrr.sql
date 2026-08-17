

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__monthly_expansions_mrr`
  OPTIONS(
      description="""Total MRR gained from customer expansions each month (existing\ncustomers paying more than the previous month), in dollars summed\nacross all customers. Pre-FX \u2014 currencies (USD, CAD, UK) at face\nvalue, not USD-converted. Excludes internal Method accounts.\nInherits the v_customer_mrr Prepay Expiry methodology. Foundation\nfor monthly NRR.\n""",
    
      labels=[('metric_id', '381'), ('layer', 'metrics'), ('type', 'simple'), ('status', 'live'), ('verified_at', '2026-05-14'), ('source_table', 'v_customer_mrr'), ('source_measure_safe', 'sum_expansions'), ('depends_on', '')]
    )
  as 

-- Canonical metric: "Monthly Expansions ($)" (#381)
-- Type: simple SUM(Expansions) from v_customer_mrr, rounded to 2 decimals

SELECT
  Month AS period,
  ROUND(SUM(Expansions), 2) AS value
FROM `project-for-method-dw`.`revenue`.`int_customer_mrr`
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1;

