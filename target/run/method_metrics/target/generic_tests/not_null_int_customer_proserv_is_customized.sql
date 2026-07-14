
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select is_customized
from `project-for-method-dw`.`revenue`.`int_customer_proserv`
where is_customized is null



  
  
      
    ) dbt_internal_test