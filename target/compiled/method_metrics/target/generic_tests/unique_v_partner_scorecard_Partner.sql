
    
    

with dbt_test__target as (

  select Partner as unique_field
  from `project-for-method-dw`.`revenue`.`v_partner_scorecard`
  where Partner is not null

)

select
    unique_field,
    count(*) as n_records

from dbt_test__target
group by unique_field
having count(*) > 1


