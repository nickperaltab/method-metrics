
    
    

with dbt_test__target as (

  select CompanyAccount as unique_field
  from `project-for-method-dw`.`revenue`.`int_partner_accounts`
  where CompanyAccount is not null

)

select
    unique_field,
    count(*) as n_records

from dbt_test__target
group by unique_field
having count(*) > 1


