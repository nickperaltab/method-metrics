#!/usr/bin/env python3
"""
Task 1: reconcile the two MWD industry "instruments" (V7 vs legacy self-report)
and check for drift in the legacy instrument's blank/unusable rate.

Writes scripts/mwd-board-prep/out/01_instruments.json. Read-only against BigQuery.
"""
import json
from pathlib import Path

from common import run_query, LABELS, MWD_L1, MWD_LEGACY

OUT_DIR = Path(__file__).parent / "out"

out = {}

# ---------------------------------------------------------------------------
# (a) Agreement between instruments, among labeled customers active in 2026
# ---------------------------------------------------------------------------
legacy_in = ", ".join(f"'{v}'" for v in MWD_LEGACY)

agreement_sql = f"""
WITH cust AS (
  SELECT EntityRecordID, ANY_VALUE(Vertical) AS Vertical   -- monthly grain: collapse to one row per entity
  FROM `project-for-method-dw.revenue.int_customers`
  WHERE Month >= '2026-01-01'
  GROUP BY EntityRecordID
)
SELECT
  COUNT(*) AS labeled_customers,
  COUNTIF(l.l1 = '{MWD_L1}') AS v7_mwd,
  COUNTIF(c.Vertical IN ({legacy_in})) AS legacy_mwd,
  COUNTIF(l.l1 = '{MWD_L1}'
      AND c.Vertical IN ({legacy_in})) AS both_mwd
FROM cust c
JOIN `{LABELS}` l
  ON l.customer_record_id = c.EntityRecordID
WHERE l.l1 != 'UNCLASSIFIABLE'
"""

agreement_rows = run_query(agreement_sql)
agreement = agreement_rows[0]
# coerce numerics (BQ may return strings)
agreement = {k: int(v) for k, v in agreement.items()}
out["agreement"] = agreement

labeled_customers = agreement["labeled_customers"]
v7_mwd = agreement["v7_mwd"]
legacy_mwd = agreement["legacy_mwd"]
both_mwd = agreement["both_mwd"]

undercount_factor = (v7_mwd / legacy_mwd) if legacy_mwd else None
# extra reconciliation context: overlap rates
pct_of_v7_also_legacy = (both_mwd / v7_mwd * 100) if v7_mwd else None
pct_of_legacy_also_v7 = (both_mwd / legacy_mwd * 100) if legacy_mwd else None

out["undercount_factor_v7_over_legacy"] = round(undercount_factor, 3) if undercount_factor else None
out["pct_of_v7_mwd_also_flagged_legacy_mwd"] = round(pct_of_v7_also_legacy, 1) if pct_of_v7_also_legacy else None
out["pct_of_legacy_mwd_also_flagged_v7_mwd"] = round(pct_of_legacy_also_v7, 1) if pct_of_legacy_also_v7 else None

# ---------------------------------------------------------------------------
# (b) Blank-Vertical share of trials by quarter 2024Q1..2026Q2 (instrument drift check)
# ---------------------------------------------------------------------------
drift_sql = f"""
SELECT DATE_TRUNC(SignupDate, QUARTER) AS q,
       COUNT(*) AS trials,
       COUNTIF(Vertical IS NULL OR Vertical IN ('', 'Unknown', 'Other')) AS unusable,
       COUNTIF(Vertical IN ({legacy_in})) AS legacy_mwd
FROM `project-for-method-dw.revenue.int_trials`
WHERE SignupDate >= '2024-01-01' AND SignupDate < '2026-07-01'
GROUP BY q ORDER BY q
"""

drift_rows_raw = run_query(drift_sql)
drift_rows = []
for r in drift_rows_raw:
    q = r["q"]
    q_str = q.isoformat() if hasattr(q, "isoformat") else str(q)
    trials = int(r["trials"])
    unusable = int(r["unusable"])
    legacy_mwd_q = int(r["legacy_mwd"])
    unusable_share = round(unusable / trials * 100, 2) if trials else None
    drift_rows.append({
        "quarter": q_str,
        "trials": trials,
        "unusable": unusable,
        "unusable_share_pct": unusable_share,
        "legacy_mwd": legacy_mwd_q,
        "legacy_mwd_share_pct": round(legacy_mwd_q / trials * 100, 2) if trials else None,
    })

