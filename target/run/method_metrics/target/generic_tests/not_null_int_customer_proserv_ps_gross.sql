
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select ps_gross
from `project-for-method-dw`.`revenue`.`int_customer_proserv`
where ps_gross is null



  
  
      
    ) dbt_internal_test