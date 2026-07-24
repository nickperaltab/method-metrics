#!/usr/bin/env python3
"""
Funnel + conversion TREND on the quarters the classification backfill has reached.
Run 2026-07-24 (re-check before reuse; coverage moves daily).

Coverage at run time (trials by signup quarter, via Account bridge -> account_labels):
  2024Q3 12.3 | 2024Q4 15.3 | 2025Q1 17.0 | 2025Q2 18.4 | 2025Q3 42.3
  2025Q4 98.7 | 2026Q1 97.1 | 2026Q2 99.2
Backfill is marching BACKWARD from the present and moving fast (Q4'25 went
45% -> 70% -> 99% over ~2 days; Q3'25 20% -> 42%). So:
  - Q4'25 -> Q2'26 is now a valid 3-quarter trend (all 97-99%).
  - vs-LY-H1 still NOT valid (Q1-Q2'25 ~17-18%).

RESULT (classifiable denominators):
  MWD % of trials: Q4'25 22.8 -> Q1'26 21.0 -> Q2'26 21.7   (flat)
  MWD % of syncs:  Q4'25 24.7 -> Q1'26 23.0 -> Q2'26 24.6   (flat)
  MWD 90d conversion: Q4'25 cohort 33.3% -> Q1'26 cohort 30.0% (flat)
    others Q1'26: Field 20.1 (Q4'25 18.7), Prof 12.1 (14.9), Retail 15.6 (11.6)
Sampling noise: ~+/-1.2pt on share (~1,250 classifiable trials/qtr),
~+/-2.9pt on MWD conversion (~245 MWD trialers/cohort). Every move is inside it.
NOTE: this window straddles the MWD campaign start (Q4'25 = pre-campaign).
"""
import json
from pathlib import Path
from common import run_query, PROJECT

OUT = Path(__file__).parent / "out" / "14_q4_baseline_trend.json"
BRIDGE = f"""
acct AS (SELECT EntityRecordID, RecordID FROM `{PROJECT}.revenue.Account`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY EntityRecordID ORDER BY RecordID DESC)=1),
lbl AS (SELECT account_record_id, l1 FROM `{PROJECT}.v7_classification.account_labels`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY account_record_id ORDER BY confidence DESC, classified_at DESC)=1)
"""
out = {}

out["trial_coverage_by_quarter"] = run_query(f"""
WITH {BRIDGE}, t AS (SELECT DISTINCT EntityRecordID, DATE_TRUNC(SignupDate,QUARTER) q
  FROM `{PROJECT}.revenue.int_trials` WHERE SignupDate>='2024-07-01' AND SignupDate<'2026-07-01')
SELECT FORMAT_DATE('%Y-Q%Q',t.q) q, COUNT(*) trials,
  ROUND(COUNTIF(l.l1 IS NOT NULL)/COUNT(*)*100,1) cov_pct,
  ROUND(COUNTIF(l.l1 IS NOT NULL AND l.l1!='UNCLASSIFIABLE')/COUNT(*)*100,1) classifiable_pct
FROM t LEFT JOIN acct a ON a.EntityRecordID=t.EntityRecordID
LEFT JOIN lbl l ON l.account_record_id=a.RecordID
GROUP BY q ORDER BY q
""")

out["funnel_trend_q4_onward"] = run_query(f"""
WITH {BRIDGE},
tr AS (SELECT DISTINCT t.EntityRecordID, DATE_TRUNC(t.SignupDate,QUARTER) q, l.l1
  FROM `{PROJECT}.revenue.int_trials` t
  LEFT JOIN acct a ON a.EntityRecordID=t.EntityRecordID LEFT JOIN lbl l ON l.account_record_id=a.RecordID
  WHERE t.SignupDate>='2025-10-01' AND t.SignupDate<'2026-07-01'),
sy AS (SELECT DISTINCT s.EntityRecordID, DATE_TRUNC(s.SyncDate,QUARTER) q, l.l1
  FROM `{PROJECT}.revenue.int_syncs` s
  LEFT JOIN acct a ON a.EntityRecordID=s.EntityRecordID LEFT JOIN lbl l ON l.account_record_id=a.RecordID
  WHERE s.SyncDate>='2025-10-01' AND s.SyncDate<'2026-07-01')
SELECT FORMAT_DATE('%Y-Q%Q',q) quarter, 'trials' stage,
  COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE') classifiable,
  ROUND(COUNTIF(l1='Manufacturing & Distribution')/NULLIF(COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE'),0)*100,1) mwd_pct,
  ROUND(COUNTIF(l1='Field Services & Trades')/NULLIF(COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE'),0)*100,1) field_pct
FROM tr GROUP BY quarter
UNION ALL
SELECT FORMAT_DATE('%Y-Q%Q',q), 'syncs', COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE'),
  ROUND(COUNTIF(l1='Manufacturing & Distribution')/NULLIF(COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE'),0)*100,1),
  ROUND(COUNTIF(l1='Field Services & Trades')/NULLIF(COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE'),0)*100,1)
FROM sy GROUP BY 1 ORDER BY stage, quarter
""")

out["conversion_trend_q4_vs_q1"] = run_query(f"""
WITH {BRIDGE},
f AS (SELECT mf.EntityRecordID, mf.converted, mf.convert_month, mf.signup_month, l.l1
  FROM `{PROJECT}.revenue.int_motion_funnel` mf
  LEFT JOIN acct a ON a.EntityRecordID=mf.EntityRecordID LEFT JOIN lbl l ON l.account_record_id=a.RecordID
  WHERE mf.signup_month>='2025-10-01' AND mf.signup_month<'2026-04-01')
SELECT CASE WHEN signup_month<'2026-01-01' THEN '2025-Q4' ELSE '2026-Q1' END cohort,
  CASE WHEN l1='Manufacturing & Distribution' THEN 'MWD'
       WHEN l1='Field Services & Trades' THEN 'Field Services'
       WHEN l1='Professional & Business Services' THEN 'Prof & Business'
       WHEN l1='Retail & Consumer' THEN 'Retail' ELSE 'Unclassifiable/none' END seg,
  COUNT(*) trialers,
  ROUND(COUNTIF(converted AND DATE_DIFF(convert_month,signup_month,MONTH)<=3)/COUNT(*)*100,1) conv90
FROM f GROUP BY cohort, seg ORDER BY seg, cohort
""")

OUT.write_text(json.dumps(out, indent=2, default=str))
print(json.dumps(out, indent=2, default=str))
