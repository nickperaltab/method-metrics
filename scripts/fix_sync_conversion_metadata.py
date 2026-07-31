#!/usr/bin/env python3
"""
Two metadata corrections in Supabase, found by the whole-branch review of
the sync-conversion work.

#357 "Scorecard Conversion Rate" — description claims "Stored as percentage
      (e.g. 7.2 for 7.2%)". It is not. Since Task 8 repointed it at
      revenue_metrics.v_metric__trial_conversion_rate_lagged it emits a
      DECIMAL (0.1414 for 14.14%), which is why its display_format is
      already 'decimal_rate'. The description contradicts both the data and
      the format token.

#403 "Sync Conversion Rate (weekly)" — supported_grains says ['monthly'].
      It is a weekly metric: its dbt model buckets by ISO week and its
      chart_sql emits FORMAT_DATE('%Y-%m-%d', period).

Metadata only. No status flip, no chart_sql change, no formula change,
nothing promoted. Idempotent: skips a field already carrying the target
value, and PATCHes only the fields that actually differ.

Snapshots before and after to
  .superpowers/sdd/2026-07-30-sync-conversion/fix-supabase-{before,after}.json

Usage:
    python3 scripts/fix_sync_conversion_metadata.py           # dry run
    python3 scripts/fix_sync_conversion_metadata.py --apply
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO, ".superpowers", "sdd", "2026-07-30-sync-conversion")
ADMIN_EMAIL = "n.peralta-baron@method.me"
SB = "https://agkubdpgnpwudzpzcvhs.supabase.co/rest/v1/metrics"

with open(os.path.join(REPO, "tracker.html")) as f:
    ANON = re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", f.read()).group(0)

H = {
    "apikey": ANON, "Authorization": f"Bearer {ANON}",
    "x-method-email": ADMIN_EMAIL, "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# Every column we care about, so the snapshot proves nothing else moved.
COLS = ("id,name,description,status,display_format,supported_grains,"
        "formula,depends_on,chart_sql,view_name,metric_type,stage")
IDS = (357, 403)

FIXES = {
    357: {
        "description": (
            "Percentage of trials that convert to paid: Conversions / Average "
            "Trial Base. The denominator is NOT just this month's trials — it's "
            "the average of last month's actual trials and this month's "
            "forecasted trials, since converters come from both pools. Matches "
            "the Looker scorecard methodology. Emits a DECIMAL rate (0.072 for "
            "7.2%), read from "
            "revenue_metrics.v_metric__trial_conversion_rate_lagged — hence "
            "display_format 'decimal_rate'."
        ),
    },
    403: {
        "supported_grains": ["weekly"],
    },
}


def req(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, headers=H, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read() or "[]")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def fetch():
    ids = ",".join(str(i) for i in IDS)
    st, rows = req("GET", f"{SB}?id=in.({ids})&select={COLS}")
    if st != 200 or not isinstance(rows, list):
        sys.exit(f"ABORT reading metrics: HTTP {st} {rows}")
    return {r["id"]: r for r in rows}


def dump(rows, name):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    with open(path, "w") as f:
        json.dump({str(k): v for k, v in sorted(rows.items())}, f, indent=2, sort_keys=True)
    return path


def main():
    apply = "--apply" in sys.argv

    before = fetch()
    missing = [i for i in IDS if i not in before]
    if missing:
        sys.exit(f"ABORT: metric(s) not found: {missing}")
    print(f"snapshot before -> {dump(before, 'fix-supabase-before.json')}")

    pending = {}
    for mid, fields in FIXES.items():
        diff = {k: v for k, v in fields.items() if before[mid].get(k) != v}
        if not diff:
            print(f"  #{mid}: already correct, nothing to do")
            continue
        pending[mid] = diff
        for k, v in diff.items():
            print(f"  #{mid}.{k}:")
            print(f"      before: {before[mid].get(k)!r}")
            print(f"      after:  {v!r}")

    if not pending:
        print("\nNothing to write.")
        return
    if not apply:
        print("\nDRY RUN. Re-run with --apply to write.")
        return

    for mid, diff in pending.items():
        st, res = req("PATCH", f"{SB}?id=eq.{mid}", diff)
        if st not in (200, 204) or (isinstance(res, list) and not res):
            sys.exit(f"ABORT patching #{mid}: HTTP {st} {res}")
        print(f"  patched #{mid}: {sorted(diff)}")

    after = fetch()
    print(f"\nsnapshot after -> {dump(after, 'fix-supabase-after.json')}")

    # Prove ONLY the intended fields moved.
    print("\n=== verification: fields that changed ===")
    clean = True
    for mid in IDS:
        for col in before[mid]:
            b, a = before[mid][col], after[mid][col]
            if b == a:
                continue
            expected = col in FIXES.get(mid, {})
            flag = "OK  " if expected else "UNEXPECTED"
            if not expected:
                clean = False
            print(f"  [{flag}] #{mid}.{col}: {b!r} -> {a!r}")
    print(f"\nonly intended fields changed: {clean}")
    if not clean:
        sys.exit(1)


if __name__ == "__main__":
    main()
