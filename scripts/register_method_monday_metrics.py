#!/usr/bin/env python3
"""
Register the Method Monday scorecard metrics in Supabase, and flip three
existing metrics to queued now that their conventions changed underneath
them (Task 3).

Every new pointer metric's chart_sql selects (period, value) from a
revenue_metrics.v_metric__* view built by dbt. No formula is duplicated
here -- dbt owns the pointer definitions. Four additional formula metrics
compute forecast-vs-trajectory and attainment over the pointer ids plus
the pre-existing Trials Forecast (#285) and Syncs Forecast (#286).

All thirteen new rows land status='queued'. Nothing goes live without
Nic's explicit approval and a docs/metric-definitions.md entry.

FORMAT_DATE('%Y-%m', period) is used for every pointer -- never
'%Y-%m-%d'. Day-grain periods break the derived-metric join at
builder/src/lib/sql/load.js:137 (exact period-label string match, no
prefix normalization), the current_month KPI lookup, and showDelta.
This cost a day on 2026-07-31 (see register_sync_conversion_metrics.py).

Also flips #295 (Syncs Trajectory), #296 (Conversions Trajectory), and
#400 (Sync Conversion Rate Trajectory) to status='queued'. Task 3
changed the convention of #295/#296 and that propagated to #400; their
dbt ymls already say status: queued, so Supabase must agree. These flip
back to live only after Task 8 records browser parity, with Nic's
explicit approval -- not this script's call.

Idempotent: skips any metric whose exact name already exists. Aborts on
the first write error so a rejected auth leaves no partial state.
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
    """chart_sql that reads a dbt metric view as (period, value) pairs."""
    return (f"SELECT FORMAT_DATE('%Y-%m', period) AS period, value "
            f"FROM `{DS}.{view}` ORDER BY 1")


_, existing = req("GET", f"{SB}?select=id,name,status")
if not isinstance(existing, list):
    sys.exit(f"ABORT reading metrics: {existing}")
by_name = {m["name"]: m for m in existing}

# POINTER metrics: chart_sql reads a dbt view. No formula duplicated here.
# Descriptions rewrite the brief's stale 2026-08-10 figures to describe the
# convention, date-stamping the one number kept (462.6 as of 2026-08-14).
POINTERS = [
    ("Trials MTD (through yesterday)", "v_metric__trials_mtd",
     "Trials with SignupDate this month, excluding today. Pairs with the "
     "complete-days trajectory. Distinct from Trials #54, the full-month total."),
    ("Syncs MTD (through yesterday)", "v_metric__syncs_mtd",
     "Sync events this month, excluding today. Distinct from Syncs #55, the full-month total."),
    ("Conversions MTD (through yesterday)", "v_metric__conversions_mtd",
     "Conversions this month, excluding today. Also backs the Sales Scorecard "
     "Conversions tile. Distinct from Conversions #56, the full-month total."),
    ("Churn MTD (through yesterday)", "v_metric__churn_mtd",
     "Distinct CompanyAccounts cancelled this month, excluding today. "
     "CompanyAccount grain, matching metric 344."),
    ("Trials Trajectory (complete days)", "v_metric__trials_trajectory",
     "Month-end projection from complete days only: MTD trials divided by "
     "complete days elapsed, times days in month. Matches Looker's Method "
     "Monday page convention. 462.6 as of 2026-08-14."),
    ("Churn Trajectory (complete days)", "v_metric__churn_trajectory",
     "Month-end projection from complete days only: MTD churn divided by "
     "complete days elapsed, times days in month."),
    ("Conversions Forecast MTD", "v_metric__conversions_forecast_mtd",
     "Full-month conversions forecast prorated to the elapsed window, so the "
     "MTD bar compares like with like."),
    ("Churn Forecast MTD", "v_metric__churn_forecast_mtd",
     "Full-month churn forecast prorated to the elapsed window."),
    ("Sync Rate MTD (through yesterday)", "v_metric__sync_rate_mtd",
     "Syncs divided by trials, both excluding today. Emits a percentage. "
     "Distinct from Sync Rate #300, the full-month ratio."),
]

maxid = max((m["id"] for m in existing if isinstance(m.get("id"), int)), default=0)
next_id = maxid + 1
print(f"max existing id={maxid}; assigning explicit ids from {next_id}")

ids = {}
for name, view, desc in POINTERS:
    if name in by_name:
        ids[name] = by_name[name]["id"]
        print(f"  skip (exists #{ids[name]}): {name}")
        continue
    row = {
        "id": next_id, "name": name, "description": desc,
        "chart_sql": pointer_sql(view), "view_name": view,
        "status": "queued", "stage": "revenue", "depends_on": [],
    }
    st, res = req("POST", SB, row)
    if st not in (200, 201) or not isinstance(res, list):
        sys.exit(f"ABORT pointer '{name}': HTTP {st} {res}")
    ids[name] = res[0]["id"]
    next_id = ids[name] + 1
    print(f"  created #{ids[name]}: {name}")

# FORMULA metrics for the forecast-vs-trajectory and attainment tiles.
# 285 = Trials Forecast, 286 = Syncs Forecast (pre-existing, full-month).
# Syncs Trajectory is NOT one of this task's nine new pointers -- it already
# exists as metric #295 (flipped to queued below, not created here).
trials_traj = ids["Trials Trajectory (complete days)"]
syncs_traj = 295

FORMULAS = [
    ("Trials Forecast vs Trajectory",
     f"{{{trials_traj}}} - {{285}}", [trials_traj, 285],
     "Trajectory minus full-month forecast, in trials. Negative means pacing behind."),
    ("Trials Attainment",
     f"SAFE_DIVIDE({{{trials_traj}}}, {{285}}) * 100", [trials_traj, 285],
     "Trajectory as a percentage of forecast. Looker labels this tile "
     "'Forecast vs Trajectory'; that label is wrong, it computes attainment."),
    ("Syncs Forecast vs Trajectory",
     f"{{{syncs_traj}}} - {{286}}", [syncs_traj, 286],
     "Trajectory minus full-month forecast, in syncs. Negative means pacing behind."),
    ("Syncs Attainment",
     f"SAFE_DIVIDE({{{syncs_traj}}}, {{286}}) * 100", [syncs_traj, 286],
     "Trajectory as a percentage of forecast."),
]

for name, formula, deps, desc in FORMULAS:
    if name in by_name:
        ids[name] = by_name[name]["id"]
        print(f"  skip (exists #{ids[name]}): {name}")
        continue
    row = {"id": next_id, "name": name, "formula": formula, "depends_on": deps,
           "description": desc, "status": "queued", "stage": "revenue"}
    st, res = req("POST", SB, row)
    if st not in (200, 201) or not isinstance(res, list):
        sys.exit(f"ABORT formula '{name}': HTTP {st} {res}")
    ids[name] = res[0]["id"]
    next_id = ids[name] + 1
    print(f"  created #{ids[name]}: {name}")

# Flip the three existing metrics whose convention changed underneath them
# (Task 3) back to queued -- Supabase must agree with the dbt ymls, which
# already say status: queued. These do NOT flip back to live automatically;
# that requires Task 8's browser-parity check and Nic's explicit approval.
REFLIP = [295, 296, 400]
print("\n=== flipping #295/#296/#400 to queued ===")
for mid in REFLIP:
    st, res = req("PATCH", f"{SB}?id=eq.{mid}", {"status": "queued"})
    if st not in (200, 204) or (isinstance(res, list) and not res):
        sys.exit(f"ABORT flip #{mid}: HTTP {st} {res}")
    print(f"  #{mid} -> queued (write accepted)")

print("\n=== read-back verification of #295/#296/#400 status ===")
_, check = req("GET", f"{SB}?select=id,name,status&id=in.(295,296,400)&order=id")
if not isinstance(check, list):
    sys.exit(f"ABORT read-back: {check}")
for m in check:
    print(f"  #{m['id']} {m['name']}: status={m['status']}")

print("\n=== new metric IDs — hardcode these into Task 6's page config ===")
for name in [p[0] for p in POINTERS] + [f[0] for f in FORMULAS]:
    print(f"  {ids[name]:>4}  {name}")
print("\nAlso write each pointer id into the metric_id label in its")
print("models/metrics/*.yml. The four formula metrics have no dbt model —")
print("they are pure Supabase derivations over the pointer/forecast metrics.")
