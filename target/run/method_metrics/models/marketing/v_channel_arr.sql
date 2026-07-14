

  create or replace view `project-for-method-dw`.`revenue`.`v_channel_arr`
  OPTIONS(
      description="""DIRECTIONAL run-rate, NOT accounting-grade. New-customer ARR by marketing\nchannel, one row per (attribution channel x first-invoice month). Replicates\nthe marketing Looker \"Revenue by Channel\" dashboard. \"SaaS\" is each new\ncustomer's current monthly plan rate (Custdatlastsaasamount) allocated to its\nattribution channel \u2014 a run-rate snapshot, NOT invoiced revenue, so it does\nnot tie to QuickBooks/RevCogs (that uses SaaSAmount). Use for directional\nARR-by-channel storytelling only; the canonical run-rate is int_customer_mrr.\nFX is applied by the consumer: emits the pre-FX US / non-US SaaS split so\nCAD ARR = ((saas_us_portion*rate + saas_nonus_portion)/attribution_value)*12.\nExcludes test accounts, internal Method Integration partner rows, and the\ncurrent incomplete month.\n""",
    
      labels=[('metric_id', ''), ('layer', 'marketing'), ('type', 'dimensional'), ('status', 'directional'), ('verified_at', '2026-06-01'), ('source_table', 'account'), ('source_measure_safe', 'custdatlastsaasamount_run_rate'), ('depends_on', '')]
    )
  as 

-- DIRECTIONAL metric: "Channel ARR" — marketing Revenue-by-Channel replica.
-- Grain: (attribution channel x first-invoice month). One row per channel per month.
--
-- Built on the int_attribution_fractional PRIMITIVE (real multi-touch attribution
-- — each customer's 1.0 of credit spread across the channels that touched them).
--
-- BASIS NOTE: uses Custdatlastsaasamount (the run-rate snapshot), NOT SaaSAmount.
-- A deliberate, documented exception to the canonical-revenue-column rule — see
-- migrate-metric-to-dbt SKILL.md "run-rate / ARR carve-out" and
-- docs/metric-definitions.md "Channel ARR". DIRECTIONAL, not accounting-grade;
-- lives in `revenue` (not `revenue_metrics`). Replicates the marketing Looker
-- "Revenue by Channel" dashboard, penny-matched for May 2026.
--
-- FX applied DOWNSTREAM (the consumer) so the USD->CAD rate stays adjustable;
-- this view emits the pre-FX US / non-US split:
--   cad_arr = ((saas_us_portion * rate + saas_nonus_portion) / attribution_value) * 12
--
-- Current incomplete month excluded; trailing 24-month window.

SELECT
  channel,
  DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH)              AS month,
  COUNT(DISTINCT CompanyAccount)                          AS customers,
  SUM(attribution_weight)                                 AS attribution_value,
  SUM(plan_rate * attribution_weight)                     AS saas_usd,
  SUM(IF(is_us,     plan_rate * attribution_weight, 0))   AS saas_us_portion,
  SUM(IF(NOT is_us, plan_rate * attribution_weight, 0))   AS saas_nonus_portion,
  -- attribution-weighted, to match Looker's "Avg First Invoice Revenue"
  -- (= first_invoice_weighted / attribution_value)
  SUM(first_invoice_revenue * attribution_weight)         AS first_invoice_weighted
FROM `project-for-method-dw`.`revenue`.`int_attribution_fractional`
WHERE FirstSaaSInvoiceTxnDate IS NOT NULL
  AND FirstSaaSInvoiceTxnDate != DATE('0001-01-01')
  AND FirstSaaSInvoiceTxnDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
  AND FirstSaaSInvoiceTxnDate <  DATE_TRUNC(CURRENT_DATE(), MONTH)
GROUP BY channel, month
ORDER BY channel, month;

