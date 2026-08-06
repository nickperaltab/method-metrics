#!/usr/bin/env python3
"""
CORRECTED industry cuts via the right join. SUPERSEDES the industry splits in
02_funnel_share.py and 05_conversion.py, which used the wrong label source.

THE BUG (caught by Nic 2026-07-24): earlier trial/conversion work joined to
v_entity_primary_label on customer_record_id. That view is CUSTOMERS ONLY (one
row per paying customer entity), so trials that never converted have no row,
producing a fake ~18% trial coverage. The real label table is
v7_classification.account_labels, keyed on account_record_id (Alocet RecordID),
which covers trials. Method's own signup cohort joined that way shows H1 2026
trial coverage at 96-100%.

THE JOIN (our BQ trials/customers are entity-keyed, labels are account-keyed):
  int_trials/int_customers.EntityRecordID
    -> revenue.Account (EntityRecordID -> RecordID, dedup 1 per entity)
    -> account_labels.account_record_id
Confirmed: reproduces 97-100% H1 2026 trial coverage.

COVERAGE IS A BACKFILL IN PROGRESS (working backward from now):
  trials by signup quarter: 2024Q3 12% ... 2025Q3 20%, 2025Q4 45%,
  2026Q1 97%, 2026Q2 99%. So H1 2026 is fully answerable by industry;
  the multi-year TREND is not yet (older quarters still filling in).
  ~25-30% of labeled trials are honest UNCLASSIFIABLE (junk/test/opaque) ->
  use share of CLASSIFIABLE (exclude UNCLASSIFIABLE from the denominator).

CORRECTED H1 2026 FINDINGS (enriched, classifiable):
  Funnel: MWD 21.1% of trials, 23.5% of syncs. Field Services 35.9% / 36.2%.
    -> Field Services is the LARGEST funnel vertical, not MWD. (Legacy self-
       report had shown MWD ~13.5%, undercounting ~1.5x AND mislabeling the
       leader.)
  Conversion (Jan-Mar'26 cohort, 90d): MWD 30.0% (best) > Field 20.1% >
    Retail 15.6% > Prof 12.1% >> Unclassifiable 1.3%. MWD ~1.6x the
    classifiable average. The "MWD converts ~2x" claim is now defensible on
    enriched data.
  New-customer mix: robust to the join (bridge vs view within ~1pt); MWD
    flat-to-down ~37%->31%, Field Services ~25%->41% and now the largest
    source of new customers. Coverage rises into 2026 (99%), so NOT a
    survivorship artifact.

NET STORY SHIFT: MWD is the highest-QUALITY vertical (best conversion, ARPC,
retention) but NOT the volume leader. Field Services dominates trials and new
customers. We are acquiring more Field than MWD; MWD's edge is quality, and its
top-of-funnel volume is the gap the MWD campaigns target.

Read-only. Output: out/12_enriched_via_bridge.json
"""
import json
from pathlib import Path
from common import run_query, PROJECT

OUT = Path(__file__).parent / "out" / "12_enriched_via_bridge.json"

BRIDGE = f"""
acct AS (
  SELECT EntityRecordID, RecordID FROM `{PROJECT}.revenue.Account`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY EntityRecordID ORDER BY RecordID DESC)=1),
lbl AS (
  SELECT account_record_id, l1 FROM `{PROJECT}.v7_classification.account_labels`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY account_record_id ORDER BY confidence DESC, classified_at DESC)=1)
"""

out = {}

out["trial_coverage_by_quarter"] = run_query(f"""
WITH {BRIDGE}, t AS (
  SELECT DISTINCT EntityRecordID, DATE_TRUNC(SignupDate,QUARTER) q
  FROM `{PROJECT}.revenue.int_trials`
  WHERE SignupDate>='2024-07-01' AND SignupDate<'2026-07-01')
SELECT FORMAT_DATE('%Y-Q%Q',t.q) q, COUNT(*) trials,
  ROUND(COUNTIF(l.l1 IS NOT NULL)/COUNT(*)*100,1) cov_pct,
  ROUND(COUNTIF(l.l1='UNCLASSIFIABLE')/NULLIF(COUNTIF(l.l1 IS NOT NULL),0)*100,1) unclass_pct_of_labeled
FROM t LEFT JOIN acct a ON a.EntityRecordID=t.EntityRecordID
LEFT JOIN lbl l ON l.account_record_id=a.RecordID
GROUP BY q ORDER BY q
""")

