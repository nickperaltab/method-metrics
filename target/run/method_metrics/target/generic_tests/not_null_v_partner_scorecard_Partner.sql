
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select Partner
from `project-for-method-dw`.`revenue`.`v_partner_scorecard`
where Partner is null



  
  
      
    ) dbt_internal_test