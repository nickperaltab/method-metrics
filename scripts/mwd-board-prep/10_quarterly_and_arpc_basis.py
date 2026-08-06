#!/usr/bin/env python3
"""
Quarterly views (ARPC, new-customer share) + ARPC-basis reconciliation.
Prompted by: "can we do ARPC quarterly?", "funnel by quarter?", and
"are we sure this is ARPC, our actual ARPC is ~$140 without DEP".

ARPC BASIS FINDING (important):
Our "$300 MWD / $258 blended" = SaaS StartMRR / paying customer (StartMRR>0),
int_customer_mrr. This is verified correct and Justin-consistent:
  - numerator $829,414 == canonical v_metric__monthly_start_mrr exactly
  - Justin's own revenue.v_saas_mrr (Jun 2026): total_mrr $839,750 / 3,382
    paying_logos = $248 ARPC. Same metric, tiny denominator diff.
  - DEP is NOT in the numerator (StartMRR ~= p1_saas ~= p2_saas, all SaaS).
The ~$140 figure is a DIFFERENT metric: $839,750 / ~6,000 = $140, i.e. total
SaaS MRR divided by ALL customers incl. non-paying/free (or a net-of-cost
RevCogs basis). Both legitimate, different questions. Board artifact relabels
ours "avg SaaS MRR per paying customer", leads with the MWD-vs-avg RATIO
(robust to denominator), and flags the $140 convention for Justin to confirm.

Read-only. Output: out/10_quarterly.json
"""
import json
from pathlib import Path
from common import run_query, PROJECT

OUT = Path(__file__).parent / "out" / "10_quarterly.json"
out = {}

QMONTHS = "('2024-09-01','2024-12-01','2025-03-01','2025-06-01'," \
          "'2025-09-01','2025-12-01','2026-03-01','2026-06-01')"

out["arpc_quarterly_per_paying_customer"] = run_query(f"""
WITH m AS (
  SELECT Month, EntityRecordID, StartMRR
  FROM `{PROJECT}.revenue.int_customer_mrr`
  WHERE Month IN {QMONTHS} AND StartMRR > 0
)
SELECT FORMAT_DATE('%Y-Q%Q', m.Month) AS q,
  ROUND(SUM(m.StartMRR)/COUNT(DISTINCT m.EntityRecordID),0) AS arpc_blended,
  ROUND(SUM(IF(l.l1='Manufacturing & Distribution',m.StartMRR,0))
        /NULLIF(COUNT(DISTINCT IF(l.l1='Manufacturing & Distribution',m.EntityRecordID,NULL)),0),0) AS arpc_mwd
FROM m
LEFT JOIN `{PROJECT}.v7_classification.v_entity_primary_label` l
  ON l.customer_record_id = m.EntityRecordID
GROUP BY q ORDER BY q
""")

out["arpc_basis_reconciliation"] = run_query(f"""
SELECT
  ROUND((SELECT total_mrr FROM `{PROJECT}.revenue.v_saas_mrr` WHERE month='2026-06'),0) AS justin_total_saas_mrr,
  (SELECT paying_logos FROM `{PROJECT}.revenue.v_saas_mrr` WHERE month='2026-06') AS justin_paying_logos,
  ROUND((SELECT total_mrr/paying_logos FROM `{PROJECT}.revenue.v_saas_mrr` WHERE month='2026-06'),0) AS justin_arpc,
  (SELECT ROUND(value,0) FROM `{PROJECT}.revenue_metrics.v_metric__monthly_start_mrr` WHERE period='2026-06-01') AS dbt_canonical_mrr,
  (SELECT value FROM `{PROJECT}.revenue_metrics.v_metric__customers` WHERE period='2026-06-01') AS active_customers
""")

out["new_customer_share_quarterly_both_instruments"] = run_query(f"""
WITH new_cust AS (
  SELECT EntityRecordID, MIN(Month) AS fm
  FROM `{PROJECT}.revenue.int_customers` WHERE IsNew
  GROUP BY EntityRecordID
  HAVING MIN(Month) >= '2025-01-01' AND MIN(Month) < '2026-07-01'
),
vert AS (
  SELECT c.EntityRecordID, ANY_VALUE(c.Vertical) AS Vertical
  FROM `{PROJECT}.revenue.int_customers` c
  JOIN new_cust n ON n.EntityRecordID=c.EntityRecordID AND c.Month=n.fm
  GROUP BY c.EntityRecordID
)
SELECT FORMAT_DATE('%Y-Q%Q', n.fm) AS q,
  COUNT(*) AS new_total,
  ROUND(COUNTIF(l.l1='Manufacturing & Distribution')
        /NULLIF(COUNTIF(l.l1 IS NOT NULL AND l.l1!='UNCLASSIFIABLE'),0)*100,1) AS v7_share_of_labeled,
  ROUND(COUNTIF(v.Vertical IN ('Manufacturing (MWD)','Wholesale and distribution services (MWD)'))
        /NULLIF(COUNT(*)-COUNTIF(v.Vertical IS NULL OR v.Vertical IN ('','Unknown','Other')),0)*100,1) AS signup_share_of_named
FROM new_cust n
LEFT JOIN vert v USING (EntityRecordID)
LEFT JOIN `{PROJECT}.v7_classification.v_entity_primary_label` l ON l.customer_record_id=n.EntityRecordID
GROUP BY q ORDER BY q
""")

OUT.write_text(json.dumps(out, indent=2, default=str))
print(json.dumps(out, indent=2, default=str))
