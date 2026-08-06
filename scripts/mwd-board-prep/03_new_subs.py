#!/usr/bin/env python3
"""
Task 3: MWD share of NEW customers (new subscriptions), by window (CEO Q2).

Instrument A only (V7 classification is the right instrument for customers -
see common.py). Windows: H1'26 (Jan-Jun 2026), Jul-Dec'25, Jun-Dec'25 (CEO
wrote "June-December"), H1'25. July 2026 excluded everywhere (incomplete month).

Writes scripts/mwd-board-prep/out/03_new_subs.json. Read-only against BigQuery.
"""
import json
from datetime import date
from pathlib import Path

from common import run_query, LABELS, MWD_L1

OUT_DIR = Path(__file__).parent / "out"

out = {}

# ---------------------------------------------------------------------------
# Step 1: monthly series of new customers (IsNew, first month per EntityRecordID),
# split by V7 label coverage and MWD flag.
# ---------------------------------------------------------------------------
monthly_sql = f"""
WITH new_cust AS (
  SELECT EntityRecordID, MIN(Month) AS first_month
  FROM `project-for-method-dw.revenue.int_customers`
  WHERE IsNew
  GROUP BY EntityRecordID          -- guard against any entity flagged IsNew twice
)
SELECT DATE_TRUNC(first_month, MONTH) AS m,
       COUNT(*) AS new_customers,
       COUNTIF(l.l1 IS NOT NULL AND l.l1 != 'UNCLASSIFIABLE') AS labeled,
       COUNTIF(l.l1 = '{MWD_L1}') AS mwd
FROM new_cust n
LEFT JOIN `{LABELS}` l
  ON l.customer_record_id = n.EntityRecordID
WHERE n.first_month >= '2025-01-01' AND n.first_month < '2026-07-01'
GROUP BY m ORDER BY m;
"""

monthly_rows_raw = run_query(monthly_sql)

monthly = []
for r in monthly_rows_raw:
    m = r["m"]
    m_str = m.isoformat() if hasattr(m, "isoformat") else str(m)
    new_customers = int(r["new_customers"])
    labeled = int(r["labeled"])
    mwd = int(r["mwd"])
    monthly.append({
        "month": m_str,
        "new_customers": new_customers,
        "labeled": labeled,
        "mwd": mwd,
        "coverage_pct": round(labeled / new_customers * 100, 1) if new_customers else None,
        "mwd_share_of_total_pct": round(mwd / new_customers * 100, 2) if new_customers else None,
        "mwd_share_of_labeled_pct": round(mwd / labeled * 100, 2) if labeled else None,
    })

out["monthly"] = monthly

# ---------------------------------------------------------------------------
# Step 2: aggregate into windows + share-change answer
# ---------------------------------------------------------------------------
WINDOWS = {
    "H1_2026": (date(2026, 1, 1), date(2026, 6, 30)),
    "Jul_Dec_2025": (date(2025, 7, 1), date(2025, 12, 31)),
    "Jun_Dec_2025": (date(2025, 6, 1), date(2025, 12, 31)),
    "H1_2025": (date(2025, 1, 1), date(2025, 6, 30)),
}


def month_in_window(month_str, start, end):
    y, mo, _ = (int(x) for x in month_str.split("-"))
    d = date(y, mo, 1)
    return start <= d <= end


windows_out = {}
for label, (start, end) in WINDOWS.items():
    rows = [r for r in monthly if month_in_window(r["month"], start, end)]
    total = sum(r["new_customers"] for r in rows)
    labeled_sum = sum(r["labeled"] for r in rows)
    mwd_sum = sum(r["mwd"] for r in rows)
    windows_out[label] = {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "months": [r["month"] for r in rows],
        "new_customers_total": total,
        "labeled": labeled_sum,
        "mwd": mwd_sum,
        "coverage_pct": round(labeled_sum / total * 100, 1) if total else None,
        "mwd_share_of_total": round(mwd_sum / total * 100, 2) if total else None,
        "mwd_share_of_labeled": round(mwd_sum / labeled_sum * 100, 2) if labeled_sum else None,
    }

out["windows"] = windows_out

# Headline CEO question: did MWD % of new customers increase Jul-Dec'25 -> H1'26?
jd25 = windows_out["Jul_Dec_2025"]
h1_26 = windows_out["H1_2026"]
jun_d25 = windows_out["Jun_Dec_2025"]
h1_25 = windows_out["H1_2025"]

share_change_of_labeled = round(h1_26["mwd_share_of_labeled"] - jd25["mwd_share_of_labeled"], 2)
share_change_of_total = round(h1_26["mwd_share_of_total"] - jd25["mwd_share_of_total"], 2)
coverage_delta_pts = round(h1_26["coverage_pct"] - jd25["coverage_pct"], 1)

out["share_change_jul_dec25_to_h1_26"] = {
    "of_labeled_pts": share_change_of_labeled,
    "of_total_pts": share_change_of_total,
    "direction": "increased" if share_change_of_labeled > 0 else ("decreased" if share_change_of_labeled < 0 else "flat"),
    "coverage_jul_dec25_pct": jd25["coverage_pct"],
    "coverage_h1_26_pct": h1_26["coverage_pct"],
    "coverage_delta_pts": coverage_delta_pts,
    "coverage_delta_material": abs(coverage_delta_pts) > 5,
    "caveat": (
        "Coverage differs by more than 5pts between windows — part of any mix shift "
        "could be a labeling-coverage artifact rather than a true change in customer mix."
        if abs(coverage_delta_pts) > 5
        else "Coverage is stable between windows (<=5pt delta) — mix-shift read is not an artifact of coverage change."
    ),
}

