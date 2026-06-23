#!/usr/bin/env python3
"""Diagnostic: source-method VINTAGE_SQL (today's data) vs dbt model int_customer_survival.

Answers: does the model faithfully reproduce the source query on CURRENT data?
And specifically: for 2025 m12/m15, which number is right — model or the §18 doc snapshot?

The §18 doc (2026-06-10) recorded:
  2025 m12 = 57.9,  m15 = 50.5

The current model produces:
  2025 m12 = 57.8,  m15 = 50.2

This script runs BOTH against today's BQ data and compares cell-by-cell.
"""

from google.cloud import bigquery

client = bigquery.Client(project="project-for-method-dw")

# ---------------------------------------------------------------------------
# §18 doc baseline — the frozen snapshot from 2026-06-10
# ---------------------------------------------------------------------------
DOC_BASELINE = {
    ("2022", 12): 52.4, ("2022", 24): 39.2,
    ("2023", 12): 49.3, ("2023", 24): 36.8,
    ("2024", 12): 51.3, ("2024", 24): 37.5,
    ("2025", 12): 57.9, ("2025", 15): 50.5,
}

CHECKPOINTS = [3, 6, 9, 12, 15, 18, 21, 24]
VINTAGES = ["2022", "2023", "2024", "2025"]

# ---------------------------------------------------------------------------
# 1. Run the adapted VINTAGE_SQL (source method, today's data)
#    Identical to build_expanders_doc.py VINTAGE_SQL except:
#      - vintage range widened to include 2025 (upper bound '2025-12-31')
#      - UNNEST limited to the 8 checkpoints (for readability; math is identical)
# ---------------------------------------------------------------------------
SOURCE_SQL = r"""
WITH signup AS (
  SELECT EntityRecordID, MIN(Date) sd FROM `project-for-method-dw.revenue.Funnel`
  WHERE EventType='Trial' GROUP BY 1
),
mrr AS (
  SELECT Month, EntityRecordID, SUM(StartMRR) mrr
  FROM `project-for-method-dw.revenue.int_customer_mrr` GROUP BY 1,2
),
first_pay AS (
  SELECT EntityRecordID, MIN(Month) t0 FROM mrr WHERE mrr.mrr>0 GROUP BY 1
),
base AS (
  SELECT fp.t0, b.EntityRecordID eid, b.mrr mrr0,
    CAST(EXTRACT(YEAR FROM fp.t0) AS STRING) vintage
  FROM first_pay fp
  JOIN mrr b ON b.EntityRecordID=fp.EntityRecordID AND b.Month=fp.t0
  JOIN signup s ON s.EntityRecordID=fp.EntityRecordID AND s.sd>='2021-06-01'
  WHERE fp.t0 BETWEEN '2022-01-01' AND '2025-12-31'
),
j AS (
  SELECT base.vintage, k tenure, base.mrr0, IFNULL(f.mrr,0) mrrk
  FROM base, UNNEST([3,6,9,12,15,18,21,24]) k
  LEFT JOIN mrr f ON f.EntityRecordID=base.eid AND f.Month=DATE_ADD(base.t0, INTERVAL k MONTH)
  WHERE DATE_ADD(base.t0, INTERVAL k MONTH) <= '2026-05-01'
)
SELECT vintage, tenure, COUNT(*) n,
  ROUND(SUM(LEAST(mrrk,mrr0))/SUM(mrr0)*100,1) grr
FROM j GROUP BY 1,2 HAVING n>=30 ORDER BY 1,2
"""

# ---------------------------------------------------------------------------
# 2. Query the dbt model (int_customer_survival), same GRR formula
# ---------------------------------------------------------------------------
MODEL_SQL = r"""
SELECT
  vintage,
  CAST(tenure_k AS INT64) AS tenure,
  n_start AS n,
  ROUND(SAFE_DIVIDE(retained_mrr, base_mrr) * 100, 1) AS grr
FROM `project-for-method-dw.revenue.int_customer_survival`
WHERE vintage IN ('2022','2023','2024','2025')
  AND tenure_k IN (3,6,9,12,15,18,21,24)
ORDER BY 1,2
"""

