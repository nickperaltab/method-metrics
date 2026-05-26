-- v_accounts: Customer entity primitive
-- One row per paying company per month with status flags and dimensions.
--
-- IsCustomer: active paying customer at end of month (paid before month end, not cancelled yet)
-- IsNew: first payment was this month (matches int_conversions)
-- IsChurned: cancellation date falls in this month (matches int_cancellations)
-- HasDEP: had a DEP transaction (Premium App or Enhancement Plan) this month
--
-- Verified 2026-04-14:
--   Customers Mar 2026: 3,898 (= total conversions all-time - total churns all-time)
--   New Mar 2026: 109 (exact match with int_conversions)
--   Churned Mar 2026: 117 (exact match with int_cancellations)
--   DEP customers Mar 2026: 313
--
-- Note: "Customers" uses end-of-month semantics. A customer who churns mid-month
-- is IsChurned=TRUE but IsCustomer=FALSE for that month.

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
