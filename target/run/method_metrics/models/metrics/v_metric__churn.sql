

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__churn`
  OPTIONS(
      description="""Monthly count of Method billing accounts (CompanyAccount grain) that\ncanceled, grouped by cancellation month. COUNT(DISTINCT CompanyAccount)\nis measured identical to COUNT(*) in every recent month (6/6 checked)\n\u2014 int_cancellations is already one row per Account, so the DISTINCT\nperforms no customer-level dedup. A customer that owns several\ncanceling CompanyAccounts (e.g. a franchise network closing multiple\nper-location accounts in one event) counts once per account, not once\nper customer. Excludes test accounts and internal Method Integration\npartner rows. Note: this is account-count churn, not dollar churn \u2014\nsee Monthly Cancellations ($) (#379) for MRR lost.\n""",
    
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

