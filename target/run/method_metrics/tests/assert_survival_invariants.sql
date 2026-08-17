
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  -- Fails if any cell violates the survival invariants.
SELECT vintage, tenure_k
FROM `project-for-method-dw`.`revenue`.`int_customer_survival`
WHERE n_alive > n_start OR retained_mrr > base_mrr
  
  
      
    ) dbt_internal_test