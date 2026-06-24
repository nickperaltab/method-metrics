{{ config(materialized='table') }}

-- Customer retention triangle: monthly cohorts x tenure. Customer grain (EntityRecordID).
-- Mirrors int_customer_survival but cohorts by first-paying MONTH (not year).
-- Frontend derives the four views (Customers/MRR x from-start/MoM) from these raw columns.

WITH monthly_mrr AS (
  SELECT Month, EntityRecordID, SUM(StartMRR) AS mrr
  FROM {{ ref('int_customer_mrr') }}
  GROUP BY 1, 2
),
signup AS (
  SELECT EntityRecordID, MIN(Date) AS sd
  FROM {{ source('revenue', 'Funnel') }}
  WHERE EventType = 'Trial'
  GROUP BY 1
),
first_pay AS (
  SELECT EntityRecordID, MIN(Month) AS cohort_month
  FROM monthly_mrr WHERE mrr > 0 GROUP BY 1
),
base AS (
  SELECT fp.EntityRecordID AS eid, fp.cohort_month, b.mrr AS mrr0
  FROM first_pay fp
  JOIN monthly_mrr b ON b.EntityRecordID = fp.EntityRecordID AND b.Month = fp.cohort_month
  JOIN signup s ON s.EntityRecordID = fp.EntityRecordID AND s.sd >= '2021-06-01'
),
joined AS (
  SELECT base.cohort_month, k AS tenure_k, base.mrr0, IFNULL(f.mrr, 0) AS mrrk
  FROM base, UNNEST(GENERATE_ARRAY(0, 24)) AS k
  LEFT JOIN monthly_mrr f
    ON f.EntityRecordID = base.eid
    AND f.Month = DATE_ADD(base.cohort_month, INTERVAL k MONTH)
  WHERE DATE_ADD(base.cohort_month, INTERVAL k MONTH) <=
    {%- if var('retention_censor_month', none) is not none %}
    DATE('{{ var("retention_censor_month") }}')
    {%- else %}
    DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH)  -- default: latest complete month
    {%- endif %}
)
SELECT
  cohort_month,
  tenure_k,
  COUNT(*) AS n_start,           -- cohort size; equal across k for a cohort because the censor passes/fails a whole (cohort,k) cell at once
  COUNTIF(mrrk > 0) AS n_active,
  SUM(mrr0) AS mrr_start,
  SUM(mrrk) AS mrr_active
FROM joined
GROUP BY 1, 2
HAVING n_start >= {{ var("retention_min_cohort", 20) }}
ORDER BY 1, 2
