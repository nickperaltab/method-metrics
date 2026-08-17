
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select value
from `project-for-method-dw`.`revenue_metrics`.`v_metric__conversions_mtd`
where value is null



  
  
      
    ) dbt_internal_test