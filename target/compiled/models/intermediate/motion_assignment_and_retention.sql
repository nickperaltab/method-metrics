-- Build actual result given inputs
WITH
            	`project-for-method-dw_revenue_int_trials` as (SELECT *  FROM UNNEST([STRUCT(CAST(1 AS INT64) AS entityrecordid, CAST('2024-01-15' AS DATE) AS signupdate, CAST(NULL AS STRING) AS companyaccount, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS synctype, CAST(NULL AS STRING) AS synctyperegion, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS custdatindustry, CAST(NULL AS FLOAT64) AS att_seo, CAST(NULL AS FLOAT64) AS att_pay_per_click, CAST(NULL AS FLOAT64) AS att_opn_other_peoples_networks, CAST(NULL AS FLOAT64) AS att_social, CAST(NULL AS FLOAT64) AS att_email, CAST(NULL AS FLOAT64) AS att_referral_link, CAST(NULL AS FLOAT64) AS att_referral_program, CAST(NULL AS FLOAT64) AS att_direct, CAST(NULL AS FLOAT64) AS att_partners, CAST(NULL AS FLOAT64) AS att_content, CAST(NULL AS FLOAT64) AS att_remarketing, CAST(NULL AS FLOAT64) AS att_other, CAST(NULL AS FLOAT64) AS att_none, CAST(NULL AS FLOAT64) AS att_backlinks, CAST(NULL AS FLOAT64) AS att_banner_ads, CAST(NULL AS FLOAT64) AS att_help_center, CAST(NULL AS FLOAT64) AS att_online_chat_tool, CAST(NULL AS FLOAT64) AS att_seminar_conference, CAST(NULL AS STRING) AS attributionchannel), STRUCT(CAST(2 AS INT64) AS entityrecordid, CAST('2024-02-20' AS DATE) AS signupdate, CAST(NULL AS STRING) AS companyaccount, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS synctype, CAST(NULL AS STRING) AS synctyperegion, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS custdatindustry, CAST(NULL AS FLOAT64) AS att_seo, CAST(NULL AS FLOAT64) AS att_pay_per_click, CAST(NULL AS FLOAT64) AS att_opn_other_peoples_networks, CAST(NULL AS FLOAT64) AS att_social, CAST(NULL AS FLOAT64) AS att_email, CAST(NULL AS FLOAT64) AS att_referral_link, CAST(NULL AS FLOAT64) AS att_referral_program, CAST(NULL AS FLOAT64) AS att_direct, CAST(NULL AS FLOAT64) AS att_partners, CAST(NULL AS FLOAT64) AS att_content, CAST(NULL AS FLOAT64) AS att_remarketing, CAST(NULL AS FLOAT64) AS att_other, CAST(NULL AS FLOAT64) AS att_none, CAST(NULL AS FLOAT64) AS att_backlinks, CAST(NULL AS FLOAT64) AS att_banner_ads, CAST(NULL AS FLOAT64) AS att_help_center, CAST(NULL AS FLOAT64) AS att_online_chat_tool, CAST(NULL AS FLOAT64) AS att_seminar_conference, CAST(NULL AS STRING) AS attributionchannel)])),
  	`project-for-method-dw_revenue_int_syncs` as (SELECT *  FROM UNNEST([STRUCT(CAST(1 AS INT64) AS entityrecordid, CAST('2024-01-20' AS DATE) AS syncdate, CAST(NULL AS DATE) AS signupdate, CAST(NULL AS STRING) AS companyaccount, CAST(NULL AS STRING) AS eventtype, CAST(NULL AS STRING) AS synctype, CAST(NULL AS STRING) AS synctyperegion, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS vertical, CAST(NULL AS FLOAT64) AS att_seo, CAST(NULL AS FLOAT64) AS att_pay_per_click, CAST(NULL AS FLOAT64) AS att_opn_other_peoples_networks, CAST(NULL AS FLOAT64) AS att_social, CAST(NULL AS FLOAT64) AS att_direct, CAST(NULL AS FLOAT64) AS att_partners, CAST(NULL AS FLOAT64) AS att_content, CAST(NULL AS FLOAT64) AS att_remarketing, CAST(NULL AS FLOAT64) AS att_other, CAST(NULL AS FLOAT64) AS att_none, CAST(NULL AS FLOAT64) AS att_backlinks, CAST(NULL AS FLOAT64) AS att_banner_ads, CAST(NULL AS FLOAT64) AS att_help_center, CAST(NULL AS FLOAT64) AS att_online_chat_tool, CAST(NULL AS FLOAT64) AS att_referral_link, CAST(NULL AS FLOAT64) AS att_referral_program, CAST(NULL AS FLOAT64) AS att_seminar_conference, CAST(NULL AS STRING) AS attributionchannel), STRUCT(CAST(2 AS INT64) AS entityrecordid, CAST('2024-02-25' AS DATE) AS syncdate, CAST(NULL AS DATE) AS signupdate, CAST(NULL AS STRING) AS companyaccount, CAST(NULL AS STRING) AS eventtype, CAST(NULL AS STRING) AS synctype, CAST(NULL AS STRING) AS synctyperegion, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS vertical, CAST(NULL AS FLOAT64) AS att_seo, CAST(NULL AS FLOAT64) AS att_pay_per_click, CAST(NULL AS FLOAT64) AS att_opn_other_peoples_networks, CAST(NULL AS FLOAT64) AS att_social, CAST(NULL AS FLOAT64) AS att_direct, CAST(NULL AS FLOAT64) AS att_partners, CAST(NULL AS FLOAT64) AS att_content, CAST(NULL AS FLOAT64) AS att_remarketing, CAST(NULL AS FLOAT64) AS att_other, CAST(NULL AS FLOAT64) AS att_none, CAST(NULL AS FLOAT64) AS att_backlinks, CAST(NULL AS FLOAT64) AS att_banner_ads, CAST(NULL AS FLOAT64) AS att_help_center, CAST(NULL AS FLOAT64) AS att_online_chat_tool, CAST(NULL AS FLOAT64) AS att_referral_link, CAST(NULL AS FLOAT64) AS att_referral_program, CAST(NULL AS FLOAT64) AS att_seminar_conference, CAST(NULL AS STRING) AS attributionchannel)])),
  	`project-for-method-dw_revenue_int_customer_mrr` as (SELECT *  FROM UNNEST([STRUCT(CAST('2024-02-01' AS DATE) AS month, CAST(1 AS INT64) AS entityrecordid, CAST(NULL AS STRING) AS company, CAST(NULL AS NUMERIC) AS p1_saas, CAST(NULL AS NUMERIC) AS p2_saas, CAST(100 AS NUMERIC) AS startmrr, CAST(NULL AS NUMERIC) AS cancellations, CAST(NULL AS NUMERIC) AS downgrades, CAST(NULL AS NUMERIC) AS expansions, CAST(NULL AS NUMERIC) AS newmrr, CAST(NULL AS STRING) AS segment, CAST(NULL AS STRING) AS usertier, CAST(NULL AS BOOL) AS hasdep, CAST(NULL AS STRING) AS attributionchannel, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS synctype), STRUCT(CAST('2024-03-01' AS DATE) AS month, CAST(1 AS INT64) AS entityrecordid, CAST(NULL AS STRING) AS company, CAST(NULL AS NUMERIC) AS p1_saas, CAST(NULL AS NUMERIC) AS p2_saas, CAST(100 AS NUMERIC) AS startmrr, CAST(NULL AS NUMERIC) AS cancellations, CAST(NULL AS NUMERIC) AS downgrades, CAST(NULL AS NUMERIC) AS expansions, CAST(NULL AS NUMERIC) AS newmrr, CAST(NULL AS STRING) AS segment, CAST(NULL AS STRING) AS usertier, CAST(NULL AS BOOL) AS hasdep, CAST(NULL AS STRING) AS attributionchannel, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS synctype), STRUCT(CAST('2024-03-01' AS DATE) AS month, CAST(2 AS INT64) AS entityrecordid, CAST(NULL AS STRING) AS company, CAST(NULL AS NUMERIC) AS p1_saas, CAST(NULL AS NUMERIC) AS p2_saas, CAST(200 AS NUMERIC) AS startmrr, CAST(NULL AS NUMERIC) AS cancellations, CAST(NULL AS NUMERIC) AS downgrades, CAST(NULL AS NUMERIC) AS expansions, CAST(NULL AS NUMERIC) AS newmrr, CAST(NULL AS STRING) AS segment, CAST(NULL AS STRING) AS usertier, CAST(NULL AS BOOL) AS hasdep, CAST(NULL AS STRING) AS attributionchannel, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS synctype)])),
  	`project-for-method-dw_revenue_int_customers` as (SELECT *  FROM UNNEST([STRUCT(CAST(NULL AS DATE) AS month, CAST(1 AS INT64) AS entityrecordid, CAST(NULL AS STRING) AS entityfullname, CAST(NULL AS INT64) AS accountcount, CAST(1 AS INT64) AS totalusers, CAST(true AS BOOL) AS hasdep, CAST(NULL AS STRING) AS usertier, CAST(NULL AS STRING) AS segment, CAST(NULL AS STRING) AS attributionchannel, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS synctype, CAST(NULL AS BOOL) AS isactive, CAST(NULL AS BOOL) AS isnew, CAST(NULL AS BOOL) AS ischurned), STRUCT(CAST(NULL AS DATE) AS month, CAST(2 AS INT64) AS entityrecordid, CAST(NULL AS STRING) AS entityfullname, CAST(NULL AS INT64) AS accountcount, CAST(3 AS INT64) AS totalusers, CAST(false AS BOOL) AS hasdep, CAST(NULL AS STRING) AS usertier, CAST(NULL AS STRING) AS segment, CAST(NULL AS STRING) AS attributionchannel, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS synctype, CAST(NULL AS BOOL) AS isactive, CAST(NULL AS BOOL) AS isnew, CAST(NULL AS BOOL) AS ischurned)])),
  	`project-for-method-dw_revenue_int_presale_touches` as (SELECT *  FROM UNNEST([STRUCT(CAST(1 AS INT64) AS entityrecordid, CAST(true AS BOOL) AS demo_booked, CAST(true AS BOOL) AS demo_attended, CAST('2024-01-25' AS DATE) AS demo_first_date, CAST(false AS BOOL) AS free_booked, CAST(false AS BOOL) AS free_attended, CAST(NULL AS DATE) AS free_first_date, CAST(true AS BOOL) AS attended_any, CAST('2024-01-25' AS DATE) AS first_attended_date)])),
  	`project-for-method-dw_revenue_int_customer_proserv` as (SELECT *  FROM UNNEST([STRUCT(CAST(1 AS INT64) AS entityrecordid, CAST(500 AS NUMERIC) AS ps_gross, CAST('2024-02-15' AS DATE) AS first_ps_date, CAST(true AS BOOL) AS is_customized)])),
  	`project-for-method-dw_revenue_TransLineFlattened` as (SELECT *  FROM UNNEST([STRUCT(CAST(NULL AS STRING) AS companyaccount, CAST(NULL AS DATE) AS signupdate, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS BOOL) AS isactive, CAST(NULL AS BOOL) AS istrialconverted, CAST(NULL AS STRING) AS channel, CAST(NULL AS STRING) AS partner, CAST(NULL AS STRING) AS platform, CAST(NULL AS DATE) AS firstsaasinvoicetxndate, CAST(NULL AS DATE) AS cancellationdate, CAST(NULL AS STRING) AS offering, CAST(NULL AS STRING) AS synctype, CAST(NULL AS STRING) AS synctyperegion, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS custdatindustry, CAST(NULL AS DATE) AS custdatfirstsynccompleted, CAST(NULL AS DATE) AS custdatlastrefreshed, CAST(NULL AS INT64) AS custdatcountofemployees, CAST(NULL AS INT64) AS custdatcountofcustomers, CAST(NULL AS INT64) AS licensecount, CAST(NULL AS INT64) AS countofcustomscreens, CAST(NULL AS INT64) AS countofcustomscreensmn, CAST(NULL AS BOOL) AS isconversionexception, CAST(NULL AS BOOL) AS ischurnexception, CAST(NULL AS STRING) AS accountsaaspaytype, CAST(NULL AS INT64) AS cookierecordid, CAST(NULL AS FLOAT64) AS att_direct, CAST(NULL AS FLOAT64) AS att_seo, CAST(NULL AS FLOAT64) AS att_opn_other_peoples_networks, CAST(NULL AS FLOAT64) AS att_pay_per_click, CAST(NULL AS FLOAT64) AS att_partners, CAST(NULL AS FLOAT64) AS att_email, CAST(NULL AS FLOAT64) AS att_remarketing, CAST(NULL AS FLOAT64) AS att_social, CAST(NULL AS FLOAT64) AS att_help_center, CAST(NULL AS FLOAT64) AS att_online_chat_tool, CAST(NULL AS FLOAT64) AS att_content, CAST(NULL AS FLOAT64) AS att_banner_ads, CAST(NULL AS FLOAT64) AS att_seminar_conference, CAST(NULL AS FLOAT64) AS att_referral_program, CAST(NULL AS FLOAT64) AS att_referral_link, CAST(NULL AS FLOAT64) AS att_backlinks, CAST(NULL AS FLOAT64) AS att_other, CAST(NULL AS FLOAT64) AS att_none, CAST(NULL AS FLOAT64) AS custdatpreviouslastsaasamount, CAST(NULL AS FLOAT64) AS custdatlastsaasamount, CAST(NULL AS FLOAT64) AS custdatannualsales, CAST(NULL AS STRING) AS entityfullname, CAST(NULL AS STRING) AS itemfullname, CAST(NULL AS STRING) AS accountfullname, CAST(NULL AS STRING) AS accounttype, CAST(NULL AS STRING) AS itemtype, CAST(NULL AS INT64) AS transrecordid, CAST(NULL AS DATE) AS txndate, CAST(NULL AS STRING) AS txntype, CAST(NULL AS INT64) AS accountrecordid, CAST(1 AS INT64) AS entityrecordid, CAST(NULL AS STRING) AS bomcustomergrouping, CAST(NULL AS STRING) AS eomcustomergrouping, CAST('Prepay' AS STRING) AS saaspaytype, CAST(NULL AS INT64) AS packpaidcount, CAST(NULL AS INT64) AS userpaidcount, CAST(NULL AS BOOL) AS isnewpayerthismonth, CAST(NULL AS STRING) AS salesrep, CAST(NULL AS INT64) AS ageatbom, CAST('SaaS' AS STRING) AS invoicegrouping, CAST(NULL AS STRING) AS platformtoggle, CAST(NULL AS INT64) AS itemrecordid, CAST(NULL AS FLOAT64) AS rate, CAST(NULL AS FLOAT64) AS qty, CAST(NULL AS FLOAT64) AS amount, CAST(NULL AS FLOAT64) AS saasbeforediscount, CAST(NULL AS FLOAT64) AS saasdiscount, CAST(NULL AS STRING) AS saasdiscounttype, CAST(100 AS FLOAT64) AS saasamount, CAST(NULL AS FLOAT64) AS saasexpense, CAST(NULL AS FLOAT64) AS psbeforediscount, CAST(NULL AS FLOAT64) AS psdiscount, CAST(NULL AS FLOAT64) AS psamount, CAST(NULL AS FLOAT64) AS psexpense, CAST(NULL AS FLOAT64) AS liabilityportion, CAST(NULL AS INT64) AS linerecordid), STRUCT(CAST(NULL AS STRING) AS companyaccount, CAST(NULL AS DATE) AS signupdate, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS BOOL) AS isactive, CAST(NULL AS BOOL) AS istrialconverted, CAST(NULL AS STRING) AS channel, CAST(NULL AS STRING) AS partner, CAST(NULL AS STRING) AS platform, CAST(NULL AS DATE) AS firstsaasinvoicetxndate, CAST(NULL AS DATE) AS cancellationdate, CAST(NULL AS STRING) AS offering, CAST(NULL AS STRING) AS synctype, CAST(NULL AS STRING) AS synctyperegion, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS custdatindustry, CAST(NULL AS DATE) AS custdatfirstsynccompleted, CAST(NULL AS DATE) AS custdatlastrefreshed, CAST(NULL AS INT64) AS custdatcountofemployees, CAST(NULL AS INT64) AS custdatcountofcustomers, CAST(NULL AS INT64) AS licensecount, CAST(NULL AS INT64) AS countofcustomscreens, CAST(NULL AS INT64) AS countofcustomscreensmn, CAST(NULL AS BOOL) AS isconversionexception, CAST(NULL AS BOOL) AS ischurnexception, CAST(NULL AS STRING) AS accountsaaspaytype, CAST(NULL AS INT64) AS cookierecordid, CAST(NULL AS FLOAT64) AS att_direct, CAST(NULL AS FLOAT64) AS att_seo, CAST(NULL AS FLOAT64) AS att_opn_other_peoples_networks, CAST(NULL AS FLOAT64) AS att_pay_per_click, CAST(NULL AS FLOAT64) AS att_partners, CAST(NULL AS FLOAT64) AS att_email, CAST(NULL AS FLOAT64) AS att_remarketing, CAST(NULL AS FLOAT64) AS att_social, CAST(NULL AS FLOAT64) AS att_help_center, CAST(NULL AS FLOAT64) AS att_online_chat_tool, CAST(NULL AS FLOAT64) AS att_content, CAST(NULL AS FLOAT64) AS att_banner_ads, CAST(NULL AS FLOAT64) AS att_seminar_conference, CAST(NULL AS FLOAT64) AS att_referral_program, CAST(NULL AS FLOAT64) AS att_referral_link, CAST(NULL AS FLOAT64) AS att_backlinks, CAST(NULL AS FLOAT64) AS att_other, CAST(NULL AS FLOAT64) AS att_none, CAST(NULL AS FLOAT64) AS custdatpreviouslastsaasamount, CAST(NULL AS FLOAT64) AS custdatlastsaasamount, CAST(NULL AS FLOAT64) AS custdatannualsales, CAST(NULL AS STRING) AS entityfullname, CAST(NULL AS STRING) AS itemfullname, CAST(NULL AS STRING) AS accountfullname, CAST(NULL AS STRING) AS accounttype, CAST(NULL AS STRING) AS itemtype, CAST(NULL AS INT64) AS transrecordid, CAST(NULL AS DATE) AS txndate, CAST(NULL AS STRING) AS txntype, CAST(NULL AS INT64) AS accountrecordid, CAST(2 AS INT64) AS entityrecordid, CAST(NULL AS STRING) AS bomcustomergrouping, CAST(NULL AS STRING) AS eomcustomergrouping, CAST('Monthly' AS STRING) AS saaspaytype, CAST(NULL AS INT64) AS packpaidcount, CAST(NULL AS INT64) AS userpaidcount, CAST(NULL AS BOOL) AS isnewpayerthismonth, CAST(NULL AS STRING) AS salesrep, CAST(NULL AS INT64) AS ageatbom, CAST('SaaS' AS STRING) AS invoicegrouping, CAST(NULL AS STRING) AS platformtoggle, CAST(NULL AS INT64) AS itemrecordid, CAST(NULL AS FLOAT64) AS rate, CAST(NULL AS FLOAT64) AS qty, CAST(NULL AS FLOAT64) AS amount, CAST(NULL AS FLOAT64) AS saasbeforediscount, CAST(NULL AS FLOAT64) AS saasdiscount, CAST(NULL AS STRING) AS saasdiscounttype, CAST(200 AS FLOAT64) AS saasamount, CAST(NULL AS FLOAT64) AS saasexpense, CAST(NULL AS FLOAT64) AS psbeforediscount, CAST(NULL AS FLOAT64) AS psdiscount, CAST(NULL AS FLOAT64) AS psamount, CAST(NULL AS FLOAT64) AS psexpense, CAST(NULL AS FLOAT64) AS liabilityportion, CAST(NULL AS INT64) AS linerecordid)])),
  	`project-for-method-dw_v7_classification_v_entity_primary_label` as (SELECT *  FROM UNNEST([STRUCT(CAST(1 AS INT64) AS customer_record_id, CAST('Construction' AS STRING) AS l1, CAST(NULL AS STRING) AS l2, CAST(NULL AS STRING) AS l3, CAST(NULL AS STRING) AS operating_model, CAST(NULL AS FLOAT64) AS confidence, CAST(NULL AS BOOL) AS is_multi_business, CAST(NULL AS BOOL) AS is_multi_client)])),
  	`project-for-method-dw_revenue_int_motion_funnel_expect` as (SELECT *  FROM UNNEST([STRUCT(CAST(1 AS INT64) AS entityrecordid, CAST('2024-01-01' AS DATE) AS signup_month, CAST(true AS BOOL) AS synced, CAST(true AS BOOL) AS converted, CAST('2024-02-01' AS DATE) AS convert_month, CAST(100 AS NUMERIC) AS mrr0, CAST('talked' AS STRING) AS motion, CAST(true AS BOOL) AS motion_trackable, CAST(true AS BOOL) AS demo_booked, CAST(true AS BOOL) AS demo_attended, CAST(false AS BOOL) AS free_booked, CAST(false AS BOOL) AS free_attended, CAST(true AS BOOL) AS is_customized, CAST(500 AS NUMERIC) AS ps_gross, CAST(true AS BOOL) AS ever_had_dep, CAST(true AS BOOL) AS ever_prepay, CAST('Construction' AS STRING) AS industry_l1, CAST('Solo' AS STRING) AS user_tier, CAST(true AS BOOL) AS retained_1mo, CAST(true AS BOOL) AS eligible_1mo, CAST(false AS BOOL) AS retained_3mo, CAST(true AS BOOL) AS eligible_3mo, CAST(false AS BOOL) AS retained_6mo, CAST(true AS BOOL) AS eligible_6mo, CAST(false AS BOOL) AS retained_12mo, CAST(false AS BOOL) AS eligible_12mo), STRUCT(CAST(2 AS INT64) AS entityrecordid, CAST('2024-02-01' AS DATE) AS signup_month, CAST(true AS BOOL) AS synced, CAST(true AS BOOL) AS converted, CAST('2024-03-01' AS DATE) AS convert_month, CAST(200 AS NUMERIC) AS mrr0, CAST('self_serve' AS STRING) AS motion, CAST(true AS BOOL) AS motion_trackable, CAST(false AS BOOL) AS demo_booked, CAST(false AS BOOL) AS demo_attended, CAST(false AS BOOL) AS free_booked, CAST(false AS BOOL) AS free_attended, CAST(false AS BOOL) AS is_customized, CAST(0 AS NUMERIC) AS ps_gross, CAST(false AS BOOL) AS ever_had_dep, CAST(false AS BOOL) AS ever_prepay, CAST('Unclassified' AS STRING) AS industry_l1, CAST('Small (2-4)' AS STRING) AS user_tier, CAST(false AS BOOL) AS retained_1mo, CAST(true AS BOOL) AS eligible_1mo, CAST(false AS BOOL) AS retained_3mo, CAST(true AS BOOL) AS eligible_3mo, CAST(false AS BOOL) AS retained_6mo, CAST(true AS BOOL) AS eligible_6mo, CAST(false AS BOOL) AS retained_12mo, CAST(false AS BOOL) AS eligible_12mo)])),
  	`project-for-method-dw_revenue_int_motion_funnel_actual` as (

-- Per-customer motion + lifecycle funnel row. ENTITY grain — one row per trialer.
-- Assembles the shipped spine (int_trials -> int_syncs -> int_customer_mrr) with the
-- talked-to-us fork (int_presale_touches), customization (int_customer_proserv),
-- DEP/prepay/industry lenses, and a multi-horizon retention curve computed per-entity
-- from int_customer_mrr (same first-pay anchor int_customer_survival uses; no engine
-- rebuilt). Directional: Activity-based motion is only trustworthy for 2024+ cohorts
-- (motion_trackable). See docs/superpowers/specs/2026-06-29-acquisition-funnel-phase2-motion-lifecycle-design.md.



WITH trials AS (
  SELECT EntityRecordID, DATE_TRUNC(MIN(SignupDate), MONTH) AS signup_month
  FROM `project-for-method-dw_revenue_int_trials`
  GROUP BY 1
),
syncs AS (
  SELECT EntityRecordID, MIN(SyncDate) AS sync_date
  FROM `project-for-method-dw_revenue_int_syncs`
  GROUP BY 1
),
mrr AS (
  SELECT EntityRecordID, Month, SUM(StartMRR) AS m
  FROM `project-for-method-dw_revenue_int_customer_mrr`
  GROUP BY 1, 2
),
conv AS (  -- first paying month = convert anchor t0
  SELECT EntityRecordID, MIN(Month) AS convert_month
  FROM mrr
  WHERE m > 0
  GROUP BY 1
),
conv_mrr AS (
  SELECT c.EntityRecordID, c.convert_month, mr.m AS mrr0
  FROM conv c JOIN mrr mr
    ON mr.EntityRecordID = c.EntityRecordID AND mr.Month = c.convert_month
),
dep AS (
  SELECT EntityRecordID, LOGICAL_OR(HasDEP) AS ever_had_dep
  FROM `project-for-method-dw_revenue_int_customers`
  GROUP BY 1
),
sizes AS (
  SELECT EntityRecordID, MAX(TotalUsers) AS users
  FROM `project-for-method-dw_revenue_int_customers`
  GROUP BY 1
),
prepay AS (
  SELECT EntityRecordID,
    LOGICAL_OR(InvoiceGrouping = 'SaaS' AND SaaSPayType = 'Prepay' AND SaaSAmount != 0) AS ever_prepay
  FROM `project-for-method-dw_revenue_TransLineFlattened`
  GROUP BY 1
),
censor AS (
  SELECT
    DATE('2024-12-01') AS censor_month
)
SELECT
  t.EntityRecordID,
  t.signup_month,
  s.sync_date IS NOT NULL                          AS synced,
  cm.convert_month IS NOT NULL                     AS converted,
  cm.convert_month,
  CAST(cm.mrr0 AS NUMERIC)                         AS mrr0,
  -- talked = attended a demo/free session on or before the convert month
  -- (or any time, if never converted). Else self_serve.
  CASE
    WHEN COALESCE(pt.attended_any, FALSE)
      AND (cm.convert_month IS NULL
           OR pt.first_attended_date < DATE_ADD(cm.convert_month, INTERVAL 1 MONTH))
    THEN 'talked' ELSE 'self_serve'
  END                                              AS motion,
  t.signup_month >= DATE('2024-01-01')             AS motion_trackable,
  COALESCE(pt.demo_booked, FALSE)                  AS demo_booked,
  COALESCE(pt.demo_attended, FALSE)                AS demo_attended,
  COALESCE(pt.free_booked, FALSE)                  AS free_booked,
  COALESCE(pt.free_attended, FALSE)                AS free_attended,
  COALESCE(ps.is_customized, FALSE)                AS is_customized,
  COALESCE(ps.ps_gross, 0)                         AS ps_gross,
  COALESCE(d.ever_had_dep, FALSE)                   AS ever_had_dep,
  COALESCE(pp.ever_prepay, FALSE)                   AS ever_prepay,
  COALESCE(ind.l1, 'Unclassified')                  AS industry_l1,
  -- customer size bucket derived from peak user count
  CASE
    WHEN sz.users IS NULL THEN 'Unknown'
    WHEN sz.users <= 1     THEN 'Solo'
    WHEN sz.users <= 4     THEN 'Small (2-4)'
    WHEN sz.users <= 10    THEN 'SMB (5-10)'
    ELSE                        'Mid (11+)'
  END                                               AS user_tier,
  -- retention horizons (numerator = alive at t0+K; eligible = t0+K observable)
  COALESCE(r1.m, 0) > 0                             AS retained_1mo,
  DATE_ADD(cm.convert_month, INTERVAL 1 MONTH)  <= c.censor_month AS eligible_1mo,
  COALESCE(r3.m, 0) > 0                             AS retained_3mo,
  DATE_ADD(cm.convert_month, INTERVAL 3 MONTH)  <= c.censor_month AS eligible_3mo,
  COALESCE(r6.m, 0) > 0                             AS retained_6mo,
  DATE_ADD(cm.convert_month, INTERVAL 6 MONTH)  <= c.censor_month AS eligible_6mo,
  COALESCE(r12.m, 0) > 0                            AS retained_12mo,
  DATE_ADD(cm.convert_month, INTERVAL 12 MONTH) <= c.censor_month AS eligible_12mo
FROM trials t
CROSS JOIN censor c
LEFT JOIN syncs s        ON s.EntityRecordID = t.EntityRecordID
-- Signup gate: a conversion only counts for this cohort if it happened at/after
-- the trial. Drops returning customers whose first-ever paying month predates
-- their (latest) trial signup — otherwise an old conversion pollutes a recent
-- cohort and shows as bogus "mature" retention. Mirrors int_customer_survival.
LEFT JOIN conv_mrr cm    ON cm.EntityRecordID = t.EntityRecordID
                        AND cm.convert_month >= t.signup_month
LEFT JOIN `project-for-method-dw_revenue_int_presale_touches` pt ON pt.EntityRecordID = t.EntityRecordID
LEFT JOIN `project-for-method-dw_revenue_int_customer_proserv` ps ON ps.EntityRecordID = t.EntityRecordID
LEFT JOIN dep d          ON d.EntityRecordID = t.EntityRecordID
LEFT JOIN sizes sz       ON sz.EntityRecordID = t.EntityRecordID
LEFT JOIN prepay pp      ON pp.EntityRecordID = t.EntityRecordID
LEFT JOIN `project-for-method-dw_v7_classification_v_entity_primary_label` ind
                         ON ind.customer_record_id = t.EntityRecordID
LEFT JOIN mrr r1  ON r1.EntityRecordID = t.EntityRecordID  AND r1.Month  = DATE_ADD(cm.convert_month, INTERVAL 1 MONTH)
LEFT JOIN mrr r3  ON r3.EntityRecordID = t.EntityRecordID  AND r3.Month  = DATE_ADD(cm.convert_month, INTERVAL 3 MONTH)
LEFT JOIN mrr r6  ON r6.EntityRecordID = t.EntityRecordID  AND r6.Month  = DATE_ADD(cm.convert_month, INTERVAL 6 MONTH)
LEFT JOIN mrr r12 ON r12.EntityRecordID = t.EntityRecordID AND r12.Month = DATE_ADD(cm.convert_month, INTERVAL 12 MONTH)
WHERE t.signup_month >= DATE('2020-01-01')
)
        (SELECT EntityRecordID, signup_month, synced, converted, convert_month, mrr0, motion, motion_trackable, demo_booked, demo_attended, free_booked, free_attended, is_customized, ps_gross, ever_had_dep, ever_prepay, industry_l1, user_tier, retained_1mo, eligible_1mo, retained_3mo, eligible_3mo, retained_6mo, eligible_6mo, retained_12mo, eligible_12mo, 'actual' AS actual_or_expected FROM `project-for-method-dw_revenue_int_motion_funnel_actual`)
        UNION ALL
        (SELECT EntityRecordID, signup_month, synced, converted, convert_month, mrr0, motion, motion_trackable, demo_booked, demo_attended, free_booked, free_attended, is_customized, ps_gross, ever_had_dep, ever_prepay, industry_l1, user_tier, retained_1mo, eligible_1mo, retained_3mo, eligible_3mo, retained_6mo, eligible_6mo, retained_12mo, eligible_12mo, 'expected' AS actual_or_expected FROM `project-for-method-dw_revenue_int_motion_funnel_expect`)
        ORDER BY EntityRecordID, signup_month, synced, converted, convert_month, mrr0, motion, motion_trackable, demo_booked, demo_attended, free_booked, free_attended, is_customized, ps_gross, ever_had_dep, ever_prepay, industry_l1, user_tier, retained_1mo, eligible_1mo, retained_3mo, eligible_3mo, retained_6mo, eligible_6mo, retained_12mo, eligible_12mo