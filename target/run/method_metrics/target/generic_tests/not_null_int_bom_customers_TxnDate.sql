
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select TxnDate
from `project-for-method-dw`.`revenue`.`int_bom_customers`
where TxnDate is null



  
  
      
    ) dbt_internal_test