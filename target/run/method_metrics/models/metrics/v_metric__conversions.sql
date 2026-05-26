

  create or replace view `project-for-method-dw`.`revenue`.`v_metric__conversions`
  OPTIONS(
      description="""Monthly count of Method accounts that converted from trial to paying\n(i.e., received their first SaaS invoice). Account-grain \u2014 a customer\nwith 2 accounts that both converted contributes 2 conversions, by\ndesign. Excludes test accounts and internal Method Integration\npartner rows. Foundation for Conversion Rate metrics (#301, #302).\n""",
    
      labels=[('metric_id', '56'), ('layer', 'metrics'), ('type', 'simple'), ('status', 'live'), ('verified_at', '2026-05-14'), ('source_table', 'v_conversions'), ('source_measure_safe', 'count_star'), ('depends_on', '')]
    )
  as 

-- Canonical metric: "Conversions" (#56)
-- Type: simple COUNT(*) from v_conversions, by FirstSaaSInvoiceTxnDate

SELECT
  DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS period,
  COUNT(*) AS value
FROM `project-for-method-dw`.`revenue`.`int_conversions`
WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1;

