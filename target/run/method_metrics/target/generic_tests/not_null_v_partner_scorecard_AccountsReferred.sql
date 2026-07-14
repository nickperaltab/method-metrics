
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select AccountsReferred
from `project-for-method-dw`.`revenue`.`v_partner_scorecard`
where AccountsReferred is null



  
  
      
    ) dbt_internal_test