#!/usr/bin/env python3
"""Parity gate for revenue.int_customer_survival.

Verification logic
------------------
GRR = ROUND(retained_mrr / base_mrr * 100, 1)

Settled vintages (2022, 2023, 2024) — EXACT gate
  These cohorts are fully matured. Any deviation from the baseline numbers
  is a hard failure that must be investigated before shipping.
  Baseline: §18 doc (verification-queries.md), confirmed 2026-06-10.

2025 cohort — live tolerance (±0.5 pp), NOT exact
  The 2025 cohort is still maturing; m12 and m15 cells shift month-to-month
  as late payments land and accounts settle. The §18 doc numbers are a
  frozen 2026-06-10 snapshot. A drift of ≤0.5 pp relative to that snapshot
  is expected and acceptable; anything larger signals a regression.
  Cells are labelled "LIVE (still maturing)" in output.

Source verification
-------------------
The model (revenue.int_customer_survival) was verified on 2026-06-23 to
reproduce the canonical source method exactly on current data — all 29
checkpoint cells matched — via scripts/audit/diag_survival_source_vs_model.py.
Do NOT silently weaken the settled-vintage assertions.

Exit codes
----------
0 — all settled checks exact + all 2025 checks within ±0.5 pp
1 — any settled mismatch OR any 2025 value outside ±0.5 pp
"""
import sys
from google.cloud import bigquery

client = bigquery.Client(project='project-for-method-dw')

# Settled vintages: exact match required
SETTLED = {
    ('2022', 12): 52.4, ('2022', 24): 39.2,
    ('2023', 12): 49.3, ('2023', 24): 36.8,
    ('2024', 12): 51.3, ('2024', 24): 37.5,
}

# 2025 cohort: §18 doc snapshot (2026-06-10), tolerance ±0.5 pp
LIVE_BASELINE = {
    ('2025', 12): 57.9,
    ('2025', 15): 50.5,
}
LIVE_TOLERANCE = 0.5

rows = client.query("""
  SELECT vintage, tenure_k,
         ROUND(SAFE_DIVIDE(retained_mrr, base_mrr) * 100, 1) AS grr
  FROM `project-for-method-dw.revenue.int_customer_survival`
  WHERE tenure_k IN (3,6,9,12,15,18,21,24)
""").result()

got = {}
for r in rows:
    grr = float(r['grr']) if r['grr'] is not None else None
    if grr is not None:
        got[(r['vintage'], int(r['tenure_k']))] = grr

fails = []

print("Settled vintages (exact gate):")
for key, exp in SETTLED.items():
    actual = got.get(key)
    if actual is None:
        status = 'MISSING'
        fails.append((key, exp, actual, 'settled'))
    elif actual == exp:
        status = 'OK'
    else:
        status = f'MISMATCH (expected {exp}, got {actual})'
        fails.append((key, exp, actual, 'settled'))
    print(f"  {key[0]} m{key[1]:<2}  baseline={exp:<5}  actual={actual}  {status}")

print("\n2025 cohort (live ±0.5 pp tolerance):")
for key, baseline in LIVE_BASELINE.items():
    actual = got.get(key)
    if actual is None:
        status = 'MISSING'
        fails.append((key, baseline, actual, 'live'))
    else:
        delta_signed = actual - baseline
        within = abs(delta_signed) <= LIVE_TOLERANCE
        status = f"LIVE (still maturing) — actual={actual}, delta={delta_signed:+.1f}pp {'OK' if within else 'OUT OF TOLERANCE'}"
        if not within:
            fails.append((key, baseline, actual, 'live'))
    print(f"  {key[0]} m{key[1]:<2}  baseline={baseline:<5}  {status}")

print()
if fails:
    print(f"FAIL: {len(fails)} check(s) failed.")
    sys.exit(1)
print("PASS: all settled vintages exact, 2025 cohort within tolerance.")
