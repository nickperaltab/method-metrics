
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select value
from (select * from `project-for-method-dw`.`revenue_metrics`.`v_metric__churn_rate_trajectory` where EXTRACT(DAY FROM CURRENT_DATE()) > 1) dbt_subquery
where value is null



  
  
      
    ) dbt_internal_test