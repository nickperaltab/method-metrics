#!/usr/bin/env python3
"""Verify the marketing 'Revenue by Channel' SaaS column is Custdatlastsaasamount
allocated by attribution channel (NOT invoiced SaaS). Reproduce May-2026
first-invoice cohort grand totals and compare to the Looker screenshot."""
from google.cloud import bigquery

c = bigquery.Client(project="project-for-method-dw")
sql = """
WITH base AS (
  SELECT
    Custdatlastsaasamount AS amt,
    Att_Direct, Att_SEO, Att_OPN_Other_Peoples_Networks, Att_Pay_Per_Click,
    Att_Partners, Att_Email, Att_Content, Att_Backlinks, Att_Other, Att_None
  FROM `project-for-method-dw.revenue.Account`
  WHERE IsConversionException = FALSE
    AND Partner != 'Method Integration'
    AND FirstSaaSInvoiceTxnDate >= '2026-05-01'
    AND FirstSaaSInvoiceTxnDate <  '2026-06-01'
)
SELECT
  COUNT(*) AS customers,
  ROUND(SUM(amt*Att_Direct),2)                        AS Direct,
  ROUND(SUM(amt*Att_SEO),2)                           AS SEO,
  ROUND(SUM(amt*Att_OPN_Other_Peoples_Networks),2)    AS OPN,
  ROUND(SUM(amt*Att_Pay_Per_Click),2)                 AS PPC,
  ROUND(SUM(amt*Att_Partners),2)                       AS Partners,
  ROUND(SUM(amt*Att_Email),2)                          AS Email,
  ROUND(SUM(amt*Att_Content),2)                        AS Content,
  ROUND(SUM(amt*Att_Backlinks),2)                      AS Backlinks,
  ROUND(SUM(amt*Att_Other),2)                          AS Other,
  ROUND(SUM(amt*Att_None),2)                           AS NoneCh
FROM base
"""
r = list(c.query(sql).result())[0]
expected = {  # grand totals from the Looker screenshot
    "customers": 88, "Direct": 2959.0, "SEO": 4729.45, "OPN": 904.0,
    "PPC": 724.21, "Partners": 512.18, "Email": 166.32, "Content": 0.0,
    "Backlinks": 0.0, "Other": 0.0, "NoneCh": 1287.35,
}
print(f"{'col':10} {'BQ (Custdatlast×Att)':>22} {'Looker':>12} {'match':>7}")
for k, exp in expected.items():
    got = getattr(r, k)
    ok = abs((got or 0) - exp) < 0.5
    print(f"{k:10} {got!s:>22} {exp:>12} {'OK' if ok else 'DIFF':>7}")
