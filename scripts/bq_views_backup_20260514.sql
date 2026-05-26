-- BigQuery view backup — project-for-method-dw.revenue
-- Generated: 2026-05-14
-- Total views: 36

-- ============================================================
-- Funnel
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.Funnel` AS
WITH AccountData AS (
    SELECT 
        EntityRecordID,
        CompanyAccount,
        SignupDate,
  		SignupCountry,
        CustDatFirstSyncCompleted,
  		CustDatLastSaasAmount,
        FirstSaaSInvoiceTxnDate,
        CookieRecordID,
        Att_Backlinks,
        Att_Banner_Ads,
        Att_Content,
        Att_Direct,
        Att_Help_Center,
        Att_None,
        Att_Online_Chat_Tool,
        Att_OPN_Other_Peoples_Networks,
        Att_Other,
        Att_Partners,
        Att_Pay_Per_Click,
        Att_Referral_Link,
        Att_Referral_Program,
        Att_Remarketing,
        Att_Seminar_Conference,
        Att_SEO,
        Att_Social,
        SyncType,
        SyncTypeRegion,
        Vertical,
        SaaSPayType
    FROM `project-for-method-dw.revenue.Account`
    WHERE IsConversionException = FALSE
      AND Partner != 'Method Integration'
)

SELECT 
    SignupDate AS Date,
    EntityRecordID,
    CompanyAccount,
    'Trial' AS EventType,
    SignupDate,
    SignupCountry,
    CustDatFirstSyncCompleted,
  	CustDatLastSaasAmount,
    FirstSaaSInvoiceTxnDate,
    CookieRecordID,
    Att_Backlinks,
    Att_Banner_Ads,
    Att_Content,
    Att_Direct,
    Att_Help_Center,
    Att_None,
    Att_Online_Chat_Tool,
    Att_OPN_Other_Peoples_Networks,
    Att_Other,
    Att_Partners,
    Att_Pay_Per_Click,
    Att_Referral_Link,
    Att_Referral_Program,
    Att_Remarketing,
    Att_Seminar_Conference,
    Att_SEO,
    Att_Social,
    SyncType,
    SyncTypeRegion,
    Vertical,
    SaaSPayType
FROM AccountData
WHERE SignupDate != DATE('0001-01-01')

UNION ALL

SELECT 
    SignupDate AS Date,
    EntityRecordID,
    CompanyAccount,
    'Sync' AS EventType,
    SignupDate,
    SignupCountry,
    CustDatFirstSyncCompleted,
  	CustDatLastSaasAmount,
    FirstSaaSInvoiceTxnDate,
    CookieRecordID,
    Att_Backlinks,
    Att_Banner_Ads,
    Att_Content,
    Att_Direct,
    Att_Help_Center,
    Att_None,
    Att_Online_Chat_Tool,
    Att_OPN_Other_Peoples_Networks,
    Att_Other,
    Att_Partners,
    Att_Pay_Per_Click,
    Att_Referral_Link,
    Att_Referral_Program,
    Att_Remarketing,
    Att_Seminar_Conference,
    Att_SEO,
    Att_Social,
    SyncType,
    SyncTypeRegion,
    Vertical,
    SaaSPayType
FROM AccountData
WHERE SyncTypeRegion != "" AND SignupDate != DATE('0001-01-01')

UNION ALL

SELECT 
    FirstSaaSInvoiceTxnDate AS Date,
    EntityRecordID,
    CompanyAccount,
    'Conversion' AS EventType,
    SignupDate,
    SignupCountry,
    CustDatFirstSyncCompleted,
  	CustDatLastSaasAmount,
    FirstSaaSInvoiceTxnDate,
    CookieRecordID,
    Att_Backlinks,
    Att_Banner_Ads,
    Att_Content,
    Att_Direct,
    Att_Help_Center,
    Att_None,
    Att_Online_Chat_Tool,
    Att_OPN_Other_Peoples_Networks,
    Att_Other,
    Att_Partners,
    Att_Pay_Per_Click,
    Att_Referral_Link,
    Att_Referral_Program,
    Att_Remarketing,
    Att_Seminar_Conference,
    Att_SEO,
    Att_Social,
    SyncType,
    SyncTypeRegion,
    Vertical,
    SaaSPayType
FROM AccountData
WHERE FirstSaaSInvoiceTxnDate != DATE('0001-01-01');

-- ============================================================
-- TransLineFlattened
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.TransLineFlattened` AS
SELECT 
CompanyAccount, SignUpDate, SignupCountry, IsActive, IsTrialConverted, Channel, Partner, Platform, FirstSaaSInvoiceTxnDate, CancellationDate, Offering, SyncType, SyncTypeRegion, Vertical, CustDatIndustry, CustDatFirstSyncCompleted, CustDatLastRefreshed, CustDatCountOfEmployees, CustDatCountOfCustomers, LicenseCount, CountOfCustomScreens, CountOfCustomScreensMN, IsConversionException, IsChurnException, A.SaaSPayType AS AccountSaaSPayType, CookieRecordID, Att_Direct, Att_SEO, Att_OPN_Other_Peoples_Networks, Att_Pay_Per_Click, Att_Partners, Att_Email, Att_Remarketing, Att_Social, Att_Help_Center, Att_Online_Chat_Tool, Att_Content, Att_Banner_Ads, Att_Seminar_Conference, Att_Referral_Program, Att_Referral_Link, Att_Backlinks, Att_Other, Att_None, Custdatpreviouslastsaasamount, Custdatlastsaasamount, CustDatAnnualSales,
E.EntityFullName,
I.ItemFullName, I.AccountFullName, I.AccountType, I.ItemType,
T.RecordID As TransRecordID, TxnDate, TxnType, AccountRecordID, T.EntityRecordID, BOMCustomerGrouping, EOMCustomerGrouping, T.SaaSPayType, PackPaidCount, UserPaidCount, IsNewPayerThisMonth, TRIM(SalesRep) AS SalesRep, AgeAtBOM, InvoiceGrouping, PlatformToggle, Line.ItemRecordID, Line.Rate, Line.Qty, Line.Amount, Line.SaaSBeforeDiscount, Line.SaaSDiscount, Line.SaaSDiscountType, Line.SaaSAmount, Line.SaaSExpense, Line.PSBeforeDiscount, Line.PSDiscount, Line.PSAmount, Line.PSExpense, Line.LiabilityPortion, Line.LineRecordID
FROM `revenue.Trans` T
LEFT JOIN `revenue.Account` A ON T.AccountRecordID = A.RecordID
LEFT JOIN `revenue.Entity` E ON T.EntityRecordID = E.RecordID
LEFT JOIN UNNEST(T.Line) AS Line
LEFT JOIN `revenue.Item` I ON Line.ItemRecordID = I.RecordID
WHERE CompanyAccount NOT LIKE "m11%";

