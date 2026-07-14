
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    

with all_values as (

    select
        motion as value_field,
        count(*) as n_records

    from `project-for-method-dw`.`revenue`.`int_motion_funnel`
    group by motion

)

select *
from all_values
where value_field not in (
    'talked','self_serve'
)



  
  
      
    ) dbt_internal_test