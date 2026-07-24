#!/usr/bin/env python3
"""
ARPC decoder — reconciles every ARPC in circulation against the RevCogs
workbook ("RevCogs Values - Models for Forecasting & Budgets") and raw
TransLineFlattened. Prompted by: "I think we need a better understanding of
ARPC... look at revcogs" after the ~$140 challenge.

FINDINGS (June 2026 unless noted; RevCogs is point-in-time, ties within ~$60):

1. The ~$140 = RevCogs row 12 "ARPC (w/out DEP)": NEW-customer FIRST-INVOICE
   ARPC excluding DEP. Jan-2024 anchor cell = $140.38; 2026 actuals $124-153,
   forecast ~$136. NOT an all-customer figure.
2. StartMRR / v_saas_mrr INCLUDE DEP. Raw June 2026: total SaaS $839,758
   (= Justin's v_saas_mrr $839,750 = RevCogs SaaS w/o DEP $706,344 + SaaS DEP
   $133,358). DEP = 15.9% of SaaS. (Corrects an earlier claim in this
   analysis that DEP was not in the numerator.)
3. MWD premium is NOT a DEP artifact: incl DEP $300.8 vs $263.8 (1.14x);
   excl DEP $254.7 vs $221.9 (1.15x). MWD DEP mix 15.3% ~= company 15.9%.
4. The ARPC family (all reconcile; differences = DEP in/out x denominator
   grain x gross-vs-net x lifecycle segment):
   - $140  RevCogs new-customer first-invoice, w/out DEP (planning basis)
   - $123-194 RevCogs cohort ARPCs w/out DEP (0-30d $123 ... 180+d $175,
     prepay $194; Jun'26)
   - ~$182 RevCogs existing blended w/out DEP ($706K / ~3,876 paying accts)
   - $216  RevCogs "ARPC NET SaaS (Retained)" (incl DEP, net of bad debt +
     retention credits, per retained customer)
   - $261  RevCogs "ARPC NET SaaS+PS" (adds professional services)
   - $248  Justin v_saas_mrr: SaaS incl DEP / 3,382 paying logos
   - $258  ours: StartMRR incl DEP / 3,216 paying entities (int_customer_mrr)
   - $222  ours excl DEP / paying entity (raw recompute)
   RevCogs denominators are ACCOUNT-grain (~3,876 BOM) vs our ENTITY grain
   (3,183-3,216) vs Justin's logos (3,382).

Read-only. Output: out/11_arpc_decoder.json
"""
import json
from pathlib import Path
from common import run_query, PROJECT

OUT = Path(__file__).parent / "out" / "11_arpc_decoder.json"
out = {}

out["june2026_dep_split_by_l1"] = run_query(f"""
WITH lines AS (
  SELECT EntityRecordID,
         (AccountFullName LIKE '%Premium App%' OR AccountFullName LIKE '%Enhancement Plan%') AS is_dep,
         SaaSAmount
  FROM `{PROJECT}.revenue.TransLineFlattened`
  WHERE FORMAT_DATE('%Y-%m', TxnDate) = '2026-06'
),
by_entity AS (
  SELECT EntityRecordID,
         SUM(SaaSAmount) AS saas_total,
         SUM(IF(is_dep, SaaSAmount, 0)) AS saas_dep
  FROM lines GROUP BY EntityRecordID
  HAVING SUM(SaaSAmount) > 0
)
SELECT
  COALESCE(NULLIF(l.l1,'UNCLASSIFIABLE'),'Unclassified') AS l1,
  COUNT(*) AS paying_entities,
  ROUND(SUM(e.saas_total),0) AS saas_incl_dep,
  ROUND(SUM(e.saas_dep),0) AS dep_amt,
  ROUND(SUM(e.saas_total)/COUNT(*),1) AS arpc_incl_dep,
  ROUND((SUM(e.saas_total)-SUM(e.saas_dep))/COUNT(*),1) AS arpc_excl_dep
FROM by_entity e
LEFT JOIN `{PROJECT}.v7_classification.v_entity_primary_label` l
  ON l.customer_record_id = e.EntityRecordID
GROUP BY l1
UNION ALL
SELECT 'TOTAL', COUNT(*), ROUND(SUM(saas_total),0), ROUND(SUM(saas_dep),0),
       ROUND(SUM(saas_total)/COUNT(*),1), ROUND((SUM(saas_total)-SUM(saas_dep))/COUNT(*),1)
FROM by_entity
ORDER BY saas_incl_dep DESC
""")

# Constants read from the RevCogs workbook (values-only export, traced by cell;
# see docstring). Kept here so the decoder is reproducible without the xlsx.
out["revcogs_jun2026_traced"] = {
    "arpc_new_first_invoice_wo_dep": {"jan2024_anchor": 140.38, "jun2026": 153.32, "forecast_2026": 136.0},
    "cohort_arpc_wo_dep": {"0_30d": 123.1, "31_60d": 167.7, "61_180d": 187.84, "180plus": 175.42, "prepay": 193.77},
    "saas_wo_dep": 706344.0, "saas_dep": 133358.0,
    "arpc_net_saas_retained": 215.84, "arpc_net_saas_plus_ps": 261.07,
    "paying_customers_bom_accounts": 3876,
}

OUT.write_text(json.dumps(out, indent=2, default=str))
print(json.dumps(out["june2026_dep_split_by_l1"], indent=1, default=str))