-- ============================================================
-- v_accounts
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_accounts` AS
WITH months AS (
  SELECT DATE_TRUNC(d, MONTH) AS month
  FROM UNNEST(GENERATE_DATE_ARRAY('2023-01-01', CURRENT_DATE(), INTERVAL 1 MONTH)) AS d
),
dep_by_month AS (
  SELECT CompanyAccount, DATE_TRUNC(TxnDate, MONTH) AS month
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE (AccountFullName LIKE '%Premium App%' OR AccountFullName LIKE '%Enhancement Plan%')
  GROUP BY 1, 2
),
accounts AS (
  SELECT
    a.CompanyAccount,
    a.SignUpDate,
    a.FirstSaaSInvoiceTxnDate,
    a.CancellationDate,
    CASE
      WHEN a.Att_SEO = 1 THEN 'SEO'
      WHEN a.Att_Pay_Per_Click = 1 THEN 'PPC'
      WHEN a.Att_OPN_Other_Peoples_Networks = 1 THEN 'OPN'
      WHEN a.Att_Social = 1 THEN 'Social'
      WHEN a.Att_Email = 1 THEN 'Email'
      WHEN a.Att_Referral_Link = 1 THEN 'Referral'
      WHEN a.Att_Direct = 1 THEN 'Direct'
      WHEN a.Att_Partners = 1 THEN 'Partners'
      WHEN a.Att_Content = 1 THEN 'Content'
      WHEN a.Att_Remarketing = 1 THEN 'Remarketing'
      WHEN a.Att_Other = 1 THEN 'Other'
      WHEN a.Att_None = 1 THEN 'None'
      ELSE 'Unknown'
    END AS AttributionChannel,
    a.SignupCountry,
    a.Vertical,
    a.SyncType
  FROM `project-for-method-dw.revenue.Account` a
  WHERE a.IsConversionException = FALSE
    AND a.Partner != 'Method Integration'
    AND a.FirstSaaSInvoiceTxnDate IS NOT NULL
    AND a.FirstSaaSInvoiceTxnDate != DATE('0001-01-01')
)
SELECT
  m.month AS Month,
  a.CompanyAccount,
  a.AttributionChannel,
  a.SignupCountry,
  a.Vertical,
  a.SyncType,
  (a.FirstSaaSInvoiceTxnDate <= LAST_DAY(m.month)
   AND (a.CancellationDate IS NULL 
        OR a.CancellationDate = DATE('0001-01-01')
        OR a.CancellationDate > LAST_DAY(m.month))) AS IsCustomer,
  DATE_TRUNC(a.FirstSaaSInvoiceTxnDate, MONTH) = m.month AS IsNew,
  (a.CancellationDate IS NOT NULL
   AND a.CancellationDate != DATE('0001-01-01')
   AND DATE_TRUNC(a.CancellationDate, MONTH) = m.month) AS IsChurned,
  dep.CompanyAccount IS NOT NULL AS HasDEP
FROM months m
CROSS JOIN accounts a
LEFT JOIN dep_by_month dep 
  ON a.CompanyAccount = dep.CompanyAccount AND m.month = dep.month
WHERE 
  a.FirstSaaSInvoiceTxnDate <= LAST_DAY(m.month)
  AND (
    (a.CancellationDate IS NULL 
     OR a.CancellationDate = DATE('0001-01-01')
     OR a.CancellationDate > LAST_DAY(m.month))
    OR DATE_TRUNC(a.CancellationDate, MONTH) = m.month
  );

-- ============================================================
-- v_bom_customers
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_bom_customers` AS
SELECT
  TxnDate,
  CompanyAccount
FROM `project-for-method-dw.revenue.TransLineFlattened`
WHERE BOMCustomerGrouping = 'Customer'
  AND IsNewPayerThisMonth = FALSE
  AND IsConversionException = FALSE
  AND Partner != 'Method Integration';

-- ============================================================
-- v_cancellations
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_cancellations` AS
SELECT
  CancellationDate,
  SignupDate,
  CompanyAccount,
  Channel AS AttributionChannel,
  SignupCountry,
  Vertical,
  SyncType,
  LicenseCount,
  SaaSPayType,
  DATE_DIFF(CancellationDate, SignupDate, MONTH) AS AgeMonths,
  CASE
    WHEN DATE_DIFF(CancellationDate, SignupDate, MONTH) < 6  THEN '0–6mo'
    WHEN DATE_DIFF(CancellationDate, SignupDate, MONTH) < 12 THEN '6–12mo'
    WHEN DATE_DIFF(CancellationDate, SignupDate, MONTH) < 24 THEN '12–24mo'
    ELSE '24mo+'
  END AS AgeBucket,
  CASE
    WHEN LicenseCount = 1        THEN '1'
    WHEN LicenseCount <= 5       THEN '2–5'
    WHEN LicenseCount <= 15      THEN '6–15'
    ELSE '16+'
  END AS LicenseTier,
  Custdatlastsaasamount,
  CustDatIndustry
FROM `project-for-method-dw.revenue.Account`
WHERE CancellationDate != DATE('0001-01-01')
  AND FirstSaaSInvoiceTxnDate != DATE('0001-01-01')
  AND IsConversionException = FALSE
  AND Partner != 'Method Integration';

-- ============================================================
-- v_cancellations_mrr
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_cancellations_mrr` AS
WITH entity_monthly AS (
  SELECT
    FORMAT_DATE('%Y-%m', TxnDate) AS month,
    EntityRecordID,
    SUM(SaaSAmount) AS total_saas,
    COUNTIF(SaaSAmount != 0) AS saas_lines,
    COUNTIF(SaaSAmount != 0 AND AccountFullName LIKE '%Prepay Expiry Income%') AS expiry_lines
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE TxnDate >= '2021-12-01'
    AND FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
  GROUP BY month, EntityRecordID
),
comparison AS (
  SELECT p2.month, p2.EntityRecordID,
    COALESCE(p1.total_saas, 0) AS p1_saas, p2.total_saas AS p2_saas,
    COALESCE(p1.expiry_lines, 0) AS p1_expiry_lines,
    COALESCE(p1.saas_lines, 0) AS p1_saas_lines,
    COALESCE(p2.expiry_lines, 0) AS p2_expiry_lines,
    COALESCE(p2.saas_lines, 0) AS p2_saas_lines
  FROM entity_monthly p2
  LEFT JOIN entity_monthly p1
    ON p2.EntityRecordID = p1.EntityRecordID
    AND p1.month = FORMAT_DATE('%Y-%m', DATE_SUB(PARSE_DATE('%Y-%m', p2.month), INTERVAL 1 MONTH))
  WHERE p2.month >= '2022-01'
  UNION ALL
  SELECT
    FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) AS month,
    p1.EntityRecordID, p1.total_saas AS p1_saas, 0 AS p2_saas,
    p1.expiry_lines AS p1_expiry_lines, p1.saas_lines AS p1_saas_lines,
    0 AS p2_expiry_lines, 0 AS p2_saas_lines
  FROM entity_monthly p1
  LEFT JOIN entity_monthly p2
    ON p1.EntityRecordID = p2.EntityRecordID
    AND p2.month = FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH))
  WHERE p2.EntityRecordID IS NULL
    AND FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) >= '2022-01'
)
SELECT month,
  ROUND(SUM(CASE WHEN p1_saas > 0 AND p2_saas = 0 THEN p1_saas ELSE 0 END)
    - SUM(CASE WHEN p1_saas > 0 AND p2_saas = 0 AND p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines THEN p1_saas ELSE 0 END), 2) AS cancellations
FROM comparison
GROUP BY month
ORDER BY month;

