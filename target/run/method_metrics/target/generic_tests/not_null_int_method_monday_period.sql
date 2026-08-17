
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select period
from `project-for-method-dw`.`revenue`.`int_method_monday`
where period is null



  
  
      
    ) dbt_internal_test