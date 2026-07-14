
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select motion
from `project-for-method-dw`.`revenue`.`v_motion_funnel`
where motion is null



  
  
      
    ) dbt_internal_test