-- ============================================================
-- v_channel_scorecard
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_channel_scorecard` AS
WITH
  calendar AS (
    SELECT
      DATE_TRUNC(CURRENT_DATE(), MONTH)                                        AS month_start,
      EXTRACT(DAY FROM CURRENT_DATE()) - 1                                     AS days_elapsed,
      DATE_DIFF(
        DATE_ADD(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH),
        DATE_TRUNC(CURRENT_DATE(), MONTH),
        DAY
      )                                                                         AS days_in_month
  ),

  trial_actuals AS (
    SELECT AttributionChannel AS channel, COUNT(*) AS trials
    FROM `project-for-method-dw.revenue.v_trials`
    WHERE SignupDate >= (SELECT month_start FROM calendar)
      AND SignupDate < CURRENT_DATE()
    GROUP BY 1
  ),

  sync_actuals AS (
    SELECT AttributionChannel AS channel, COUNT(*) AS syncs
    FROM `project-for-method-dw.revenue.v_syncs`
    WHERE SyncDate >= (SELECT month_start FROM calendar)
      AND SyncDate < CURRENT_DATE()
    GROUP BY 1
  ),

  forecasts AS (
    SELECT
      Channel AS channel,
      ROUND(MAX(Budgeted_Trials) * (SELECT days_in_month FROM calendar), 1) AS trials_forecast,
      ROUND(MAX(Budgeted_Syncs)  * (SELECT days_in_month FROM calendar), 1) AS syncs_forecast
    FROM `project-for-method-dw.revenue.looker_inputs`
    WHERE Forecast_Month = (SELECT month_start FROM calendar)
    GROUP BY 1
  )

SELECT
  COALESCE(t.channel, s.channel, f.channel) AS channel,

  -- Trials
  COALESCE(t.trials, 0)                                                                                                      AS trials,
  f.trials_forecast,
  ROUND(SAFE_DIVIDE(COALESCE(t.trials, 0), c.days_elapsed) * c.days_in_month, 1)                                            AS trials_trajectory,
  ROUND(SAFE_DIVIDE(COALESCE(t.trials, 0), c.days_elapsed) * c.days_in_month - f.trials_forecast, 1)                       AS trials_traj_vs_forecast,
  ROUND(SAFE_DIVIDE(SAFE_DIVIDE(COALESCE(t.trials, 0), c.days_elapsed) * c.days_in_month - f.trials_forecast, f.trials_forecast) * 100, 1) AS trials_traj_vs_forecast_pct,

  -- Syncs
  COALESCE(s.syncs, 0)                                                                                                       AS syncs,
  f.syncs_forecast,
  ROUND(SAFE_DIVIDE(COALESCE(s.syncs, 0), c.days_elapsed) * c.days_in_month, 1)                                             AS syncs_trajectory,
  ROUND(SAFE_DIVIDE(COALESCE(s.syncs, 0), c.days_elapsed) * c.days_in_month - f.syncs_forecast, 1)                        AS syncs_traj_vs_forecast,
  ROUND(SAFE_DIVIDE(SAFE_DIVIDE(COALESCE(s.syncs, 0), c.days_elapsed) * c.days_in_month - f.syncs_forecast, f.syncs_forecast) * 100, 1) AS syncs_traj_vs_forecast_pct,

  -- Sync rate
  ROUND(SAFE_DIVIDE(COALESCE(s.syncs, 0), COALESCE(t.trials, 0)) * 100, 2)                                                 AS sync_rate_pct,
  ROUND(SAFE_DIVIDE(f.syncs_forecast, f.trials_forecast) * 100, 2)                                                         AS sync_rate_forecast_pct,
  ROUND((SAFE_DIVIDE(COALESCE(s.syncs, 0), COALESCE(t.trials, 0)) - SAFE_DIVIDE(f.syncs_forecast, f.trials_forecast)) * 100, 2) AS sync_rate_vs_forecast_pct

FROM trial_actuals t
FULL OUTER JOIN sync_actuals s ON t.channel = s.channel
FULL OUTER JOIN forecasts f    ON COALESCE(t.channel, s.channel) = f.channel
CROSS JOIN calendar c
ORDER BY COALESCE(t.trials, 0) DESC;

-- ============================================================
-- v_conversions
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_conversions` AS
SELECT
  FirstSaaSInvoiceTxnDate,
  SignupDate,
  CompanyAccount,
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
  Att_Referral_Link, Att_Referral_Program, Att_Seminar_Conference,
  Att_Email,
  CASE
    WHEN Att_SEO = 1 THEN 'SEO'
    WHEN Att_Pay_Per_Click = 1 THEN 'PPC'
    WHEN Att_OPN_Other_Peoples_Networks = 1 THEN 'OPN'
    WHEN Att_Social = 1 THEN 'Social'
    WHEN Att_Email = 1 THEN 'Email'
    WHEN Att_Referral_Link = 1 THEN 'Referral'
    WHEN Att_Direct = 1 THEN 'Direct'
    WHEN Att_Partners = 1 THEN 'Partners'
    WHEN Att_Content = 1 THEN 'Content'
    WHEN Att_Remarketing = 1 THEN 'Remarketing'
    WHEN Att_Other = 1 THEN 'Other'
    WHEN Att_None = 1 THEN 'None'
    ELSE 'Unknown'
  END AS AttributionChannel
FROM `project-for-method-dw.revenue.Account`
WHERE IsConversionException = FALSE
  AND Partner != 'Method Integration'
  AND FirstSaaSInvoiceTxnDate != DATE('0001-01-01');

-- ============================================================
-- v_customer_annual_mrr
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_customer_annual_mrr` AS
WITH entity_monthly AS (
  SELECT
    FORMAT_DATE('%Y-%m', TxnDate)                                              AS month_str,
    DATE_TRUNC(TxnDate, MONTH)                                                 AS Month,
    EntityRecordID,
    -- ORDER BY adds CompanyAccount ASC as a deterministic tie-breaker.
    -- Without it, equal-revenue CompanyAccounts under one entity caused the
    -- view to pick different "winning" names on different query plans, which
    -- then broke the final JOIN ON Company.
    ARRAY_AGG(CompanyAccount ORDER BY SaaSAmount DESC, CompanyAccount ASC LIMIT 1)[OFFSET(0)] AS company,
    SUM(SaaSAmount)                                                            AS total_saas,
    COUNTIF(SaaSAmount != 0)                                                   AS saas_lines,
    COUNTIF(SaaSAmount != 0 AND AccountFullName LIKE '%Prepay Expiry Income%') AS expiry_lines
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE TxnDate >= '2021-12-01'
    AND FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    -- Exclude internal Method accounts (m11/m18 prefixes) — matches Looker
    -- and SaaS Analytics Engine filters.
    AND CompanyAccount NOT LIKE 'm11%'
    AND CompanyAccount NOT LIKE 'm18%'
  GROUP BY 1, 2, 3
),

-- P1/P2 pairing at EntityRecordID grain (12-month shift).
-- Path A: entity appeared in P2 (may or may not have a P1 row 12m ago).
-- Path B: entity had P1 12m ago but no P2 now — the churn event row.
entity_paired AS (
  -- Path A: entity has a row in this month (P2)
  SELECT
    p2.Month,
    p2.month_str,
    p2.EntityRecordID,
    COALESCE(p2.company, p1.company)   AS Company,
    COALESCE(p1.total_saas, 0)         AS p1_saas,
    p2.total_saas                      AS p2_saas,
    COALESCE(p1.expiry_lines, 0)       AS p1_expiry_lines,
    COALESCE(p1.saas_lines, 0)         AS p1_saas_lines
  FROM entity_monthly p2
  LEFT JOIN entity_monthly p1
    ON  p2.EntityRecordID = p1.EntityRecordID
    AND p1.month_str = FORMAT_DATE('%Y-%m',
          DATE_SUB(p2.Month, INTERVAL 12 MONTH))
  WHERE p2.month_str >= '2023-01'

  UNION ALL

  -- Path B: entity had P1 12m ago but disappeared 12m later (churn)
  SELECT
    DATE_ADD(p1.Month, INTERVAL 12 MONTH)                 AS Month,
    FORMAT_DATE('%Y-%m',
      DATE_ADD(p1.Month, INTERVAL 12 MONTH))              AS month_str,
    p1.EntityRecordID,
    p1.company                                            AS Company,
    p1.total_saas                                         AS p1_saas,
    0                                                     AS p2_saas,
    p1.expiry_lines                                       AS p1_expiry_lines,
    p1.saas_lines                                         AS p1_saas_lines
  FROM entity_monthly p1
  LEFT JOIN entity_monthly p2
    ON  p1.EntityRecordID = p2.EntityRecordID
    AND p2.month_str = FORMAT_DATE('%Y-%m',
          DATE_ADD(p1.Month, INTERVAL 12 MONTH))
  WHERE p2.EntityRecordID IS NULL
    AND FORMAT_DATE('%Y-%m', DATE_ADD(p1.Month, INTERVAL 12 MONTH))
          < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND FORMAT_DATE('%Y-%m', DATE_ADD(p1.Month, INTERVAL 12 MONTH))
          >= '2023-01'
),

-- Aggregate to CompanyAccount level for event classification.
-- Multi-entity companies must be classified as a unit: one entity cancelling
-- while another stays is a downgrade, not a cancellation.
company_level AS (
  SELECT
    month_str,
    Month,
    Company,
    SUM(p1_saas)         AS p1_saas,
    SUM(p2_saas)         AS p2_saas,
    SUM(p1_expiry_lines) AS p1_expiry_lines,
    SUM(p1_saas_lines)   AS p1_saas_lines
  FROM entity_paired
  GROUP BY 1, 2, 3
),

-- Compute classification amounts at company level.
-- StartMRR and Cancellations BOTH apply the all-PE exclusion (symmetric).
company_classified AS (
  SELECT
    month_str,
    Month,
    Company,
    p1_saas,
    p2_saas,
    CASE WHEN p1_saas > 0
              AND NOT (p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines)
         THEN p1_saas ELSE 0 END
      AS StartMRR,
    CASE WHEN p1_saas > 0 AND p2_saas = 0
              AND NOT (p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines)
         THEN p1_saas ELSE 0 END
      AS Cancellations,
    CASE WHEN p1_saas > 0 AND p2_saas > 0 AND p2_saas < p1_saas
         THEN p1_saas - p2_saas ELSE 0 END
      AS Downgrades,
    CASE WHEN p1_saas > 0 AND p2_saas > p1_saas
         THEN p2_saas - p1_saas ELSE 0 END
      AS Expansions,
    CASE WHEN p1_saas = 0 AND p2_saas > 0
         THEN p2_saas ELSE 0 END
      AS NewMRR
  FROM company_level
)

SELECT
  ep.Month,
  ep.EntityRecordID,
  cc.Company,
  CAST(ep.p1_saas AS NUMERIC)   AS p1_saas,
  CAST(ep.p2_saas AS NUMERIC)   AS p2_saas,
  CAST(
    CASE WHEN cc.p1_saas > 0
         THEN cc.StartMRR    * SAFE_DIVIDE(ep.p1_saas, cc.p1_saas)
         ELSE 0 END
  AS NUMERIC) AS StartMRR,
  CAST(
    CASE WHEN cc.p1_saas > 0
         THEN cc.Cancellations * SAFE_DIVIDE(ep.p1_saas, cc.p1_saas)
         ELSE 0 END
  AS NUMERIC) AS Cancellations,
  CAST(
    CASE WHEN cc.p1_saas > 0
         THEN cc.Downgrades  * SAFE_DIVIDE(ep.p1_saas, cc.p1_saas)
         ELSE 0 END
  AS NUMERIC) AS Downgrades,
  CAST(
    CASE WHEN cc.p1_saas > 0
         THEN cc.Expansions  * SAFE_DIVIDE(ep.p1_saas, cc.p1_saas)
         ELSE 0 END
  AS NUMERIC) AS Expansions,
  CAST(
    CASE WHEN cc.p2_saas > 0 AND cc.p1_saas = 0
         THEN cc.NewMRR * SAFE_DIVIDE(ep.p2_saas, cc.p2_saas)
         ELSE 0 END
  AS NUMERIC) AS NewMRR,
  -- Dimensions sourced from v_customers.
  -- For existing customers (p1>0): use 12-month-prior dims (reflects the
  --   segment the customer was in at the start of the annual cohort).
  -- For new customers (p1=0): use current-month dims.
  vc_dim.Segment,
  vc_dim.UserTier,
  vc_dim.HasDEP,
  vc_dim.AttributionChannel,
  vc_dim.SignupCountry,
  vc_dim.Vertical,
  vc_dim.SyncType
FROM entity_paired ep
JOIN company_classified cc
  ON  ep.month_str = cc.month_str
  AND ep.Company   = cc.Company
LEFT JOIN `project-for-method-dw.revenue.v_customers` vc_dim
  ON  vc_dim.EntityRecordID = ep.EntityRecordID
  AND vc_dim.Month = CASE
    WHEN ep.p1_saas > 0 THEN DATE_SUB(ep.Month, INTERVAL 12 MONTH)
    ELSE ep.Month
  END;

-- ============================================================
-- v_customer_mrr
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_customer_mrr` AS
WITH entity_monthly AS (
  SELECT
    FORMAT_DATE('%Y-%m', TxnDate)                                              AS month_str,
    DATE_TRUNC(TxnDate, MONTH)                                                 AS Month,
    EntityRecordID,
    -- ORDER BY adds CompanyAccount ASC as a deterministic tie-breaker.
    -- Without it, equal-revenue CompanyAccounts under one entity caused the
    -- view to pick different "winning" names on different query plans, which
    -- then broke the final JOIN ON Company.
    ARRAY_AGG(CompanyAccount ORDER BY SaaSAmount DESC, CompanyAccount ASC LIMIT 1)[OFFSET(0)] AS company,
    SUM(SaaSAmount)                                                            AS total_saas,
    COUNTIF(SaaSAmount != 0)                                                   AS saas_lines,
    COUNTIF(SaaSAmount != 0 AND AccountFullName LIKE '%Prepay Expiry Income%') AS expiry_lines
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE TxnDate >= '2021-12-01'
    AND FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    -- Exclude internal Method accounts (m11/m18 prefixes) — matches Looker
    -- and SaaS Analytics Engine filters.
    AND CompanyAccount NOT LIKE 'm11%'
    AND CompanyAccount NOT LIKE 'm18%'
  GROUP BY 1, 2, 3
),

