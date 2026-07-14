
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select month
from `project-for-method-dw`.`revenue_validation`.`int_annual_mrr_movement_decomposed`
where month is null



  
  
      
    ) dbt_internal_test