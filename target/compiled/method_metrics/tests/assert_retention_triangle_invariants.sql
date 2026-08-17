-- Fails if any cohort has more active members than it started with.
SELECT cohort_month, tenure_k
FROM `project-for-method-dw`.`revenue`.`int_customer_retention_triangle`
WHERE n_active > n_start