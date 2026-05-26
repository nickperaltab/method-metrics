

  create or replace view `project-for-method-dw`.`revenue`.`v_metric__annual_start_mrr`
  OPTIONS(
      description="""Total MRR at the start of each annual cohort, summed across all\ncustomers. Pre-FX \u2014 currencies (USD, CAD, UK) at face value, not\nUSD-converted. Excludes internal Method accounts. Uses CEO-confirmed\nmethodology that excludes one-time Prepay Expiry write-offs.\nFoundation for annual GRR / NRR (#388 / #389). Annual cohort\nreported monthly (trailing comparison).\n""",
    
      labels=[('metric_id', '384'), ('layer', 'metrics'), ('type', 'simple'), ('status', 'live'), ('verified_at', '2026-05-14'), ('source_table', 'v_customer_annual_mrr'), ('source_measure_safe', 'sum_startmrr'), ('depends_on', '')]
    )
  as 

-- Canonical metric: "Annual Start MRR" (#384)
-- Type: simple SUM(StartMRR) from v_customer_annual_mrr, rounded to 2 decimals

SELECT
  Month AS period,
  ROUND(SUM(StartMRR), 2) AS value
FROM `project-for-method-dw`.`revenue`.`int_customer_annual_mrr`
WHERE Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1;

