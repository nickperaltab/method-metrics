
    
    select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
  
    
    

with all_values as (

    select
        metric as value_field,
        count(*) as n_records

    from `project-for-method-dw`.`revenue`.`int_channel_funnel_trajectory`
    group by metric

)

select *
from all_values
where value_field not in (
    'trials','syncs','sync_rate'
)



  
  
      
    ) dbt_internal_test