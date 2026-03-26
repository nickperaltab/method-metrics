-- BQ Views Backup — 2026-03-26
-- Run this file to restore all views if anything breaks.
-- Source: revenue.INFORMATION_SCHEMA.VIEWS

-- ============================================================
-- BASE VIEWS (Funnel, TransLineFlattened) — DO NOT DROP
-- ============================================================

-- Funnel is a complex view joining Account data with Trial/Sync/Conversion events.
-- TransLineFlattened joins Trans, Account, Entity, Item with UNNEST(Line).
-- These are effectively base tables. Not included here — too large and should never be dropped.

-- ============================================================
-- 9 PRIMITIVES
-- ============================================================

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_trials` AS
SELECT
  SignupDate, CompanyAccount, Channel, SignupCountry, SyncType, SyncTypeRegion, Vertical, CustDatIndustry,
  Att_SEO, Att_Pay_Per_Click, Att_OPN_Other_Peoples_Networks, Att_Social, Att_Email,
  Att_Referral_Link, Att_Referral_Program, Att_Direct, Att_Partners, Att_Content,
  Att_Remarketing, Att_Other, Att_None, Att_Backlinks, Att_Banner_Ads,
  Att_Help_Center, Att_Online_Chat_Tool, Att_Seminar_Conference
FROM revenue.Account
WHERE IsConversionException = FALSE
  AND Partner != 'Method Integration'
  AND SignupDate != DATE('0001-01-01');

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_syncs` AS
SELECT
  CAST(Date AS DATE) AS SyncDate,
  SignupDate,
  CompanyAccount,
  EventType,
  SyncType,
  SyncTypeRegion,
  SignupCountry,
  Vertical,
  Att_SEO, Att_Pay_Per_Click, Att_OPN_Other_Peoples_Networks, Att_Social,
  Att_Direct, Att_Partners, Att_Content, Att_Remarketing, Att_Other, Att_None,
  Att_Backlinks, Att_Banner_Ads, Att_Help_Center, Att_Online_Chat_Tool,
  Att_Referral_Link, Att_Referral_Program, Att_Seminar_Conference
FROM `project-for-method-dw.revenue.Funnel`
WHERE EventType = 'Sync';

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_conversions` AS
SELECT
  FirstSaaSInvoiceTxnDate,
  SignupDate,
  CompanyAccount,
  Channel,
  SignupCountry,
  SyncType,
  SyncTypeRegion,
  Vertical,
  CustDatIndustry,
  Custdatlastsaasamount,
  CustDatCountOfEmployees,
  Att_SEO, Att_Pay_Per_Click, Att_OPN_Other_Peoples_Networks, Att_Social,
  Att_Direct, Att_Partners, Att_Content, Att_Remarketing, Att_Other, Att_None,
  Att_Backlinks, Att_Banner_Ads, Att_Help_Center, Att_Online_Chat_Tool,
  Att_Referral_Link, Att_Referral_Program, Att_Seminar_Conference
FROM `project-for-method-dw.revenue.Account`
WHERE IsConversionException = FALSE
  AND Partner != 'Method Integration'
  AND FirstSaaSInvoiceTxnDate != DATE('0001-01-01');

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_cancellations` AS
SELECT
  CancellationDate,
  SignupDate,
  CompanyAccount,
  Channel,
  SignupCountry,
  Custdatlastsaasamount,
  CustDatIndustry
FROM `project-for-method-dw.revenue.Account`
WHERE CancellationDate != DATE('0001-01-01')
  AND FirstSaaSInvoiceTxnDate != DATE('0001-01-01')
  AND IsConversionException = FALSE
  AND Partner != 'Method Integration';

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_bom_customers` AS
SELECT
  TxnDate,
  CompanyAccount
FROM `project-for-method-dw.revenue.TransLineFlattened`
WHERE BOMCustomerGrouping = 'Customer'
  AND IsNewPayerThisMonth = FALSE
  AND IsConversionException = FALSE
  AND Partner != 'Method Integration';

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_new_net_saas` AS
SELECT
  TxnDate,
  CompanyAccount,
  SaaSAmount
