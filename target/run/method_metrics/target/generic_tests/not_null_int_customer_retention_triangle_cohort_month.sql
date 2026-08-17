
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    



select cohort_month
from `project-for-method-dw`.`revenue`.`int_customer_retention_triangle`
where cohort_month is null



  
  
      
    ) dbt_internal_test