

  create or replace view `project-for-method-dw`.`revenue`.`v_metric__customers`
  OPTIONS(
      description="""Monthly count of unique active Method customers \u2014 companies with\nrevenue activity in the month. Customer-grain \u2014 a company with\nmultiple Method accounts counts ONCE per month (unlike Trials,\nwhich counts each account separately). Current month is incomplete;\npartial values until month-end.\n""",
    
      labels=[('metric_id', '373'), ('layer', 'metrics'), ('type', 'simple'), ('status', 'live'), ('verified_at', '2026-05-12'), ('source_table', 'v_customers'), ('source_measure_safe', 'count_distinct_entityrecordid'), ('depends_on', '')]
    )
  as 

-- Canonical metric: "Customers" (#373)
-- Type: simple count_distinct of EntityRecordID from v_customers
-- Filter: IsActive = TRUE (matches Supabase semantic_filters)
-- Grain: customer (NOT account) — a customer with multiple accounts counts ONCE
-- Materialization: rolling 24 months ending at the current day

SELECT
  Month AS period,
  COUNT(DISTINCT EntityRecordID) AS value
FROM `project-for-method-dw`.`revenue`.`int_customers`
WHERE IsActive = TRUE
  AND Month >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1;

