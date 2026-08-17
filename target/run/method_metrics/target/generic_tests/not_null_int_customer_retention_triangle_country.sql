
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select country
from `project-for-method-dw`.`revenue`.`int_customer_retention_triangle`
where country is null



  
  
      
    ) dbt_internal_test