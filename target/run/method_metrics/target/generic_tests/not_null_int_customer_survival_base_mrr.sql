
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select base_mrr
from `project-for-method-dw`.`revenue`.`int_customer_survival`
where base_mrr is null



  
  
      
    ) dbt_internal_test