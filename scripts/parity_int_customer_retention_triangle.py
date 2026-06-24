#!/usr/bin/env python3
"""Verify int_customer_retention_triangle via source-method reproduction.

Runs the same SQL the dbt model encodes directly against the source tables, then
compares it cell-by-cell against the materialized model. Exits non-zero on any
mismatch — this is the correctness gate.

DEFERRED: a yearly-rollup sanity tie against int_customer_survival (rolling monthly
cohorts → first-pay year, LEAST-cap GRR band) is not implemented here. Because the
triangle stores net mrr_active (no cap), such a tie would be a fuzzy ~1pp band, not
bit-exact — it is not suitable as a hard gate and has not been added.
"""
import sys
from google.cloud import bigquery
client = bigquery.Client(project='project-for-method-dw')

# 1. Source-method reproduction (same SQL the model encodes) vs the model.
# Uses monthly_mrr as CTE name (matching the dbt model) to avoid name collision
# with the mrr column inside that same CTE.
SRC = """
WITH monthly_mrr AS (SELECT Month, EntityRecordID, SUM(StartMRR) AS mrr
                     FROM `project-for-method-dw.revenue.int_customer_mrr` GROUP BY 1,2),
signup AS (SELECT EntityRecordID, MIN(Date) AS sd FROM `project-for-method-dw.revenue.Funnel`
           WHERE EventType='Trial' GROUP BY 1),
fp AS (SELECT EntityRecordID, MIN(Month) AS cohort_month FROM monthly_mrr WHERE mrr>0 GROUP BY 1),
base AS (SELECT fp.EntityRecordID AS eid, fp.cohort_month, b.mrr AS mrr0 FROM fp
         JOIN monthly_mrr b ON b.EntityRecordID=fp.EntityRecordID AND b.Month=fp.cohort_month
         JOIN signup s ON s.EntityRecordID=fp.EntityRecordID AND s.sd>='2021-06-01'),
j AS (SELECT base.cohort_month, k AS tenure_k, IFNULL(f.mrr,0) AS mrrk
      FROM base, UNNEST(GENERATE_ARRAY(0,24)) AS k
      LEFT JOIN monthly_mrr f ON f.EntityRecordID=base.eid AND f.Month=DATE_ADD(base.cohort_month, INTERVAL k MONTH)
      WHERE DATE_ADD(base.cohort_month, INTERVAL k MONTH) <= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH))
SELECT cohort_month, tenure_k, COUNT(*) AS n_start, COUNTIF(mrrk>0) AS n_active
FROM j GROUP BY 1,2 HAVING n_start>=20 ORDER BY 1,2
"""
src = {(str(r['cohort_month']), int(r['tenure_k'])): (int(r['n_start']), int(r['n_active']))
       for r in client.query(SRC).result()}
mdl = {(str(r['cohort_month']), int(r['tenure_k'])): (int(r['n_start']), int(r['n_active']))
       for r in client.query("SELECT cohort_month, tenure_k, n_start, n_active "
                             "FROM `project-for-method-dw.revenue.int_customer_retention_triangle`").result()}
mismatch = [k for k in set(src) | set(mdl) if src.get(k) != mdl.get(k)]
print(f"source-method cells: {len(src)} | model cells: {len(mdl)} | mismatches: {len(mismatch)}")
for k in mismatch[:10]:
    print(f"  MISMATCH {k}: src={src.get(k)} model={mdl.get(k)}")
if mismatch:
    print("FAIL: model does not reproduce the source method.")
    sys.exit(1)
print("PASS: model == source method on all cells.")