FROM `project-for-method-dw.revenue.TransLineFlattened`
WHERE IsNewPayerThisMonth = TRUE
  AND IsConversionException = FALSE
  AND Partner != 'Method Integration'
  AND AccountFullName NOT LIKE '%Premium App%'
  AND AccountFullName NOT LIKE '%Enhancement Plan%';

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_new_dep_revenue` AS
WITH DEPAccounts AS (
  SELECT * FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE (AccountFullName LIKE '%Premium App%' OR AccountFullName LIKE '%Enhancement Plan%')
    AND IsConversionException = FALSE
    AND Partner != 'Method Integration'
),
FirstAppearance AS (
  SELECT CompanyAccount, MIN(TxnDate) AS FirstTxnDate
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE (AccountFullName LIKE '%Premium App%' OR AccountFullName LIKE '%Enhancement Plan%')
  GROUP BY CompanyAccount
)
SELECT
  d.TxnDate,
  d.CompanyAccount,
  d.SaaSAmount,
  f.FirstTxnDate,
  DATE_TRUNC(f.FirstTxnDate, MONTH) = DATE_TRUNC(d.TxnDate, MONTH) AS is_new_dep
FROM DEPAccounts d
LEFT JOIN FirstAppearance f ON d.CompanyAccount = f.CompanyAccount;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_total_net_saas` AS
SELECT
  TxnDate,
  CompanyAccount,
  SaaSAmount,
  SaaSExpense
FROM `project-for-method-dw.revenue.TransLineFlattened`
WHERE IsConversionException = FALSE
  AND Partner != 'Method Integration';

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_total_dep_revenue` AS
SELECT
  TxnDate,
  CompanyAccount,
  SaaSAmount
FROM `project-for-method-dw.revenue.TransLineFlattened`
WHERE (AccountFullName LIKE '%Premium App%' OR AccountFullName LIKE '%Enhancement Plan%')
  AND IsConversionException = FALSE
  AND Partner != 'Method Integration';

-- ============================================================
-- BY-DIMENSION VIEWS (keeping these — column mapping nuances)
-- ============================================================

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_trials_by_channel` AS
SELECT Channel, FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS trials
FROM `project-for-method-dw.revenue.v_trials`
GROUP BY 1, 2 ORDER BY 2, 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_trials_by_country` AS
SELECT SignupCountry, FORMAT_DATE('%Y-W%V', SignupDate) AS week, COUNT(*) AS trials
FROM `project-for-method-dw.revenue.v_trials`
WHERE SignupDate >= DATE_TRUNC(CURRENT_DATE(), MONTH) - INTERVAL 60 DAY
GROUP BY 1, 2 ORDER BY 2, 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_trials_by_industry` AS
SELECT CustDatIndustry, FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS trials
FROM `project-for-method-dw.revenue.v_trials`
GROUP BY 1, 2 ORDER BY 2, 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_trials_by_sync_type` AS
SELECT SyncType, FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS trials
FROM `project-for-method-dw.revenue.v_trials`
GROUP BY 1, 2 ORDER BY 2, 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_syncs_by_channel` AS
SELECT SyncType AS Channel, FORMAT_DATE('%Y-%m', SyncDate) AS period, COUNT(*) AS syncs
FROM `project-for-method-dw.revenue.v_syncs`
GROUP BY 1, 2 ORDER BY 2, 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_syncs_by_country` AS
SELECT SignupCountry, FORMAT_DATE('%Y-W%V', SyncDate) AS week, COUNT(*) AS syncs
FROM `project-for-method-dw.revenue.v_syncs`
WHERE SyncDate >= DATE_TRUNC(CURRENT_DATE(), MONTH) - INTERVAL 60 DAY
GROUP BY 1, 2 ORDER BY 2, 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_syncs_by_sync_type` AS
SELECT SyncType, FORMAT_DATE('%Y-%m', SyncDate) AS period, COUNT(*) AS syncs
FROM `project-for-method-dw.revenue.v_syncs`
GROUP BY 1, 2 ORDER BY 2, 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_conversions_by_channel` AS
SELECT Channel, FORMAT_DATE('%Y-%m', FirstSaaSInvoiceTxnDate) AS period, COUNT(*) AS conversions
FROM `project-for-method-dw.revenue.v_conversions`
GROUP BY 1, 2 ORDER BY 2, 1;

-- ============================================================
-- ATTRIBUTION (complex unpivot)
-- ============================================================

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_trials_by_attribution` AS
SELECT period, channel, ROUND(SUM(weight), 1) AS attributed
FROM (
  SELECT FORMAT_DATE('%Y-%m', SignupDate) AS period, 'SEO' AS channel, Att_SEO AS weight FROM `project-for-method-dw.revenue.v_trials`
  UNION ALL SELECT FORMAT_DATE('%Y-%m', SignupDate), 'PPC', Att_Pay_Per_Click FROM `project-for-method-dw.revenue.v_trials`
  UNION ALL SELECT FORMAT_DATE('%Y-%m', SignupDate), 'OPN', Att_OPN_Other_Peoples_Networks FROM `project-for-method-dw.revenue.v_trials`
  UNION ALL SELECT FORMAT_DATE('%Y-%m', SignupDate), 'Social', Att_Social FROM `project-for-method-dw.revenue.v_trials`
  UNION ALL SELECT FORMAT_DATE('%Y-%m', SignupDate), 'Email', Att_Email FROM `project-for-method-dw.revenue.v_trials`
  UNION ALL SELECT FORMAT_DATE('%Y-%m', SignupDate), 'Referral', Att_Referral_Link FROM `project-for-method-dw.revenue.v_trials`
  UNION ALL SELECT FORMAT_DATE('%Y-%m', SignupDate), 'Direct', Att_Direct FROM `project-for-method-dw.revenue.v_trials`
  UNION ALL SELECT FORMAT_DATE('%Y-%m', SignupDate), 'Partners', Att_Partners FROM `project-for-method-dw.revenue.v_trials`
  UNION ALL SELECT FORMAT_DATE('%Y-%m', SignupDate), 'Content', Att_Content FROM `project-for-method-dw.revenue.v_trials`
  UNION ALL SELECT FORMAT_DATE('%Y-%m', SignupDate), 'Remarketing', Att_Remarketing FROM `project-for-method-dw.revenue.v_trials`
  UNION ALL SELECT FORMAT_DATE('%Y-%m', SignupDate), 'Other', Att_Other FROM `project-for-method-dw.revenue.v_trials`
  UNION ALL SELECT FORMAT_DATE('%Y-%m', SignupDate), 'None', Att_None FROM `project-for-method-dw.revenue.v_trials`
) GROUP BY 1, 2 ORDER BY 1, 2;