-- P1/P2 pairing at EntityRecordID grain.
-- Path A: entity appeared in P2 (may or may not have a P1 row).
-- Path B: entity had P1 but no P2 — the churn event row.
entity_paired AS (
  -- Path A: entity has a row in this month (P2)
  SELECT
    p2.Month,
    p2.month_str,
    p2.EntityRecordID,
    COALESCE(p2.company, p1.company)   AS Company,
    COALESCE(p1.total_saas, 0)         AS p1_saas,
    p2.total_saas                      AS p2_saas,
    COALESCE(p1.expiry_lines, 0)       AS p1_expiry_lines,
    COALESCE(p1.saas_lines, 0)         AS p1_saas_lines
  FROM entity_monthly p2
  LEFT JOIN entity_monthly p1
    ON  p2.EntityRecordID = p1.EntityRecordID
    AND p1.month_str = FORMAT_DATE('%Y-%m',
          DATE_SUB(p2.Month, INTERVAL 1 MONTH))
  WHERE p2.month_str >= '2022-01'

  UNION ALL

  -- Path B: entity had P1 but disappeared in the next month (churn)
  SELECT
    DATE_ADD(p1.Month, INTERVAL 1 MONTH)                 AS Month,
    FORMAT_DATE('%Y-%m',
      DATE_ADD(p1.Month, INTERVAL 1 MONTH))              AS month_str,
    p1.EntityRecordID,
    p1.company                                           AS Company,
    p1.total_saas                                        AS p1_saas,
    0                                                    AS p2_saas,
    p1.expiry_lines                                      AS p1_expiry_lines,
    p1.saas_lines                                        AS p1_saas_lines
  FROM entity_monthly p1
  LEFT JOIN entity_monthly p2
    ON  p1.EntityRecordID = p2.EntityRecordID
    AND p2.month_str = FORMAT_DATE('%Y-%m',
          DATE_ADD(p1.Month, INTERVAL 1 MONTH))
  WHERE p2.EntityRecordID IS NULL
    AND FORMAT_DATE('%Y-%m', DATE_ADD(p1.Month, INTERVAL 1 MONTH))
          < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND FORMAT_DATE('%Y-%m', DATE_ADD(p1.Month, INTERVAL 1 MONTH))
          >= '2022-01'
),

-- Aggregate to CompanyAccount level for event classification.
-- Multi-entity companies must be classified as a unit: one entity cancelling
-- while another stays is a downgrade, not a cancellation.
company_level AS (
  SELECT
    month_str,
    Month,
    Company,
    SUM(p1_saas)         AS p1_saas,
    SUM(p2_saas)         AS p2_saas,
    SUM(p1_expiry_lines) AS p1_expiry_lines,
    SUM(p1_saas_lines)   AS p1_saas_lines
  FROM entity_paired
  GROUP BY 1, 2, 3
),

-- Compute classification amounts at company level.
-- StartMRR and Cancellations BOTH apply the all-PE exclusion (symmetric).
-- This is the CEO-confirmed methodology and DIFFERS from the board deck
-- monthly tabs, which leave PE-only customers in StartMRR (asymmetric).
company_classified AS (
  SELECT
    month_str,
    Month,
    Company,
    p1_saas,
    p2_saas,
    -- StartMRR: positive prior-month revenue, EXCLUDING PE-only customers
    CASE WHEN p1_saas > 0
              AND NOT (p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines)
         THEN p1_saas ELSE 0 END
      AS StartMRR,
    -- Cancellations: P1>0, P2=0, EXCLUDING PE-only customers (OtherChurn)
    CASE WHEN p1_saas > 0 AND p2_saas = 0
              AND NOT (p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines)
         THEN p1_saas ELSE 0 END
      AS Cancellations,
    -- Downgrades: still active but P2 < P1
    CASE WHEN p1_saas > 0 AND p2_saas > 0 AND p2_saas < p1_saas
         THEN p1_saas - p2_saas ELSE 0 END
      AS Downgrades,
    -- Expansions: still active but P2 > P1
    CASE WHEN p1_saas > 0 AND p2_saas > p1_saas
         THEN p2_saas - p1_saas ELSE 0 END
      AS Expansions,
    -- NewMRR: first appearance (P1=0, P2>0)
    CASE WHEN p1_saas = 0 AND p2_saas > 0
         THEN p2_saas ELSE 0 END
      AS NewMRR
  FROM company_level
)

