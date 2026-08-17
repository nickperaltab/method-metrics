
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select EntityRecordID
from `project-for-method-dw`.`revenue`.`int_customer_firmographics`
where EntityRecordID is null



  
  
      
    ) dbt_internal_test