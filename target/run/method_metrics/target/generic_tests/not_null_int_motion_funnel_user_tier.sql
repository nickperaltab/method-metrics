
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select user_tier
from `project-for-method-dw`.`revenue`.`int_motion_funnel`
where user_tier is null



  
  
      
    ) dbt_internal_test