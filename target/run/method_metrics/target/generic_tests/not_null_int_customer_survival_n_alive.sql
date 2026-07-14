
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select n_alive
from `project-for-method-dw`.`revenue`.`int_customer_survival`
where n_alive is null



  
  
      
    ) dbt_internal_test