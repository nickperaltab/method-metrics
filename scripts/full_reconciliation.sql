-- Bidirectional reconciliation: every dollar of difference accounted for
-- For Feb 2026

WITH
-- Step 1: Looker per-CompanyAccount classification
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
    END AS lk_class
  FROM looker_per_company
),

-- Step 2: Our per-Company (which equals winning CA per entity) classification
our_per_company AS (
  SELECT
    Company AS CompanyAccount,
    SUM(StartMRR)      AS our_start,
    SUM(Cancellations) AS our_cancel,
    SUM(Downgrades)    AS our_down,
    SUM(Expansions)    AS our_exp,
    SUM(NewMRR)        AS our_new,
    SUM(p1_saas)       AS our_p1,
    SUM(p2_saas)       AS our_p2
  FROM `project-for-method-dw.revenue.v_customer_mrr`
  WHERE FORMAT_DATE('%Y-%m', Month) = '2026-02'
  GROUP BY Company
),

-- Step 3: Aggregate Looker data to our view's grain (winning CA per entity)
looker_to_entity_grain AS (
  -- Get the winning CA per entity for the period
  WITH winning AS (
    SELECT
      EntityRecordID,
      ARRAY_AGG(CompanyAccount ORDER BY SUM(SaaSAmount) DESC LIMIT 1)[OFFSET(0)] AS winning_ca
    FROM `project-for-method-dw.revenue.TransLineFlattened`
    WHERE TxnDate >= '2026-01-01' AND TxnDate < '2026-03-01'
    GROUP BY EntityRecordID, CompanyAccount
  ),
  ent_winning AS (
    SELECT EntityRecordID, ARRAY_AGG(winning_ca ORDER BY winning_ca LIMIT 1)[OFFSET(0)] AS winning_ca
    FROM (
      SELECT DISTINCT EntityRecordID, winning_ca FROM winning
    )
    GROUP BY EntityRecordID
  )
  -- Sum Looker amounts at entity grain (rolling up multi-CA into the winning CA)
  SELECT
    e.winning_ca AS CompanyAccount,
    SUM(l.prev_month) AS lk_prev_total,
    SUM(l.nrr_month)  AS lk_cur_total
  FROM looker_classified l
  JOIN `project-for-method-dw.revenue.TransLineFlattened` t
    ON t.CompanyAccount = l.CompanyAccount
   AND t.TxnDate >= '2026-01-01' AND t.TxnDate < '2026-03-01'
  JOIN ent_winning e ON e.EntityRecordID = t.EntityRecordID
  GROUP BY e.winning_ca
)

-- Diff at entity grain: if multi-CA is the only difference, totals should match exactly
SELECT
  'Looker raw (CA-grain)' AS view,
  ROUND(SUM(prev_month), 2) AS prev_total,
  ROUND(SUM(nrr_month), 2)  AS cur_total
FROM looker_classified
UNION ALL
SELECT
  'Looker rolled to entity grain',
  ROUND(SUM(lk_prev_total), 2),
  ROUND(SUM(lk_cur_total), 2)
FROM looker_to_entity_grain
UNION ALL
SELECT
  'Our v_customer_mrr',
  ROUND(SUM(our_p1), 2),
  ROUND(SUM(our_p2), 2)
FROM our_per_company
