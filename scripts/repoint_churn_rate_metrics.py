#!/usr/bin/env python3
"""
Repoint #344 ("Churn Rate") and #345 ("Churn Rate % Trajectory") at the
new dbt views v_metric__churn_rate_mtd / v_metric__churn_rate_trajectory,
following the same repoint pattern used for #295/#296/#357 in
register_sync_conversion_metrics.py.

Both ids stay stable (they have history). Both stay status='queued' --
this script does not flip anything live. Names are updated to match the
2026-08-17 Ruling 9 rename (Churn -> Accounts Churned, already applied to
#409/#411/#413) so the family reads consistently.

Idempotent-ish: re-running just re-applies the same PATCH body. Aborts on
the first write error. Reads every row back after writing per the repo's
Supabase-write convention.
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


REPOINT = {
    344: {
        "name": "Accounts Churned Rate MTD (through yesterday)",
        "view": "v_metric__churn_rate_mtd",
        "description": (
            "Accounts churned this month (through yesterday) as a percentage "
            "of the active account base: churn_mtd / (beginning-of-month "
            "customers + mid-month conversions). CompanyAccount (billing-"
            "account) grain. Renamed from 'Churn Rate' 2026-08-17 (Ruling 9: "
            "Churn -> Accounts Churned, matching #409/#411/#413) and moved "
            "from the through-today window to the complete-days convention "
            "used by the rest of Method Monday. Verified: Apr 2026 = 2.41%, "
            "Jun 2026 = 2.70%, exact match."
        ),
        "notes": (
            "Was raw chart_sql joining v_cancellations, v_bom_customers and "
            "v_conversions; the blocking gap ('no BOM customers primitive') "
            "is resolved by int_bom_customers (dbt model mirroring "
            "revenue.v_bom_customers exactly, parity-checked 14 months). "
            "Now a thin pointer at v_metric__churn_rate_mtd, which reads "
            "int_method_monday.churn_rate_mtd."
        ),
    },
    345: {
        "name": "Accounts Churned Rate Trajectory (complete days)",
        "view": "v_metric__churn_rate_trajectory",
        "description": (
            "Month-end projection of the accounts-churned rate: "
            "churn_trajectory / (beginning-of-month customers + "
            "conversions_trajectory), both divided by complete days only. "
            "NULL on day 1. CompanyAccount (billing-account) grain. Renamed "
            "from 'Churn Rate % Trajectory' 2026-08-17 (Ruling 9). Previously "
            "read BOM from revenue.Account directly, a different code path "
            "than #344 -- both now read the same int_bom_customers source."
        ),
        "notes": (
            "Was raw chart_sql reading BOM from revenue.Account directly -- "
            "a different code path than #344's v_bom_customers, which could "
            "silently diverge. Now a thin pointer at "
            "v_metric__churn_rate_trajectory, same int_bom_customers source "
            "as #344."
        ),
    },
}

print("=== current state before repoint ===")
_, before = req("GET", f"{SB}?select=id,name,view_name,status,display_format&id=in.(344,345)&order=id")
if not isinstance(before, list):
    sys.exit(f"ABORT reading metrics: {before}")
for m in before:
    print(f"  #{m['id']} {m['name']!r} view_name={m['view_name']!r} status={m['status']} display_format={m['display_format']}")

print("\n=== repointing #344 / #345 ===")
for mid, cfg in REPOINT.items():
    body = {
        "name": cfg["name"],
        "chart_sql": pointer_sql(cfg["view"]),
        "view_name": cfg["view"],
        "description": cfg["description"],
        "notes": cfg["notes"],
        "display_format": "percent",
        # status stays 'queued' -- not touched here, but set explicitly so a
        # stray prior edit can't leave it live by accident.
        "status": "queued",
    }
    st, res = req("PATCH", f"{SB}?id=eq.{mid}", body)
    if st not in (200, 204) or (isinstance(res, list) and not res):
        sys.exit(f"ABORT repoint #{mid}: HTTP {st} {res}")
    print(f"  #{mid} -> {cfg['view']} ({cfg['name']})")

print("\n=== read-back verification ===")
_, after = req("GET", f"{SB}?select=id,name,view_name,status,display_format,chart_sql&id=in.(344,345)&order=id")
if not isinstance(after, list):
    sys.exit(f"ABORT read-back: {after}")
for m in after:
    print(f"  #{m['id']} {m['name']!r}")
    print(f"    view_name={m['view_name']!r} status={m['status']} display_format={m['display_format']}")
    print(f"    chart_sql={m['chart_sql']!r}")