-- Final output: EntityRecordID × Month grain.
-- Company-level classification amounts are distributed back to each entity
-- pro-rata by p1_saas (or p2_saas for new customers). For single-entity
-- companies (the vast majority) the ratio is exactly 1.0.
-- Monthly SUM() totals are algebraically identical to company_classified SUM().
SELECT
  ep.Month,
  ep.EntityRecordID,
  cc.Company,
  CAST(ep.p1_saas AS NUMERIC)   AS p1_saas,
  CAST(ep.p2_saas AS NUMERIC)   AS p2_saas,
  CAST(
    CASE WHEN cc.p1_saas > 0
         THEN cc.StartMRR    * SAFE_DIVIDE(ep.p1_saas, cc.p1_saas)
         ELSE 0 END
  AS NUMERIC) AS StartMRR,
  CAST(
    CASE WHEN cc.p1_saas > 0
         THEN cc.Cancellations * SAFE_DIVIDE(ep.p1_saas, cc.p1_saas)
         ELSE 0 END
  AS NUMERIC) AS Cancellations,
  CAST(
    CASE WHEN cc.p1_saas > 0
         THEN cc.Downgrades  * SAFE_DIVIDE(ep.p1_saas, cc.p1_saas)
         ELSE 0 END
  AS NUMERIC) AS Downgrades,
  CAST(
    CASE WHEN cc.p1_saas > 0
         THEN cc.Expansions  * SAFE_DIVIDE(ep.p1_saas, cc.p1_saas)
         ELSE 0 END
  AS NUMERIC) AS Expansions,
  CAST(
    CASE WHEN cc.p2_saas > 0 AND cc.p1_saas = 0
         THEN cc.NewMRR * SAFE_DIVIDE(ep.p2_saas, cc.p2_saas)
         ELSE 0 END
  AS NUMERIC) AS NewMRR,
  -- Dimensions sourced from v_customers.
  -- For existing customers (p1>0): use prior month so churn/downgrade rows
  --   get the segment they were in before the event.
  -- For new customers (p1=0): use current month.
  -- v_customers only covers 2024-01-01+; older rows will have NULL dims.
  vc_dim.Segment,
  vc_dim.UserTier,
  vc_dim.HasDEP,
  vc_dim.AttributionChannel,
  vc_dim.SignupCountry,
  vc_dim.Vertical,
  vc_dim.SyncType
FROM entity_paired ep
JOIN company_classified cc
  ON  ep.month_str = cc.month_str
  AND ep.Company   = cc.Company
LEFT JOIN `project-for-method-dw.revenue.v_customers` vc_dim
  ON  vc_dim.EntityRecordID = ep.EntityRecordID
  AND vc_dim.Month = CASE
    WHEN ep.p1_saas > 0 THEN DATE_SUB(ep.Month, INTERVAL 1 MONTH)
    ELSE ep.Month
  END;

-- ============================================================
-- v_customer_segments
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_customer_segments` AS
SELECT
  Month, EntityRecordID, EntityFullName,
  AccountCount, TotalUsers, HasDEP, Segment
FROM `project-for-method-dw.revenue.v_customers`;

-- ============================================================
-- v_customers
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_customers` AS
WITH monthly_accounts AS (
  SELECT
    t.EntityRecordID,
    DATE_TRUNC(t.TxnDate, MONTH) AS Month,
    t.CompanyAccount,
    MAX(t.UserPaidCount) AS UserPaidCount,
    MAX(CASE WHEN (t.AccountFullName LIKE '%Premium App%' OR t.AccountFullName LIKE '%Enhancement Plan%') AND t.SaaSAmount != 0 THEN 1 ELSE 0 END) AS has_dep_txn
  FROM `project-for-method-dw.revenue.TransLineFlattened` t
  WHERE t.Partner != 'Method Integration'
    AND t.TxnDate >= '2024-01-01'
  GROUP BY 1, 2, 3
),
account_dims AS (
  SELECT
    a.CompanyAccount,
    a.FirstSaaSInvoiceTxnDate,
    CASE
      WHEN a.Att_SEO = 1 THEN 'SEO'
      WHEN a.Att_Pay_Per_Click = 1 THEN 'PPC'
      WHEN a.Att_OPN_Other_Peoples_Networks = 1 THEN 'OPN'
      WHEN a.Att_Social = 1 THEN 'Social'
      WHEN a.Att_Email = 1 THEN 'Email'
      WHEN a.Att_Referral_Link = 1 THEN 'Referral'
      WHEN a.Att_Direct = 1 THEN 'Direct'
      WHEN a.Att_Partners = 1 THEN 'Partners'
      WHEN a.Att_Content = 1 THEN 'Content'
      WHEN a.Att_Remarketing = 1 THEN 'Remarketing'
      WHEN a.Att_Other = 1 THEN 'Other'
      WHEN a.Att_None = 1 THEN 'None'
      ELSE 'Unknown'
    END AS AttributionChannel,
    a.SignupCountry,
    a.Vertical,
    a.SyncType
  FROM `project-for-method-dw.revenue.Account` a
  WHERE a.IsConversionException = FALSE
    AND a.Partner != 'Method Integration'
),
entity_monthly AS (
  SELECT
    ma.EntityRecordID,
    ma.Month,
    COUNT(DISTINCT ma.CompanyAccount) AS AccountCount,
    SUM(ma.UserPaidCount) AS TotalUsers,
    MAX(ma.has_dep_txn) AS HasDEP,
    ARRAY_AGG(ad.AttributionChannel IGNORE NULLS ORDER BY ad.FirstSaaSInvoiceTxnDate LIMIT 1)[SAFE_OFFSET(0)] AS AttributionChannel,
    ARRAY_AGG(ad.SignupCountry      IGNORE NULLS ORDER BY ad.FirstSaaSInvoiceTxnDate LIMIT 1)[SAFE_OFFSET(0)] AS SignupCountry,
    ARRAY_AGG(ad.Vertical           IGNORE NULLS ORDER BY ad.FirstSaaSInvoiceTxnDate LIMIT 1)[SAFE_OFFSET(0)] AS Vertical,
    ARRAY_AGG(ad.SyncType           IGNORE NULLS ORDER BY ad.FirstSaaSInvoiceTxnDate LIMIT 1)[SAFE_OFFSET(0)] AS SyncType
  FROM monthly_accounts ma
  LEFT JOIN account_dims ad ON ma.CompanyAccount = ad.CompanyAccount
  GROUP BY 1, 2
),
max_month AS (
  SELECT MAX(Month) AS m FROM entity_monthly
)
SELECT
  em.Month,
  em.EntityRecordID,
  e.EntityFullName,
  em.AccountCount,
  em.TotalUsers,
  em.HasDEP = 1 AS HasDEP,
  CASE
    WHEN em.TotalUsers = 1              THEN 'Solo'
    WHEN em.TotalUsers BETWEEN 2 AND 3  THEN 'Small Team'
    ELSE                                     'Team'
  END AS UserTier,
  CASE
    WHEN em.HasDEP = 1 THEN 'Team AI Plus'
    WHEN em.TotalUsers >= 4 THEN '4+ no DEP'
    WHEN em.TotalUsers >= 2 THEN '2-3 no DEP'
    ELSE 'Solo no DEP'
  END AS Segment,
  em.AttributionChannel,
  em.SignupCountry,
  em.Vertical,
  em.SyncType,
  TRUE AS IsActive,
  LAG(em.Month) OVER (PARTITION BY em.EntityRecordID ORDER BY em.Month) IS NULL AS IsNew,
  LEAD(em.Month) OVER (PARTITION BY em.EntityRecordID ORDER BY em.Month) IS NULL
    AND em.Month < (SELECT m FROM max_month) AS IsChurned
FROM entity_monthly em
JOIN `project-for-method-dw.revenue.Entity` e ON em.EntityRecordID = e.RecordID;

