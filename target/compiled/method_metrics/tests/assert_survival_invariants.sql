-- Fails if any cell violates the survival invariants.
SELECT vintage, tenure_k
FROM `project-for-method-dw`.`revenue`.`int_customer_survival`
WHERE n_alive > n_start OR retained_mrr > base_mrr