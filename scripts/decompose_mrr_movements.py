#!/usr/bin/env python3
"""
Decompose monthly MRR downgrades & expansions into SEATS vs APPS vs PRICE.

Replicates int_customer_mrr's monthly book (SUM(SaaSAmount) per entity per
calendar month, same filters) but keeps line-level detail, then attributes each
customer's month-over-month change via a price/volume/mix split:

  - APP    : a module (ItemFullName, Service) added or dropped entirely
  - SEAT   : same module, change in Qty (users)  -> (Δqty * prior unit-rate)
  - PRICE  : same module, change in unit-rate (residual) + any Discount-line change

Net of (app+seat+price) per customer-month == total MRR change, so it reconciles
to the official Downgrades/Expansions. Window matches the Net SaaS bridge
(trailing 12 movement-months: 2025-05 .. 2026-04). Pre-FX.
"""
from google.cloud import bigquery

PROJECT = "project-for-method-dw"
WIN_START, WIN_END = "2025-05-01", "2026-04-01"   # movement months (m vs m-1)
client = bigquery.Client(project=PROJECT)

SQL = f"""
WITH lines AS (   -- monthly line composition per entity (int_customer_mrr filters)
  SELECT DATE_TRUNC(TxnDate, MONTH) AS m, EntityRecordID AS e,
         ItemFullName AS item, (ItemType = 'Discount') AS is_disc,
         SUM(Qty) AS qty, SUM(SaaSAmount) AS saas
  FROM `{PROJECT}.revenue.TransLineFlattened`
  WHERE TxnDate >= '2021-12-01'
    AND FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND CompanyAccount NOT LIKE 'm11%' AND CompanyAccount NOT LIKE 'm18%'
  GROUP BY 1,2,3,4
),
em AS (SELECT e, m, SUM(saas) AS cur FROM lines GROUP BY e, m),
tot AS (  -- entity monthly total + TRUE prior-calendar-month total (NULL if gap)
  SELECT a.e, a.m, a.cur, b.cur AS prv
  FROM em a
  LEFT JOIN em b ON a.e = b.e AND b.m = DATE_SUB(a.m, INTERVAL 1 MONTH)
),
paired AS (   -- item-level month vs month-1
  SELECT COALESCE(c.e,p.e) AS e,
         COALESCE(c.m, DATE_ADD(p.m, INTERVAL 1 MONTH)) AS m,
         COALESCE(c.is_disc, p.is_disc) AS is_disc,
         IFNULL(c.qty,0) AS cq, IFNULL(p.qty,0) AS pq,
         IFNULL(c.saas,0) AS cs, IFNULL(p.saas,0) AS ps
  FROM lines c
  FULL OUTER JOIN lines p
    ON c.e = p.e AND c.item = p.item AND c.m = DATE_ADD(p.m, INTERVAL 1 MONTH)
),
eff AS (   -- attribute each item delta to a bucket
  SELECT e, m,
    -- APP: Service line that appeared or disappeared
    CASE WHEN NOT is_disc AND (cs=0 OR ps=0) THEN cs - ps ELSE 0 END AS app,
    -- SEAT: Service line in both periods, qty change at prior unit-rate
    CASE WHEN NOT is_disc AND cs<>0 AND ps<>0 THEN (cq-pq) * SAFE_DIVIDE(ps,pq) ELSE 0 END AS seat,
    -- PRICE: Service rate change (residual) + any Discount-line change
    CASE WHEN NOT is_disc AND cs<>0 AND ps<>0 THEN (cs-ps) - (cq-pq)*SAFE_DIVIDE(ps,pq)
         WHEN is_disc THEN cs - ps ELSE 0 END AS price
  FROM paired
),
by_em AS (  -- per entity-month bucket sums + classify the month
  SELECT ef.e AS e, ef.m AS m, SUM(ef.app) app, SUM(ef.seat) seat, SUM(ef.price) price,
         tt.cur, tt.prv
  FROM eff ef JOIN tot tt ON ef.e=tt.e AND ef.m=tt.m
  WHERE ef.m BETWEEN '{WIN_START}' AND '{WIN_END}'
  GROUP BY ef.e, ef.m, tt.cur, tt.prv
)
SELECT
  CASE WHEN prv>0 AND cur>0 AND cur<prv THEN 'DOWNGRADE'
       WHEN prv>0 AND cur>0 AND cur>prv THEN 'EXPANSION' ELSE 'other' END AS kind,
  ROUND(SUM(app))   AS app_mrr,
  ROUND(SUM(seat))  AS seat_mrr,
  ROUND(SUM(price)) AS price_mrr,
  ROUND(SUM(app+seat+price)) AS net_mrr,
  COUNT(*) AS cust_months
FROM by_em
GROUP BY kind
"""

rows = {r["kind"]: r for r in client.query(SQL).result()}

def show(kind, label):
    r = rows.get(kind)
    if not r:
        print(f"  {label}: (none)"); return
    app, seat, price, net = (float(r[k]) for k in ("app_mrr","seat_mrr","price_mrr","net_mrr"))
    gross = abs(app)+abs(seat)+abs(price)
    print(f"\n{label}  (net {net*12/1e6:+.2f}M ARR · {r['cust_months']} cust-months)")
    for nm, v in (("Apps (module add/drop)", app), ("Seats (Δ users)", seat), ("Price (rate/discount)", price)):
        pct = (abs(v)/gross*100) if gross else 0
        print(f"   {nm:<26} {v*12/1e6:+6.2f}M ARR   ({pct:4.0f}% of gross movement)")

print("="*60)
print(f"MRR MOVEMENT DECOMPOSITION  ·  {WIN_START}..{WIN_END}  ·  pre-FX")
print("="*60)
show("DOWNGRADE", "DOWNGRADES")
show("EXPANSION", "EXPANSIONS")
print("\n(ARR = monthly MRR flow x12. Net should match v_metric__monthly_downgrades_mrr / _expansions_mrr.)")