# ---------------------------------------------------------------------------
# Run both queries
# ---------------------------------------------------------------------------
print("Running source query against current BQ data...")
src_rows = client.query(SOURCE_SQL).to_dataframe()
print(f"  → {len(src_rows)} rows returned")

print("Querying dbt model int_customer_survival...")
mod_rows = client.query(MODEL_SQL).to_dataframe()
print(f"  → {len(mod_rows)} rows returned\n")

# Index by (vintage, tenure)
src = {(str(r.vintage), int(r.tenure)): float(r.grr)
       for _, r in src_rows.iterrows()}
mod = {(str(r.vintage), int(r.tenure)): float(r.grr)
       for _, r in mod_rows.iterrows()}

# ---------------------------------------------------------------------------
# 3. Comparison table
# ---------------------------------------------------------------------------
header = f"{'vintage':<8} {'k':<5} {'source_today':>12} {'model':>8} {'doc':>8} {'src==mod':>10} {'src==doc':>10}"
sep = "-" * len(header)
print(header)
print(sep)

all_match_src_mod = True
mismatches_src_mod = []
mismatches_src_doc = []

for vt in VINTAGES:
    for k in CHECKPOINTS:
        key = (vt, k)
        s_grr = src.get(key)
        m_grr = mod.get(key)
        d_grr = DOC_BASELINE.get(key)

        s_str = f"{s_grr:.1f}" if s_grr is not None else "–"
        m_str = f"{m_grr:.1f}" if m_grr is not None else "–"
        d_str = f"{d_grr:.1f}" if d_grr is not None else "–"

        sm_match = (s_grr == m_grr) if (s_grr is not None and m_grr is not None) else None
        sd_match = (s_grr == d_grr) if (s_grr is not None and d_grr is not None) else None

        sm_flag = "YES" if sm_match else ("NO" if sm_match is False else "n/a")
        sd_flag = "YES" if sd_match else ("NO" if sd_match is False else "n/a")

        if sm_match is False:
            all_match_src_mod = False
            mismatches_src_mod.append((vt, k, s_grr, m_grr))
        if sd_match is False:
            mismatches_src_doc.append((vt, k, s_grr, d_grr))

        # Only print rows that have at least one of: source data, model data, doc data
        if s_grr is not None or m_grr is not None or d_grr is not None:
            print(f"{vt:<8} m{k:<4} {s_str:>12} {m_str:>8} {d_str:>8} {sm_flag:>10} {sd_flag:>10}")

print(sep)

# ---------------------------------------------------------------------------
# 4. Focus rows: 2025 m12 and m15
# ---------------------------------------------------------------------------
print("\n--- 2025 focal cells ---")
for k in [12, 15]:
    key = ("2025", k)
    s = src.get(key, "MISSING")
    m = mod.get(key, "MISSING")
    d = DOC_BASELINE.get(key, "–")
    print(f"  2025 m{k}: source_today={s}, model={m}, doc={d}")

# ---------------------------------------------------------------------------
# 5. Verdict
# ---------------------------------------------------------------------------
print("\n=== VERDICT ===")
if all_match_src_mod:
    print("SOURCE-TODAY == MODEL: YES — every overlapping cell matches.")
    print("Interpretation: the model faithfully reproduces the source method.")
    print("The 2025 divergence from the §18 doc (57.9→57.8, 50.5→50.2) is a")
    print("still-maturing cohort: customers joined/left since the doc was frozen.")
else:
    print(f"SOURCE-TODAY == MODEL: NO — {len(mismatches_src_mod)} cell(s) differ.")
    for vt, k, s, m in mismatches_src_mod:
        print(f"  {vt} m{k}: source={s}, model={m}, delta={round(s-m,1)}")
    print("Interpretation: the model diverges from the source method = REAL BUG.")

if mismatches_src_doc:
    print(f"\nSource-today vs §18 doc: {len(mismatches_src_doc)} cell(s) differ "
          f"(expected if cohort still maturing).")
    for vt, k, s, d in mismatches_src_doc:
        print(f"  {vt} m{k}: source_today={s}, doc={d}, delta={round(s-d,1)}")
else:
    print("\nSource-today vs §18 doc: all checked cells match the doc exactly.")
