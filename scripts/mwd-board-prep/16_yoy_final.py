#!/usr/bin/env python3
"""
FINAL numbers — trial backfill completed 2025, so YoY is now possible.
Supersedes the "level only / partial" state of scripts 12 and 02.

Coverage at time of run (trial labels by signup quarter, via Account bridge to
account_labels): 2024Q3 14.5%, 2024Q4 17.8%, 2025Q1 97.0%, 2025Q2 98.0%,
2025Q3 98.6%, 2025Q4 99.3%, 2026Q1 97.1%, 2026Q2 99.2%.
=> comparisons run from Q1 2025 forward; 2024 excluded.

FUNNEL (share of CLASSIFIABLE trials, MWD):
  Q1'25 22.4 | Q2'25 22.3 | Q3'25 22.2 | Q4'25 22.6 | Q1'26 21.0 | Q2'26 21.7
  Halves: H1'25 22.3 -> H1'26 21.1 (trials); 24.1 -> 23.6 (syncs)
  All-trials denominator: 15.5 -> 16.3
  Volume: MWD trials 713 -> 538 (-25%) vs total -24%
  => FLAT. 1.6pt band over six quarters vs ~+/-1.2pt noise.

CONVERSION (share of a signup quarter's trials that have since paid):
  MWD:    31.1 | 37.7 | 35.6 | 33.5 | 30.9   (Q1'25 -> Q1'26)
  Field:  18.7 | 21.6 | 19.4 | 19.4 | 20.1
  Prof:   15.8 | 16.2 | 17.3 | 16.1 | 12.1
  Retail: 18.4 | 14.9 | 13.2 | 12.2 | 16.2
  => MWD leads every quarter, but DECLINES four consecutive quarters from a
     Q2'25 peak (-6.8pt) while Field is flat. Advantage narrows ~16pt -> ~11pt.
     n~245-330 MWD/cohort, noise ~3pt, so the decline is a pattern not a wobble.
     Q2'26 cohort excluded (not matured; ~97% of conversions land within 3mo).

Read-only. Output: out/16_yoy_final.json
"""
import json
from pathlib import Path
from common import run_query, PROJECT

OUT = Path(__file__).parent / "out" / "16_yoy_final.json"
BRIDGE = f"""
acct AS (SELECT EntityRecordID, RecordID FROM `{PROJECT}.revenue.Account`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY EntityRecordID ORDER BY RecordID DESC)=1),
lbl AS (SELECT account_record_id, l1 FROM `{PROJECT}.v7_classification.account_labels`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY account_record_id ORDER BY confidence DESC, classified_at DESC)=1)
"""
out = {}

out["coverage"] = run_query(f"""
WITH {BRIDGE}, t AS (SELECT DISTINCT EntityRecordID, DATE_TRUNC(SignupDate,QUARTER) q
  FROM `{PROJECT}.revenue.int_trials`
  WHERE SignupDate>='2024-07-01' AND SignupDate<'2026-07-01')
SELECT FORMAT_DATE('%Y-Q%Q',t.q) quarter, COUNT(*) trials,
  ROUND(COUNTIF(l.l1 IS NOT NULL)/COUNT(*)*100,1) coverage_pct
FROM t LEFT JOIN acct a ON a.EntityRecordID=t.EntityRecordID
LEFT JOIN lbl l ON l.account_record_id=a.RecordID
GROUP BY quarter ORDER BY quarter
""")

out["funnel_share_quarterly"] = run_query(f"""
WITH {BRIDGE}, tr AS (SELECT DISTINCT t.EntityRecordID, DATE_TRUNC(t.SignupDate,QUARTER) q, l.l1
  FROM `{PROJECT}.revenue.int_trials` t
  LEFT JOIN acct a ON a.EntityRecordID=t.EntityRecordID LEFT JOIN lbl l ON l.account_record_id=a.RecordID
  WHERE t.SignupDate>='2025-01-01' AND t.SignupDate<'2026-07-01')
SELECT FORMAT_DATE('%Y-Q%Q',q) quarter, COUNT(*) trials,
  ROUND(COUNTIF(l1='Manufacturing & Distribution')/NULLIF(COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE'),0)*100,1) mwd_of_classifiable,
  ROUND(COUNTIF(l1='Manufacturing & Distribution')/COUNT(*)*100,1) mwd_of_all,
  ROUND(COUNTIF(l1='Field Services & Trades')/NULLIF(COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE'),0)*100,1) field_of_classifiable
FROM tr GROUP BY quarter ORDER BY quarter
""")

out["conversion_by_cohort"] = run_query(f"""
WITH {BRIDGE}, f AS (SELECT mf.EntityRecordID, mf.converted, DATE_TRUNC(mf.signup_month,QUARTER) q, l.l1
  FROM `{PROJECT}.revenue.int_motion_funnel` mf
  LEFT JOIN acct a ON a.EntityRecordID=mf.EntityRecordID LEFT JOIN lbl l ON l.account_record_id=a.RecordID
  WHERE mf.signup_month>='2025-01-01' AND mf.signup_month<'2026-04-01')
SELECT FORMAT_DATE('%Y-Q%Q',q) cohort,
  COUNTIF(l1='Manufacturing & Distribution') mwd_trials,
  ROUND(COUNTIF(l1='Manufacturing & Distribution' AND converted)/NULLIF(COUNTIF(l1='Manufacturing & Distribution'),0)*100,1) mwd_conv,
  ROUND(COUNTIF(l1='Field Services & Trades' AND converted)/NULLIF(COUNTIF(l1='Field Services & Trades'),0)*100,1) field_conv,
  ROUND(COUNTIF(l1='Professional & Business Services' AND converted)/NULLIF(COUNTIF(l1='Professional & Business Services'),0)*100,1) prof_conv,
  ROUND(COUNTIF(l1='Retail & Consumer' AND converted)/NULLIF(COUNTIF(l1='Retail & Consumer'),0)*100,1) retail_conv
FROM f GROUP BY cohort ORDER BY cohort
""")

OUT.write_text(json.dumps(out, indent=2, default=str))
print(json.dumps(out, indent=2, default=str))
