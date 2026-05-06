-- Customer-level diff: Looker classification vs our BQ classification
-- For Feb 2026, identify EVERY CompanyAccount where the two methodologies differ
-- and tag with the likely cause.

WITH
-- Step 1: Reproduce Looker's per-CompanyAccount classification
looker_per_company AS (
  SELECT
    CompanyAccount,
    SUM(IF(month = '2026-01-01', SaaSAmount, 0)) AS prev_month,
    SUM(IF(month = '2026-02-01', SaaSAmount, 0)) AS nrr_month,
    SUM(IF(month = '2026-01-01' AND AccountFullName LIKE '%Prepay Expiry%', SaaSAmount, 0)) AS pe_prev,
    SUM(IF(month = '2026-02-01' AND AccountFullName LIKE '%Prepay Expiry%', SaaSAmount, 0)) AS pe_cur
  FROM (
    SELECT
      DATE_TRUNC(t.TxnDate, MONTH) AS month,
      t.CompanyAccount,
      t.SaaSAmount,
      t.AccountFullName
    FROM `project-for-method-dw.revenue.TransLineFlattened` t
    WHERE t.TxnDate >= '2026-01-01' AND t.TxnDate < '2026-03-01'
  )
  GROUP BY CompanyAccount
),
looker_classified AS (
  SELECT
    CompanyAccount,
    prev_month,
    nrr_month,
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

-- Step 2: Get our BQ classification for Feb 2026, aggregated by Company
our_per_company AS (
  SELECT
    Company AS CompanyAccount,
    SUM(StartMRR)      AS our_start,
    SUM(Cancellations) AS our_cancel,
    SUM(Downgrades)    AS our_down,
    SUM(Expansions)    AS our_exp,
    SUM(NewMRR)        AS our_new,
    SUM(p1_saas)       AS our_p1,
    SUM(p2_saas)       AS our_p2,
    COUNT(DISTINCT EntityRecordID) AS entity_count
  FROM `project-for-method-dw.revenue.v_customer_mrr`
  WHERE FORMAT_DATE('%Y-%m', Month) = '2026-02'
  GROUP BY Company
),
our_classified AS (
  SELECT
    CompanyAccount,
    our_p1,
    our_p2,
    entity_count,
    CASE
      WHEN our_cancel > 0 THEN 'Cancel'
      WHEN our_down > 0 THEN 'Downgrade'
      WHEN our_exp > 0 THEN 'Upgrade'
      WHEN our_new > 0 THEN 'New'
      WHEN our_start > 0 AND our_cancel = 0 AND our_down = 0 AND our_exp = 0 THEN 'NoChange/Other (incl PE OtherChurn)'
      ELSE 'Other'
    END AS Our_Classification
  FROM our_per_company
),

-- Step 3: FULL OUTER JOIN to find rows that differ
diff AS (
  SELECT
    COALESCE(l.CompanyAccount, o.CompanyAccount) AS CompanyAccount,
    l.Looker_Classification,
    l.prev_month AS looker_prev,
    l.nrr_month  AS looker_cur,
    o.Our_Classification,
    o.our_p1,
    o.our_p2,
    o.entity_count
  FROM looker_classified l
  FULL OUTER JOIN our_classified o USING (CompanyAccount)
)

-- Focus: rows where Looker says Cancel but our doesn't
SELECT
  Looker_Classification,
  Our_Classification,
  COUNT(*) AS account_count,
  ROUND(SUM(looker_prev), 2) AS looker_prev_total,
  ROUND(SUM(looker_cur), 2)  AS looker_cur_total,
  ROUND(SUM(our_p1), 2)      AS our_p1_total,
  ROUND(SUM(our_p2), 2)      AS our_p2_total,
  ROUND(AVG(entity_count), 2) AS avg_entity_count
FROM diff
WHERE Looker_Classification IN ('Churn', 'Downgrade', 'Upgrade')
  AND (Our_Classification IS NULL OR Our_Classification != CASE
    WHEN Looker_Classification = 'Churn' THEN 'Cancel'
    WHEN Looker_Classification = 'Downgrade' THEN 'Downgrade'
    WHEN Looker_Classification = 'Upgrade' THEN 'Upgrade'
  END)
GROUP BY Looker_Classification, Our_Classification
ORDER BY Looker_Classification, Our_Classification
