

  create or replace view `project-for-method-dw`.`revenue`.`v_metric__churn`
  OPTIONS(
      description="""Monthly count of distinct Method customers that canceled, grouped by\ncancellation month. Customer-grain \u2014 uses COUNT(DISTINCT CompanyAccount)\nso a customer with multiple canceling accounts in the same month\ncounts ONCE. Excludes test accounts and internal Method Integration\npartner rows. Note: this is account-count churn, not dollar churn \u2014\nsee Monthly Cancellations ($) (#379) for MRR lost.\n""",
    
      labels=[('metric_id', '59'), ('layer', 'metrics'), ('type', 'simple'), ('status', 'live'), ('verified_at', '2026-05-14'), ('source_table', 'v_cancellations'), ('source_measure_safe', 'count_distinct_companyaccount'), ('depends_on', '')]
    )
  as 

-- Canonical metric: "Churn" (#59)
-- Type: simple COUNT(DISTINCT CompanyAccount) from v_cancellations, by CancellationDate

SELECT
  DATE_TRUNC(CancellationDate, MONTH) AS period,
  COUNT(DISTINCT CompanyAccount) AS value
FROM `project-for-method-dw`.`revenue`.`int_cancellations`
WHERE CancellationDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1;

