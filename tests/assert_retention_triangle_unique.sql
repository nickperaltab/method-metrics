-- Fails if any (cohort_month, tenure_k) cell appears more than once.
SELECT cohort_month, tenure_k, COUNT(*) AS n
FROM {{ ref('int_customer_retention_triangle') }}
GROUP BY 1, 2
HAVING COUNT(*) > 1
