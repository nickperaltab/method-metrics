
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select movement_kind
from `project-for-method-dw`.`revenue_validation`.`int_annual_mrr_movement_decomposed`
where movement_kind is null



  
  
      
    ) dbt_internal_test