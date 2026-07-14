
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select p2_saas
from `project-for-method-dw`.`revenue`.`int_customer_mrr`
where p2_saas is null



  
  
      
    ) dbt_internal_test