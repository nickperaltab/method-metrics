#!/usr/bin/env python3
"""
Task 8 re-cut verification: two numbers imported from the marketing H1 whitepaper
need independent verification before they enter the board artifact.

(a) 12-month logo retention of new customers by V7 L1
    - cohorts: first-ever paying month Jan 2024 .. Jun 2025 (int_customers.IsNew)
    - retained = a row exists for the entity exactly 12 months after first month
      (int_customers only contains active paying customers)
    - whitepaper claim (legacy-vertical basis): MWD 62%, Construction 49%,
      Consulting 46%. Ours is V7-L1 basis so expect close, not identical.

(b) Annual GRR by L2 inside Manufacturing & Distribution, June 2026 cohort
    - mirrors builder/src/lib/grrIndustrySql.js exactly (same as
      scripts/retail_grr_diagnostic.py): int_customer_annual_mrr +
      v7_classification.account_labels deduped by confidence/classified_at
    - whitepaper claims: Electronics & Tech Mfg 84.2, Med & Pharma Dist 83.1,
      Building Materials Mfg 82.6, Consumer Products Mfg 81.9,
      Industrial & Equipment Dist 77.7 ($67K MRR, 246 customers), company avg 76.3.

Read-only. Output: out/08_retention_grr.json
"""
import json
from pathlib import Path
from common import run_query, PROJECT, LABELS, MWD_L1

OUT = Path(__file__).parent / "out" / "08_retention_grr.json"
out = {}

# ---- (a) 12-month logo retention by V7 L1 ------------------------------------
retention = run_query(f"""
WITH new_cust AS (
  SELECT EntityRecordID, MIN(Month) AS first_month
  FROM `{PROJECT}.revenue.int_customers`
  WHERE IsNew
  GROUP BY EntityRecordID
  HAVING MIN(Month) BETWEEN DATE '2024-01-01' AND DATE '2025-06-01'
),
alive_12 AS (
  SELECT DISTINCT c.EntityRecordID
  FROM `{PROJECT}.revenue.int_customers` c
  JOIN new_cust n ON n.EntityRecordID = c.EntityRecordID
  WHERE c.Month = DATE_ADD(n.first_month, INTERVAL 12 MONTH)
)
SELECT
  COALESCE(NULLIF(l.l1, 'UNCLASSIFIABLE'), 'Unclassified') AS l1,
  COUNT(*) AS cohort_customers,
  COUNTIF(a.EntityRecordID IS NOT NULL) AS retained_12mo,
  ROUND(COUNTIF(a.EntityRecordID IS NOT NULL) / COUNT(*) * 100, 1) AS retention_pct
FROM new_cust n
LEFT JOIN alive_12 a USING (EntityRecordID)
LEFT JOIN `{LABELS}` l ON l.customer_record_id = n.EntityRecordID
GROUP BY l1
ORDER BY cohort_customers DESC
""")
overall = run_query(f"""
WITH new_cust AS (
  SELECT EntityRecordID, MIN(Month) AS first_month
  FROM `{PROJECT}.revenue.int_customers`
  WHERE IsNew
  GROUP BY EntityRecordID
  HAVING MIN(Month) BETWEEN DATE '2024-01-01' AND DATE '2025-06-01'
)
SELECT COUNT(*) AS cohort_customers,
       COUNTIF(a.Month IS NOT NULL) AS retained_12mo,
       ROUND(COUNTIF(a.Month IS NOT NULL) / COUNT(*) * 100, 1) AS retention_pct
FROM new_cust n
LEFT JOIN `{PROJECT}.revenue.int_customers` a
  ON a.EntityRecordID = n.EntityRecordID
 AND a.Month = DATE_ADD(n.first_month, INTERVAL 12 MONTH)
""")[0]
out["logo_retention_12mo_by_l1"] = retention
out["logo_retention_12mo_overall"] = overall