-- ============================================================
-- MRR VIEWS
-- ============================================================

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_converted_mrr` AS
SELECT FORMAT_DATE('%Y-%m', FirstSaaSInvoiceTxnDate) AS period,
  COUNT(*) AS conversions,
  ROUND(SUM(Custdatlastsaasamount), 2) AS mrr
FROM `project-for-method-dw.revenue.v_conversions`
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_avg_mrr_per_conversion` AS
SELECT period, conversions, mrr,
  ROUND(SAFE_DIVIDE(mrr, conversions), 2) AS avg_mrr
FROM `project-for-method-dw.revenue.v_converted_mrr`;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_mrr_lost` AS
SELECT FORMAT_DATE('%Y-%m', CancellationDate) AS period,
  COUNT(DISTINCT CompanyAccount) AS churned,
  ROUND(SUM(Custdatlastsaasamount), 2) AS mrr_lost
FROM `project-for-method-dw.revenue.v_cancellations`
GROUP BY 1 ORDER BY 1;

-- ============================================================
-- VIEWS BEING DROPPED (backup only — restore if needed)
-- ============================================================

-- MONTHLY VIEWS

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_trials_monthly` AS
SELECT FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS actual
FROM `project-for-method-dw.revenue.v_trials`
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_syncs_monthly` AS
SELECT FORMAT_DATE('%Y-%m', SyncDate) AS period, COUNT(*) AS actual
FROM `project-for-method-dw.revenue.v_syncs`
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_conversions_monthly` AS
SELECT FORMAT_DATE('%Y-%m', FirstSaaSInvoiceTxnDate) AS period, COUNT(*) AS actual
FROM `project-for-method-dw.revenue.v_conversions`
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_cancellations_monthly` AS
SELECT FORMAT_DATE('%Y-%m', CancellationDate) AS period,
  COUNT(DISTINCT CompanyAccount) AS actual
FROM `project-for-method-dw.revenue.v_cancellations`
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_bom_monthly` AS
SELECT FORMAT_DATE('%Y-%m', TxnDate) AS period,
  COUNT(DISTINCT CompanyAccount) AS bom_customers
