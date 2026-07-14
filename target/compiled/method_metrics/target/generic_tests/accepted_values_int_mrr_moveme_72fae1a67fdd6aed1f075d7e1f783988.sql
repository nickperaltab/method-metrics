
    
    

with all_values as (

    select
        movement_kind as value_field,
        count(*) as n_records

    from `project-for-method-dw`.`revenue_validation`.`int_mrr_movement_decomposed`
    group by movement_kind

)

select *
from all_values
where value_field not in (
    'new','expansion','downgrade','cancellation','flat'
)


