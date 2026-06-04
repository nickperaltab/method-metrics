"""Verify int_mrr_movement_decomposed identity:
   seat_mrr + app_mrr + price_mrr == (p2_saas - p1_saas)
per (month, entity_record_id), within float tolerance.

p1_saas (prior-month total) is NULL when the entity had no prior calendar month
(a "new" movement). The decomposition's components are built from a full-outer item
join that coalesces a missing prior to 0, so the economic identity uses
COALESCE(p1_saas, 0). We test that. We also separately count NULL-prior rows so the
NULL handling is explicit, not silently masked.

Exit 0 if all rows pass; exit 1 otherwise.
"""
import sys
from google.cloud import bigquery

TOLERANCE = 0.01
PROJECT = "project-for-method-dw"
DATASET = "revenue_validation"  # freshly built in staging for this validation

SQL = f"""
SELECT
  month,
  entity_record_id,
  movement_kind,
  p1_saas,
  p2_saas,
  app_mrr,
  seat_mrr,
  price_mrr,
  (p2_saas - COALESCE(p1_saas, 0)) AS expected_total,
  (app_mrr + seat_mrr + price_mrr) AS decomposed_total,
  ABS((p2_saas - COALESCE(p1_saas, 0)) - (app_mrr + seat_mrr + price_mrr)) AS abs_diff
FROM `{PROJECT}.{DATASET}.int_mrr_movement_decomposed`
WHERE month >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
  AND ABS((p2_saas - COALESCE(p1_saas, 0)) - (app_mrr + seat_mrr + price_mrr)) > {TOLERANCE}
ORDER BY abs_diff DESC
LIMIT 200
"""


def main():
    client = bigquery.Client(project=PROJECT)
    rows = list(client.query(SQL).result())
    if not rows:
        print(f"OK Identity holds within {TOLERANCE} on all rows (trailing 24 months)")
        sys.exit(0)
    print(f"FAIL {len(rows)} rows (top 200 by abs_diff) violate identity:")
    for r in rows[:25]:
        print(
            f"  {r.month} | {r.entity_record_id} | {r.movement_kind} | "
            f"expected={r.expected_total:.4f} decomposed={r.decomposed_total:.4f} "
            f"diff={r.abs_diff:.4f}"
        )
    sys.exit(1)


if __name__ == "__main__":
    main()
