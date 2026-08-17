
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select n_active
from `project-for-method-dw`.`revenue`.`int_customer_retention_triangle`
where n_active is null



  
  
      
    ) dbt_internal_test