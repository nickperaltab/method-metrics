"""Verify int_customer_mrr_lines rolls up to int_customer_mrr's customer-month SaaS total.

Compares SUM(int_customer_mrr_lines.saas) per (month, entity) against
int_customer_mrr.p2_saas per (Month, EntityRecordID).

p2_saas is the raw entity book (PE exclusion does NOT touch it), so it should match
the line rollup exactly. Churn rows in int_customer_mrr (p2_saas=0, no lines) net to 0.
Comparison restricted to Month >= '2022-01' to align the two models' output windows.

Exit 0 if all (month, entity) pairs reconcile within TOLERANCE; 1 otherwise.
"""
import sys
from google.cloud import bigquery

TOLERANCE = 0.01

SQL = """
WITH lines_rollup AS (
  SELECT month, entity_record_id, SUM(saas) AS lines_total
  FROM `project-for-method-dw.revenue_validation.int_customer_mrr_lines`
  WHERE month >= '2022-01-01'
  GROUP BY 1, 2
),
icm AS (
  SELECT Month AS month, EntityRecordID AS entity_record_id, SUM(p2_saas) AS customer_total
  FROM `project-for-method-dw.revenue.int_customer_mrr`
  WHERE Month >= '2022-01-01'
  GROUP BY 1, 2
)
SELECT
  COALESCE(l.month, c.month) AS month,
  COALESCE(l.entity_record_id, c.entity_record_id) AS entity_record_id,
  IFNULL(l.lines_total, 0) AS lines_total,
  IFNULL(c.customer_total, 0) AS customer_total,
  IFNULL(l.lines_total, 0) - IFNULL(c.customer_total, 0) AS diff
FROM lines_rollup l
FULL OUTER JOIN icm c USING (month, entity_record_id)
WHERE ABS(IFNULL(l.lines_total, 0) - IFNULL(c.customer_total, 0)) > 0.01
ORDER BY ABS(IFNULL(l.lines_total, 0) - IFNULL(c.customer_total, 0)) DESC
LIMIT 200
"""


def main():
    client = bigquery.Client(project="project-for-method-dw")
    rows = list(client.query(SQL).result())
    if not rows:
        print(f"OK Lines roll up to customer-month within {TOLERANCE} (Month >= 2022-01)")
        sys.exit(0)
    print(f"FAIL {len(rows)} (month, entity) pairs fail rollup (top 200 by abs diff):")
    for r in rows[:30]:
        print(f"  {r.month} | {r.entity_record_id} | lines={r.lines_total:>12,.4f} | icm={r.customer_total:>12,.4f} | diff={r.diff:>+10,.4f}")
    sys.exit(1)


if __name__ == "__main__":
    main()
