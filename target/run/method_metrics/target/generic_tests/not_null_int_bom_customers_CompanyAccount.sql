
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select CompanyAccount
from `project-for-method-dw`.`revenue`.`int_bom_customers`
where CompanyAccount is null



  
  
      
    ) dbt_internal_test