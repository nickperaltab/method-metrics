#!/usr/bin/env python3
"""
Register the sync conversion rate metric family in Supabase, and repoint
295/296/357 at their new dbt views.

Every new metric is a POINTER: chart_sql selects (period, value) from a
revenue_metrics.v_metric__* view built by dbt. No formula is duplicated
here -- dbt owns the definitions.

New metrics land status='queued'. Nothing goes live without Nic's
approval and a docs/metric-definitions.md entry.

Idempotent: skips any metric whose exact name already exists. Aborts on
the first write error so a rejected auth leaves no partial state.

PERIOD FORMAT (deviation from the task brief, made deliberately):
    Monthly pointers emit FORMAT_DATE('%Y-%m', period); the weekly
    pointer emits FORMAT_DATE('%Y-%m-%d', period).

    The brief specified '%Y-%m-%d' everywhere. That breaks production.
    builder/src/lib/sql/load.js joins a derived metric's dependencies by
    EXACT period-label string (`depData[depId]?.[lbl] || 0`) with no
    prefix normalization, and every other monthly series in the app --
    semantic metrics via periodExpr() in builder/src/lib/sql/semantic.js,
    and every existing chart_sql -- emits '%Y-%m'.

    Concretely: #351 is `{295} - {286}` and #352 is
    `SAFE_DIVIDE({295}, {286}) * 100`, both on the Marketing Scorecard.
    #286 is a semantic metric, so it emits '2026-07'. Had #295 started
    emitting '2026-07-01', those two KPIs would have joined a label that
    exists on only one side and silently read 0 for the other.

    '%Y-%m-%d' is correct for the weekly pointer -- that matches
    periodExpr()'s week bucket and the axisIsWeekly detection in
    builder/src/lib/chartDataBuilder.js.
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


def pointer_sql(view, fmt="%Y-%m"):
    """chart_sql that reads a dbt metric view as (period, value) pairs."""
    return (f"SELECT FORMAT_DATE('{fmt}', period) AS period, value "
            f"FROM `{DS}.{view}` ORDER BY 1")


_, existing = req("GET", f"{SB}?select=id,name,status")
if not isinstance(existing, list):
    sys.exit(f"ABORT reading metrics: {existing}")
by_name = {m["name"]: m for m in existing}

# POINTER metrics: chart_sql reads a dbt view. No formula duplicated here.
# 4th element is the period format -- monthly everywhere except the weekly view.
POINTERS = [
    ("Sync Conversion Rate Trajectory",
     "v_metric__sync_conversion_rate_trajectory",
     "Month-end projection of the sync conversion rate: projected conversions / projected sync events. Same-month, no lag. Decimal rate. Single row, current month.",
     "%Y-%m"),
    ("Budgeted Sync Conversion Rate",
     "v_metric__sync_conversion_rate_budgeted",
     "Budgeted conversions / budgeted sync events by month. DERIVED, not published by Finance — pending Justin's confirmation. Decimal rate.",
     "%Y-%m"),
    ("Forecasted Sync Conversion Rate",
     "v_metric__sync_conversion_rate_forecasted",
     "Forecasted conversions / forecasted sync events by month. DERIVED, not published by Finance — pending Justin's confirmation. Decimal rate.",
     "%Y-%m"),
    ("Sync Conversion Rate (weekly)",
     "v_metric__sync_conversion_rate_weekly",
     "Conversions / sync events by ISO week (Monday start), no lag. Decimal rate. Noisy by nature.",
     "%Y-%m-%d"),
]

maxid = max((m["id"] for m in existing if isinstance(m.get("id"), int)), default=0)
next_id = maxid + 1
print(f"max existing id={maxid}; assigning explicit ids from {next_id}")

ids = {}
for name, view, desc, fmt in POINTERS:
    if name in by_name:
        ids[name] = by_name[name]["id"]
        print(f"  skip (exists #{ids[name]}): {name}")
        continue
    row = {
        "id": next_id, "name": name, "description": desc,
        "chart_sql": pointer_sql(view, fmt), "view_name": view,
        "status": "queued", "stage": "revenue", "depends_on": [],
    }
    st, res = req("POST", SB, row)
    if st not in (200, 201) or not isinstance(res, list):
        sys.exit(f"ABORT pointer '{name}': HTTP {st} {res}")
    ids[name] = res[0]["id"]
    next_id = ids[name] + 1
    print(f"  created #{ids[name]}: {name}")

# FORMULA metrics for the two derived KPIs. These get their own ids rather
# than reusing the trajectory id with a formulaOverride — three KPIs sharing
# one metricId breaks the MetricInspector drill-down and React keys.
#
# Both inputs are decimal rates, so multiply by 100 once for display. This
# differs from the trials section's 322/323, where 321 is already a
# percentage and 319 is a decimal — hence their messier scaling.
traj = ids["Sync Conversion Rate Trajectory"]
fcst = ids["Forecasted Sync Conversion Rate"]

FORMULAS = [
    ("Sync Forecast vs. Trajectory",
     f"({{{traj}}} - {{{fcst}}}) * 100",
     [traj, fcst],
     "Gap between the projected sync conversion rate and the forecast, in percentage points. Positive means pacing ahead of forecast."),
    ("Sync Forecasted Attainment",
     f"SAFE_DIVIDE({{{traj}}}, {{{fcst}}}) * 100",
     [traj, fcst],
     "Projected sync conversion rate as a percentage of the forecast. 100% means exactly on forecast."),
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

# Repoint the three existing metrics whose formulas now live in dbt.
# Only chart_sql and view_name change. Name, status, depends_on, and every
# other column are left exactly as they were.
REPOINT = {
    295: "v_metric__syncs_trajectory",
    296: "v_metric__conversions_trajectory",
    357: "v_metric__trial_conversion_rate_lagged",
}

print("\n=== repointing existing metrics at dbt views ===")
for mid, view in REPOINT.items():
    body = {"chart_sql": pointer_sql(view), "view_name": view}
    st, res = req("PATCH", f"{SB}?id=eq.{mid}", body)
    if st not in (200, 204) or (isinstance(res, list) and not res):
        sys.exit(f"ABORT repoint #{mid}: HTTP {st} {res}")
    print(f"  #{mid} -> {view}")

print("\n=== new metric IDs — hardcode these into sales-scorecard.js ===")
for name in [p[0] for p in POINTERS] + [f[0] for f in FORMULAS]:
    print(f"  {ids[name]:>4}  {name}")
print("\nAlso write each pointer id into the metric_id label in its")
print("models/metrics/*.yml. The two formula metrics have no dbt model —")
print("they are pure Supabase derivations over the pointer metrics.")
