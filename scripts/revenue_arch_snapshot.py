#!/usr/bin/env python3
"""
Revenue Architecture diagnostic snapshot for Method.
Pulls the numbers needed to answer the Growth-Model (ARR) and GTM-Model
(ACV, deals/year) questions from the verified revenue_metrics dataset.

All MRR is pre-FX (USD/CAD/UK at face value), excludes internal Method accounts.
Current (incomplete) month is excluded — we anchor on the latest complete month.
"""
from google.cloud import bigquery

PROJECT = "project-for-method-dw"
client = bigquery.Client(project=PROJECT)

# Latest COMPLETE month to anchor on (June 2026 is mid-month / incomplete).
ANCHOR = "2026-05-01"

def series(view):
    sql = f"""
      SELECT period, value
      FROM `{PROJECT}.revenue_metrics.v_metric__{view}`
      WHERE period <= DATE('{ANCHOR}')
      ORDER BY period
    """
    return [(r["period"], float(r["value"])) for r in client.query(sql).result()]

mrr_series   = series("monthly_start_mrr")
cust_series  = series("customers")
conv_series  = series("conversions")
churn_series = series("churn")

# ---- Growth Model: current ARR --------------------------------------------
period_mrr, total_mrr = mrr_series[-1]
arr = total_mrr * 12

# ARR one year ago for YoY growth
mrr_by_period = dict(mrr_series)
import datetime
yago = datetime.date(period_mrr.year - 1, period_mrr.month, 1)
arr_yago = mrr_by_period.get(yago, None)
arr_yago = arr_yago * 12 if arr_yago else None

# ---- GTM Model: ACV + deals/year ------------------------------------------
period_cust, active_customers = cust_series[-1]
acv = arr / active_customers                      # ARR per active customer
arpu_mo = total_mrr / active_customers            # monthly ARPU

# Trailing-12-month conversions (new paying accounts = "deals closed")
conv_t12 = sum(v for p, v in conv_series if p > datetime.date(period_mrr.year - 1, period_mrr.month, 1))
churn_t12 = sum(v for p, v in churn_series if p > datetime.date(period_mrr.year - 1, period_mrr.month, 1))

print("=" * 64)
print("METHOD — REVENUE ARCHITECTURE SNAPSHOT")
print(f"Anchor (latest complete month): {ANCHOR}   [pre-FX]")
print("=" * 64)
print("\nGROWTH MODEL")
print(f"  Total MRR (book, {period_mrr}):   ${total_mrr:,.0f}")
print(f"  Current ARR (MRR x 12):           ${arr:,.0f}")
if arr_yago:
    print(f"  ARR one year ago:                 ${arr_yago:,.0f}")
    print(f"  YoY ARR growth:                   {(arr/arr_yago - 1)*100:,.1f}%")
print("\nGTM MODEL")
print(f"  Active customers ({period_cust}): {active_customers:,.0f}")
print(f"  ACV (ARR / customer):             ${acv:,.0f}/yr")
print(f"  ARPU (monthly):                   ${arpu_mo:,.0f}/mo")
print(f"  New paying accounts, trailing 12mo: {conv_t12:,.0f}   (~{conv_t12/12:,.0f}/mo)")
print(f"  Cust. cancellations, trailing 12mo: {churn_t12:,.0f}   (~{churn_t12/12:,.0f}/mo)")
print("=" * 64)