FROM `project-for-method-dw.revenue.v_bom_customers`
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_new_net_saas_monthly` AS
SELECT FORMAT_DATE('%Y-%m', TxnDate) AS period,
  ROUND(SUM(SaaSAmount), 0) AS actual
FROM `project-for-method-dw.revenue.v_new_net_saas`
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_new_dep_monthly` AS
SELECT FORMAT_DATE('%Y-%m', TxnDate) AS period,
  ROUND(SUM(CASE WHEN is_new_dep THEN SaaSAmount ELSE 0 END), 0) AS actual
FROM `project-for-method-dw.revenue.v_new_dep_revenue`
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_total_net_saas_monthly` AS
SELECT FORMAT_DATE('%Y-%m', TxnDate) AS period,
  ROUND(SUM(SaaSAmount + SaaSExpense), 0) AS actual
FROM `project-for-method-dw.revenue.v_total_net_saas`
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_total_dep_monthly` AS
SELECT FORMAT_DATE('%Y-%m', TxnDate) AS period,
  ROUND(SUM(SaaSAmount), 0) AS actual
FROM `project-for-method-dw.revenue.v_total_dep_revenue`
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_us_trials_monthly` AS
SELECT FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS actual
FROM `project-for-method-dw.revenue.v_us_trials`
GROUP BY 1 ORDER BY 1;

-- WEEKLY VIEWS

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_trials_weekly` AS
SELECT FORMAT_DATE('%Y-W%V', SignupDate) AS week,
  MIN(FORMAT_DATE('%b %d', SignupDate)) AS label,
  COUNT(*) AS actual
FROM `project-for-method-dw.revenue.v_trials`
WHERE SignupDate >= DATE_TRUNC(CURRENT_DATE(), MONTH) - INTERVAL 60 DAY
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_syncs_weekly` AS
SELECT FORMAT_DATE('%Y-W%V', SyncDate) AS week,
  MIN(FORMAT_DATE('%b %d', SyncDate)) AS label,
  COUNT(*) AS actual
FROM `project-for-method-dw.revenue.v_syncs`
WHERE SyncDate >= DATE_TRUNC(CURRENT_DATE(), MONTH) - INTERVAL 60 DAY
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_conversions_weekly` AS
SELECT FORMAT_DATE('%Y-W%V', FirstSaaSInvoiceTxnDate) AS week,
  MIN(FORMAT_DATE('%b %d', FirstSaaSInvoiceTxnDate)) AS label,
  COUNT(*) AS actual
FROM `project-for-method-dw.revenue.v_conversions`
WHERE FirstSaaSInvoiceTxnDate >= DATE_TRUNC(CURRENT_DATE(), MONTH) - INTERVAL 60 DAY
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_cancellations_weekly` AS
SELECT FORMAT_DATE('%Y-W%V', CancellationDate) AS week,
  MIN(FORMAT_DATE('%b %d', CancellationDate)) AS label,
  COUNT(DISTINCT CompanyAccount) AS actual
FROM `project-for-method-dw.revenue.v_cancellations`
WHERE CancellationDate >= DATE_TRUNC(CURRENT_DATE(), MONTH) - INTERVAL 60 DAY
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_new_net_saas_weekly` AS
SELECT FORMAT_DATE('%Y-W%V', TxnDate) AS week,
  MIN(FORMAT_DATE('%b %d', TxnDate)) AS label,
  ROUND(SUM(SaaSAmount), 0) AS actual
