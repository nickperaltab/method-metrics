-- Fails if any (cohort_month, tenure_k, l1, segment, country, channel) cell appears more than once.
SELECT cohort_month, tenure_k, l1, segment, country, channel, COUNT(*) AS n
FROM {{ ref('int_customer_retention_triangle') }}
GROUP BY 1, 2, 3, 4, 5, 6
HAVING COUNT(*) > 1
