#!/usr/bin/env python3
"""For the May-2026 NEW customer cohort (first SaaS invoice in May), compare
SUM(Custdatlastsaasamount) [run-rate] vs SUM(first-invoice net SaaS) [invoiced],
and break down WHY they differ per account (proration/discount vs prepay vs timing)."""
from google.cloud import bigquery

c = bigquery.Client(project="project-for-method-dw")
sql = """
WITH acct AS (
  SELECT CompanyAccount, FirstSaaSInvoiceTxnDate,
         Custdatlastsaasamount AS plan_rate, SaaSPayType
  FROM `project-for-method-dw.revenue.Account`
  WHERE IsConversionException = FALSE AND Partner != 'Method Integration'
    AND FirstSaaSInvoiceTxnDate >= '2026-05-01'
    AND FirstSaaSInvoiceTxnDate <  '2026-06-01'
),
inv AS (
  SELECT CompanyAccount,
    SUM(CASE WHEN TxnDate = FirstSaaSInvoiceTxnDate THEN SaaSAmount + SaaSExpense ELSE 0 END) AS first_invoice
  FROM `project-for-method-dw.revenue.TransLineFlattened`
  GROUP BY CompanyAccount
)
SELECT
  COUNT(*)                                            AS customers,
  ROUND(SUM(a.plan_rate),2)                           AS sum_custdatlast,
  ROUND(SUM(COALESCE(i.first_invoice,0)),2)           AS sum_first_invoice,
  COUNTIF(COALESCE(i.first_invoice,0) = 0)            AS n_zero_invoice,
  COUNTIF(i.first_invoice < a.plan_rate - 0.5)        AS n_invoice_below_plan,
  COUNTIF(i.first_invoice > a.plan_rate + 0.5)        AS n_invoice_above_plan,
  COUNTIF(ABS(COALESCE(i.first_invoice,0) - a.plan_rate) <= 0.5) AS n_equal
FROM acct a LEFT JOIN inv i USING (CompanyAccount)
"""
r = list(c.query(sql).result())[0]
print(f"May-2026 new-customer cohort: {r.customers} customers\n")
print(f"  SUM(Custdatlastsaasamount)  [run-rate] = ${r.sum_custdatlast:,.2f}")
print(f"  SUM(first-invoice net SaaS) [invoiced] = ${r.sum_first_invoice:,.2f}")
diff = r.sum_custdatlast - r.sum_first_invoice
pct = diff / r.sum_first_invoice * 100 if r.sum_first_invoice else float('nan')
print(f"  Custdatlast is {'HIGHER' if diff>0 else 'LOWER'} by ${abs(diff):,.2f} ({pct:+.1f}%)\n")
print("  Per-account reason the two differ:")
print(f"    first invoice == plan rate (clean monthly) : {r.n_equal}")
print(f"    first invoice <  plan rate (proration/disc): {r.n_invoice_below_plan}")
print(f"    first invoice >  plan rate (prepay/annual) : {r.n_invoice_above_plan}")
print(f"    first invoice == $0 (billing timing)       : {r.n_zero_invoice}")
