-- Build actual result given inputs
WITH
            	`project-for-method-dw_revenue_int_customer_mrr` as (SELECT *  FROM UNNEST([STRUCT(CAST('2024-01-01' AS DATE) AS month, CAST(1 AS INT64) AS entityrecordid, CAST('CoA' AS STRING) AS company, CAST(NULL AS NUMERIC) AS p1_saas, CAST(NULL AS NUMERIC) AS p2_saas, CAST(100 AS NUMERIC) AS startmrr, CAST(NULL AS NUMERIC) AS cancellations, CAST(NULL AS NUMERIC) AS downgrades, CAST(NULL AS NUMERIC) AS expansions, CAST(NULL AS NUMERIC) AS newmrr, CAST('Solo no DEP' AS STRING) AS segment, CAST(NULL AS STRING) AS usertier, CAST(NULL AS BOOL) AS hasdep, CAST('SEO' AS STRING) AS attributionchannel, CAST('US' AS STRING) AS signupcountry, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS synctype), STRUCT(CAST('2024-01-01' AS DATE) AS month, CAST(2 AS INT64) AS entityrecordid, CAST('CoB' AS STRING) AS company, CAST(NULL AS NUMERIC) AS p1_saas, CAST(NULL AS NUMERIC) AS p2_saas, CAST(200 AS NUMERIC) AS startmrr, CAST(NULL AS NUMERIC) AS cancellations, CAST(NULL AS NUMERIC) AS downgrades, CAST(NULL AS NUMERIC) AS expansions, CAST(NULL AS NUMERIC) AS newmrr, CAST('Team AI Plus' AS STRING) AS segment, CAST(NULL AS STRING) AS usertier, CAST(NULL AS BOOL) AS hasdep, CAST('PPC' AS STRING) AS attributionchannel, CAST('CA' AS STRING) AS signupcountry, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS synctype)])),
  	`project-for-method-dw_revenue_Funnel` as (SELECT *  FROM UNNEST([STRUCT(CAST('2023-07-01' AS DATE) AS date, CAST(1 AS INT64) AS entityrecordid, CAST(NULL AS STRING) AS companyaccount, CAST('Trial' AS STRING) AS eventtype, CAST(NULL AS DATE) AS signupdate, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS DATE) AS custdatfirstsynccompleted, CAST(NULL AS FLOAT64) AS custdatlastsaasamount, CAST(NULL AS DATE) AS firstsaasinvoicetxndate, CAST(NULL AS INT64) AS cookierecordid, CAST(NULL AS FLOAT64) AS att_backlinks, CAST(NULL AS FLOAT64) AS att_banner_ads, CAST(NULL AS FLOAT64) AS att_content, CAST(NULL AS FLOAT64) AS att_direct, CAST(NULL AS FLOAT64) AS att_help_center, CAST(NULL AS FLOAT64) AS att_none, CAST(NULL AS FLOAT64) AS att_online_chat_tool, CAST(NULL AS FLOAT64) AS att_opn_other_peoples_networks, CAST(NULL AS FLOAT64) AS att_other, CAST(NULL AS FLOAT64) AS att_partners, CAST(NULL AS FLOAT64) AS att_pay_per_click, CAST(NULL AS FLOAT64) AS att_referral_link, CAST(NULL AS FLOAT64) AS att_referral_program, CAST(NULL AS FLOAT64) AS att_remarketing, CAST(NULL AS FLOAT64) AS att_seminar_conference, CAST(NULL AS FLOAT64) AS att_seo, CAST(NULL AS FLOAT64) AS att_social, CAST(NULL AS STRING) AS synctype, CAST(NULL AS STRING) AS synctyperegion, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS saaspaytype), STRUCT(CAST('2023-08-01' AS DATE) AS date, CAST(2 AS INT64) AS entityrecordid, CAST(NULL AS STRING) AS companyaccount, CAST('Trial' AS STRING) AS eventtype, CAST(NULL AS DATE) AS signupdate, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS DATE) AS custdatfirstsynccompleted, CAST(NULL AS FLOAT64) AS custdatlastsaasamount, CAST(NULL AS DATE) AS firstsaasinvoicetxndate, CAST(NULL AS INT64) AS cookierecordid, CAST(NULL AS FLOAT64) AS att_backlinks, CAST(NULL AS FLOAT64) AS att_banner_ads, CAST(NULL AS FLOAT64) AS att_content, CAST(NULL AS FLOAT64) AS att_direct, CAST(NULL AS FLOAT64) AS att_help_center, CAST(NULL AS FLOAT64) AS att_none, CAST(NULL AS FLOAT64) AS att_online_chat_tool, CAST(NULL AS FLOAT64) AS att_opn_other_peoples_networks, CAST(NULL AS FLOAT64) AS att_other, CAST(NULL AS FLOAT64) AS att_partners, CAST(NULL AS FLOAT64) AS att_pay_per_click, CAST(NULL AS FLOAT64) AS att_referral_link, CAST(NULL AS FLOAT64) AS att_referral_program, CAST(NULL AS FLOAT64) AS att_remarketing, CAST(NULL AS FLOAT64) AS att_seminar_conference, CAST(NULL AS FLOAT64) AS att_seo, CAST(NULL AS FLOAT64) AS att_social, CAST(NULL AS STRING) AS synctype, CAST(NULL AS STRING) AS synctyperegion, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS saaspaytype)])),
  	`project-for-method-dw_v7_classification_v_entity_primary_label` as (SELECT *  FROM UNNEST([STRUCT(CAST(1 AS INT64) AS customer_record_id, CAST('Manufacturing' AS STRING) AS l1, CAST(NULL AS STRING) AS l2, CAST(NULL AS STRING) AS l3, CAST(NULL AS STRING) AS operating_model, CAST(NULL AS FLOAT64) AS confidence, CAST(NULL AS BOOL) AS is_multi_business, CAST(false AS BOOL) AS is_multi_client), STRUCT(CAST(2 AS INT64) AS customer_record_id, CAST('Retail' AS STRING) AS l1, CAST(NULL AS STRING) AS l2, CAST(NULL AS STRING) AS l3, CAST(NULL AS STRING) AS operating_model, CAST(NULL AS FLOAT64) AS confidence, CAST(NULL AS BOOL) AS is_multi_business, CAST(false AS BOOL) AS is_multi_client)])),
  	`project-for-method-dw_revenue_int_customer_retention_triangle_expect` as (SELECT *  FROM UNNEST([STRUCT(CAST('2024-01-01' AS DATE) AS cohort_month, CAST(0 AS INT64) AS tenure_k, CAST('Manufacturing' AS STRING) AS l1, CAST('Solo no DEP' AS STRING) AS segment, CAST('US' AS STRING) AS country, CAST('SEO' AS STRING) AS channel, CAST(1 AS INT64) AS n_start, CAST(1 AS INT64) AS n_active, CAST(100 AS NUMERIC) AS mrr_start, CAST(100 AS NUMERIC) AS mrr_active), STRUCT(CAST('2024-01-01' AS DATE) AS cohort_month, CAST(0 AS INT64) AS tenure_k, CAST('Retail' AS STRING) AS l1, CAST('Team AI Plus' AS STRING) AS segment, CAST('CA' AS STRING) AS country, CAST('PPC' AS STRING) AS channel, CAST(1 AS INT64) AS n_start, CAST(1 AS INT64) AS n_active, CAST(200 AS NUMERIC) AS mrr_start, CAST(200 AS NUMERIC) AS mrr_active)])),
  	`project-for-method-dw_revenue_int_customer_retention_triangle_actual` as (

-- Customer retention CUBE: monthly cohorts x tenure x (l1, segment, country, channel).
-- Customer grain (EntityRecordID). Dims frozen at cohort start; l1 is current classification.
-- Additive measures: the frontend sums the filtered slice and derives the four views.
-- No in-model n_start threshold: the cube is complete so the "All" rollup is exact;
-- the min-cohort threshold is applied at display time in the frontend.

WITH monthly_mrr AS (
  SELECT Month, EntityRecordID, SUM(StartMRR) AS mrr
  FROM `project-for-method-dw_revenue_int_customer_mrr`
  GROUP BY 1, 2
),
signup AS (
  SELECT EntityRecordID, MIN(Date) AS sd
  FROM `project-for-method-dw_revenue_Funnel`
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
  FROM `project-for-method-dw_revenue_int_customer_mrr` d
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
  LEFT JOIN `project-for-method-dw_v7_classification_v_entity_primary_label` lbl ON lbl.customer_record_id = fp.EntityRecordID
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
    DATE('2024-01-01')
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
)
        (SELECT cohort_month, tenure_k, l1, segment, country, channel, n_start, n_active, mrr_start, mrr_active, 'actual' AS actual_or_expected FROM `project-for-method-dw_revenue_int_customer_retention_triangle_actual`)
        UNION ALL
        (SELECT cohort_month, tenure_k, l1, segment, country, channel, n_start, n_active, mrr_start, mrr_active, 'expected' AS actual_or_expected FROM `project-for-method-dw_revenue_int_customer_retention_triangle_expect`)
        ORDER BY cohort_month, tenure_k, l1, segment, country, channel, n_start, n_active, mrr_start, mrr_active