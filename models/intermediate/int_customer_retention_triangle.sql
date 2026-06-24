{{ config(materialized='table') }}

-- Customer retention CUBE: monthly cohorts x tenure x (l1, segment, country, channel).
-- Customer grain (EntityRecordID). Dims frozen at cohort start; l1 is current classification.
-- Additive measures: the frontend sums the filtered slice and derives the four views.
-- No in-model n_start threshold: the cube is complete so the "All" rollup is exact;
-- the min-cohort threshold is applied at display time in the frontend.

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
dims AS (  -- cohort-start attributes, one row per entity at its first paying month
  SELECT
    d.EntityRecordID,
    COALESCE(d.Segment, '(unknown)') AS segment,
    COALESCE(d.SignupCountry, '(unknown)') AS country,
    COALESCE(d.AttributionChannel, '(unknown)') AS channel
  FROM {{ ref('int_customer_mrr') }} d
  JOIN first_pay fp ON fp.EntityRecordID = d.EntityRecordID AND d.Month = fp.cohort_month
),
base AS (
  SELECT
    fp.EntityRecordID AS eid, fp.cohort_month, b.mrr AS mrr0,
    dm.segment, dm.country, dm.channel,
    CASE WHEN lbl.is_multi_client THEN 'Multi-client' ELSE COALESCE(lbl.l1, 'Unclassified') END AS l1
  FROM first_pay fp
  JOIN monthly_mrr b ON b.EntityRecordID = fp.EntityRecordID AND b.Month = fp.cohort_month
  JOIN signup s ON s.EntityRecordID = fp.EntityRecordID AND s.sd >= '2021-06-01'
  LEFT JOIN dims dm ON dm.EntityRecordID = fp.EntityRecordID
  LEFT JOIN {{ source('v7_classification', 'v_entity_primary_label') }} lbl ON lbl.customer_record_id = fp.EntityRecordID
),
joined AS (
  SELECT
    base.cohort_month, k AS tenure_k, base.mrr0, IFNULL(f.mrr, 0) AS mrrk,
    base.l1, base.segment, base.country, base.channel
  FROM base, UNNEST(GENERATE_ARRAY(0, 24)) AS k
  LEFT JOIN monthly_mrr f
    ON f.EntityRecordID = base.eid
    AND f.Month = DATE_ADD(base.cohort_month, INTERVAL k MONTH)
  WHERE DATE_ADD(base.cohort_month, INTERVAL k MONTH) <=
    {%- if var('retention_censor_month', none) is not none %}
    DATE('{{ var("retention_censor_month") }}')
    {%- else %}
    DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH)
    {%- endif %}
)
SELECT
  cohort_month, tenure_k, l1, segment, country, channel,
  COUNT(*) AS n_start,
  COUNTIF(mrrk > 0) AS n_active,
  SUM(mrr0) AS mrr_start,
  SUM(mrrk) AS mrr_active
FROM joined
GROUP BY 1, 2, 3, 4, 5, 6
ORDER BY 1, 2, 3, 4, 5, 6
