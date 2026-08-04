#!/usr/bin/env python3
"""
Flip the sync-conversion metric family to status='live' in Supabase.

Nine ids: 295/296/357 (repointed at dbt views) and 400-405 (new).
Snapshots every row in full BEFORE the write, then diffs field-by-field
after so only `status` can have moved. Aborts on the first write error.
Idempotent: a row already live is skipped.
"""
import json, pathlib, re, sys, urllib.request

IDS = [295, 296, 357, 400, 401, 402, 403, 404, 405]
SB = "https://agkubdpgnpwudzpzcvhs.supabase.co/rest/v1/metrics"
SNAP = pathlib.Path(".superpowers/sdd/2026-07-30-sync-conversion/promotion-snapshot.json")

ANON = re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",
                 pathlib.Path("tracker.html").read_text()).group(0)
H = {"apikey": ANON, "Authorization": f"Bearer {ANON}",
     "x-method-email": "n.peralta-baron@method.me",
     "Content-Type": "application/json", "Prefer": "return=representation"}

def req(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, headers=H, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read() or "[]")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

sel = ",".join(str(i) for i in IDS)
st, before = req("GET", f"{SB}?id=in.({sel})&select=*&order=id")
if st != 200 or not isinstance(before, list) or len(before) != len(IDS):
    sys.exit(f"ABORT snapshot: HTTP {st}, got {len(before) if isinstance(before,list) else before}")
SNAP.write_text(json.dumps(before, indent=2, sort_keys=True))
print(f"snapshot -> {SNAP} ({len(before)} rows x {len(before[0])} cols)")
for r in before:
    print(f"  #{r['id']:<4} {r['status']:<10} {r['name']}")

for r in before:
    if r["status"] == "live":
        print(f"  skip (already live): #{r['id']}")
        continue
    st, res = req("PATCH", f"{SB}?id=eq.{r['id']}", {"status": "live"})
    if st not in (200, 204) or (isinstance(res, list) and not res):
        sys.exit(f"ABORT patch #{r['id']}: HTTP {st} {res}")
    print(f"  #{r['id']} -> live")

st, after = req("GET", f"{SB}?id=in.({sel})&select=*&order=id")
if st != 200:
    sys.exit(f"ABORT re-read: HTTP {st}")

print("\n=== field-by-field diff ===")
bad = 0
for b, a in zip(before, after):
    moved = [k for k in b if b[k] != a[k]]
    unexpected = [k for k in moved if k != "status"]
    flag = "OK" if not unexpected else f"VIOLATION {unexpected}"
    if unexpected: bad += 1
    print(f"  #{b['id']:<4} {len(b)} cols, changed={moved} {flag}")
if bad:
    sys.exit(f"\nABORT: {bad} row(s) changed a field other than status")
live = [r["id"] for r in after if r["status"] == "live"]
print(f"\nall live: {live}")
print("clean — only `status` moved on every row")
