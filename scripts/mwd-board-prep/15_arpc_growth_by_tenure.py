#!/usr/bin/env python3
"""
ARPC growth by customer tenure — reconciles the ~$140 "new customer" figure with
the ~$258 installed-base average, and tests whether MWD's ARPC premium is really
an industry effect or just a tenure-mix artifact.

Prompted by Nic: "I thought our average revenue per customer was a lot lower, so
the RevCogs spreadsheet also shows that it is actually higher since they grow?"
Answer: yes. Both figures are correct; they measure different lifecycle points.

RESULT (June 2026, per paying customer):
  tenure        n     ARPC(all)  ARPC(non-DEP customers)  %DEP
  <6mo          279   $202       $149                     11.5
  6-12mo        356   $250       $154                     16.3
  1-2yr         587   $251       $162                     16.5
  2-5yr         975   $254       $194                      7.1
  5-10yr        669   $313       $218                      8.1
  10yr+         260   $261       $206                      6.2

Bridge from ~$140 to $258:
  - New customer, no DEP: $149 <- matches RevCogs first-invoice $140-153 (2026 actuals)
  - Grows ~46% to $218 by 5-10 years (non-DEP)
  - Add DEP (15.9% of SaaS revenue) -> blended base $258
  - RevCogs shows the same ramp at finer grain for months 0-6 ($123 -> $188 per
    ACCOUNT) but lumps everything past 180 days into one bucket; this extends it.
  - Oldest cohort dips ($206 non-DEP) -> likely grandfathered legacy pricing;
    confirm against the pricing-increase project.

MWD PREMIUM IS NOT A TENURE ARTIFACT (this was the risk):
  within-band MWD/company ratio: 1.12 (<1yr), 1.16 (1-2yr), 1.08 (2-5yr),
  1.28 (5-10yr), 1.13 (10yr+). Holds everywhere. Contrast with the SIZE
  cross-cut, where the premium reverses in the $1M-$10M bands.

Read-only. Output: out/15_arpc_growth_by_tenure.json
"""
import json
from pathlib import Path
from common import run_query, PROJECT, LABELS

OUT = Path(__file__).parent / "out" / "15_arpc_growth_by_tenure.json"
out = {}

out["arpc_by_tenure"] = run_query(f"""
WITH m AS (
  SELECT c.EntityRecordID, c.StartMRR, cu.HasDEP
  FROM `{PROJECT}.revenue.int_customer_mrr` c
  JOIN `{PROJECT}.revenue.int_customers` cu
    ON cu.EntityRecordID=c.EntityRecordID AND cu.Month=c.Month
  WHERE c.Month=DATE '2026-06-01' AND c.StartMRR>0)
SELECT CASE WHEN f.tenure_years < 0.5 THEN '1_under 6mo'
            WHEN f.tenure_years < 1 THEN '2_6-12mo'
            WHEN f.tenure_years < 2 THEN '3_1-2yr'
            WHEN f.tenure_years < 5 THEN '4_2-5yr'
            WHEN f.tenure_years < 10 THEN '5_5-10yr'
            ELSE '6_10yr+' END AS tenure,
  COUNT(*) customers,
  ROUND(AVG(m.StartMRR),0) arpc_all,
  ROUND(AVG(IF(NOT m.HasDEP, m.StartMRR, NULL)),0) arpc_no_dep_customers,
  ROUND(COUNTIF(m.HasDEP)/COUNT(*)*100,1) pct_with_dep
FROM m JOIN `{PROJECT}.revenue.int_customer_firmographics` f USING (EntityRecordID)
GROUP BY tenure ORDER BY tenure
""")

out["mwd_premium_within_tenure"] = run_query(f"""
WITH m AS (SELECT EntityRecordID, StartMRR FROM `{PROJECT}.revenue.int_customer_mrr`
           WHERE Month=DATE '2026-06-01' AND StartMRR>0)
SELECT CASE WHEN f.tenure_years < 1 THEN '1_under 1yr'
            WHEN f.tenure_years < 2 THEN '2_1-2yr'
            WHEN f.tenure_years < 5 THEN '3_2-5yr'
            WHEN f.tenure_years < 10 THEN '4_5-10yr'
            ELSE '5_10yr+' END AS tenure,
  COUNT(*) all_cust, ROUND(AVG(m.StartMRR),0) arpc_all,
  COUNTIF(l.l1='Manufacturing & Distribution') mwd_cust,
  ROUND(AVG(IF(l.l1='Manufacturing & Distribution', m.StartMRR, NULL)),0) arpc_mwd,
  ROUND(AVG(IF(l.l1='Manufacturing & Distribution', m.StartMRR, NULL))/AVG(m.StartMRR),2) mwd_ratio
FROM m
JOIN `{PROJECT}.revenue.int_customer_firmographics` f USING (EntityRecordID)
LEFT JOIN `{LABELS}` l ON l.customer_record_id=m.EntityRecordID
GROUP BY tenure ORDER BY tenure
""")

OUT.write_text(json.dumps(out, indent=2, default=str))
print(json.dumps(out, indent=2, default=str))