-- ============================================================
-- v_downgrades_mrr
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_downgrades_mrr` AS
WITH entity_monthly AS (
  SELECT FORMAT_DATE('%Y-%m', TxnDate) AS month, EntityRecordID, SUM(SaaSAmount) AS total_saas,
    COUNTIF(SaaSAmount != 0) AS saas_lines,
    COUNTIF(SaaSAmount != 0 AND AccountFullName LIKE '%Prepay Expiry Income%') AS expiry_lines
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE TxnDate >= '2021-12-01' AND FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
  GROUP BY month, EntityRecordID
),
comparison AS (
  SELECT p2.month, p2.EntityRecordID, COALESCE(p1.total_saas, 0) AS p1_saas, p2.total_saas AS p2_saas,
    COALESCE(p1.expiry_lines, 0) AS p1_expiry_lines, COALESCE(p1.saas_lines, 0) AS p1_saas_lines,
    COALESCE(p2.expiry_lines, 0) AS p2_expiry_lines, COALESCE(p2.saas_lines, 0) AS p2_saas_lines
  FROM entity_monthly p2 LEFT JOIN entity_monthly p1
    ON p2.EntityRecordID = p1.EntityRecordID AND p1.month = FORMAT_DATE('%Y-%m', DATE_SUB(PARSE_DATE('%Y-%m', p2.month), INTERVAL 1 MONTH))
  WHERE p2.month >= '2022-01'
  UNION ALL
  SELECT FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) AS month,
    p1.EntityRecordID, p1.total_saas AS p1_saas, 0 AS p2_saas,
    p1.expiry_lines AS p1_expiry_lines, p1.saas_lines AS p1_saas_lines, 0 AS p2_expiry_lines, 0 AS p2_saas_lines
  FROM entity_monthly p1 LEFT JOIN entity_monthly p2
    ON p1.EntityRecordID = p2.EntityRecordID AND p2.month = FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH))
  WHERE p2.EntityRecordID IS NULL
    AND FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) >= '2022-01'
)
SELECT month, ROUND(SUM(CASE WHEN p1_saas > 0 AND p2_saas > 0 AND p2_saas < p1_saas THEN p1_saas - p2_saas ELSE 0 END), 2) AS downgrades
FROM comparison GROUP BY month ORDER BY month;

-- ============================================================
-- v_expansions_mrr
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_expansions_mrr` AS
WITH entity_monthly AS (
  SELECT FORMAT_DATE('%Y-%m', TxnDate) AS month, EntityRecordID, SUM(SaaSAmount) AS total_saas,
    COUNTIF(SaaSAmount != 0) AS saas_lines, COUNTIF(SaaSAmount != 0 AND AccountFullName LIKE '%Prepay Expiry Income%') AS expiry_lines
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE TxnDate >= '2021-12-01' AND FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
  GROUP BY month, EntityRecordID
),
comparison AS (
  SELECT p2.month, p2.EntityRecordID, COALESCE(p1.total_saas, 0) AS p1_saas, p2.total_saas AS p2_saas,
    COALESCE(p1.expiry_lines, 0) AS p1_expiry_lines, COALESCE(p1.saas_lines, 0) AS p1_saas_lines,
    COALESCE(p2.expiry_lines, 0) AS p2_expiry_lines, COALESCE(p2.saas_lines, 0) AS p2_saas_lines
  FROM entity_monthly p2 LEFT JOIN entity_monthly p1
    ON p2.EntityRecordID = p1.EntityRecordID AND p1.month = FORMAT_DATE('%Y-%m', DATE_SUB(PARSE_DATE('%Y-%m', p2.month), INTERVAL 1 MONTH))
  WHERE p2.month >= '2022-01'
  UNION ALL
  SELECT FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) AS month,
    p1.EntityRecordID, p1.total_saas AS p1_saas, 0 AS p2_saas,
    p1.expiry_lines AS p1_expiry_lines, p1.saas_lines AS p1_saas_lines, 0 AS p2_expiry_lines, 0 AS p2_saas_lines
  FROM entity_monthly p1 LEFT JOIN entity_monthly p2
    ON p1.EntityRecordID = p2.EntityRecordID AND p2.month = FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH))
  WHERE p2.EntityRecordID IS NULL
    AND FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) >= '2022-01'
)
SELECT month, ROUND(SUM(CASE WHEN p1_saas > 0 AND p2_saas > p1_saas THEN p2_saas - p1_saas ELSE 0 END), 2) AS expansions
FROM comparison GROUP BY month ORDER BY month;

-- ============================================================
-- v_metric__sync_rate
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_metric__sync_rate` AS
SELECT
  COALESCE(s.period, t.period) AS period,
  SAFE_DIVIDE(s.value, t.value) AS value
FROM `project-for-method-dw`.`revenue`.`v_metric__syncs` s
FULL OUTER JOIN `project-for-method-dw`.`revenue`.`v_metric__trials` t
  ON s.period = t.period
ORDER BY 1;

-- ============================================================
-- v_metric__syncs
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_metric__syncs` AS
SELECT
  DATE_TRUNC(SyncDate, MONTH) AS period,
  COUNT(*) AS value
FROM `project-for-method-dw`.`revenue`.`v_syncs`
WHERE SyncDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1;

-- ============================================================
-- v_metric__trials
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_metric__trials` AS
SELECT
  DATE_TRUNC(SignupDate, MONTH) AS period,
  COUNT(*) AS value
FROM `project-for-method-dw`.`revenue`.`v_trials`
WHERE SignupDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
GROUP BY 1
ORDER BY 1;

-- ============================================================
-- v_new_dep_revenue
-- ============================================================
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
  DATE_TRUNC(f.FirstTxnDate, MONTH) = DATE_TRUNC(d.TxnDate, MONTH) AS is_new_dep,
  CASE
    WHEN d.Att_SEO = 1 THEN 'SEO'
    WHEN d.Att_Pay_Per_Click = 1 THEN 'PPC'
    WHEN d.Att_OPN_Other_Peoples_Networks = 1 THEN 'OPN'
    WHEN d.Att_Social = 1 THEN 'Social'
    WHEN d.Att_Email = 1 THEN 'Email'
    WHEN d.Att_Referral_Link = 1 THEN 'Referral'
    WHEN d.Att_Direct = 1 THEN 'Direct'
    WHEN d.Att_Partners = 1 THEN 'Partners'
    WHEN d.Att_Content = 1 THEN 'Content'
    WHEN d.Att_Remarketing = 1 THEN 'Remarketing'
    WHEN d.Att_Other = 1 THEN 'Other'
    WHEN d.Att_None = 1 THEN 'None'
    ELSE 'Unknown'
  END AS AttributionChannel,
  d.SignupCountry,
  d.Vertical,
  d.SyncType
FROM DEPAccounts d
LEFT JOIN FirstAppearance f ON d.CompanyAccount = f.CompanyAccount;

-- ============================================================
-- v_new_mrr
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_new_mrr` AS
WITH entity_monthly AS (
  SELECT FORMAT_DATE('%Y-%m', TxnDate) AS month, EntityRecordID, SUM(SaaSAmount) AS total_saas,
    COUNTIF(SaaSAmount != 0) AS saas_lines, COUNTIF(SaaSAmount != 0 AND AccountFullName LIKE '%Prepay Expiry Income%') AS expiry_lines
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE TxnDate >= '2021-12-01' AND FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
  GROUP BY month, EntityRecordID
),
comparison AS (
  SELECT p2.month, p2.EntityRecordID, COALESCE(p1.total_saas, 0) AS p1_saas, p2.total_saas AS p2_saas,
    COALESCE(p1.expiry_lines, 0) AS p1_expiry_lines, COALESCE(p1.saas_lines, 0) AS p1_saas_lines,
    COALESCE(p2.expiry_lines, 0) AS p2_expiry_lines, COALESCE(p2.saas_lines, 0) AS p2_saas_lines
  FROM entity_monthly p2 LEFT JOIN entity_monthly p1
    ON p2.EntityRecordID = p1.EntityRecordID AND p1.month = FORMAT_DATE('%Y-%m', DATE_SUB(PARSE_DATE('%Y-%m', p2.month), INTERVAL 1 MONTH))
  WHERE p2.month >= '2022-01'
  UNION ALL
  SELECT FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) AS month,
    p1.EntityRecordID, p1.total_saas AS p1_saas, 0 AS p2_saas,
    p1.expiry_lines AS p1_expiry_lines, p1.saas_lines AS p1_saas_lines, 0 AS p2_expiry_lines, 0 AS p2_saas_lines
  FROM entity_monthly p1 LEFT JOIN entity_monthly p2
    ON p1.EntityRecordID = p2.EntityRecordID AND p2.month = FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH))
  WHERE p2.EntityRecordID IS NULL
    AND FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) >= '2022-01'
)
SELECT month, ROUND(SUM(CASE WHEN p1_saas = 0 AND p2_saas > 0
    AND NOT (p2_expiry_lines > 0 AND p2_expiry_lines = p2_saas_lines) THEN p2_saas ELSE 0 END), 2) AS new_mrr
FROM comparison GROUP BY month ORDER BY month;

-- ============================================================
-- v_new_net_saas
-- ============================================================
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

