

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__churn_rate_mtd`
  OPTIONS(
      description="""Accounts churned this month (through yesterday) as a percentage of\nthe active account base: churn_mtd / (beginning-of-month customers +\nmid-month conversions). CompanyAccount (billing-account) grain\nthroughout. Distinct from Churn Rate #344's prior through-today\nwindow -- this is the complete-days convention used by the rest of\nMethod Monday.\n""",
    
      labels=[('metric_id', '344'), ('layer', 'metrics'), ('type', 'ratio'), ('status', 'queued'), ('source_table', 'int_method_monday'), ('source_measure_safe', ''), ('depends_on', '409-59')]
    )
  as 

-- Canonical metric: "Accounts Churned Rate MTD (through yesterday)"
-- Type: ratio
--
-- churn_mtd / (bom_customers + conversions_mtd), both through yesterday.
-- Emits a PERCENTAGE (2.41, not 0.0241) -- matches Churn Rate #344's
-- display_format, so this can repoint #344 without a rescale on the
-- consuming side.
--
-- Denominator is BOM (beginning-of-month customer base, from
-- int_bom_customers) plus mid-month conversions -- NOT BOM alone. This was
-- settled empirically: verified against Looker, Apr 2026 = 2.41% and
-- Jun 2026 = 2.70%, exact only with conversions included (see
-- churn-rate-report.md). BOM does not scale with elapsed days, unlike
-- conversions_mtd -- see int_method_monday.sql for why this pairs with a
-- genuinely different trajectory number, not the same value repeated.
--
-- CompanyAccount grain throughout -- inherits churn_mtd's franchise-fan-out
-- caveat (see v_metric__churn_mtd.sql / #409).

SELECT period, churn_rate_mtd AS value
FROM `project-for-method-dw`.`revenue`.`int_method_monday`;

