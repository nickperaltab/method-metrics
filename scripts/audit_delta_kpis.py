#!/usr/bin/env python3
"""
Audit which Sales Scorecard KPIs carry showDelta, and whether each metric's
definition can support a prior-month-same-window comparison.

Context: computeDelta (builder/src/components/scorecards/utils.js) compares
current_month against prior_month off a MONTHLY series, so mid-month it
divides MTD by the full prior month. On 2026-08-10 that read -73.1% where
Looker read -27.6% (21 vs all-of-July 78, against 21 vs July 1-10's 29).

A same-window delta needs day-grain access to the metric's source. Semantic
metrics carry table + date column + measure, so a windowed query is
derivable. Opaque chart_sql and formula metrics are not.
"""
import json
import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SB = "https://agkubdpgnpwudzpzcvhs.supabase.co/rest/v1/metrics"

src = (ROOT / "builder/src/config/scorecards/sales-scorecard.js").read_text()
ids = sorted({int(m) for m in re.findall(r"metricId: (\d+)[^}]*?showDelta: true", src)})
print(f"Sales KPIs with showDelta: {ids}\n")
if not ids:
    raise SystemExit("none found — the regex may no longer match the config shape")

anon = re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",
                 (ROOT / "tracker.html").read_text()).group(0)
url = (f"{SB}?id=in.({','.join(map(str, ids))})&select=id,name,chart_sql,"
       "semantic_table,semantic_measure,semantic_date_col,formula,depends_on")
req = urllib.request.Request(url, headers={"apikey": anon, "Authorization": f"Bearer {anon}"})
rows = json.load(urllib.request.urlopen(req))

DATE_COLS = r"TxnDate|SignupDate|FirstSaaSInvoiceTxnDate|CancellationDate|SyncDate"

for m in sorted(rows, key=lambda x: x["id"]):
    if m["semantic_table"]:
        verdict = "WINDOWABLE"
        detail = f"{m['semantic_table']}.{m['semantic_date_col']} / {m['semantic_measure']}"
    elif m["formula"]:
        verdict = "DERIVED"
        detail = f"{m['formula']} deps={m['depends_on']}"
    else:
        cs = (m["chart_sql"] or "").replace("\n", " ")
        hit = re.search(DATE_COLS, cs)
        verdict = "BESPOKE" if hit else "OPAQUE"
        detail = f"date col {hit.group(0)}" if hit else "no recognisable date column"
    print(f"  #{m['id']:<4} {m['name'][:30]:<32} {verdict:<12} {detail[:64]}")

print("\nWINDOWABLE = a same-window query is derivable from the semantic fields.")
print("DERIVED    = delta should come from its dependencies, not computed here.")
print("BESPOKE    = chart_sql has a date column; needs a hand-written windowed variant.")
print("OPAQUE     = no date column exposed; a same-window delta is not derivable.")
