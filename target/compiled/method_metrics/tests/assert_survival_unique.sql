-- Fails if any (vintage, tenure_k) cell appears more than once.
SELECT vintage, tenure_k, COUNT(*) AS n
FROM `project-for-method-dw`.`revenue`.`int_customer_survival`
GROUP BY 1, 2
HAVING COUNT(*) > 1