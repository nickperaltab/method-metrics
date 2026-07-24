#!/usr/bin/env python3
"""
DEP attach across the full paying base by vertical (answers "are MWD more likely
to take DEP" robustly, big N). Prompted by: DEP was mislabeled "Partial" when it
was only measured on H1 new customers (small N, 15/158, and it pointed the wrong
way). This is a CUSTOMER-side cut, so it uses the CURATED customer label
v_entity_primary_label (consistent with ARPC/installed-base), NOT the account
bridge — the crude bridge (RecordID DESC dedup) under-classifies multi-account
entities (put 776 in Unclassified and only 986 in MWD vs the curated 1,284).

RULE reinforced: customer-side cuts -> v_entity_primary_label (curated, entity
grain, one row per customer). Trial-side cuts -> account_labels via Account
bridge (v_entity_primary_label has no trial rows). Do not use the account bridge
for the full customer base.

RESULT (June 2026, full active base, curated label):
  MWD 11.5% (148/1,284) -- highest named vertical
  Field 11.3% (112/989); Retail 9.5%; company ALL 9.2% (332/3,622);
  Prof & Business 4.6%; Unclassified 2.3%.
Answer: MWD is modestly more likely to take DEP -- highest of the named
verticals, ~tied with Field Services, above company average.
"""
import json
from pathlib import Path
from common import run_query, PROJECT, LABELS

OUT = Path(__file__).parent / "out" / "13_dep_fullbase.json"
rows = run_query(f"""
WITH c AS (SELECT EntityRecordID, HasDEP FROM `{PROJECT}.revenue.int_customers` WHERE Month=DATE '2026-06-01')
SELECT COALESCE(NULLIF(l.l1,'UNCLASSIFIABLE'),'Unclassified') l1,
  COUNT(*) customers, COUNTIF(c.HasDEP) with_dep, ROUND(COUNTIF(c.HasDEP)/COUNT(*)*100,1) dep_pct
FROM c LEFT JOIN `{LABELS}` l ON l.customer_record_id=c.EntityRecordID
GROUP BY l1
UNION ALL SELECT 'ALL', COUNT(*), COUNTIF(HasDEP), ROUND(COUNTIF(HasDEP)/COUNT(*)*100,1) FROM c
ORDER BY dep_pct DESC
""")
OUT.write_text(json.dumps(rows, indent=2, default=str))
print(json.dumps(rows, indent=2, default=str))
