
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select IsActive
from `project-for-method-dw`.`revenue`.`int_partner_accounts`
where IsActive is null



  
  
      
    ) dbt_internal_test