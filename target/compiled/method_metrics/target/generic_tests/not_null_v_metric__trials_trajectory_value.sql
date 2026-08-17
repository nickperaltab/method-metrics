
    
    



select value
from (select * from `project-for-method-dw`.`revenue_metrics`.`v_metric__trials_trajectory` where EXTRACT(DAY FROM CURRENT_DATE()) > 1) dbt_subquery
where value is null


