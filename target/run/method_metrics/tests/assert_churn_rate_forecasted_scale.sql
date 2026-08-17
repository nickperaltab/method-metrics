
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  -- Pins the emitted scale of v_metric__churn_rate_forecasted (Supabase
-- #342, the pre-existing metric this view now backs -- #424 was a
-- duplicate, deprecated 2026-08-17) as a PERCENTAGE, not a decimal -- the
-- third instance in this project of the #319 trap (a rate metric quietly
-- emitting a decimal that a downstream attainment formula has to
-- compensate for). #322/#323 on the Sales Scorecard were wrong 100x for
-- months from exactly this shape; this test exists so a future
-- "simplification" back to the source sheet's native decimal scale fails
-- loudly instead of silently breaking #425's formula
-- (SAFE_DIVIDE({345}, {342}) * 100, which assumes #342 is already a
-- percentage).
--
-- Two checks:
--   1. 0-100 band -- a percentage-scale churn rate cannot legitimately
--      exceed 100 or go negative.
--   2. > 1 for any month with a non-zero forecast -- a genuine decimal
--      rate (e.g. 0.025) would fail this immediately, since real
--      accounts-churned forecasts are single-digit percentages (2-3),
--      never sub-1. This is the check that actually distinguishes "decimal"
--      from "percentage", which the 0-100 band alone would not catch (a
--      decimal of 0.025 also technically sits inside 0-100).
--
-- Returns offending rows; empty result = pass.

SELECT period, value, 'out_of_percentage_band' AS violation
FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__churn_rate_forecasted`
WHERE value IS NOT NULL
  AND (value < 0 OR value > 100)

UNION ALL

SELECT period, value, 'looks_like_a_decimal_not_a_percentage' AS violation
FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__churn_rate_forecasted`
WHERE value IS NOT NULL
  AND value != 0
  AND value <= 1
  
  
      
    ) dbt_internal_test