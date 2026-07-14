
    
    

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


