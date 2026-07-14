-- Build actual result given inputs
WITH
            	`project-for-method-dw_revenue_int_customer_mrr` as (SELECT *  FROM UNNEST([STRUCT(CAST('2024-01-01' AS DATE) AS month, CAST(1 AS INT64) AS entityrecordid, CAST(NULL AS STRING) AS company, CAST(NULL AS NUMERIC) AS p1_saas, CAST(NULL AS NUMERIC) AS p2_saas, CAST(100 AS NUMERIC) AS startmrr, CAST(NULL AS NUMERIC) AS cancellations, CAST(NULL AS NUMERIC) AS downgrades, CAST(NULL AS NUMERIC) AS expansions, CAST(NULL AS NUMERIC) AS newmrr, CAST(NULL AS STRING) AS segment, CAST(NULL AS STRING) AS usertier, CAST(NULL AS BOOL) AS hasdep, CAST(NULL AS STRING) AS attributionchannel, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS synctype), STRUCT(CAST('2024-02-01' AS DATE) AS month, CAST(1 AS INT64) AS entityrecordid, CAST(NULL AS STRING) AS company, CAST(NULL AS NUMERIC) AS p1_saas, CAST(NULL AS NUMERIC) AS p2_saas, CAST(100 AS NUMERIC) AS startmrr, CAST(NULL AS NUMERIC) AS cancellations, CAST(NULL AS NUMERIC) AS downgrades, CAST(NULL AS NUMERIC) AS expansions, CAST(NULL AS NUMERIC) AS newmrr, CAST(NULL AS STRING) AS segment, CAST(NULL AS STRING) AS usertier, CAST(NULL AS BOOL) AS hasdep, CAST(NULL AS STRING) AS attributionchannel, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS synctype), STRUCT(CAST('2024-03-01' AS DATE) AS month, CAST(1 AS INT64) AS entityrecordid, CAST(NULL AS STRING) AS company, CAST(NULL AS NUMERIC) AS p1_saas, CAST(NULL AS NUMERIC) AS p2_saas, CAST(50 AS NUMERIC) AS startmrr, CAST(NULL AS NUMERIC) AS cancellations, CAST(NULL AS NUMERIC) AS downgrades, CAST(NULL AS NUMERIC) AS expansions, CAST(NULL AS NUMERIC) AS newmrr, CAST(NULL AS STRING) AS segment, CAST(NULL AS STRING) AS usertier, CAST(NULL AS BOOL) AS hasdep, CAST(NULL AS STRING) AS attributionchannel, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS synctype), STRUCT(CAST('2024-01-01' AS DATE) AS month, CAST(2 AS INT64) AS entityrecordid, CAST(NULL AS STRING) AS company, CAST(NULL AS NUMERIC) AS p1_saas, CAST(NULL AS NUMERIC) AS p2_saas, CAST(200 AS NUMERIC) AS startmrr, CAST(NULL AS NUMERIC) AS cancellations, CAST(NULL AS NUMERIC) AS downgrades, CAST(NULL AS NUMERIC) AS expansions, CAST(NULL AS NUMERIC) AS newmrr, CAST(NULL AS STRING) AS segment, CAST(NULL AS STRING) AS usertier, CAST(NULL AS BOOL) AS hasdep, CAST(NULL AS STRING) AS attributionchannel, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS synctype), STRUCT(CAST('2023-01-01' AS DATE) AS month, CAST(3 AS INT64) AS entityrecordid, CAST(NULL AS STRING) AS company, CAST(NULL AS NUMERIC) AS p1_saas, CAST(NULL AS NUMERIC) AS p2_saas, CAST(80 AS NUMERIC) AS startmrr, CAST(NULL AS NUMERIC) AS cancellations, CAST(NULL AS NUMERIC) AS downgrades, CAST(NULL AS NUMERIC) AS expansions, CAST(NULL AS NUMERIC) AS newmrr, CAST(NULL AS STRING) AS segment, CAST(NULL AS STRING) AS usertier, CAST(NULL AS BOOL) AS hasdep, CAST(NULL AS STRING) AS attributionchannel, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS synctype)])),
  	`project-for-method-dw_revenue_Funnel` as (SELECT *  FROM UNNEST([STRUCT(CAST('2023-07-01' AS DATE) AS date, CAST(1 AS INT64) AS entityrecordid, CAST(NULL AS STRING) AS companyaccount, CAST('Trial' AS STRING) AS eventtype, CAST(NULL AS DATE) AS signupdate, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS DATE) AS custdatfirstsynccompleted, CAST(NULL AS FLOAT64) AS custdatlastsaasamount, CAST(NULL AS DATE) AS firstsaasinvoicetxndate, CAST(NULL AS INT64) AS cookierecordid, CAST(NULL AS FLOAT64) AS att_backlinks, CAST(NULL AS FLOAT64) AS att_banner_ads, CAST(NULL AS FLOAT64) AS att_content, CAST(NULL AS FLOAT64) AS att_direct, CAST(NULL AS FLOAT64) AS att_help_center, CAST(NULL AS FLOAT64) AS att_none, CAST(NULL AS FLOAT64) AS att_online_chat_tool, CAST(NULL AS FLOAT64) AS att_opn_other_peoples_networks, CAST(NULL AS FLOAT64) AS att_other, CAST(NULL AS FLOAT64) AS att_partners, CAST(NULL AS FLOAT64) AS att_pay_per_click, CAST(NULL AS FLOAT64) AS att_referral_link, CAST(NULL AS FLOAT64) AS att_referral_program, CAST(NULL AS FLOAT64) AS att_remarketing, CAST(NULL AS FLOAT64) AS att_seminar_conference, CAST(NULL AS FLOAT64) AS att_seo, CAST(NULL AS FLOAT64) AS att_social, CAST(NULL AS STRING) AS synctype, CAST(NULL AS STRING) AS synctyperegion, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS saaspaytype), STRUCT(CAST('2023-08-01' AS DATE) AS date, CAST(2 AS INT64) AS entityrecordid, CAST(NULL AS STRING) AS companyaccount, CAST('Trial' AS STRING) AS eventtype, CAST(NULL AS DATE) AS signupdate, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS DATE) AS custdatfirstsynccompleted, CAST(NULL AS FLOAT64) AS custdatlastsaasamount, CAST(NULL AS DATE) AS firstsaasinvoicetxndate, CAST(NULL AS INT64) AS cookierecordid, CAST(NULL AS FLOAT64) AS att_backlinks, CAST(NULL AS FLOAT64) AS att_banner_ads, CAST(NULL AS FLOAT64) AS att_content, CAST(NULL AS FLOAT64) AS att_direct, CAST(NULL AS FLOAT64) AS att_help_center, CAST(NULL AS FLOAT64) AS att_none, CAST(NULL AS FLOAT64) AS att_online_chat_tool, CAST(NULL AS FLOAT64) AS att_opn_other_peoples_networks, CAST(NULL AS FLOAT64) AS att_other, CAST(NULL AS FLOAT64) AS att_partners, CAST(NULL AS FLOAT64) AS att_pay_per_click, CAST(NULL AS FLOAT64) AS att_referral_link, CAST(NULL AS FLOAT64) AS att_referral_program, CAST(NULL AS FLOAT64) AS att_remarketing, CAST(NULL AS FLOAT64) AS att_seminar_conference, CAST(NULL AS FLOAT64) AS att_seo, CAST(NULL AS FLOAT64) AS att_social, CAST(NULL AS STRING) AS synctype, CAST(NULL AS STRING) AS synctyperegion, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS saaspaytype), STRUCT(CAST('2022-06-01' AS DATE) AS date, CAST(3 AS INT64) AS entityrecordid, CAST(NULL AS STRING) AS companyaccount, CAST('Trial' AS STRING) AS eventtype, CAST(NULL AS DATE) AS signupdate, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS DATE) AS custdatfirstsynccompleted, CAST(NULL AS FLOAT64) AS custdatlastsaasamount, CAST(NULL AS DATE) AS firstsaasinvoicetxndate, CAST(NULL AS INT64) AS cookierecordid, CAST(NULL AS FLOAT64) AS att_backlinks, CAST(NULL AS FLOAT64) AS att_banner_ads, CAST(NULL AS FLOAT64) AS att_content, CAST(NULL AS FLOAT64) AS att_direct, CAST(NULL AS FLOAT64) AS att_help_center, CAST(NULL AS FLOAT64) AS att_none, CAST(NULL AS FLOAT64) AS att_online_chat_tool, CAST(NULL AS FLOAT64) AS att_opn_other_peoples_networks, CAST(NULL AS FLOAT64) AS att_other, CAST(NULL AS FLOAT64) AS att_partners, CAST(NULL AS FLOAT64) AS att_pay_per_click, CAST(NULL AS FLOAT64) AS att_referral_link, CAST(NULL AS FLOAT64) AS att_referral_program, CAST(NULL AS FLOAT64) AS att_remarketing, CAST(NULL AS FLOAT64) AS att_seminar_conference, CAST(NULL AS FLOAT64) AS att_seo, CAST(NULL AS FLOAT64) AS att_social, CAST(NULL AS STRING) AS synctype, CAST(NULL AS STRING) AS synctyperegion, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS saaspaytype)])),
  	`project-for-method-dw_revenue_int_customer_survival_expect` as (SELECT *  FROM UNNEST([STRUCT(CAST('2024' AS STRING) AS vintage, CAST(0 AS INT64) AS tenure_k, CAST(2 AS INT64) AS n_start, CAST(2 AS INT64) AS n_alive, CAST(300 AS NUMERIC) AS base_mrr, CAST(300 AS NUMERIC) AS retained_mrr, CAST(300 AS NUMERIC) AS net_mrr), STRUCT(CAST('2024' AS STRING) AS vintage, CAST(1 AS INT64) AS tenure_k, CAST(2 AS INT64) AS n_start, CAST(1 AS INT64) AS n_alive, CAST(300 AS NUMERIC) AS base_mrr, CAST(100 AS NUMERIC) AS retained_mrr, CAST(100 AS NUMERIC) AS net_mrr), STRUCT(CAST('2024' AS STRING) AS vintage, CAST(2 AS INT64) AS tenure_k, CAST(2 AS INT64) AS n_start, CAST(1 AS INT64) AS n_alive, CAST(300 AS NUMERIC) AS base_mrr, CAST(50 AS NUMERIC) AS retained_mrr, CAST(50 AS NUMERIC) AS net_mrr)])),
  	`project-for-method-dw_revenue_int_customer_survival_actual` as (

-- Cohort survival by first-pay vintage. ENTITY grain (EntityRecordID).
-- Mirrors VINTAGE_SQL (build_expanders_doc.py) + §18 of verification-queries.md.
-- See docs/metric-definitions.md and docs/superpowers/specs/2026-06-22-cohort-survival-vintage-design.md.

WITH mrr AS (
  SELECT Month, EntityRecordID, SUM(StartMRR) AS month_mrr
  FROM `project-for-method-dw_revenue_int_customer_mrr`
  GROUP BY 1, 2
),
signup AS (
  SELECT EntityRecordID, MIN(Date) AS sd
  FROM `project-for-method-dw_revenue_Funnel`
  WHERE EventType = 'Trial'
  GROUP BY 1
),
first_pay AS (  -- anchor = each entity's FIRST paying month
  SELECT EntityRecordID, MIN(Month) AS t0
  FROM mrr
  WHERE month_mrr > 0
  GROUP BY 1
),
base AS (
  SELECT
    fp.EntityRecordID AS eid,
    fp.t0,
    CAST(EXTRACT(YEAR FROM fp.t0) AS STRING) AS vintage,
    b.month_mrr AS mrr0
  FROM first_pay fp
  JOIN mrr b
    ON b.EntityRecordID = fp.EntityRecordID
    AND b.Month = fp.t0
  JOIN signup s  -- signup gate: first-pay anchor is genuine, not left-censored
    ON s.EntityRecordID = fp.EntityRecordID
    AND s.sd >= '2021-06-01'
),
joined AS (
  SELECT
    base.vintage,
    k AS tenure_k,
    base.mrr0,
    IFNULL(f.month_mrr, 0) AS mrrk
  FROM base, UNNEST(GENERATE_ARRAY(0, 24)) AS k
  LEFT JOIN mrr f
    ON f.EntityRecordID = base.eid
    AND f.Month = DATE_ADD(base.t0, INTERVAL k MONTH)
  WHERE DATE_ADD(base.t0, INTERVAL k MONTH)
        <= DATE('2024-03-01')
)
SELECT
  vintage,
  tenure_k,
  -- n_start = cohort size, constant across k (UNNEST drives one row per entity per tenure)
  COUNT(*) AS n_start,
  COUNTIF(mrrk > 0) AS n_alive,
  SUM(mrr0) AS base_mrr,
  SUM(LEAST(mrrk, mrr0)) AS retained_mrr,
  SUM(mrrk) AS net_mrr
FROM joined
GROUP BY 1, 2
HAVING n_start >= 2
ORDER BY 1, 2
)
        (SELECT vintage, tenure_k, n_start, n_alive, base_mrr, retained_mrr, net_mrr, 'actual' AS actual_or_expected FROM `project-for-method-dw_revenue_int_customer_survival_actual`)
        UNION ALL
        (SELECT vintage, tenure_k, n_start, n_alive, base_mrr, retained_mrr, net_mrr, 'expected' AS actual_or_expected FROM `project-for-method-dw_revenue_int_customer_survival_expect`)
        ORDER BY vintage, tenure_k, n_start, n_alive, base_mrr, retained_mrr, net_mrr