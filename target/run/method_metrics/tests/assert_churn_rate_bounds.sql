
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  -- Real invariant for the two Churn Rate metrics (#344/#345): a rate is a
-- percentage of an account base and cannot be negative or exceed 100%.
-- This does NOT recompute the model's own SAFE_DIVIDE expression (an
-- earlier test in this project did that and was unsatisfiable by
-- construction -- see assert_trajectory_invariants.sql's
-- trajectory_below_actual note) -- it is an independent range check on the
-- materialized output.
--
-- NULL values (legitimately NULL on day 1 for the trajectory metric) are
-- excluded here by the `value BETWEEN 0 AND 100` predicate itself (NULL
-- fails the BETWEEN and would normally be filtered OUT by a WHERE NOT
-- BETWEEN, so it's made explicit below rather than relying on that).
--
-- Returns offending rows; empty result = pass.

WITH rates AS (
  SELECT 'churn_rate_mtd' AS metric, period, value FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__churn_rate_mtd`
  UNION ALL
  SELECT 'churn_rate_trajectory', period, value FROM `project-for-method-dw`.`revenue_metrics`.`v_metric__churn_rate_trajectory`
)
SELECT metric, period, value
FROM rates
WHERE value IS NOT NULL
  AND (value < 0 OR value > 100)
  
  
      
    ) dbt_internal_test