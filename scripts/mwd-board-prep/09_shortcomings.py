#!/usr/bin/env python3
"""
Shortcomings audit (2026-07-22, prompted by: "are these numbers skewed since we
haven't fully populated all the trial data for L1/L2/L3?").

Two exposures tested:

(a) NEW-CUSTOMER MIX TREND, instrument sensitivity. The board headline used V7
    labels (36.9% -> 30.4% of labeled, Jul-Dec'25 -> H1'26, "decline"). But V7
    classification ran ~May 2026 and only covers accounts alive at run time, so
    the older window's labeled set over-samples survivors; MWD churns less, so
    the older window's MWD share is inflated, manufacturing a fake decline.
    Test: recompute on the signup-time Vertical (fixed before churn).
    RESULT: trend REVERSES on the clean instrument (26.4% -> 29.2% of named).
    The V7 decline is substantially a survivorship artifact. Artifact corrected
    to present both instruments and call the mix flat-to-ambiguous.

(b) GRR-BY-L2 MAP, inner-join exposure. 08_retention_grr.py joined
    int_customer_annual_mrr to account_labels with an INNER join, silently
    dropping unlabeled accounts. Test: LEFT JOIN and measure the unlabeled slice.
    RESULT: unlabeled = 37 customers, ~1.4% of June-2026 cohort StartMRR, GRR
    9.4% (they churned; that's why they're unlabeled). L2 cells are inflated by
    <=~1pt; the company-average comparison (76.3%, computed WITHOUT a label
    join) is slightly flattering to the labeled pockets. Caveat added, no
    restatement needed at board grain.

Read-only. Output: out/09_shortcomings.json
"""
import json
from pathlib import Path
from common import run_query, PROJECT

OUT = Path(__file__).parent / "out" / "09_shortcomings.json"
out = {}

# ---- (a) new-customer MWD share on the signup-time instrument -----------------
out["new_customer_share_legacy_instrument"] = run_query(f"""
WITH new_cust AS (
  SELECT EntityRecordID, MIN(Month) AS first_month
  FROM `{PROJECT}.revenue.int_customers`
  WHERE IsNew
  GROUP BY EntityRecordID
  HAVING MIN(Month) BETWEEN DATE '2025-01-01' AND DATE '2026-06-01'
),
vert AS (
  SELECT c.EntityRecordID, ANY_VALUE(c.Vertical) AS Vertical
  FROM `{PROJECT}.revenue.int_customers` c
  JOIN new_cust n ON n.EntityRecordID = c.EntityRecordID AND c.Month = n.first_month
  GROUP BY c.EntityRecordID
)
SELECT
  CASE WHEN n.first_month >= '2026-01-01' THEN '3_H1_2026'
       WHEN n.first_month >= '2025-07-01' THEN '2_JulDec_2025'
       ELSE '1_H1_2025' END AS win,
  COUNT(*) AS new_total,
  COUNTIF(v.Vertical IN ('Manufacturing (MWD)','Wholesale and distribution services (MWD)')) AS mwd_legacy,
  COUNTIF(v.Vertical IS NULL OR v.Vertical IN ('', 'Unknown', 'Other')) AS no_vertical,
  ROUND(COUNTIF(v.Vertical IN ('Manufacturing (MWD)','Wholesale and distribution services (MWD)')) / COUNT(*) * 100, 1) AS mwd_share_of_total_pct,
  ROUND(COUNTIF(v.Vertical IN ('Manufacturing (MWD)','Wholesale and distribution services (MWD)'))
        / NULLIF(COUNT(*) - COUNTIF(v.Vertical IS NULL OR v.Vertical IN ('', 'Unknown', 'Other')), 0) * 100, 1) AS mwd_share_of_named_pct
FROM new_cust n
LEFT JOIN vert v USING (EntityRecordID)
GROUP BY win ORDER BY win
""")

# ---- (b) unlabeled slice of the June-2026 annual GRR cohort --------------------
out["grr_cohort_label_coverage_jun2026"] = run_query(f"""
WITH labels AS (
  SELECT company_account, l1
  FROM `{PROJECT}.v7_classification.account_labels`
  WHERE company_account IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY company_account ORDER BY confidence DESC, classified_at DESC) = 1
)
SELECT
  CASE WHEN lb.company_account IS NULL THEN 'unlabeled'
       WHEN lb.l1 = 'Manufacturing & Distribution' THEN 'MWD'
       ELSE 'other_labeled' END AS seg,
  COUNT(DISTINCT IF(a.StartMRR > 0, a.Company, NULL)) AS customers,
  ROUND(SUM(a.StartMRR), 0) AS start_mrr,
  ROUND(SAFE_DIVIDE(SUM(a.StartMRR) - SUM(a.Cancellations) - SUM(a.Downgrades), SUM(a.StartMRR)) * 100, 1) AS grr_pct
FROM `{PROJECT}.revenue.int_customer_annual_mrr` a
LEFT JOIN labels lb ON lb.company_account = a.Company
WHERE a.Month = DATE '2026-06-01'
GROUP BY seg ORDER BY seg
""")

out["verdicts"] = {
    "new_customer_mix": "INSTRUMENT-DEPENDENT: V7 shows -6.5pt (survivorship-biased in older window); signup-time shows +2.8pt of named. Board claim downgraded to 'flat-to-ambiguous mix, volume -14% to -34% vs market -24%'.",
    "grr_l2_map": "Cells inflated <=~1pt by inner-join label survivorship (unlabeled = 1.4% of dollars at 9.4% GRR). Caveat added; ordering unaffected.",
    "trial_side_v7": "Not used for any historical trial cut (17% coverage, converter-biased); signup-time instrument used instead. Residual: ~1/3 blank verticals (levels are floors), 1.5x undercount, 2024/2025 form shift. The 22.8% V7 crosscheck is a biased ceiling, not a level.",
}

OUT.write_text(json.dumps(out, indent=2, default=str))
print(json.dumps(out, indent=2, default=str))
