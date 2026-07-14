

-- PRIMITIVE: fractional (real multi-touch) channel attribution.
--
-- One row per (account × channel) where the account has a nonzero attribution
-- weight for that channel. Each account's weights sum to EXACTLY 1.0 across
-- channels (verified 2026-06-01: 88/88 May accounts; 82 single-channel, 6 split
-- across 2-3) — i.e. one customer's credit distributed across the channels that
-- actually touched them. This is the REAL multi-touch model.
--
-- Distinct from the single-touch `AttributionChannel` dimension on
-- int_trials / int_conversions, which collapses each account to ONE channel
-- (first Att_*=1 wins) and dumps fractional-only accounts into 'Unknown'. Use
-- THIS view for attribution-credited "X by channel" measures (e.g. Channel ARR);
-- use the single-touch dimension for "which one channel gets the whole account".
--
-- Carries the account attributes downstream metrics need (signup / first-invoice
-- dates, run-rate plan amount, first-invoice net SaaS, US/non-US region) so any
-- fractional "X by channel" metric is just SUM(<measure> * attribution_weight)
-- GROUP BY channel.

WITH accounts AS (
  SELECT
    CompanyAccount, EntityRecordID,
    SignupDate, FirstSaaSInvoiceTxnDate,
    Custdatlastsaasamount AS plan_rate,
    Att_Backlinks, Att_Banner_Ads, Att_Content, Att_Direct, Att_Email,
    Att_Help_Center, Att_None, Att_Online_Chat_Tool,
    Att_OPN_Other_Peoples_Networks, Att_Other, Att_Partners, Att_Pay_Per_Click,
    Att_Referral_Link, Att_Referral_Program, Att_Remarketing,
    Att_Seminar_Conference, Att_SEO, Att_Social
  FROM `project-for-method-dw`.`revenue`.`Account`
  WHERE IsConversionException = FALSE
    AND Partner != 'Method Integration'
),

first_invoice AS (
  SELECT
    CompanyAccount,
    SUM(CASE WHEN TxnDate = FirstSaaSInvoiceTxnDate
             THEN SaaSAmount + SaaSExpense ELSE 0 END) AS first_invoice_revenue
  FROM `project-for-method-dw`.`revenue`.`TransLineFlattened`
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
    FROM `project-for-method-dw`.`revenue`.`TransLineFlattened`
    WHERE AccountFullName IS NOT NULL
  )
  WHERE rn = 1
),

joined AS (
  SELECT
    a.CompanyAccount, a.EntityRecordID, a.SignupDate, a.FirstSaaSInvoiceTxnDate,
    a.plan_rate,
    COALESCE(fi.first_invoice_revenue, 0) AS first_invoice_revenue,
    COALESCE(r.region, 'Other') = 'US' AS is_us,
    a.Att_Backlinks, a.Att_Banner_Ads, a.Att_Content, a.Att_Direct, a.Att_Email,
    a.Att_Help_Center, a.Att_None, a.Att_Online_Chat_Tool,
    a.Att_OPN_Other_Peoples_Networks, a.Att_Other, a.Att_Partners, a.Att_Pay_Per_Click,
    a.Att_Referral_Link, a.Att_Referral_Program, a.Att_Remarketing,
    a.Att_Seminar_Conference, a.Att_SEO, a.Att_Social
  FROM accounts a
  LEFT JOIN first_invoice fi USING (CompanyAccount)
  LEFT JOIN region r USING (CompanyAccount)
)

SELECT
  CompanyAccount, EntityRecordID, SignupDate, FirstSaaSInvoiceTxnDate,
  plan_rate, first_invoice_revenue, is_us,
  channel, attribution_weight
FROM joined
UNPIVOT (attribution_weight FOR channel IN (
  Att_Backlinks AS 'Backlinks', Att_Banner_Ads AS 'Banner_Ads',
  Att_Content AS 'Content', Att_Direct AS 'Direct', Att_Email AS 'Email',
  Att_Help_Center AS 'Help_Center', Att_None AS 'None',
  Att_Online_Chat_Tool AS 'Online_Chat_Tool',
  Att_OPN_Other_Peoples_Networks AS 'OPN', Att_Other AS 'Other',
  Att_Partners AS 'Partners', Att_Pay_Per_Click AS 'PPC',
  Att_Referral_Link AS 'Referral_Link', Att_Referral_Program AS 'Referral_Program',
  Att_Remarketing AS 'Remarketing', Att_Seminar_Conference AS 'Seminar_Conference',
  Att_SEO AS 'SEO', Att_Social AS 'Social'))
WHERE attribution_weight <> 0