# Also report Jun-Dec'25 (CEO's literal "June-December" wording) -> H1'26, and H1'25 -> H1'26 (YoY)
out["share_change_jun_dec25_to_h1_26"] = {
    "of_labeled_pts": round(h1_26["mwd_share_of_labeled"] - jun_d25["mwd_share_of_labeled"], 2),
    "of_total_pts": round(h1_26["mwd_share_of_total"] - jun_d25["mwd_share_of_total"], 2),
    "coverage_jun_dec25_pct": jun_d25["coverage_pct"],
    "coverage_h1_26_pct": h1_26["coverage_pct"],
}

out["share_change_h1_25_to_h1_26_yoy"] = {
    "of_labeled_pts": round(h1_26["mwd_share_of_labeled"] - h1_25["mwd_share_of_labeled"], 2),
    "of_total_pts": round(h1_26["mwd_share_of_total"] - h1_25["mwd_share_of_total"], 2),
    "coverage_h1_25_pct": h1_25["coverage_pct"],
    "coverage_h1_26_pct": h1_26["coverage_pct"],
}

# ---------------------------------------------------------------------------
# Step 3: verify — H1'26 total must be 592, labeled ~525
# ---------------------------------------------------------------------------
verification = {
    "h1_2026_total_expected": 592,
    "h1_2026_total_actual": h1_26["new_customers_total"],
    "h1_2026_total_match": h1_26["new_customers_total"] == 592,
    "h1_2026_labeled_expected_approx": 525,
    "h1_2026_labeled_actual": h1_26["labeled"],
    "h1_2026_labeled_within_tolerance": abs(h1_26["labeled"] - 525) <= 10,
}

# Sanity check: one month's new-customer count should be a plausible slice of
# v_metric__customers total customer count / MoM growth. Compare a month's net
# growth from v_metric__customers to that same month's IsNew count (new count
# should be >= net growth, since net growth = new - churned).
sanity_sql = """
SELECT period, value
FROM `project-for-method-dw.revenue_metrics.v_metric__customers`
WHERE period >= '2025-12-01' AND period <= '2026-06-01'
ORDER BY period
"""
try:
    sanity_rows_raw = run_query(sanity_sql)
    sanity_rows = []
    for r in sanity_rows_raw:
        p = r["period"]
        p_str = p.isoformat() if hasattr(p, "isoformat") else str(p)
        sanity_rows.append({"period": p_str, "value": float(r["value"])})
    # net MoM growth for each month vs our new_customers count for that month
    sanity_check = []
    for i in range(1, len(sanity_rows)):
        prev_p, cur_p = sanity_rows[i - 1], sanity_rows[i]
        net_growth = cur_p["value"] - prev_p["value"]
        month_key = cur_p["period"][:7]
        matching = next((m for m in monthly if m["month"].startswith(month_key)), None)
        new_ct = matching["new_customers"] if matching else None
        sanity_check.append({
            "period": cur_p["period"],
            "v_metric__customers_value": cur_p["value"],
            "net_growth_vs_prior_month": round(net_growth, 1),
            "isnew_new_customers_this_month": new_ct,
            "plausible": (new_ct is not None and new_ct >= net_growth - 1) if new_ct is not None else None,
        })
    verification["sanity_check_vs_v_metric__customers"] = sanity_check
except Exception as e:
    verification["sanity_check_vs_v_metric__customers"] = f"SKIPPED - query failed: {e}"

out["verification"] = verification

# ---------------------------------------------------------------------------
# write
# ---------------------------------------------------------------------------
OUT_DIR.mkdir(parents=True, exist_ok=True)
out_path = OUT_DIR / "03_new_subs.json"
out_path.write_text(json.dumps(out, indent=2, default=str))

print("=" * 72)
print("MWD SHARE OF NEW CUSTOMERS, BY WINDOW")
print("=" * 72)
for label in ["H1_2025", "Jun_Dec_2025", "Jul_Dec_2025", "H1_2026"]:
    w = windows_out[label]
    print(f"\n{label}  ({w['start']}..{w['end']})")
    print(f"  new_customers_total={w['new_customers_total']}  labeled={w['labeled']} (coverage={w['coverage_pct']}%)  mwd={w['mwd']}")
    print(f"  mwd_share_of_total={w['mwd_share_of_total']}%   mwd_share_of_labeled={w['mwd_share_of_labeled']}%")

print("\nMonthly series:")
for r in monthly:
    print(f"  {r['month']}  new={r['new_customers']:>4}  labeled={r['labeled']:>4} ({r['coverage_pct']}%)  mwd={r['mwd']:>3}  share_of_labeled={r['mwd_share_of_labeled_pct']}%")

print(f"\nShare change Jul-Dec'25 -> H1'26 (of labeled): {share_change_of_labeled:+.2f}pts ({out['share_change_jul_dec25_to_h1_26']['direction']})")
print(f"Share change Jul-Dec'25 -> H1'26 (of total):   {share_change_of_total:+.2f}pts")
print(f"Coverage delta: {coverage_delta_pts:+.1f}pts -> material={out['share_change_jul_dec25_to_h1_26']['coverage_delta_material']}")

print("\nVerification:")
print(f"  H1'26 total: expected=592 actual={verification['h1_2026_total_actual']} match={verification['h1_2026_total_match']}")
print(f"  H1'26 labeled: expected~525 actual={verification['h1_2026_labeled_actual']} within_tolerance={verification['h1_2026_labeled_within_tolerance']}")

print(f"\nWrote {out_path}")
