"""Reconcile int_annual_mrr_movement_decomposed (staging) vs the validated
annual metric views in revenue_metrics, per (period, movement_kind).

The annual decomposition mirrors int_customer_annual_mrr (12-month offset, same
PE exclusion). The three annual movement metrics derive from that same annual
cohort model, so they should reconcile if the decomposition's classification
matches.

Decomposition net movement = SUM(p2_saas - COALESCE(p1_saas, 0)) grouped by
movement_kind, keyed on `month` (the window-END month). The metric views store
movements as positive figures keyed on `period` (= window-END month, DATE,
first-of-month). To compare against the decomposition's signed net:
  - downgrade    -> -(annual downgrades value)   (decomp net is negative)
  - expansion    -> +(annual expansions value)
  - cancellation -> -(annual cancellations value) (decomp net is negative)

Gated kinds: downgrade, expansion, cancellation. There is NO annual New metric
in revenue_metrics (only downgrades/expansions/cancellations/grr/nrr/start_mrr),
so 'new' is NOT gated. 'flat' has no metric counterpart and is not gated.

Only periods present in BOTH the decomposition and the metric view are gated
(the metric series starts later because it needs a full 12-month lookback).

Exit 0 if all gated (period, kind) pairs reconcile within TOLERANCE; 1 otherwise.
"""
import sys
from google.cloud import bigquery

TOLERANCE = 1.00  # dollars, per (period, kind) aggregate

SQL = """
WITH decomp AS (
  SELECT
    month AS period,
    movement_kind,
    SUM(p2_saas - COALESCE(p1_saas, 0)) AS decomp_net
  FROM `project-for-method-dw.revenue_validation.int_annual_mrr_movement_decomposed`
  WHERE movement_kind IN ('downgrade', 'expansion', 'cancellation')
  GROUP BY month, movement_kind
),
metric_long AS (
  -- Metric views store positive movement dollars; sign them to the
  -- decomposition's signed-net convention.
  SELECT period, 'downgrade' AS movement_kind, -value AS expected
  FROM `project-for-method-dw.revenue_metrics.v_metric__annual_downgrades_mrr`
  UNION ALL
  SELECT period, 'expansion', value
  FROM `project-for-method-dw.revenue_metrics.v_metric__annual_expansions_mrr`
  UNION ALL
  SELECT period, 'cancellation', -value
  FROM `project-for-method-dw.revenue_metrics.v_metric__annual_cancellations_mrr`
)
SELECT
  COALESCE(d.period, m.period) AS period,
  COALESCE(d.movement_kind, m.movement_kind) AS movement_kind,
  d.decomp_net,
  m.expected,
  CAST(d.decomp_net AS FLOAT64) - CAST(m.expected AS FLOAT64) AS diff,
  -- A pair is gated only if BOTH sides have a row for this period; the metric
  -- series starts later (needs a full 12-month lookback). Periods present on
  -- only one side are reported but not gated.
  (d.period IS NOT NULL AND m.period IS NOT NULL) AS both_present
FROM decomp d
FULL OUTER JOIN metric_long m
  ON d.period = m.period AND d.movement_kind = m.movement_kind
ORDER BY movement_kind, period
"""


def main():
    client = bigquery.Client(project="project-for-method-dw")
    rows = list(client.query(SQL).result())

    def fnum(x):
        return float(x) if x is not None else None

    def err(r):
        dn = fnum(r.decomp_net)
        ex = fnum(r.expected)
        if dn is None or ex is None:
            return None
        return abs(dn - ex)

    gated = [r for r in rows if r.both_present]
    unmatched = [r for r in rows if not r.both_present]

    fails = [r for r in gated if (err(r) or 0) > TOLERANCE]

    # Per-(period, kind) residual table — always printed.
    print("Per-(period, kind) residuals (gated pairs — present in both sources):")
    print(f"  {'period':12s} {'kind':13s} {'decomp_net':>16s} {'metric_signed':>16s} {'diff':>14s}")
    for r in sorted(gated, key=lambda r: (r.movement_kind, r.period)):
        dn = fnum(r.decomp_net)
        ex = fnum(r.expected)
        flag = "  <-- FAIL" if (err(r) or 0) > TOLERANCE else ""
        print(f"  {str(r.period):12s} {r.movement_kind:13s} "
              f"{dn:>16,.2f} {ex:>16,.2f} {(dn - ex):>+14,.2f}{flag}")

    if unmatched:
        print("\nNon-gated pairs (present in only one source — reported, not gated):")
        for r in sorted(unmatched, key=lambda r: (r.movement_kind, str(r.period))):
            dn = fnum(r.decomp_net)
            ex = fnum(r.expected)
            dn_s = f"{dn:,.2f}" if dn is not None else "(none)"
            ex_s = f"{ex:,.2f}" if ex is not None else "(none)"
            print(f"  {str(r.period):12s} {r.movement_kind:13s} "
                  f"decomp={dn_s:>16s} metric={ex_s:>16s}")

    total_abs = sum((err(r) or 0) for r in gated)
    print(f"\nGated (period, kind) pairs: {len(gated)}")
    print(f"Pairs failing (> ${TOLERANCE:.2f}): {len(fails)}")
    print(f"Total absolute reconciliation error across gated pairs: ${total_abs:,.2f}")

    if fails:
        print("\nFAIL Reconciliation diverges beyond tolerance on the pairs above.")
        sys.exit(1)

    print("\nOK Reconciliation holds within tolerance for all gated (period, kind) pairs")
    sys.exit(0)


if __name__ == "__main__":
    main()