-- ============================================================
-- v_other_in_mrr
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_other_in_mrr` AS
WITH entity_monthly AS (
  SELECT FORMAT_DATE('%Y-%m', TxnDate) AS month, EntityRecordID, SUM(SaaSAmount) AS total_saas,
    COUNTIF(SaaSAmount != 0) AS saas_lines, COUNTIF(SaaSAmount != 0 AND AccountFullName LIKE '%Prepay Expiry Income%') AS expiry_lines
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE TxnDate >= '2021-12-01' AND FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
  GROUP BY month, EntityRecordID
),
comparison AS (
  SELECT p2.month, p2.EntityRecordID, COALESCE(p1.total_saas, 0) AS p1_saas, p2.total_saas AS p2_saas,
    COALESCE(p1.expiry_lines, 0) AS p1_expiry_lines, COALESCE(p1.saas_lines, 0) AS p1_saas_lines,
    COALESCE(p2.expiry_lines, 0) AS p2_expiry_lines, COALESCE(p2.saas_lines, 0) AS p2_saas_lines
  FROM entity_monthly p2 LEFT JOIN entity_monthly p1
    ON p2.EntityRecordID = p1.EntityRecordID AND p1.month = FORMAT_DATE('%Y-%m', DATE_SUB(PARSE_DATE('%Y-%m', p2.month), INTERVAL 1 MONTH))
  WHERE p2.month >= '2022-01'
  UNION ALL
  SELECT FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) AS month,
    p1.EntityRecordID, p1.total_saas AS p1_saas, 0 AS p2_saas,
    p1.expiry_lines AS p1_expiry_lines, p1.saas_lines AS p1_saas_lines, 0 AS p2_expiry_lines, 0 AS p2_saas_lines
  FROM entity_monthly p1 LEFT JOIN entity_monthly p2
    ON p1.EntityRecordID = p2.EntityRecordID AND p2.month = FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH))
  WHERE p2.EntityRecordID IS NULL
    AND FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) >= '2022-01'
)
SELECT month, ROUND(SUM(CASE WHEN p1_saas = 0 AND p2_saas > 0
    AND p2_expiry_lines > 0 AND p2_expiry_lines = p2_saas_lines THEN p2_saas ELSE 0 END), 2) AS other_in
FROM comparison GROUP BY month ORDER BY month;

-- ============================================================
-- v_other_out_mrr
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_other_out_mrr` AS
WITH entity_monthly AS (
  SELECT FORMAT_DATE('%Y-%m', TxnDate) AS month, EntityRecordID, SUM(SaaSAmount) AS total_saas,
    COUNTIF(SaaSAmount != 0) AS saas_lines, COUNTIF(SaaSAmount != 0 AND AccountFullName LIKE '%Prepay Expiry Income%') AS expiry_lines
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE TxnDate >= '2021-12-01' AND FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
  GROUP BY month, EntityRecordID
),
comparison AS (
  SELECT p2.month, p2.EntityRecordID, COALESCE(p1.total_saas, 0) AS p1_saas, p2.total_saas AS p2_saas,
    COALESCE(p1.expiry_lines, 0) AS p1_expiry_lines, COALESCE(p1.saas_lines, 0) AS p1_saas_lines,
    COALESCE(p2.expiry_lines, 0) AS p2_expiry_lines, COALESCE(p2.saas_lines, 0) AS p2_saas_lines
  FROM entity_monthly p2 LEFT JOIN entity_monthly p1
    ON p2.EntityRecordID = p1.EntityRecordID AND p1.month = FORMAT_DATE('%Y-%m', DATE_SUB(PARSE_DATE('%Y-%m', p2.month), INTERVAL 1 MONTH))
  WHERE p2.month >= '2022-01'
  UNION ALL
  SELECT FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) AS month,
    p1.EntityRecordID, p1.total_saas AS p1_saas, 0 AS p2_saas,
    p1.expiry_lines AS p1_expiry_lines, p1.saas_lines AS p1_saas_lines, 0 AS p2_expiry_lines, 0 AS p2_saas_lines
  FROM entity_monthly p1 LEFT JOIN entity_monthly p2
    ON p1.EntityRecordID = p2.EntityRecordID AND p2.month = FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH))
  WHERE p2.EntityRecordID IS NULL
    AND FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m', p1.month), INTERVAL 1 MONTH)) >= '2022-01'
)
SELECT month, ROUND(SUM(CASE WHEN p1_saas > 0 AND p2_saas = 0 AND p1_expiry_lines > 0 AND p1_expiry_lines = p1_saas_lines
    THEN p1_saas ELSE 0 END), 2) AS other_out
FROM comparison GROUP BY month ORDER BY month;

