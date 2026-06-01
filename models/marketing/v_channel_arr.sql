{{ config(materialized='view') }}

-- DIRECTIONAL metric: "Channel ARR" — marketing Revenue-by-Channel replica.
-- Grain: (attribution channel x first-invoice month). One row per channel per month.
--
-- BASIS NOTE: this view uses Custdatlastsaasamount (the run-rate snapshot on
-- Account), NOT SaaSAmount. That is a deliberate, documented exception to the
-- canonical-revenue-column rule — see migrate-metric-to-dbt SKILL.md
-- "run-rate / ARR carve-out" and docs/metric-definitions.md "Channel ARR".
-- It is DIRECTIONAL, not accounting-grade, and intentionally lives in `revenue`
-- (not `revenue_metrics`). It replicates the marketing Looker "Revenue by
-- Channel" dashboard, penny-matched for May 2026.
--
-- FX is applied DOWNSTREAM (the app's page) so the USD->CAD rate stays an
-- adjustable control. This view therefore emits the pre-FX US / non-US split
-- of SaaS, letting the consumer compute CAD ARR at any rate:
--   cad_arr = ((saas_us_portion * rate + saas_nonus_portion) / attribution_value) * 12
--
-- Rolling current incomplete month is excluded; window is the trailing 24 months.

WITH accounts AS (
  SELECT
    CompanyAccount,
    DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS month,
    Custdatlastsaasamount AS plan_rate,
    Att_Backlinks, Att_Banner_Ads, Att_Content, Att_Direct, Att_Email,
    Att_Help_Center, Att_None, Att_Online_Chat_Tool,
    Att_OPN_Other_Peoples_Networks, Att_Other, Att_Partners, Att_Pay_Per_Click,
    Att_Referral_Link, Att_Referral_Program, Att_Remarketing,
    Att_Seminar_Conference, Att_SEO, Att_Social
  FROM {{ source('revenue', 'Account') }}
  WHERE IsConversionException = FALSE
    AND Partner != 'Method Integration'
    AND FirstSaaSInvoiceTxnDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
    AND FirstSaaSInvoiceTxnDate <  DATE_TRUNC(CURRENT_DATE(), MONTH)
),

first_invoice AS (
  SELECT
    CompanyAccount,
    SUM(CASE WHEN TxnDate = FirstSaaSInvoiceTxnDate
             THEN SaaSAmount + SaaSExpense ELSE 0 END) AS first_invoice_revenue
  FROM {{ source('revenue', 'TransLineFlattened') }}
  GROUP BY CompanyAccount
),

region AS (  -- most-recent-transaction AR account → US / CAN / Other
  SELECT CompanyAccount,
    CASE WHEN AccountFullName LIKE '%US%'  THEN 'US'
         WHEN AccountFullName LIKE '%CAN%' THEN 'CAN'
         ELSE 'Other' END AS region
  FROM (
    SELECT CompanyAccount, AccountFullName,
      ROW_NUMBER() OVER (PARTITION BY CompanyAccount ORDER BY TransRecordID DESC) AS rn
    FROM {{ source('revenue', 'TransLineFlattened') }}
    WHERE AccountFullName IS NOT NULL
  )
  WHERE rn = 1
),

joined AS (
  SELECT
    a.month, a.CompanyAccount, a.plan_rate,
    COALESCE(r.region, 'Other') = 'US' AS is_us,
    COALESCE(fi.first_invoice_revenue, 0) AS first_invoice_revenue,
    a.Att_Backlinks, a.Att_Banner_Ads, a.Att_Content, a.Att_Direct, a.Att_Email,
    a.Att_Help_Center, a.Att_None, a.Att_Online_Chat_Tool,
    a.Att_OPN_Other_Peoples_Networks, a.Att_Other, a.Att_Partners, a.Att_Pay_Per_Click,
    a.Att_Referral_Link, a.Att_Referral_Program, a.Att_Remarketing,
    a.Att_Seminar_Conference, a.Att_SEO, a.Att_Social
  FROM accounts a
  LEFT JOIN first_invoice fi USING (CompanyAccount)
  LEFT JOIN region r USING (CompanyAccount)
),

unpivoted AS (
  SELECT month, CompanyAccount, plan_rate, is_us, first_invoice_revenue,
         channel, attribution_value
  FROM joined
  UNPIVOT (attribution_value FOR channel IN (
    Att_Backlinks AS 'Backlinks', Att_Banner_Ads AS 'Banner_Ads',
    Att_Content AS 'Content', Att_Direct AS 'Direct', Att_Email AS 'Email',
    Att_Help_Center AS 'Help_Center', Att_None AS 'None',
    Att_Online_Chat_Tool AS 'Online_Chat_Tool',
    Att_OPN_Other_Peoples_Networks AS 'OPN', Att_Other AS 'Other',
    Att_Partners AS 'Partners', Att_Pay_Per_Click AS 'PPC',
    Att_Referral_Link AS 'Referral_Link', Att_Referral_Program AS 'Referral_Program',
    Att_Remarketing AS 'Remarketing', Att_Seminar_Conference AS 'Seminar_Conference',
    Att_SEO AS 'SEO', Att_Social AS 'Social'))
  WHERE attribution_value <> 0
)

SELECT
  channel,
  month,
  COUNT(DISTINCT CompanyAccount)                          AS customers,
  SUM(attribution_value)                                  AS attribution_value,
  SUM(plan_rate * attribution_value)                      AS saas_usd,
  SUM(IF(is_us,     plan_rate * attribution_value, 0))    AS saas_us_portion,
  SUM(IF(NOT is_us, plan_rate * attribution_value, 0))    AS saas_nonus_portion,
  -- attribution-weighted, to match Looker's "Avg First Invoice Revenue"
  -- (= first_invoice_weighted / attribution_value)
  SUM(first_invoice_revenue * attribution_value)          AS first_invoice_weighted
FROM unpivoted
GROUP BY channel, month
ORDER BY channel, month
