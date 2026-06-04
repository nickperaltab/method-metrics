"""Reconcile int_mrr_movement_decomposed (staging) vs int_customer_mrr (prod)
per (month, movement_kind). Both should sum to the same movement dollars.

Decomposition net movement = p2_saas - COALESCE(p1_saas, 0), grouped by movement_kind.
int_customer_mrr stores movements as positive parallel columns; downgrades and
cancellations are negated to match the decomposition's signed net.

'flat' rows have no int_customer_mrr counterpart and are reported, not gated.

Exit 0 if all gated (month, kind) pairs reconcile within TOLERANCE; 1 otherwise.
"""
import sys
from google.cloud import bigquery

TOLERANCE = 1.00  # dollars, per (month, kind) aggregate

SQL = """
WITH decomp AS (
  SELECT
    month,
    movement_kind,
    SUM(p2_saas - COALESCE(p1_saas, 0)) AS decomp_net
  FROM `project-for-method-dw.revenue_validation.int_mrr_movement_decomposed`
  WHERE month >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
    -- Exclude the in-progress month. Both models' feeders exclude it
    -- (TransLineFlattened WHERE format_date('%Y-%m', TxnDate) < current month),
    -- but the decomposition's full-outer `tot` join synthesizes phantom
    -- cur=0 "cancellation" rows at current-month for entities last booked in
    -- the prior month. int_customer_mrr has no current-month rows at all, so
    -- these have no counterpart and would NaN-gate. Align both sides to the
    -- complete-months window they actually populate.
    AND month < DATE_TRUNC(CURRENT_DATE(), MONTH)
  GROUP BY month, movement_kind
),
icm AS (
  SELECT
    Month AS month,
    SUM(NewMRR)         AS new_mrr,
    SUM(Expansions)     AS expansion_mrr,
    -SUM(Downgrades)    AS downgrade_mrr,
    -SUM(Cancellations) AS cancellation_mrr
  FROM `project-for-method-dw.revenue.int_customer_mrr`
  WHERE Month >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
  GROUP BY Month
),
icm_long AS (
  SELECT month, 'new' AS movement_kind, new_mrr AS expected FROM icm
  UNION ALL SELECT month, 'expansion', expansion_mrr FROM icm
  UNION ALL SELECT month, 'downgrade', downgrade_mrr FROM icm
  UNION ALL SELECT month, 'cancellation', cancellation_mrr FROM icm
)
SELECT
  COALESCE(d.month, i.month) AS month,
  COALESCE(d.movement_kind, i.movement_kind) AS movement_kind,
  d.decomp_net,
  i.expected,
  d.decomp_net - i.expected AS diff
FROM decomp d
FULL OUTER JOIN icm_long i
  ON d.month = i.month AND d.movement_kind = i.movement_kind
WHERE d.movement_kind != 'flat' OR d.movement_kind IS NULL
ORDER BY ABS(IFNULL(d.decomp_net,0) - IFNULL(i.expected,0)) DESC
"""

def main():
    client = bigquery.Client(project="project-for-method-dw")
    rows = list(client.query(SQL).result())
    gated = [r for r in rows if (r.movement_kind or '') != 'flat']

    def err(r):
        return abs(float(r.decomp_net or 0) - float(r.expected or 0))

    fails = [r for r in gated if err(r) > TOLERANCE]

    total_abs = sum(err(r) for r in gated)
    print(f"Gated (month, kind) pairs: {len(gated)}")
    print(f"Pairs failing (> ${TOLERANCE}): {len(fails)}")
    print(f"Total absolute reconciliation error across all pairs: ${total_abs:,.2f}")

    if fails:
        print("\nWorst mismatches:")
        for r in fails[:30]:
            dn = float(r.decomp_net) if r.decomp_net is not None else float('nan')
            ex = float(r.expected) if r.expected is not None else float('nan')
            print(f"  {r.month} | {r.movement_kind:13s} | decomp={dn:>16,.2f} | icm={ex:>16,.2f} | diff={(dn-ex):>+14,.2f}")
        sys.exit(1)

    print("\nOK Reconciliation holds within tolerance for all gated (month, kind) pairs")
    sys.exit(0)

if __name__ == "__main__":
    main()
