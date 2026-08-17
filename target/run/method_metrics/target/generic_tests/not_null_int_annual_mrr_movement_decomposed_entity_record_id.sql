
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select entity_record_id
from `project-for-method-dw`.`revenue`.`int_annual_mrr_movement_decomposed`
where entity_record_id is null



  
  
      
    ) dbt_internal_test