
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select month
from `project-for-method-dw`.`revenue`.`int_customer_mrr_lines`
where month is null



  
  
      
    ) dbt_internal_test