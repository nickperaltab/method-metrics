
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select period
from `project-for-method-dw`.`revenue_metrics`.`v_metric__churn_trajectory`
where period is null



  
  
      
    ) dbt_internal_test