out["funnel_mix_h1_2026_classifiable"] = run_query(f"""
WITH {BRIDGE},
tr AS (SELECT DISTINCT t.EntityRecordID, l.l1 FROM `{PROJECT}.revenue.int_trials` t
  LEFT JOIN acct a ON a.EntityRecordID=t.EntityRecordID LEFT JOIN lbl l ON l.account_record_id=a.RecordID
  WHERE t.SignupDate>='2026-01-01' AND t.SignupDate<'2026-07-01'),
sy AS (SELECT DISTINCT s.EntityRecordID, l.l1 FROM `{PROJECT}.revenue.int_syncs` s
  LEFT JOIN acct a ON a.EntityRecordID=s.EntityRecordID LEFT JOIN lbl l ON l.account_record_id=a.RecordID
  WHERE s.SyncDate>='2026-01-01' AND s.SyncDate<'2026-07-01')
SELECT 'trials' metric,
  COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE') classifiable,
  ROUND(COUNTIF(l1='Manufacturing & Distribution')/NULLIF(COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE'),0)*100,1) mwd_pct,
  ROUND(COUNTIF(l1='Field Services & Trades')/NULLIF(COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE'),0)*100,1) field_pct,
  ROUND(COUNTIF(l1='Professional & Business Services')/NULLIF(COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE'),0)*100,1) prof_pct,
  ROUND(COUNTIF(l1='Retail & Consumer')/NULLIF(COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE'),0)*100,1) retail_pct
FROM tr
UNION ALL
SELECT 'syncs', COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE'),
  ROUND(COUNTIF(l1='Manufacturing & Distribution')/NULLIF(COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE'),0)*100,1),
  ROUND(COUNTIF(l1='Field Services & Trades')/NULLIF(COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE'),0)*100,1),
  ROUND(COUNTIF(l1='Professional & Business Services')/NULLIF(COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE'),0)*100,1),
  ROUND(COUNTIF(l1='Retail & Consumer')/NULLIF(COUNTIF(l1 IS NOT NULL AND l1!='UNCLASSIFIABLE'),0)*100,1)
FROM sy
""")

out["conversion_h1_2026_by_l1"] = run_query(f"""
WITH {BRIDGE},
f AS (SELECT mf.EntityRecordID, mf.converted, mf.convert_month, mf.signup_month, l.l1
  FROM `{PROJECT}.revenue.int_motion_funnel` mf
  LEFT JOIN acct a ON a.EntityRecordID=mf.EntityRecordID LEFT JOIN lbl l ON l.account_record_id=a.RecordID
  WHERE mf.signup_month>='2026-01-01' AND mf.signup_month<'2026-04-01')
SELECT CASE WHEN l1='Manufacturing & Distribution' THEN 'MWD'
            WHEN l1 IS NULL OR l1='UNCLASSIFIABLE' THEN 'Unclassifiable/none' ELSE l1 END seg,
  COUNT(*) trialers,
  ROUND(COUNTIF(converted AND DATE_DIFF(convert_month,signup_month,MONTH)<=3)/COUNT(*)*100,1) conv90_pct
FROM f GROUP BY seg ORDER BY conv90_pct DESC
""")

out["new_customer_mix_via_bridge"] = run_query(f"""
WITH {BRIDGE},
nc AS (SELECT EntityRecordID, MIN(Month) fm FROM `{PROJECT}.revenue.int_customers`
       WHERE IsNew GROUP BY EntityRecordID
       HAVING MIN(Month)>='2024-07-01' AND MIN(Month)<'2026-07-01')
SELECT FORMAT_DATE('%Y-Q%Q',DATE_TRUNC(nc.fm,QUARTER)) q, COUNT(*) new_total,
  ROUND(COUNTIF(l.l1 IS NOT NULL)/COUNT(*)*100,1) cov_pct,
  ROUND(COUNTIF(l.l1='Manufacturing & Distribution')/NULLIF(COUNTIF(l.l1 IS NOT NULL AND l.l1!='UNCLASSIFIABLE'),0)*100,1) mwd_share,
  ROUND(COUNTIF(l.l1='Field Services & Trades')/NULLIF(COUNTIF(l.l1 IS NOT NULL AND l.l1!='UNCLASSIFIABLE'),0)*100,1) field_share
FROM nc LEFT JOIN acct a ON a.EntityRecordID=nc.EntityRecordID
LEFT JOIN lbl l ON l.account_record_id=a.RecordID
GROUP BY q ORDER BY q
""")

OUT.write_text(json.dumps(out, indent=2, default=str))
print(json.dumps(out, indent=2, default=str))
