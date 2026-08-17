
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    

with all_values as (

    select
        movement_kind as value_field,
        count(*) as n_records

    from `project-for-method-dw`.`revenue`.`int_annual_mrr_movement_decomposed`
    group by movement_kind

)

select *
from all_values
where value_field not in (
    'new','expansion','downgrade','cancellation','flat'
)



  
  
      
    ) dbt_internal_test