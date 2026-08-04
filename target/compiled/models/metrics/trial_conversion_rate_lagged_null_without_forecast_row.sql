-- Build actual result given inputs
WITH
            	`project-for-method-dw_revenue_int_conversions` as (SELECT *  FROM UNNEST([STRUCT(CAST('2026-02-04' AS DATE) AS firstsaasinvoicetxndate, CAST(NULL AS DATE) AS signupdate, CAST(NULL AS STRING) AS companyaccount, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS synctype, CAST(NULL AS STRING) AS synctyperegion, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS custdatindustry, CAST(NULL AS FLOAT64) AS custdatlastsaasamount, CAST(NULL AS INT64) AS custdatcountofemployees, CAST(NULL AS FLOAT64) AS att_seo, CAST(NULL AS FLOAT64) AS att_pay_per_click, CAST(NULL AS FLOAT64) AS att_opn_other_peoples_networks, CAST(NULL AS FLOAT64) AS att_social, CAST(NULL AS FLOAT64) AS att_direct, CAST(NULL AS FLOAT64) AS att_partners, CAST(NULL AS FLOAT64) AS att_content, CAST(NULL AS FLOAT64) AS att_remarketing, CAST(NULL AS FLOAT64) AS att_other, CAST(NULL AS FLOAT64) AS att_none, CAST(NULL AS FLOAT64) AS att_backlinks, CAST(NULL AS FLOAT64) AS att_banner_ads, CAST(NULL AS FLOAT64) AS att_help_center, CAST(NULL AS FLOAT64) AS att_online_chat_tool, CAST(NULL AS FLOAT64) AS att_referral_link, CAST(NULL AS FLOAT64) AS att_referral_program, CAST(NULL AS FLOAT64) AS att_seminar_conference, CAST(NULL AS FLOAT64) AS att_email, CAST(NULL AS STRING) AS attributionchannel, CAST(NULL AS STRING) AS email, CAST(NULL AS FLOAT64) AS totalsaasamount), STRUCT(CAST('2026-02-18' AS DATE) AS firstsaasinvoicetxndate, CAST(NULL AS DATE) AS signupdate, CAST(NULL AS STRING) AS companyaccount, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS synctype, CAST(NULL AS STRING) AS synctyperegion, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS custdatindustry, CAST(NULL AS FLOAT64) AS custdatlastsaasamount, CAST(NULL AS INT64) AS custdatcountofemployees, CAST(NULL AS FLOAT64) AS att_seo, CAST(NULL AS FLOAT64) AS att_pay_per_click, CAST(NULL AS FLOAT64) AS att_opn_other_peoples_networks, CAST(NULL AS FLOAT64) AS att_social, CAST(NULL AS FLOAT64) AS att_direct, CAST(NULL AS FLOAT64) AS att_partners, CAST(NULL AS FLOAT64) AS att_content, CAST(NULL AS FLOAT64) AS att_remarketing, CAST(NULL AS FLOAT64) AS att_other, CAST(NULL AS FLOAT64) AS att_none, CAST(NULL AS FLOAT64) AS att_backlinks, CAST(NULL AS FLOAT64) AS att_banner_ads, CAST(NULL AS FLOAT64) AS att_help_center, CAST(NULL AS FLOAT64) AS att_online_chat_tool, CAST(NULL AS FLOAT64) AS att_referral_link, CAST(NULL AS FLOAT64) AS att_referral_program, CAST(NULL AS FLOAT64) AS att_seminar_conference, CAST(NULL AS FLOAT64) AS att_email, CAST(NULL AS STRING) AS attributionchannel, CAST(NULL AS STRING) AS email, CAST(NULL AS FLOAT64) AS totalsaasamount)])),
  	`project-for-method-dw_revenue_int_trials` as (SELECT *  FROM UNNEST([STRUCT(CAST(NULL AS INT64) AS entityrecordid, CAST('2026-01-02' AS DATE) AS signupdate, CAST(NULL AS STRING) AS companyaccount, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS synctype, CAST(NULL AS STRING) AS synctyperegion, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS custdatindustry, CAST(NULL AS FLOAT64) AS att_seo, CAST(NULL AS FLOAT64) AS att_pay_per_click, CAST(NULL AS FLOAT64) AS att_opn_other_peoples_networks, CAST(NULL AS FLOAT64) AS att_social, CAST(NULL AS FLOAT64) AS att_email, CAST(NULL AS FLOAT64) AS att_referral_link, CAST(NULL AS FLOAT64) AS att_referral_program, CAST(NULL AS FLOAT64) AS att_direct, CAST(NULL AS FLOAT64) AS att_partners, CAST(NULL AS FLOAT64) AS att_content, CAST(NULL AS FLOAT64) AS att_remarketing, CAST(NULL AS FLOAT64) AS att_other, CAST(NULL AS FLOAT64) AS att_none, CAST(NULL AS FLOAT64) AS att_backlinks, CAST(NULL AS FLOAT64) AS att_banner_ads, CAST(NULL AS FLOAT64) AS att_help_center, CAST(NULL AS FLOAT64) AS att_online_chat_tool, CAST(NULL AS FLOAT64) AS att_seminar_conference, CAST(NULL AS STRING) AS attributionchannel), STRUCT(CAST(NULL AS INT64) AS entityrecordid, CAST('2026-01-08' AS DATE) AS signupdate, CAST(NULL AS STRING) AS companyaccount, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS synctype, CAST(NULL AS STRING) AS synctyperegion, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS custdatindustry, CAST(NULL AS FLOAT64) AS att_seo, CAST(NULL AS FLOAT64) AS att_pay_per_click, CAST(NULL AS FLOAT64) AS att_opn_other_peoples_networks, CAST(NULL AS FLOAT64) AS att_social, CAST(NULL AS FLOAT64) AS att_email, CAST(NULL AS FLOAT64) AS att_referral_link, CAST(NULL AS FLOAT64) AS att_referral_program, CAST(NULL AS FLOAT64) AS att_direct, CAST(NULL AS FLOAT64) AS att_partners, CAST(NULL AS FLOAT64) AS att_content, CAST(NULL AS FLOAT64) AS att_remarketing, CAST(NULL AS FLOAT64) AS att_other, CAST(NULL AS FLOAT64) AS att_none, CAST(NULL AS FLOAT64) AS att_backlinks, CAST(NULL AS FLOAT64) AS att_banner_ads, CAST(NULL AS FLOAT64) AS att_help_center, CAST(NULL AS FLOAT64) AS att_online_chat_tool, CAST(NULL AS FLOAT64) AS att_seminar_conference, CAST(NULL AS STRING) AS attributionchannel), STRUCT(CAST(NULL AS INT64) AS entityrecordid, CAST('2026-01-15' AS DATE) AS signupdate, CAST(NULL AS STRING) AS companyaccount, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS synctype, CAST(NULL AS STRING) AS synctyperegion, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS custdatindustry, CAST(NULL AS FLOAT64) AS att_seo, CAST(NULL AS FLOAT64) AS att_pay_per_click, CAST(NULL AS FLOAT64) AS att_opn_other_peoples_networks, CAST(NULL AS FLOAT64) AS att_social, CAST(NULL AS FLOAT64) AS att_email, CAST(NULL AS FLOAT64) AS att_referral_link, CAST(NULL AS FLOAT64) AS att_referral_program, CAST(NULL AS FLOAT64) AS att_direct, CAST(NULL AS FLOAT64) AS att_partners, CAST(NULL AS FLOAT64) AS att_content, CAST(NULL AS FLOAT64) AS att_remarketing, CAST(NULL AS FLOAT64) AS att_other, CAST(NULL AS FLOAT64) AS att_none, CAST(NULL AS FLOAT64) AS att_backlinks, CAST(NULL AS FLOAT64) AS att_banner_ads, CAST(NULL AS FLOAT64) AS att_help_center, CAST(NULL AS FLOAT64) AS att_online_chat_tool, CAST(NULL AS FLOAT64) AS att_seminar_conference, CAST(NULL AS STRING) AS attributionchannel), STRUCT(CAST(NULL AS INT64) AS entityrecordid, CAST('2026-01-22' AS DATE) AS signupdate, CAST(NULL AS STRING) AS companyaccount, CAST(NULL AS STRING) AS signupcountry, CAST(NULL AS STRING) AS synctype, CAST(NULL AS STRING) AS synctyperegion, CAST(NULL AS STRING) AS vertical, CAST(NULL AS STRING) AS custdatindustry, CAST(NULL AS FLOAT64) AS att_seo, CAST(NULL AS FLOAT64) AS att_pay_per_click, CAST(NULL AS FLOAT64) AS att_opn_other_peoples_networks, CAST(NULL AS FLOAT64) AS att_social, CAST(NULL AS FLOAT64) AS att_email, CAST(NULL AS FLOAT64) AS att_referral_link, CAST(NULL AS FLOAT64) AS att_referral_program, CAST(NULL AS FLOAT64) AS att_direct, CAST(NULL AS FLOAT64) AS att_partners, CAST(NULL AS FLOAT64) AS att_content, CAST(NULL AS FLOAT64) AS att_remarketing, CAST(NULL AS FLOAT64) AS att_other, CAST(NULL AS FLOAT64) AS att_none, CAST(NULL AS FLOAT64) AS att_backlinks, CAST(NULL AS FLOAT64) AS att_banner_ads, CAST(NULL AS FLOAT64) AS att_help_center, CAST(NULL AS FLOAT64) AS att_online_chat_tool, CAST(NULL AS FLOAT64) AS att_seminar_conference, CAST(NULL AS STRING) AS attributionchannel)])),
  	`project-for-method-dw_revenue_method_forecast` as (SELECT *  FROM UNNEST(ARRAY<STRUCT<Date DATE, Forecasted_Month DATE, Forecasted_Trials INT64, Forecasted_Syncs INT64, Forecasted_Conversion INT64, Forecasted_New_Net_SaaS FLOAT64, Forecasted_New_DEP_Revenue STRING, Forecasted_Total_Net_SaaS FLOAT64, Forecasted_Total_DEP_Revenue FLOAT64, Forecasted_Churn FLOAT64, Forecasted_Churn_Rate__ FLOAT64, Forecasted_NRR FLOAT64, Forecasted_Conversion_Rate FLOAT64, Budgeted_Trials FLOAT64, Budgeted_Syncs FLOAT64, Budgeted_Conversion FLOAT64, Budgeted_New_Net_SaaS FLOAT64, Budgeted_New_DEP_Revenue FLOAT64, Budgeted_Total_Net_SaaS FLOAT64, Budgeted_Total_DEP_Revenue FLOAT64, Budgeted_Churn FLOAT64, Budgeted_Churn_Rate__ FLOAT64, Budgeted_NRR FLOAT64, Budgeted_Conversion_Rate FLOAT64, _FILE_NAME STRING>>[])),
  	`project-for-method-dw_revenue_metrics_v_metric__trial_conversion_rate_lagged_expect` as (SELECT *  FROM UNNEST([STRUCT(CAST('2026-02-01' AS DATE) AS period, CAST(NULL AS FLOAT64) AS value)])),
  	`project-for-method-dw_revenue_metrics_v_metric__trial_conversion_rate_lagged_actual` as (

-- Canonical metric: "Conversion Rate" (#357) — the Sales Scorecard flavour
-- Type: derived ratio
--
-- Formula: conversions in M
--            / ((trials in M-1 + forecasted trials in M) / 2)
--
-- This is NOT v_metric__trial_to_conversion_rate (#302). #302 is
-- same-month and runs 15-20%. This one lags the denominator by a month
-- and blends in forecast, which is what the Looker Sales Scorecard shows.
--
-- The one-month lag is deliberate: trials convert roughly a month after
-- signup, so pairing conversions in M against trials in M-1 is closer to
-- a cohort than same-month would be.
--
-- The current month reads LOW (a partial numerator over a full-month
-- denominator). That is not a bug — it is why the panel shows ~9.6%
-- mid-month and ~13% at month end. Do not "fix" it by annualising here;
-- the trajectory metric (#321) is the month-end projection.
--
-- Emits a decimal rate (0.096), not a percentage (9.6).
--
-- NULL handling: a period is only computable if BOTH prior-month trials
-- AND that month's forecast row exist. `method_forecast` only has data
-- from 2025-12 onward, so months before forecast coverage begins have no
-- `forecast` row. Do NOT COALESCE the missing side to 0 — that silently
-- halves the denominator (via the /2.0 average) and roughly doubles the
-- rate for every pre-coverage month. Instead, let a missing input
-- propagate to a NULL denominator, so SAFE_DIVIDE returns NULL for that
-- period. The row still appears (one row per month with conversions) so
-- a chart consumer sees an explicit gap for that period rather than the
-- period silently vanishing — a missing row could otherwise be mistaken
-- for the pipeline not having run, whereas a NULL value unambiguously
-- says "not computable yet." The window therefore self-extends: as the
-- forecast sheet accumulates history, older months resolve on their own
-- with no code change needed here.

WITH conversions AS (
  SELECT
    DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS period,
    COUNT(*) AS conversions
  FROM `project-for-method-dw_revenue_int_conversions`
  WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
  GROUP BY 1
),
trials_lagged AS (
  -- Trials from month M-1, surfaced under month M.
  SELECT
    DATE_ADD(DATE_TRUNC(SignupDate, MONTH), INTERVAL 1 MONTH) AS period,
    COUNT(*) AS prior_month_trials
  FROM `project-for-method-dw_revenue_int_trials`
  WHERE SignupDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 25 MONTH)
  GROUP BY 1
),
forecast AS (
  SELECT
    DATE_TRUNC(Date, MONTH) AS period,
    SUM(Forecasted_Trials) AS forecasted_trials
  FROM `project-for-method-dw_revenue_method_forecast`
  GROUP BY 1
)
SELECT
  c.period AS period,
  SAFE_DIVIDE(
    c.conversions,
    (t.prior_month_trials + f.forecasted_trials) / 2.0
  ) AS value
FROM conversions c
LEFT JOIN trials_lagged t USING (period)
LEFT JOIN forecast f USING (period)
ORDER BY 1
)
        (SELECT period, value, 'actual' AS actual_or_expected FROM `project-for-method-dw_revenue_metrics_v_metric__trial_conversion_rate_lagged_actual`)
        UNION ALL
        (SELECT period, value, 'expected' AS actual_or_expected FROM `project-for-method-dw_revenue_metrics_v_metric__trial_conversion_rate_lagged_expect`)
        ORDER BY period, value