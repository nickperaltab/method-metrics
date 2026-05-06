-- Compare Looker definition vs our v_customer_mrr for Feb 2026
-- Looker filter applied: exclude PrepayExpiry Churn, PrepayExpiry Revenue, No Change, New Revenue
-- Visible classifications after filter: Churn, Upgrade, Downgrade only

WITH RevenueData AS (
  SELECT
    DATE_TRUNC(t.TxnDate, MONTH) AS month,
    t.CompanyAccount,
    t.SaaSAmount,
    CASE
      WHEN t.AccountFullName LIKE '%Prepay Expiry%' THEN t.SaaSAmount
      ELSE 0
    END AS OtherRevenue
  FROM `project-for-method-dw.revenue.TransLineFlattened` t
  WHERE t.TxnDate >= '2026-01-01' AND t.TxnDate < '2026-03-01'
),
MonthlyRevenue AS (
  SELECT
    CompanyAccount,
    SUM(IF(month = '2026-01-01', SaaSAmount,    0)) AS Revenue_PreviousMonth,
    SUM(IF(month = '2026-02-01', SaaSAmount,    0)) AS Revenue_NRRMonth,
    SUM(IF(month = '2026-01-01', OtherRevenue,  0)) AS OtherChurn,
    SUM(IF(month = '2026-02-01', OtherRevenue,  0)) AS OtherRev_p2
  FROM RevenueData
  GROUP BY CompanyAccount
),
classified AS (
  SELECT
    CompanyAccount,
    Revenue_PreviousMonth, Revenue_NRRMonth, OtherChurn, OtherRev_p2,
    CASE
      WHEN OtherChurn > 0 THEN 'PrepayExpiry Churn'
      WHEN OtherRev_p2 > 0 THEN 'PrepayExpiry Revenue'
      WHEN Revenue_NRRMonth = 0 AND Revenue_PreviousMonth > 0 THEN 'Churn'
      WHEN Revenue_NRRMonth > Revenue_PreviousMonth AND Revenue_PreviousMonth > 0 THEN 'Upgrade'
      WHEN Revenue_NRRMonth < Revenue_PreviousMonth AND Revenue_NRRMonth > 0 THEN 'Downgrade'
      WHEN Revenue_NRRMonth > 0 AND Revenue_PreviousMonth = 0 THEN 'New Revenue'
      ELSE 'No Change'
    END AS Classification
  FROM MonthlyRevenue
  WHERE NOT (Revenue_PreviousMonth = 0 AND Revenue_NRRMonth = 0)
)
SELECT
  Classification,
  COUNT(*)                                   AS account_count,
  ROUND(SUM(Revenue_PreviousMonth), 2)       AS prev_month_total,
  ROUND(SUM(Revenue_NRRMonth), 2)            AS nrr_month_total,
  ROUND(SUM(CASE WHEN Revenue_NRRMonth = 0 AND Revenue_PreviousMonth > 0
                 THEN Revenue_PreviousMonth ELSE 0 END), 2) AS churn_revenue,
  ROUND(SUM(CASE WHEN Revenue_NRRMonth < Revenue_PreviousMonth AND Revenue_NRRMonth > 0
                 THEN Revenue_PreviousMonth - Revenue_NRRMonth ELSE 0 END), 2) AS downgrade_revenue,
  ROUND(SUM(CASE WHEN Revenue_NRRMonth > Revenue_PreviousMonth AND Revenue_PreviousMonth > 0
                 THEN Revenue_NRRMonth - Revenue_PreviousMonth ELSE 0 END), 2) AS upgrade_revenue
FROM classified
GROUP BY Classification
ORDER BY Classification
