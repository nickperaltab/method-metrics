
WITH churns AS (SELECT DATE_TRUNC(CancellationDate,MONTH) m, COUNT(DISTINCT CompanyAccount) c FROM `project-for-method-dw.revenue.int_cancellations` WHERE CancellationDate>='2025-01-01' AND CancellationDate<=CURRENT_DATE() GROUP BY 1),
bom_hist AS (SELECT DATE_TRUNC(TxnDate,MONTH) m, COUNT(DISTINCT CompanyAccount) b FROM `project-for-method-dw.revenue.v_bom_customers` WHERE DATE_TRUNC(TxnDate,MONTH)<DATE_TRUNC(CURRENT_DATE(),MONTH) GROUP BY 1),
convs AS (SELECT DATE_TRUNC(FirstSaaSInvoiceTxnDate,MONTH) m, COUNT(*) v FROM `project-for-method-dw.revenue.int_conversions` GROUP BY 1)
SELECT FORMAT_DATE('%Y-%m',c.m) period, c.c churn, b.b bom, v.v convs,
  ROUND(c.c*100.0/NULLIF(b.b+COALESCE(v.v,0),0),2) churn_rate_pct
FROM churns c JOIN bom_hist b USING(m) LEFT JOIN convs v USING(m)
WHERE c.m>=DATE '2026-03-01' ORDER BY 1