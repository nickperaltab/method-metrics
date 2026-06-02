#!/usr/bin/env python3
"""
Register the Channel ARR metric family in Supabase (directional).

6 base semantic metrics on int_attribution_fractional + 4 derived formula
metrics (so the MetricInspector drill-down resolves the derivation chain).
Idempotent: skips any metric whose exact name already exists. Inserts base
first, captures their ids, then inserts derived with {id} formulas.

Admin write via the x-method-email header (RLS). Aborts on the first write
error so a rejected auth leaves no partial state.
"""
import json
import re
import sys
import urllib.request

ADMIN_EMAIL = "n.peralta-baron@method.me"
SB = "https://agkubdpgnpwudzpzcvhs.supabase.co/rest/v1/metrics"

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

# Existing names (idempotency) + valid statuses
_, existing = req("GET", f"{SB}?select=id,name,status")
by_name = {m["name"]: m for m in existing} if isinstance(existing, list) else {}
statuses = sorted({m["status"] for m in existing if m.get("status")}) if isinstance(existing, list) else []
STATUS = "queued" if "queued" in statuses else (statuses[0] if statuses else "queued")
print(f"existing statuses: {statuses} -> using '{STATUS}'")

BASE_COMMON = dict(
    semantic_table="int_attribution_fractional", view_name="int_attribution_fractional",
    semantic_date_col="FirstSaaSInvoiceTxnDate", semantic_dimensions=["channel"],
    status=STATUS, stage="revenue", depends_on=[],
)

base = [
    ("Channel New SaaS (run-rate)", "SUM(plan_rate * attribution_weight)",
     "Directional run-rate. New-customer SaaS allocated per marketing channel by real multi-touch attribution = SUM(monthly plan rate x fractional channel weight). Plan-rate snapshot (Custdatlastsaasamount), NOT invoiced revenue; does not tie to RevCogs."),
    ("Channel US SaaS (run-rate)", "SUM(IF(is_us, plan_rate * attribution_weight, 0))",
     "Portion of Channel New SaaS from US accounts (gets the USD->CAD multiplier). Internal input to Channel CAD ARR."),
    ("Channel Non-US SaaS (run-rate)", "SUM(IF(NOT is_us, plan_rate * attribution_weight, 0))",
     "Portion of Channel New SaaS from non-US (CAN/Other) accounts (no FX multiplier). Internal input to Channel CAD ARR."),
    ("Channel Attribution Value", "SUM(attribution_weight)",
     "Summed fractional multi-touch attribution credit per channel; a customer split across channels contributes a fraction to each. Sums to total new customers."),
    ("Channel Unique Customers", "COUNT(DISTINCT CompanyAccount)",
     "Distinct new customers attributed to each channel (multi-touch; a customer can count toward several channels)."),
    ("Channel First Invoice (weighted)", "SUM(first_invoice_revenue * attribution_weight)",
     "Attribution-weighted first-invoice net SaaS (invoiced basis). Internal input to Channel Avg First Invoice."),
]

maxid = max((m["id"] for m in existing if isinstance(m.get("id"), int)), default=0)
next_id = maxid + 1
print(f"max existing id={maxid}; assigning explicit ids from {next_id}")

ids = {}
for name, measure, desc in base:
    if name in by_name:
        ids[name] = by_name[name]["id"]
        print(f"  skip (exists #{ids[name]}): {name}")
        continue
    row = {**BASE_COMMON, "id": next_id, "name": name, "semantic_measure": measure, "description": desc}
    st, res = req("POST", SB, row)
    if st not in (200, 201) or not isinstance(res, list):
        sys.exit(f"ABORT base '{name}': HTTP {st} {res}")
    ids[name] = res[0]["id"]
    next_id = ids[name] + 1
    print(f"  created #{ids[name]}: {name}")

def f(key): return ids[key]  # resolve base id by name

derived = [
    ("Channel Avg First Invoice",
     f"SAFE_DIVIDE({{{f('Channel First Invoice (weighted)')}}},{{{f('Channel Attribution Value')}}})",
     [f("Channel First Invoice (weighted)"), f("Channel Attribution Value")],
     "Attribution-weighted average first-invoice net SaaS per channel = weighted first invoice / attribution value. Invoiced basis."),
    ("Channel ARPC",
     f"SAFE_DIVIDE({{{f('Channel New SaaS (run-rate)')}}},{{{f('Channel Attribution Value')}}})",
     [f("Channel New SaaS (run-rate)"), f("Channel Attribution Value")],
     "Average revenue per customer (run-rate) per channel = Channel New SaaS / Attribution Value. Directional."),
    ("Channel ARR",
     f"SAFE_DIVIDE({{{f('Channel New SaaS (run-rate)')}}},{{{f('Channel Attribution Value')}}}) * 12",
     [f("Channel New SaaS (run-rate)"), f("Channel Attribution Value")],
     "Annual run-rate per customer per channel = ARPC x 12. Directional run-rate, not accounting-grade."),
    ("Channel CAD ARR",
     f"SAFE_DIVIDE({{{f('Channel US SaaS (run-rate)')}}}*1.33 + {{{f('Channel Non-US SaaS (run-rate)')}}},{{{f('Channel Attribution Value')}}}) * 12",
     [f("Channel US SaaS (run-rate)"), f("Channel Non-US SaaS (run-rate)"), f("Channel Attribution Value")],
     "ARR in CAD per channel = (US SaaS x 1.33 + Non-US SaaS) / Attribution Value x 12. Currency-aware. Directional."),
]

for name, formula, deps, desc in derived:
    if name in by_name:
        ids[name] = by_name[name]["id"]
        print(f"  skip (exists #{ids[name]}): {name}")
        continue
    row = {"id": next_id, "name": name, "formula": formula, "depends_on": deps,
           "status": STATUS, "stage": "revenue", "description": desc}
    st, res = req("POST", SB, row)
    if st not in (200, 201) or not isinstance(res, list):
        sys.exit(f"ABORT derived '{name}': HTTP {st} {res}")
    ids[name] = res[0]["id"]
    next_id = ids[name] + 1
    print(f"  created #{ids[name]}: {name}")

print("\n=== Channel ARR metric IDs ===")
for name in [b[0] for b in base] + [d[0] for d in derived]:
    print(f"  {ids[name]:>4}  {name}")
