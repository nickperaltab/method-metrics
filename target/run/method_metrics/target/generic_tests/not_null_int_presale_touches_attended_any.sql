
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select attended_any
from `project-for-method-dw`.`revenue`.`int_presale_touches`
where attended_any is null



  
  
      
    ) dbt_internal_test