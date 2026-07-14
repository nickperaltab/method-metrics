
    
    

with all_values as (

    select
        tenure_k as value_field,
        count(*) as n_records

    from `project-for-method-dw`.`revenue`.`int_customer_survival`
    group by tenure_k

)

select *
from all_values
where value_field not in (
    '0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24'
)