# ---- (a2) same retention on the UNBIASED signup-time instrument ---------------
# The V7 cut above is survivorship-biased for retention: churned customers were
# never labeled (the Unclassified bucket retains at ~6%), inflating labeled-L1
# rates. The legacy signup-time Vertical is fixed before churn, so it is the
# right instrument here (same logic as conversion in 05_conversion.py).
retention_legacy = run_query(f"""
WITH new_cust AS (
  SELECT EntityRecordID, MIN(Month) AS first_month
  FROM `{PROJECT}.revenue.int_customers`
  WHERE IsNew
  GROUP BY EntityRecordID
  HAVING MIN(Month) BETWEEN DATE '2024-01-01' AND DATE '2025-06-01'
),
vert AS (
  SELECT c.EntityRecordID, ANY_VALUE(c.Vertical) AS Vertical
  FROM `{PROJECT}.revenue.int_customers` c
  JOIN new_cust n ON n.EntityRecordID = c.EntityRecordID AND c.Month = n.first_month
  GROUP BY c.EntityRecordID
)
SELECT
  CASE WHEN v.Vertical IN ('Manufacturing (MWD)','Wholesale and distribution services (MWD)') THEN 'MWD (legacy)'
       WHEN v.Vertical IS NULL OR v.Vertical IN ('', 'Unknown', 'Other') THEN 'No vertical'
       ELSE 'Non-MWD (legacy)' END AS seg,
  COUNT(*) AS cohort,
  COUNTIF(a.Month IS NOT NULL) AS retained,
  ROUND(COUNTIF(a.Month IS NOT NULL) / COUNT(*) * 100, 1) AS retention_pct
FROM new_cust n
LEFT JOIN vert v USING (EntityRecordID)
LEFT JOIN `{PROJECT}.revenue.int_customers` a
  ON a.EntityRecordID = n.EntityRecordID
 AND a.Month = DATE_ADD(n.first_month, INTERVAL 12 MONTH)
GROUP BY seg ORDER BY seg
""")
out["logo_retention_12mo_legacy_instrument"] = retention_legacy

# ---- (b) GRR by L2 inside M&D, June 2026 cohort -------------------------------
DEDUP_LABELS = f"""
labels AS (
  SELECT company_account, l1, l2, confidence, classified_at
  FROM `{PROJECT}.v7_classification.account_labels`
  WHERE company_account IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY company_account
                             ORDER BY confidence DESC, classified_at DESC) = 1
)"""
grr_l2 = run_query(f"""
WITH {DEDUP_LABELS}
SELECT lb.l2,
       COUNT(DISTINCT IF(a.StartMRR > 0, a.Company, NULL)) AS customers,
       ROUND(SUM(a.StartMRR), 0) AS start_mrr,
       ROUND(SAFE_DIVIDE(SUM(a.StartMRR) - SUM(a.Cancellations) - SUM(a.Downgrades),
                         SUM(a.StartMRR)) * 100, 1) AS grr_pct
FROM `{PROJECT}.revenue.int_customer_annual_mrr` a
JOIN labels lb ON lb.company_account = a.Company AND lb.l1 = '{MWD_L1}'
WHERE a.Month = DATE '2026-06-01'
GROUP BY lb.l2
HAVING SUM(a.StartMRR) > 0
ORDER BY grr_pct DESC
""")
grr_company = run_query(f"""
SELECT ROUND(SAFE_DIVIDE(SUM(StartMRR) - SUM(Cancellations) - SUM(Downgrades),
                         SUM(StartMRR)) * 100, 1) AS grr_pct,
       COUNT(DISTINCT IF(StartMRR > 0, Company, NULL)) AS customers
FROM `{PROJECT}.revenue.int_customer_annual_mrr`
WHERE Month = DATE '2026-06-01'
""")[0]
out["grr_l2_mwd_jun2026"] = grr_l2
out["grr_company_jun2026"] = grr_company

# ---- whitepaper comparison -----------------------------------------------------
out["whitepaper_claims"] = {
    "retention_12mo": {"MWD": 62, "note": "legacy-vertical basis, converts Jan24-Jun25"},
    "grr_l2": {
        "Electronics & Technology Manufacturing": 84.2,
        "Medical & Pharmaceutical Distribution": 83.1,
        "Building Materials Manufacturing": 82.6,
        "Consumer Products Manufacturing": 81.9,
        "Industrial & Equipment Distribution": 77.7,
        "company_average": 76.3,
    },
}

OUT.write_text(json.dumps(out, indent=2, default=str))
print(json.dumps(out, indent=2, default=str))
