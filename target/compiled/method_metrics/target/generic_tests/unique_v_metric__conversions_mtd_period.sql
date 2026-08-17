
    
    

with dbt_test__target as (

  select period as unique_field
  from `project-for-method-dw`.`revenue_metrics`.`v_metric__conversions_mtd`
  where period is not null

)

select
    unique_field,
    count(*) as n_records

from dbt_test__target
group by unique_field
having count(*) > 1


