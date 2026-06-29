#!/usr/bin/env python3
"""Parity: int_motion_funnel spine (trial/sync/convert counts by signup month)
vs the shipped Funnel-based spine. Different sources -> report the delta; a small
stable delta is acceptable and gets documented, a large/structural one stops the build.
"""
import sys
from google.cloud import bigquery

client = bigquery.Client(project='project-for-method-dw')

rows = client.query("""
WITH motion AS (
  SELECT FORMAT_DATE('%Y-%m', signup_month) AS m,
         COUNT(*) AS trials,
         COUNTIF(synced) AS synced,
         COUNTIF(converted) AS converted
  FROM `project-for-method-dw.revenue.int_motion_funnel`
  WHERE signup_month >= '2024-01-01'
  GROUP BY 1
),
funnel AS (
  SELECT FORMAT_DATE('%Y-%m', DATE_TRUNC(MIN_trial, MONTH)) AS m, COUNT(*) AS trials
  FROM (
    SELECT EntityRecordID, MIN(IF(EventType='Trial', Date, NULL)) AS MIN_trial
    FROM `project-for-method-dw.revenue.Funnel`
    GROUP BY 1
  )
  WHERE MIN_trial >= '2024-01-01'
  GROUP BY 1
)
SELECT motion.m, motion.trials AS motion_trials, funnel.trials AS funnel_trials,
       motion.trials - funnel.trials AS delta
FROM motion LEFT JOIN funnel USING (m)
ORDER BY motion.m
""").result()

worst = 0.0
for r in rows:
    ft = r['funnel_trials'] or 0
    pct = (abs(r['delta']) / ft * 100) if ft else 0
    worst = max(worst, pct)
    print(f"  {r['m']}  motion={r['motion_trials']:<6} funnel={ft:<6} delta={r['delta']:<6} ({pct:.1f}%)")

print(f"\nWorst monthly trial-count delta: {worst:.1f}%")
if worst > 5.0:
    print("FAIL: >5% spine divergence -- int_trials vs Funnel disagree. Investigate source choice before proceeding.")
    sys.exit(1)
print("PASS: spine within 5% of the shipped Funnel-based counts (document the residual in metric-definitions).")
