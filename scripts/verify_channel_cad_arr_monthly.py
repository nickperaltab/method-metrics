#!/usr/bin/env python3
"""Verify a (channel x month) reconstruction of CAD ARR reproduces the Looker
'Revenue by Channel' CAD ARR column for May 2026 (rate=1.33). CAD ARR is
per-customer: (SUM(Custdatlast*Att*fx) / SUM(Att)) * 12, fx = rate if US else 1."""
from google.cloud import bigquery

c = bigquery.Client(project="project-for-method-dw")
sql = """
DECLARE cad_rate FLOAT64 DEFAULT 1.33;
WITH Filtered AS (
  SELECT CompanyAccount,
    DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS Month,
    Custdatlastsaasamount,
    Att_Direct, Att_SEO, Att_OPN_Other_Peoples_Networks, Att_Pay_Per_Click,
    Att_Partners, Att_Email, Att_Content, Att_Backlinks, Att_Other, Att_None,
    Att_Social
  FROM `project-for-method-dw.revenue.Account`
  WHERE IsConversionException = FALSE AND Partner != 'Method Integration'
    AND FirstSaaSInvoiceTxnDate != DATE('0001-01-01')
),
Region AS (
  SELECT CompanyAccount,
    CASE WHEN AccountFullName LIKE '%US%' THEN 'US'
         WHEN AccountFullName LIKE '%CAN%' THEN 'CAN' ELSE 'Other' END AS Region
  FROM (SELECT CompanyAccount, AccountFullName,
          ROW_NUMBER() OVER (PARTITION BY CompanyAccount ORDER BY TransRecordID DESC) rn
        FROM `project-for-method-dw.revenue.TransLineFlattened`
        WHERE AccountFullName IS NOT NULL) WHERE rn = 1
),
J AS (
  SELECT f.Month, f.Custdatlastsaasamount AS amt,
         CASE WHEN COALESCE(r.Region,'Other')='US' THEN cad_rate ELSE 1 END AS fx,
         f.Att_Direct, f.Att_SEO, f.Att_OPN_Other_Peoples_Networks, f.Att_Pay_Per_Click,
         f.Att_Partners, f.Att_Email, f.Att_Content, f.Att_Backlinks, f.Att_Other,
         f.Att_None, f.Att_Social
  FROM Filtered f LEFT JOIN Region r USING (CompanyAccount)
),
U AS (
  SELECT Month, amt, fx, AttributionType AS Channel, AttributionValue
  FROM J
  UNPIVOT (AttributionValue FOR AttributionType IN (
    Att_Direct AS 'Direct', Att_SEO AS 'SEO',
    Att_OPN_Other_Peoples_Networks AS 'OPN', Att_Pay_Per_Click AS 'PPC',
    Att_Partners AS 'Partners', Att_Email AS 'Email', Att_Content AS 'Content',
    Att_Backlinks AS 'Backlinks', Att_Other AS 'Other', Att_None AS 'None',
    Att_Social AS 'Social'))
  WHERE AttributionValue <> 0
)
SELECT Channel,
  ROUND((SUM(amt*AttributionValue*fx)/NULLIF(SUM(AttributionValue),0))*12, 2) AS CAD_ARR
FROM U
WHERE Month = DATE '2026-05-01'
GROUP BY Channel ORDER BY CAD_ARR DESC
"""
rows = list(c.query(sql).result())
expected = {"SEO": 2108.8, "Direct": 2863.52, "None": 2034.27, "PPC": 1132.46,
            "OPN": 1539.73, "Partners": 1133.56, "Email": 2746.16, "Social": 0.0}
print(f"{'channel':10}{'BQ CAD_ARR':>12}{'Looker':>11}{'match':>7}")
for r in rows:
    exp = expected.get(r.Channel)
    ok = exp is not None and abs((r.CAD_ARR or 0) - exp) < 2.0
    print(f"{r.Channel:10}{r.CAD_ARR!s:>12}{exp if exp is not None else '-':>11}{'OK' if ok else 'DIFF':>7}")
