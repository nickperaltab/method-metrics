#!/usr/bin/env python3
"""Phase-0 parity: confirm fractional Funnel syncs + fractional Account trials
by channel reproduce the Looker PDF (Jul 1-8, 2026), and that prior-month-shape
trajectory reproduces Looker's PPC sync trajectory (~56.19)."""
from google.cloud import bigquery
c = bigquery.Client(project='project-for-method-dw')
P = 'project-for-method-dw.revenue'

def att_cols(table):
    return [r.column_name for r in c.query(
        f"SELECT column_name FROM `{P}.INFORMATION_SCHEMA.COLUMNS` "
        f"WHERE table_name='{table}' AND column_name LIKE 'Att_%'").result()]

def breakdown(table, datecol, where, lo, hi):
    cols = att_cols(table)
    sel = ",".join([f"ROUND(SUM({a}),4) AS `{a}`" for a in cols])
    row = dict(list(c.query(
        f"SELECT COUNT(*) events,{sel} FROM `{P}.{table}` "
        f"WHERE {where} AND {datecol}>=DATE '{lo}' AND {datecol}<DATE '{hi}'").result())[0].items())
    ev = row.pop('events')
    return ev, {k: v for k, v in row.items() if v}

# Syncs (Funnel) Jul1-8
ev, s = breakdown('Funnel', 'CAST(Date AS DATE)', "EventType='Sync'", '2026-07-01', '2026-07-09')
print("SYNCS Funnel Jul1-8  events=", ev)
for k, v in sorted(s.items(), key=lambda x: -x[1]): print(f"  {k:34} {v}")
assert abs(s.get('Att_Pay_Per_Click', 0) - 14.5) < 0.01, "PPC sync != 14.5"
assert abs(s.get('Att_SEO', 0) - 20.0) < 0.01, "SEO sync != 20"

# Trials (Account) Jul1-8
tw = "IsConversionException=FALSE AND Partner!='Method Integration' AND SignupDate!=DATE('0001-01-01')"
ev, t = breakdown('Account', 'SignupDate', tw, '2026-07-01', '2026-07-09')
print("TRIALS Account Jul1-8  rows=", ev)
for k, v in sorted(t.items(), key=lambda x: -x[1]): print(f"  {k:34} {v}")
assert abs(t.get('Att_Pay_Per_Click', 0) - 37.5) < 0.01, "PPC trial != 37.5"

# Trajectory (prior-month-shape) for PPC syncs, as of a fixed date matching Looker
D = '2026-06-16'  # mid-June, when Michelle observed 57.86 / target ~56-58
q = f"""
WITH s AS (SELECT CAST(Date AS DATE) d, Att_Pay_Per_Click w FROM `{P}.Funnel` WHERE EventType='Sync')
SELECT
  SUM(CASE WHEN d>=DATE_TRUNC(DATE('{D}'),MONTH) AND d<DATE('{D}') THEN w END) mtd,
  SUM(CASE WHEN d>=DATE_TRUNC(DATE_SUB(DATE('{D}'),INTERVAL 1 MONTH),MONTH) AND d<DATE_SUB(DATE('{D}'),INTERVAL 1 MONTH) THEN w END) prior_same,
  SUM(CASE WHEN d>=DATE_TRUNC(DATE_SUB(DATE('{D}'),INTERVAL 1 MONTH),MONTH) AND d<DATE_TRUNC(DATE('{D}'),MONTH) THEN w END) prior_full
FROM s"""
r = list(c.query(q).result())[0]
traj = r.mtd / r.prior_same * r.prior_full if r.prior_same and r.prior_same != 0 else None
print(f"\nPPC sync trajectory as of {D}: mtd={r.mtd} prior_same={r.prior_same} prior_full={r.prior_full} -> {traj}")
print("Michelle observed ~57.86; confirm this method lands in that neighborhood.")
