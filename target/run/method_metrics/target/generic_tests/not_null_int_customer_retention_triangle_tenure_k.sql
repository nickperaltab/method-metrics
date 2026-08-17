
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select tenure_k
from `project-for-method-dw`.`revenue`.`int_customer_retention_triangle`
where tenure_k is null



  
  
      
    ) dbt_internal_test