-- ============================================================
-- v_saas_mrr
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_saas_mrr` AS
WITH entity_monthly AS (
  SELECT
    FORMAT_DATE('%Y-%m', TxnDate) AS month,
    EntityRecordID,
    SUM(SaaSAmount) AS total_saas,
    ARRAY_AGG(
      CASE WHEN AccountFullName LIKE '%US-Sales%' THEN 'US'
           WHEN AccountFullName LIKE '%CAN-Sales%' THEN 'CAN'
           WHEN AccountFullName LIKE '%UK-Sales%' THEN 'UK'
           ELSE 'Other' END
      ORDER BY SaaSAmount DESC LIMIT 1
    )[OFFSET(0)] AS primary_currency,
    SUM(CASE WHEN AccountFullName LIKE '%MethodNew%'
              OR AccountFullName LIKE '%Dedicated Enhancement Plan%'
              OR AccountFullName LIKE '%Prepay Expiry Income%'
              OR AccountFullName LIKE '%Emails%'
         THEN SaaSAmount ELSE 0 END) AS new_platform_income
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE TxnDate >= '2022-01-01'
    AND FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
  GROUP BY month, EntityRecordID
)
SELECT
  month,
  SUM(CASE WHEN primary_currency = 'US'  THEN total_saas ELSE 0 END) AS us_mrr,
  SUM(CASE WHEN primary_currency = 'CAN' THEN total_saas ELSE 0 END) AS can_mrr,
  SUM(CASE WHEN primary_currency = 'UK'  THEN total_saas ELSE 0 END) AS uk_mrr,
  SUM(total_saas) AS total_mrr,
  SUM(total_saas) * 12 AS total_arr,
  COUNTIF(new_platform_income > 0) AS paying_logos
FROM entity_monthly
WHERE primary_currency IN ('US', 'CAN', 'UK')
GROUP BY month
ORDER BY month;

-- ============================================================
-- v_scorecard_mtd
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_scorecard_mtd` AS
WITH current_month AS (
  SELECT
    FORMAT_DATE('%Y-%m', CURRENT_DATE()) AS period,
    EXTRACT(DAY FROM CURRENT_DATE()) - 1 AS days_elapsed,
    EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE())) AS days_in_month
),
actuals AS (
  SELECT 'trials' AS metric, COUNT(*) AS actual
  FROM `project-for-method-dw.revenue.v_trials`, current_month cm
  WHERE FORMAT_DATE('%Y-%m', SignupDate) = cm.period

  UNION ALL SELECT 'syncs', COUNT(*)
  FROM `project-for-method-dw.revenue.v_syncs`, current_month cm
  WHERE FORMAT_DATE('%Y-%m', SyncDate) = cm.period

  UNION ALL SELECT 'conversions', COUNT(*)
  FROM `project-for-method-dw.revenue.v_conversions`, current_month cm
  WHERE FORMAT_DATE('%Y-%m', FirstSaaSInvoiceTxnDate) = cm.period

  UNION ALL SELECT 'cancellations', COUNT(DISTINCT CompanyAccount)
  FROM `project-for-method-dw.revenue.v_cancellations`, current_month cm
  WHERE FORMAT_DATE('%Y-%m', CancellationDate) = cm.period

  UNION ALL SELECT 'bom_customers', COUNT(DISTINCT CompanyAccount)
  FROM `project-for-method-dw.revenue.v_bom_customers`, current_month cm
  WHERE FORMAT_DATE('%Y-%m', TxnDate) = cm.period

  UNION ALL SELECT 'new_net_saas', ROUND(SUM(SaaSAmount), 0)
  FROM `project-for-method-dw.revenue.v_new_net_saas`, current_month cm
  WHERE FORMAT_DATE('%Y-%m', TxnDate) = cm.period

  UNION ALL SELECT 'new_dep_revenue', ROUND(SUM(CASE WHEN is_new_dep THEN SaaSAmount ELSE 0 END), 0)
  FROM `project-for-method-dw.revenue.v_new_dep_revenue`, current_month cm
  WHERE FORMAT_DATE('%Y-%m', TxnDate) = cm.period

  UNION ALL SELECT 'total_net_saas', ROUND(SUM(SaaSAmount + SaaSExpense), 0)
  FROM `project-for-method-dw.revenue.v_total_net_saas`, current_month cm
  WHERE FORMAT_DATE('%Y-%m', TxnDate) = cm.period

  UNION ALL SELECT 'total_dep_revenue', ROUND(SUM(SaaSAmount), 0)
  FROM `project-for-method-dw.revenue.v_total_dep_revenue`, current_month cm
  WHERE FORMAT_DATE('%Y-%m', TxnDate) = cm.period
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

-- ============================================================
-- v_syncs
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_syncs` AS
SELECT
  EntityRecordID,
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
  Att_Referral_Link, Att_Referral_Program, Att_Seminar_Conference,
  CASE
    WHEN Att_SEO = 1 THEN 'SEO'
    WHEN Att_Pay_Per_Click = 1 THEN 'PPC'
    WHEN Att_OPN_Other_Peoples_Networks = 1 THEN 'OPN'
    WHEN Att_Social = 1 THEN 'Social'
    WHEN Att_Referral_Link = 1 THEN 'Referral'
    WHEN Att_Direct = 1 THEN 'Direct'
    WHEN Att_Partners = 1 THEN 'Partners'
    WHEN Att_Content = 1 THEN 'Content'
    WHEN Att_Remarketing = 1 THEN 'Remarketing'
    WHEN Att_Other = 1 THEN 'Other'
    WHEN Att_None = 1 THEN 'None'
    ELSE 'Unknown'
  END AS AttributionChannel
FROM `project-for-method-dw.revenue.Funnel`
WHERE EventType = 'Sync';

-- ============================================================
-- v_syncs_forecast_channel
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_syncs_forecast_channel` AS
SELECT
  Forecast_Month AS forecast_date,
  Channel AS AttributionChannel,
  SUM(Forecasted_Syncs) AS forecast_value
FROM `project-for-method-dw.revenue.looker_inputs`
GROUP BY 1, 2;

-- ============================================================
-- v_syncs_trajectory_channel
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_syncs_trajectory_channel` AS
SELECT
  DATE_TRUNC(CURRENT_DATE(), MONTH) AS snapshot_date,
  AttributionChannel,
  COUNT(*) *
    DATE_DIFF(
      DATE_TRUNC(DATE_ADD(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH),
      DATE_TRUNC(CURRENT_DATE(), MONTH),
      DAY
    ) /
    NULLIF(DATE_DIFF(CURRENT_DATE(), DATE_TRUNC(CURRENT_DATE(), MONTH), DAY), 0)
    AS trajectory_value
FROM `project-for-method-dw.revenue.v_syncs`
WHERE SyncDate >= DATE_TRUNC(CURRENT_DATE(), MONTH)
  AND SyncDate < CURRENT_DATE()
GROUP BY 1, 2;

-- ============================================================
-- v_total_dep_revenue
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_total_dep_revenue` AS
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
  DATE_TRUNC(f.FirstTxnDate, MONTH) = DATE_TRUNC(d.TxnDate, MONTH) AS is_new_dep,
  CASE
    WHEN d.Att_SEO = 1 THEN 'SEO'
    WHEN d.Att_Pay_Per_Click = 1 THEN 'PPC'
    WHEN d.Att_OPN_Other_Peoples_Networks = 1 THEN 'OPN'
    WHEN d.Att_Social = 1 THEN 'Social'
    WHEN d.Att_Email = 1 THEN 'Email'
    WHEN d.Att_Referral_Link = 1 THEN 'Referral'
    WHEN d.Att_Direct = 1 THEN 'Direct'
    WHEN d.Att_Partners = 1 THEN 'Partners'
    WHEN d.Att_Content = 1 THEN 'Content'
    WHEN d.Att_Remarketing = 1 THEN 'Remarketing'
    WHEN d.Att_Other = 1 THEN 'Other'
    WHEN d.Att_None = 1 THEN 'None'
    ELSE 'Unknown'
  END AS AttributionChannel,
  d.SignupCountry,
  d.Vertical,
  d.SyncType
FROM DEPAccounts d
LEFT JOIN FirstAppearance f ON d.CompanyAccount = f.CompanyAccount;

-- ============================================================
-- v_total_net_saas
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_total_net_saas` AS
SELECT
  TxnDate,
  CompanyAccount,
  SaaSAmount,
  SaaSExpense
FROM `project-for-method-dw.revenue.TransLineFlattened`
WHERE IsConversionException = FALSE
  AND Partner != 'Method Integration';

-- ============================================================
-- v_trials
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_trials` AS
SELECT
  EntityRecordID,
  SignupDate, CompanyAccount, SignupCountry, SyncType, SyncTypeRegion, Vertical, CustDatIndustry,
  Att_SEO, Att_Pay_Per_Click, Att_OPN_Other_Peoples_Networks, Att_Social, Att_Email,
  Att_Referral_Link, Att_Referral_Program, Att_Direct, Att_Partners, Att_Content,
  Att_Remarketing, Att_Other, Att_None, Att_Backlinks, Att_Banner_Ads,
  Att_Help_Center, Att_Online_Chat_Tool, Att_Seminar_Conference,
  CASE
    WHEN Att_SEO = 1 THEN 'SEO'
    WHEN Att_Pay_Per_Click = 1 THEN 'PPC'
    WHEN Att_OPN_Other_Peoples_Networks = 1 THEN 'OPN'
    WHEN Att_Social = 1 THEN 'Social'
    WHEN Att_Email = 1 THEN 'Email'
    WHEN Att_Referral_Link = 1 THEN 'Referral'
    WHEN Att_Direct = 1 THEN 'Direct'
    WHEN Att_Partners = 1 THEN 'Partners'
    WHEN Att_Content = 1 THEN 'Content'
    WHEN Att_Remarketing = 1 THEN 'Remarketing'
    WHEN Att_Other = 1 THEN 'Other'
    WHEN Att_None = 1 THEN 'None'
    ELSE 'Unknown'
  END AS AttributionChannel
FROM `project-for-method-dw.revenue.Account`
WHERE IsConversionException = FALSE
  AND Partner != 'Method Integration'
  AND SignupDate != DATE('0001-01-01');

-- ============================================================
-- v_trials_by_channel
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_trials_by_channel` AS
SELECT Channel, FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS trials
FROM `project-for-method-dw.revenue.v_trials`
GROUP BY 1, 2 ORDER BY 2, 1;

-- ============================================================
-- v_trials_by_country
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_trials_by_country` AS
SELECT SignupCountry, FORMAT_DATE('%Y-W%V', SignupDate) AS week, COUNT(*) AS trials
FROM `project-for-method-dw.revenue.v_trials`
WHERE SignupDate >= DATE_TRUNC(CURRENT_DATE(), MONTH) - INTERVAL 60 DAY
GROUP BY 1, 2 ORDER BY 2, 1;

-- ============================================================
-- v_trials_by_industry
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_trials_by_industry` AS
SELECT CustDatIndustry, FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS trials
FROM `project-for-method-dw.revenue.v_trials`
GROUP BY 1, 2 ORDER BY 2, 1;

-- ============================================================
-- v_trials_by_sync_type
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_trials_by_sync_type` AS
SELECT SyncType, FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS trials
FROM `project-for-method-dw.revenue.v_trials`
GROUP BY 1, 2 ORDER BY 2, 1;

-- ============================================================
-- v_trials_forecast_channel
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_trials_forecast_channel` AS
SELECT
  Forecast_Month AS forecast_date,
  Channel AS AttributionChannel,
  SUM(Forecasted_Trials) AS forecast_value
FROM `project-for-method-dw.revenue.looker_inputs`
GROUP BY 1, 2;

-- ============================================================
-- v_trials_trajectory_channel
-- ============================================================
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_trials_trajectory_channel` AS
SELECT
  DATE_TRUNC(CURRENT_DATE(), MONTH) AS snapshot_date,
  AttributionChannel,
  COUNT(*) *
    DATE_DIFF(
      DATE_TRUNC(DATE_ADD(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH),
      DATE_TRUNC(CURRENT_DATE(), MONTH),
      DAY
    ) /
    NULLIF(DATE_DIFF(CURRENT_DATE(), DATE_TRUNC(CURRENT_DATE(), MONTH), DAY), 0)
    AS trajectory_value
FROM `project-for-method-dw.revenue.v_trials`
WHERE SignupDate >= DATE_TRUNC(CURRENT_DATE(), MONTH)
  AND SignupDate < CURRENT_DATE()
GROUP BY 1, 2;
