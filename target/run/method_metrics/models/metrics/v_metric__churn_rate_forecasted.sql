

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__churn_rate_forecasted`
  OPTIONS(
      description="""Forecasted accounts-churned rate by month, read directly from\nmethod_forecast's Forecasted_Churn_Rate__ column. Unlike Forecasted\nConversion Rate (#319), which derives a rate by summing two absolute\nforecast columns, the forecast sheet already publishes a churn-rate\ncolumn -- no derivation needed. Emits a PERCENTAGE (2.5), not the\nsource column's own decimal scale (0.025) -- see filters below for why\nthis view deliberately rescales. Backs Supabase #342 (\"Forecasted\nChurn Rate %\"), a pre-existing metric verified 2026-08-17 to already\ncompute this exact figure (13/13 months matched exactly against #342's\nprior raw chart_sql before it was repointed here).\n""",
    
      labels=[('metric_id', '342'), ('layer', 'metrics'), ('type', 'derived'), ('status', 'queued'), ('source_table', 'method_forecast'), ('source_measure_safe', ''), ('depends_on', '')]
    )
  as 

-- Canonical metric: "Forecasted Accounts Churned Rate"
-- Type: derived
--
-- Reads Forecasted_Churn_Rate__ directly from the forecast sheet -- unlike
-- Forecasted Conversion Rate (#319), which derives its rate from summing
-- two absolute forecast columns, method_forecast already carries a
-- pre-computed churn-rate column. Confirmed (2026-08-17) constant within
-- a month -- COUNT(DISTINCT Forecasted_Churn_Rate__) = 1 for every month
-- checked -- so AVG is a safe monthly reduction (equivalent to picking any
-- single day's value, not a sum that would inflate by days_in_month).
--
-- Emits a PERCENTAGE (2.5), not the source column's own decimal scale
-- (0.025) -- deliberately rescaled here with *100, so this metric shares
-- one scale with its two siblings, v_metric__churn_rate_mtd (1.939) and
-- v_metric__churn_rate_trajectory (3.73). This is the same trap that left
-- #319 (Forecasted Conversion Rate) emitting a decimal while its sibling
-- ratios emit percentages: the attainment formula built on top had to
-- compensate with an extra *100, which reads as a mistake to the next
-- person who touches it and eventually gets "fixed" into a 100x error (see
-- #322/#323 on the Sales Scorecard). Do NOT remove this *100 to "match the
-- source sheet" -- the sheet's own decimal scale is not this metric's
-- contract; matching its two siblings is.

SELECT
  DATE_TRUNC(Date, MONTH) AS period,
  AVG(Forecasted_Churn_Rate__) * 100 AS value
FROM `project-for-method-dw`.`revenue`.`method_forecast`
WHERE Date IS NOT NULL
GROUP BY 1
ORDER BY 1;