out["blank_share_by_quarter"] = drift_rows

# Drift check: compare 2025H1 (2025-01-01..2025-06-30, i.e. 2025 Q1+Q2) vs
# 2026H1 (2026 Q1+Q2). Weighted average unusable share across the two quarters
# in each half, weighted by trial count.
def half_year_unusable_share(rows, year):
    half_rows = [r for r in rows if r["quarter"].startswith(f"{year}-01") or r["quarter"].startswith(f"{year}-04")]
    tot_trials = sum(r["trials"] for r in half_rows)
    tot_unusable = sum(r["unusable"] for r in half_rows)
    share = round(tot_unusable / tot_trials * 100, 2) if tot_trials else None
    return {"quarters": [r["quarter"] for r in half_rows], "trials": tot_trials, "unusable": tot_unusable, "unusable_share_pct": share}

ly_h1 = half_year_unusable_share(drift_rows, 2025)
cy_h1 = half_year_unusable_share(drift_rows, 2026)

drift_pts = None
if ly_h1["unusable_share_pct"] is not None and cy_h1["unusable_share_pct"] is not None:
    drift_pts = round(cy_h1["unusable_share_pct"] - ly_h1["unusable_share_pct"], 2)

drift_flag = (abs(drift_pts) > 5) if drift_pts is not None else None

out["drift_check"] = {
    "ly_h1_2025": ly_h1,
    "cy_h1_2026": cy_h1,
    "unusable_share_move_pts": drift_pts,
    "moved_more_than_5pts": drift_flag,
    "verdict": (
        "STABLE - no caveat needed for Task-2/5 legacy-share trend"
        if drift_flag is False
        else "DRIFTED >5pts - legacy-share trend outputs must carry a data-artifact caveat"
        if drift_flag is True
        else "UNKNOWN - insufficient data"
    ),
}

# ---------------------------------------------------------------------------
# write
# ---------------------------------------------------------------------------
OUT_DIR.mkdir(parents=True, exist_ok=True)
out_path = OUT_DIR / "01_instruments.json"
out_path.write_text(json.dumps(out, indent=2, default=str))

print("=" * 72)
print("MWD INSTRUMENT RECONCILIATION")
print("=" * 72)
print(f"\nLabeled customers (active in 2026, l1 != UNCLASSIFIABLE): {labeled_customers}")
print(f"  V7 MWD customers:      {v7_mwd}")
print(f"  Legacy MWD customers:  {legacy_mwd}")
print(f"  Both agree (MWD∩MWD):  {both_mwd}")
print(f"  Undercount factor (v7_mwd / legacy_mwd): {out['undercount_factor_v7_over_legacy']}")
print(f"  % of V7-MWD also flagged legacy-MWD:     {out['pct_of_v7_mwd_also_flagged_legacy_mwd']}%")
print(f"  % of legacy-MWD also flagged V7-MWD:     {out['pct_of_legacy_mwd_also_flagged_v7_mwd']}%")

print("\nBlank/unusable Vertical share of trials, by quarter:")
for r in drift_rows:
    print(f"  {r['quarter']}  trials={r['trials']:>6}  unusable={r['unusable_share_pct']:>6}%  legacy_mwd_share={r['legacy_mwd_share_pct']}%")

print(f"\nDrift check: LY H1 2025 unusable share = {ly_h1['unusable_share_pct']}%  "
      f"(trials={ly_h1['trials']})")
print(f"             CY H1 2026 unusable share = {cy_h1['unusable_share_pct']}%  "
      f"(trials={cy_h1['trials']})")
print(f"             move = {drift_pts}pts -> {out['drift_check']['verdict']}")

print(f"\nWrote {out_path}")
