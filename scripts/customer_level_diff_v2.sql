-- Bidirectional diff + trace specific cases to confirm multi-entity vs rename

WITH
looker_per_company AS (
  SELECT
    CompanyAccount,
    SUM(IF(month = '2026-01-01', SaaSAmount, 0)) AS prev_month,
    SUM(IF(month = '2026-02-01', SaaSAmount, 0)) AS nrr_month,
    SUM(IF(month = '2026-01-01' AND AccountFullName LIKE '%Prepay Expiry%', SaaSAmount, 0)) AS pe_prev,
    SUM(IF(month = '2026-02-01' AND AccountFullName LIKE '%Prepay Expiry%', SaaSAmount, 0)) AS pe_cur
  FROM (
    SELECT DATE_TRUNC(t.TxnDate, MONTH) AS month, t.CompanyAccount, t.SaaSAmount, t.AccountFullName
    FROM `project-for-method-dw.revenue.TransLineFlattened` t
    WHERE t.TxnDate >= '2026-01-01' AND t.TxnDate < '2026-03-01'
  )
  GROUP BY CompanyAccount
),
looker_classified AS (
  SELECT *,
    CASE
      WHEN pe_prev > 0 THEN 'PrepayExpiry Churn'
      WHEN pe_cur > 0 THEN 'PrepayExpiry Revenue'
      WHEN nrr_month = 0 AND prev_month > 0 THEN 'Churn'
      WHEN nrr_month > prev_month AND prev_month > 0 THEN 'Upgrade'
      WHEN nrr_month < prev_month AND nrr_month > 0 THEN 'Downgrade'
      WHEN nrr_month > 0 AND prev_month = 0 THEN 'New Revenue'
      ELSE 'No Change'
    END AS Looker_Classification
  FROM looker_per_company
),

-- For each CompanyAccount in Looker, find the EntityRecordID(s) in the period
ca_to_entity AS (
  SELECT
    EntityRecordID,
    CompanyAccount,
    SUM(SaaSAmount) AS SaaSAmount
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  WHERE TxnDate >= '2026-01-01' AND TxnDate < '2026-03-01'
  GROUP BY EntityRecordID, CompanyAccount
),
-- Pick the "winning" (highest SaaS) CompanyAccount per entity for the period
winning_per_entity AS (
  SELECT
    EntityRecordID,
    ARRAY_AGG(CompanyAccount ORDER BY SaaSAmount DESC LIMIT 1)[OFFSET(0)] AS winning_ca
  FROM ca_to_entity
  GROUP BY EntityRecordID
),

-- Compute how many CompanyAccounts each EntityRecordID has in this period
entity_ca_counts AS (
  SELECT
    EntityRecordID,
    COUNT(DISTINCT CompanyAccount) AS company_count
  FROM ca_to_entity
  GROUP BY EntityRecordID
)

-- Looker rows that classified as Churn/Down/Up — show their entity context
SELECT
  l.CompanyAccount,
  l.Looker_Classification,
  l.prev_month,
  l.nrr_month,
  c.EntityRecordID,
  w.winning_ca AS winning_companyaccount_for_entity,
  ec.company_count AS entity_total_company_accounts,
  CASE
    WHEN c.CompanyAccount = w.winning_ca THEN 'IS winning CA'
    ELSE 'rolled into other CA'
  END AS rollup_status
FROM looker_classified l
LEFT JOIN ca_to_entity c ON c.CompanyAccount = l.CompanyAccount
LEFT JOIN winning_per_entity w ON w.EntityRecordID = c.EntityRecordID
LEFT JOIN entity_ca_counts ec ON ec.EntityRecordID = c.EntityRecordID
WHERE l.Looker_Classification IN ('Churn', 'Downgrade', 'Upgrade')
  AND ec.company_count > 1
ORDER BY l.Looker_Classification, l.prev_month DESC
LIMIT 80
