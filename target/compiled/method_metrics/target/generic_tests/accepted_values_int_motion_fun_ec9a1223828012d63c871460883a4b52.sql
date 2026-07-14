
    
    

with all_values as (

    select
        user_tier as value_field,
        count(*) as n_records

    from `project-for-method-dw`.`revenue`.`int_motion_funnel`
    group by user_tier

)

select *
from all_values
where value_field not in (
    'Solo','Small (2-4)','SMB (5-10)','Mid (11+)','Unknown'
)


