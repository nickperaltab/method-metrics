#!/usr/bin/env python3
"""Read-only: IsConversionException breakdown by signup month (recent), to see
whether May accounts really are all exception=TRUE in the source Account table."""
from google.cloud import bigquery

c = bigquery.Client(project="project-for-method-dw")
sql = """
SELECT
  FORMAT_DATE('%Y-%m', SignupDate) AS signup_month,
  COUNT(*) AS accounts,
  COUNTIF(IsConversionException = TRUE)  AS exc_true,
  COUNTIF(IsConversionException = FALSE) AS exc_false,
  COUNTIF(IsConversionException IS NULL) AS exc_null,
  COUNTIF(Partner = 'Method Integration') AS method_partner
FROM `project-for-method-dw.revenue.Account`
WHERE SignupDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 MONTH)
  AND SignupDate != DATE('0001-01-01')
GROUP BY 1 ORDER BY 1
"""
rows = list(c.query(sql).result())
hdr = ("month", "accts", "exc=TRUE", "exc=FALSE", "exc=NULL", "MI_partner")
print(f"{hdr[0]:8}{hdr[1]:>8}{hdr[2]:>10}{hdr[3]:>11}{hdr[4]:>10}{hdr[5]:>12}")
for x in rows:
    print(f"{x.signup_month:8}{x.accounts:>8,}{x.exc_true:>10,}"
          f"{x.exc_false:>11,}{x.exc_null:>10,}{x.method_partner:>12,}")
