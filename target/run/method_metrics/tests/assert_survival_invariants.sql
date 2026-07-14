
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  -- tests/assert_survival_invariants.sql
-- Returns offending rows where survival invariants are violated.
-- n_alive must not exceed n_start; retained_mrr must not exceed base_mrr.
SELECT vintage, tenure_k
FROM `project-for-method-dw`.`revenue`.`int_customer_survival`
WHERE n_alive > n_start OR retained_mrr > base_mrr
GROUP BY 1, 2
HAVING COUNT(*) > 0
  
  
      
    ) dbt_internal_test