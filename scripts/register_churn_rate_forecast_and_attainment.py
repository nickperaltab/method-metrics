#!/usr/bin/env python3
"""
Register two new metrics for the Method Monday Churn Rate group's pace row:

1. "Forecasted Accounts Churned Rate" -- POINTER at
   v_metric__churn_rate_forecasted (decimal_rate). This is the analogue of
   #319 (Forecasted Conversion Rate) for the churn-rate pace denominator.
2. "Accounts Churned Rate Attainment" -- FORMULA metric,
   SAFE_DIVIDE({345}, {forecast_id} * 100) * 100, following the exact
   pattern already used by #420 (Conversion Rate Attainment), which
   rescales a decimal_rate denominator (*100) before dividing a
   percentage-scale numerator into it.

Both land status='queued'. Idempotent: skips any metric whose exact name
already exists. Aborts on the first write error. Reads every row back
after writing.
"""
import json
import re
import sys
import urllib.request

ADMIN_EMAIL = "n.peralta-baron@method.me"
SB = "https://agkubdpgnpwudzpzcvhs.supabase.co/rest/v1/metrics"
DS = "project-for-method-dw.revenue_metrics"

with open("tracker.html") as f:
    ANON = re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", f.read()).group(0)

H = {
    "apikey": ANON, "Authorization": f"Bearer {ANON}",
    "x-method-email": ADMIN_EMAIL, "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def req(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, headers=H, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read() or "[]")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def pointer_sql(view):
    return (f"SELECT FORMAT_DATE('%Y-%m', period) AS period, value "
            f"FROM `{DS}.{view}` ORDER BY 1")


_, existing = req("GET", f"{SB}?select=id,name,status")
if not isinstance(existing, list):
    sys.exit(f"ABORT reading metrics: {existing}")
by_name = {m["name"]: m for m in existing}
maxid = max((m["id"] for m in existing if isinstance(m.get("id"), int)), default=0)
next_id = maxid + 1
print(f"max existing id={maxid}; assigning explicit ids from {next_id}")

ids = {}

# 1. Pointer metric.
POINTER_NAME = "Forecasted Accounts Churned Rate"
POINTER_VIEW = "v_metric__churn_rate_forecasted"
POINTER_DESC = (
    "Forecasted accounts-churned rate by month, read directly from "
    "method_forecast's Forecasted_Churn_Rate__ column. Emits a decimal "
    "rate (0.025), not a percentage. Denominator for Accounts Churned "
    "Rate Attainment, alongside Accounts Churned Rate Trajectory (#345)."
)
if POINTER_NAME in by_name:
    ids[POINTER_NAME] = by_name[POINTER_NAME]["id"]
    print(f"  skip (exists #{ids[POINTER_NAME]}): {POINTER_NAME}")
else:
    row = {
        "id": next_id, "name": POINTER_NAME, "description": POINTER_DESC,
        "chart_sql": pointer_sql(POINTER_VIEW), "view_name": POINTER_VIEW,
        "display_format": "decimal_rate",
        "status": "queued", "stage": "revenue", "depends_on": [],
    }
    st, res = req("POST", SB, row)
    if st not in (200, 201) or not isinstance(res, list):
        sys.exit(f"ABORT pointer '{POINTER_NAME}': HTTP {st} {res}")
    ids[POINTER_NAME] = res[0]["id"]
    next_id = ids[POINTER_NAME] + 1
    print(f"  created #{ids[POINTER_NAME]}: {POINTER_NAME}")

forecast_id = ids[POINTER_NAME]

# 2. Formula metric: attainment = trajectory / forecast, both rescaled to
# percentage. #345 already emits percentage; the forecast is decimal_rate,
# rescaled with *100 inside the formula -- matching #420's exact pattern.
ATTAIN_NAME = "Accounts Churned Rate Attainment"
ATTAIN_FORMULA = f"SAFE_DIVIDE({{345}}, {{{forecast_id}}} * 100) * 100"
ATTAIN_DESC = (
    "Accounts Churned Rate Trajectory (#345) as a percentage of the "
    "Forecasted Accounts Churned Rate. Inverted metric on the Pace view: "
    "over 100% is bad (more churn than forecast), unlike every other "
    "attainment tile on the page."
)
if ATTAIN_NAME in by_name:
    ids[ATTAIN_NAME] = by_name[ATTAIN_NAME]["id"]
    print(f"  skip (exists #{ids[ATTAIN_NAME]}): {ATTAIN_NAME}")
else:
    row = {
        "id": next_id, "name": ATTAIN_NAME, "formula": ATTAIN_FORMULA,
        "depends_on": [345, forecast_id], "description": ATTAIN_DESC,
        "display_format": "number",
        "status": "queued", "stage": "revenue",
    }
    st, res = req("POST", SB, row)
    if st not in (200, 201) or not isinstance(res, list):
        sys.exit(f"ABORT formula '{ATTAIN_NAME}': HTTP {st} {res}")
    ids[ATTAIN_NAME] = res[0]["id"]
    next_id = ids[ATTAIN_NAME] + 1
    print(f"  created #{ids[ATTAIN_NAME]}: {ATTAIN_NAME}")

print("\n=== read-back verification ===")
_, check = req("GET", f"{SB}?select=id,name,status,view_name,formula,display_format&id=in.({ids[POINTER_NAME]},{ids[ATTAIN_NAME]})&order=id")
if not isinstance(check, list):
    sys.exit(f"ABORT read-back: {check}")
for m in check:
    print(f"  #{m['id']} {m['name']}: status={m['status']} view_name={m.get('view_name')} formula={m.get('formula')} display_format={m['display_format']}")

print("\n=== new metric IDs — hardcode these into method-monday-scorecard.js / methodMondayPace.js ===")
print(f"  {ids[POINTER_NAME]:>4}  {POINTER_NAME}")
print(f"  {ids[ATTAIN_NAME]:>4}  {ATTAIN_NAME}")
print(f"\nAlso write metric_id: '{ids[POINTER_NAME]}' into models/metrics/v_metric__churn_rate_forecasted.yml (currently 'pending').")
