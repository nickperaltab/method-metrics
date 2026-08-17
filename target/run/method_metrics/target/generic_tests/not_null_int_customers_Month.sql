
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select Month
from `project-for-method-dw`.`revenue`.`int_customers`
where Month is null



  
  
      
    ) dbt_internal_test