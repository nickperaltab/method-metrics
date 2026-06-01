#!/usr/bin/env python3
"""Parity: revenue.v_channel_arr (dbt) vs the Looker 'Revenue by Channel'
dashboard, May 2026, rate=1.33. Checks SaaS, CAD ARR, customers, avg first invoice."""
from google.cloud import bigquery

RATE = 1.33
c = bigquery.Client(project="project-for-method-dw")
rows = list(c.query(f"""
SELECT channel,
  customers,
  ROUND(saas_usd, 2) AS saas,
  ROUND(((saas_us_portion*{RATE} + saas_nonus_portion)/NULLIF(attribution_value,0))*12, 2) AS cad_arr,
  ROUND(first_invoice_weighted/NULLIF(attribution_value,0), 2) AS avg_first_invoice
FROM `project-for-method-dw.revenue.v_channel_arr`
WHERE month = DATE '2026-05-01'
""").result())

# Looker screenshot values (image #2)
looker = {
  'SEO':      dict(customers=36, saas=4729.45, cad_arr=2108.8,  avg_first_invoice=117.93),
  'Direct':   dict(customers=15, saas=2959.0,  cad_arr=2863.52, avg_first_invoice=239.59),
  'None':     dict(customers=12, saas=1287.35, cad_arr=2034.27, avg_first_invoice=168.45),
  'PPC':      dict(customers=11, saas=724.21,  cad_arr=1132.46, avg_first_invoice=73.16),
  'OPN':      dict(customers=9,  saas=904.0,   cad_arr=1539.73, avg_first_invoice=85.74),
  'Partners': dict(customers=9,  saas=512.18,  cad_arr=1133.56, avg_first_invoice=61.82),
  'Email':    dict(customers=2,  saas=166.32,  cad_arr=2746.16, avg_first_invoice=125.41),
  'Social':   dict(customers=2,  saas=0.0,     cad_arr=0.0,     avg_first_invoice=0.0),
}
got = {r.channel: r for r in rows}
allok = True
print(f"{'channel':9}{'metric':18}{'dbt':>11}{'looker':>11}{'':>4}")
for ch, exp in looker.items():
    r = got.get(ch)
    if not r:
        print(f"{ch:9} MISSING from view"); allok = False; continue
    for k in ('customers', 'saas', 'cad_arr', 'avg_first_invoice'):
        g = getattr(r, k); e = exp[k]
        ok = abs((g or 0) - e) < 0.6
        allok = allok and ok
        print(f"{ch:9}{k:18}{g!s:>11}{e!s:>11}{'  OK' if ok else ' DIFF'}")
print("\n" + ("ALL PARITY CHECKS PASSED" if allok else "*** PARITY FAILED ***"))
