#!/usr/bin/env python3
"""
CRO follow-up: "what L2 sub-categories are driving up Field Services new
customers in H2?"

ANSWER: none. The premise doesn't hold. Field Services new-customer COUNTS are
falling in every L2 except one. Its rising SHARE is differential decline:
Field -23% YoY vs total -37%, so it shrinks slowest and therefore leads on share.

New customers by L1 (curated label, IsNew first-paying-month):
  vertical        H1'25  H2'25  H1'26   YoY
  Field Services    254    205    195   -23%   <- falls least
  Prof & Business   174    159    114   -35%
  Retail             69     46     42   -39%
  MWD               303    239    166   -45%   <- falls most
  Unclassifiable    132    130     75   -43%
  TOTAL             932    779    592   -37%

Field Services by L2:
  L2                                  H1'25  H2'25  H1'26
  Industrial & Commercial Field Svcs     55     54     49
  Specialty Construction                 35     28     35
  Cleaning & Environmental               21     16     27   <- ONLY riser
  HVAC, Plumbing & Electrical            25     20     24
  Landscaping & Outdoor                  29     19     13
  Home & Property Services               26     26     12
  General Contracting                    20      8     11
  Security, Fire & Alarm                 11     13     10
  Flooring & Interior Finishing          18     11      9
  Home Watch                             14     10      5

Only Cleaning & Environmental Services grew (21 -> 27, +29%). Industrial &
Commercial Field Services is the largest and roughly flat (55 -> 49). The
segments that collapsed are Home & Property (-54%), Landscaping (-55%),
Home Watch (-64%).

CAVEAT: L2 labels are less rerun-stable than L1 and cells are 5-55 customers,
so treat individual L2 moves as directional. The L1-level conclusion (nothing is
growing) is solid.

Read-only. Output: out/17_field_services_l2.json
"""
import json
from pathlib import Path
from common import run_query, PROJECT, LABELS

OUT = Path(__file__).parent / "out" / "17_field_services_l2.json"
NC = f"""
nc AS (SELECT EntityRecordID, MIN(Month) AS fm
  FROM `{PROJECT}.revenue.int_customers` WHERE IsNew GROUP BY EntityRecordID
  HAVING MIN(Month) >= '2025-01-01' AND MIN(Month) < '2026-07-01')
"""
out = {}

out["new_customers_by_l1"] = run_query(f"""
WITH {NC}
SELECT COALESCE(NULLIF(l.l1,'UNCLASSIFIABLE'),'(unclassifiable/none)') l1,
  COUNTIF(nc.fm < '2025-07-01') h1_2025,
  COUNTIF(nc.fm >= '2025-07-01' AND nc.fm < '2026-01-01') h2_2025,
  COUNTIF(nc.fm >= '2026-01-01') h1_2026,
  ROUND((COUNTIF(nc.fm>='2026-01-01')-COUNTIF(nc.fm<'2025-07-01'))/NULLIF(COUNTIF(nc.fm<'2025-07-01'),0)*100,1) yoy_pct
FROM nc LEFT JOIN `{LABELS}` l ON l.customer_record_id = nc.EntityRecordID
GROUP BY l1
UNION ALL
SELECT 'TOTAL', COUNTIF(fm<'2025-07-01'), COUNTIF(fm>='2025-07-01' AND fm<'2026-01-01'),
  COUNTIF(fm>='2026-01-01'),
  ROUND((COUNTIF(fm>='2026-01-01')-COUNTIF(fm<'2025-07-01'))/NULLIF(COUNTIF(fm<'2025-07-01'),0)*100,1)
FROM nc ORDER BY h1_2026 DESC
""")

out["field_services_by_l2"] = run_query(f"""
WITH {NC}
SELECT COALESCE(l.l2,'(no L2)') l2,
  COUNTIF(nc.fm < '2025-07-01') h1_2025,
  COUNTIF(nc.fm >= '2025-07-01' AND nc.fm < '2026-01-01') h2_2025,
  COUNTIF(nc.fm >= '2026-01-01') h1_2026
FROM nc
JOIN `{LABELS}` l ON l.customer_record_id = nc.EntityRecordID
WHERE l.l1 = 'Field Services & Trades'
GROUP BY l2 ORDER BY h1_2026 DESC
""")

OUT.write_text(json.dumps(out, indent=2, default=str))
print(json.dumps(out, indent=2, default=str))
