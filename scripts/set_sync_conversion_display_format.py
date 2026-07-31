#!/usr/bin/env python3
"""
Fix display_format on the six sync-conversion-rate metrics registered in
Task 8 (scripts/register_sync_conversion_metrics.py). They were created
without display_format and default to Supabase's 'number', which renders
a decimal rate like 0.3319 as "0" on the scorecard KPI tiles.

    400 Sync Conversion Rate Trajectory    -> decimal_rate
    401 Budgeted Sync Conversion Rate      -> decimal_rate
    402 Forecasted Sync Conversion Rate    -> decimal_rate
    403 Sync Conversion Rate (weekly)      -> decimal_rate
    404 Sync Forecast vs. Trajectory       -> percent
    405 Sync Forecasted Attainment         -> percent

This matches how builder/src/config/scorecards/sales-scorecard.js already
declares these metrics' `format` prop (verified against the checked-in
config before writing this script).

Scope: display_format ONLY. Nothing else on these rows changes -- status
stays 'queued', chart_sql/formula/view_name/depends_on are untouched. This
is the one write this task authorizes outside of the parity script's
read-only BQ queries.

Idempotent: skips any row whose display_format already matches. Snapshots
every field on all six rows before writing, and diffs full rows after, so
a run can prove nothing else moved.

Auth pattern matches scripts/register_sync_conversion_metrics.py: anon key
regexed out of tracker.html, writes via the x-method-email header (RLS
admin check).
"""
import json
import re
import sys
import urllib.request

ADMIN_EMAIL = "n.peralta-baron@method.me"
SB = "https://agkubdpgnpwudzpzcvhs.supabase.co/rest/v1/metrics"

DESIRED = {
    400: "decimal_rate",
    401: "decimal_rate",
    402: "decimal_rate",
    403: "decimal_rate",
    404: "percent",
    405: "percent",
}

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


def fetch_rows(ids):
    id_list = ",".join(str(i) for i in ids)
    st, rows = req("GET", f"{SB}?select=*&id=in.({id_list})&order=id")
    if st != 200 or not isinstance(rows, list):
        sys.exit(f"ABORT reading metrics {ids}: HTTP {st} {rows}")
    return {r["id"]: r for r in rows}


def print_rows(label, by_id):
    print(f"\n=== {label} ===")
    for mid in sorted(DESIRED):
        r = by_id.get(mid)
        if r is None:
            print(f"  #{mid}: MISSING")
            continue
        print(f"  #{mid:<4} {r['name']:<32} display_format={r['display_format']!r:<16} status={r['status']!r}")


def main():
    ids = list(DESIRED)
    before = fetch_rows(ids)
    if len(before) != len(ids):
        sys.exit(f"ABORT: expected {len(ids)} rows, found {len(before)}. "
                  f"Missing: {sorted(set(ids) - set(before))}")

    print_rows("BEFORE (snapshot)", before)

    print("\n=== writing display_format ===")
    for mid, desired in DESIRED.items():
        current = before[mid]["display_format"]
        if current == desired:
            print(f"  skip #{mid}: already {desired!r}")
            continue
        st, res = req("PATCH", f"{SB}?id=eq.{mid}", {"display_format": desired})
        if st not in (200, 204) or (isinstance(res, list) and not res):
            sys.exit(f"ABORT patching #{mid}: HTTP {st} {res}")
        print(f"  #{mid}: {current!r} -> {desired!r}")

    after = fetch_rows(ids)
    print_rows("AFTER", after)

    print("\n=== diff: every field except display_format ===")
    clean = True
    for mid in ids:
        b, a = before[mid], after[mid]
        for key in set(b) | set(a):
            if key == "display_format":
                continue
            if b.get(key) != a.get(key):
                clean = False
                print(f"  UNEXPECTED CHANGE #{mid}.{key}: {b.get(key)!r} -> {a.get(key)!r}")
    if clean:
        print("  clean -- no field other than display_format changed on any of the six rows.")
    else:
        sys.exit("ABORT-AFTER-WRITE: unexpected field changes detected, see above.")


if __name__ == "__main__":
    main()