FROM `project-for-method-dw.revenue.v_new_net_saas`
WHERE TxnDate >= DATE_TRUNC(CURRENT_DATE(), MONTH) - INTERVAL 60 DAY
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_new_dep_weekly` AS
SELECT FORMAT_DATE('%Y-W%V', TxnDate) AS week,
  MIN(FORMAT_DATE('%b %d', TxnDate)) AS label,
  ROUND(SUM(CASE WHEN is_new_dep THEN SaaSAmount ELSE 0 END), 0) AS actual
FROM `project-for-method-dw.revenue.v_new_dep_revenue`
WHERE TxnDate >= DATE_TRUNC(CURRENT_DATE(), MONTH) - INTERVAL 60 DAY
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_total_net_saas_weekly` AS
SELECT FORMAT_DATE('%Y-W%V', TxnDate) AS week,
  MIN(FORMAT_DATE('%b %d', TxnDate)) AS label,
  ROUND(SUM(SaaSAmount + SaaSExpense), 0) AS actual
FROM `project-for-method-dw.revenue.v_total_net_saas`
WHERE TxnDate >= DATE_TRUNC(CURRENT_DATE(), MONTH) - INTERVAL 60 DAY
GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_total_dep_weekly` AS
SELECT FORMAT_DATE('%Y-W%V', TxnDate) AS week,
  MIN(FORMAT_DATE('%b %d', TxnDate)) AS label,
  ROUND(SUM(SaaSAmount), 0) AS actual
FROM `project-for-method-dw.revenue.v_total_dep_revenue`
WHERE TxnDate >= DATE_TRUNC(CURRENT_DATE(), MONTH) - INTERVAL 60 DAY
GROUP BY 1 ORDER BY 1;

-- YOY VIEWS

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_trials_yoy` AS
SELECT EXTRACT(YEAR FROM SignupDate) AS year,
  EXTRACT(MONTH FROM SignupDate) AS month_num,
  FORMAT_DATE('%b', SignupDate) AS month_name,
  COUNT(*) AS actual
FROM `project-for-method-dw.revenue.v_trials`
GROUP BY 1, 2, 3 ORDER BY 1, 2;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_syncs_yoy` AS
SELECT EXTRACT(YEAR FROM SyncDate) AS year,
  EXTRACT(MONTH FROM SyncDate) AS month_num,
  FORMAT_DATE('%b', SyncDate) AS month_name,
  COUNT(*) AS actual
FROM `project-for-method-dw.revenue.v_syncs`
GROUP BY 1, 2, 3 ORDER BY 1, 2;

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_conversions_yoy` AS
SELECT EXTRACT(YEAR FROM FirstSaaSInvoiceTxnDate) AS year,
  EXTRACT(MONTH FROM FirstSaaSInvoiceTxnDate) AS month_num,
  FORMAT_DATE('%b', FirstSaaSInvoiceTxnDate) AS month_name,
  COUNT(*) AS actual
FROM `project-for-method-dw.revenue.v_conversions`
GROUP BY 1, 2, 3 ORDER BY 1, 2;

-- ============================================================
-- SCORECARD (original version referencing _monthly views)
-- ============================================================

CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_scorecard_mtd` AS
WITH current_month AS (
  SELECT
    FORMAT_DATE('%Y-%m', CURRENT_DATE()) AS period,
    EXTRACT(DAY FROM CURRENT_DATE()) - 1 AS days_elapsed,
    EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE())) AS days_in_month
),
actuals AS (
  SELECT 'trials' AS metric, actual FROM `project-for-method-dw.revenue.v_trials_monthly` t, current_month cm WHERE t.period = cm.period
  UNION ALL SELECT 'syncs', actual FROM `project-for-method-dw.revenue.v_syncs_monthly` t, current_month cm WHERE t.period = cm.period
  UNION ALL SELECT 'conversions', actual FROM `project-for-method-dw.revenue.v_conversions_monthly` t, current_month cm WHERE t.period = cm.period
  UNION ALL SELECT 'cancellations', actual FROM `project-for-method-dw.revenue.v_cancellations_monthly` t, current_month cm WHERE t.period = cm.period
  UNION ALL SELECT 'bom_customers', bom_customers FROM `project-for-method-dw.revenue.v_bom_monthly` t, current_month cm WHERE t.period = cm.period
  UNION ALL SELECT 'new_net_saas', actual FROM `project-for-method-dw.revenue.v_new_net_saas_monthly` t, current_month cm WHERE t.period = cm.period
  UNION ALL SELECT 'new_dep_revenue', actual FROM `project-for-method-dw.revenue.v_new_dep_monthly` t, current_month cm WHERE t.period = cm.period
  UNION ALL SELECT 'total_net_saas', actual FROM `project-for-method-dw.revenue.v_total_net_saas_monthly` t, current_month cm WHERE t.period = cm.period
  UNION ALL SELECT 'total_dep_revenue', actual FROM `project-for-method-dw.revenue.v_total_dep_monthly` t, current_month cm WHERE t.period = cm.period
),
forecasts AS (
  SELECT metric,
    ROUND(SUM(CAST(budget AS FLOAT64)), 2) AS budget
  FROM (
    SELECT 'trials' AS metric, Budgeted_Trials AS budget FROM `project-for-method-dw.revenue.method_forecast` WHERE FORMAT_DATE('%Y-%m', Forecasted_Month) = FORMAT_DATE('%Y-%m', CURRENT_DATE())
    UNION ALL SELECT 'syncs', Budgeted_Syncs FROM `project-for-method-dw.revenue.method_forecast` WHERE FORMAT_DATE('%Y-%m', Forecasted_Month) = FORMAT_DATE('%Y-%m', CURRENT_DATE())
    UNION ALL SELECT 'conversions', Budgeted_Conversion FROM `project-for-method-dw.revenue.method_forecast` WHERE FORMAT_DATE('%Y-%m', Forecasted_Month) = FORMAT_DATE('%Y-%m', CURRENT_DATE())
    UNION ALL SELECT 'cancellations', Budgeted_Churn FROM `project-for-method-dw.revenue.method_forecast` WHERE FORMAT_DATE('%Y-%m', Forecasted_Month) = FORMAT_DATE('%Y-%m', CURRENT_DATE())
    UNION ALL SELECT 'new_net_saas', Budgeted_New_Net_SaaS FROM `project-for-method-dw.revenue.method_forecast` WHERE FORMAT_DATE('%Y-%m', Forecasted_Month) = FORMAT_DATE('%Y-%m', CURRENT_DATE())
    UNION ALL SELECT 'new_dep_revenue', Budgeted_New_DEP_Revenue FROM `project-for-method-dw.revenue.method_forecast` WHERE FORMAT_DATE('%Y-%m', Forecasted_Month) = FORMAT_DATE('%Y-%m', CURRENT_DATE())
    UNION ALL SELECT 'total_net_saas', Budgeted_Total_Net_SaaS FROM `project-for-method-dw.revenue.method_forecast` WHERE FORMAT_DATE('%Y-%m', Forecasted_Month) = FORMAT_DATE('%Y-%m', CURRENT_DATE())
    UNION ALL SELECT 'total_dep_revenue', Budgeted_Total_DEP_Revenue FROM `project-for-method-dw.revenue.method_forecast` WHERE FORMAT_DATE('%Y-%m', Forecasted_Month) = FORMAT_DATE('%Y-%m', CURRENT_DATE())
    UNION ALL SELECT 'cancellations', Budgeted_Churn FROM `project-for-method-dw.revenue.method_forecast` WHERE FORMAT_DATE('%Y-%m', Forecasted_Month) = FORMAT_DATE('%Y-%m', CURRENT_DATE())
  ) GROUP BY metric
)
SELECT
  cm.period,
  a.metric,
  a.actual AS mtd_actual,
  ROUND(a.actual * cm.days_in_month / NULLIF(cm.days_elapsed, 0), 0) AS trajectory,
  f.budget AS forecast,
  ROUND(a.actual * cm.days_in_month / NULLIF(cm.days_elapsed, 0), 0) - COALESCE(f.budget, 0) AS variance,
  ROUND(SAFE_DIVIDE(a.actual * cm.days_in_month / NULLIF(cm.days_elapsed, 0), f.budget) * 100, 1) AS attainment_pct,
  cm.days_elapsed,
  cm.days_in_month
FROM actuals a
CROSS JOIN current_month cm
LEFT JOIN forecasts f ON a.metric = f.metric;
