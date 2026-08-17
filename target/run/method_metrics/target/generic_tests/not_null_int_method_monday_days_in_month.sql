
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select days_in_month
from `project-for-method-dw`.`revenue`.`int_method_monday`
where days_in_month is null



  
  
      
    ) dbt_internal_test