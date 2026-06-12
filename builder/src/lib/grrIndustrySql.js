// builder/src/lib/grrIndustrySql.js
// Pure SQL builders for the GRR by Industry Labs page. No I/O. Unit-tested.
//
// Sources:
//   revenue.int_customer_annual_mrr  — annual MRR movement at customer grain
//   v7_classification.account_labels — current-state V7 labels; multiple rows
//                                      can share a company_account, so every
//                                      join goes through the deduping CTE below
//
// Sign convention (matches v_metric__annual_grr): Cancellations and Downgrades
// are positive magnitudes; GRR = (Start − Cancellations − Downgrades) / Start.

const MRR_VIEW = '`project-for-method-dw.revenue.int_customer_annual_mrr`';
const LABELS_TABLE = '`project-for-method-dw.v7_classification.account_labels`';

export const GRR_DIMENSIONS = ['l1', 'l2', 'l3', 'operating_model'];

// BigQuery string-literal escape: double any single quote.
function sqlStr(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

function assertDim(dim) {
  if (!GRR_DIMENSIONS.includes(dim)) throw new Error(`Unknown GRR dimension: ${dim}`);
}

// One label row per company_account: highest confidence wins, latest
// classified_at breaks ties — a LEFT JOIN against this can never fan out
// MRR rows (account_labels is keyed by account_record_id, not company_account).
function labelsCte() {
  return `WITH labels AS (
  SELECT company_account, l1, l2, l3, operating_model, confidence,
         business_description, short_reasoning, classified_at
  FROM ${LABELS_TABLE}
  WHERE company_account IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY company_account
    ORDER BY confidence DESC, classified_at DESC
  ) = 1
)`;
}

// "AND COALESCE(lb.<dim>, 'Unclassified') = '<val>'" clauses for the drill
// path + clicked segment. Keys must be allowlisted dimensions; values escaped.
export function buildLabelFilterClauses(filters = {}) {
  return Object.entries(filters)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => {
      assertDim(k);
      return `  AND COALESCE(lb.${k}, 'Unclassified') = ${sqlStr(v)}`;
    })
    .join('\n');
}

// Annual GRR + base per value of `dimension` for one cohort month, scoped to
// the drill path in `filters`. Unlabeled customers bucket as 'Unclassified'.
export function buildGrrBySegmentSql({ month, dimension, filters = {} }) {
  assertDim(dimension);
  return `${labelsCte()}
SELECT
  COALESCE(lb.${dimension}, 'Unclassified') AS segment,
  SUM(c.StartMRR)      AS start_mrr,
  SUM(c.Cancellations) AS churn_mrr,
  SUM(c.Downgrades)    AS downgrade_mrr,
  SAFE_DIVIDE(SUM(c.StartMRR) - SUM(c.Cancellations) - SUM(c.Downgrades), SUM(c.StartMRR)) AS grr,
  COUNT(DISTINCT IF(c.StartMRR > 0, c.Company, NULL)) AS customers
FROM ${MRR_VIEW} c
LEFT JOIN labels lb ON lb.company_account = c.Company
WHERE c.Month = ${sqlStr(month)}
${buildLabelFilterClauses(filters)}
GROUP BY segment
HAVING SUM(c.StartMRR) > 0
ORDER BY start_mrr DESC`.trimEnd();
}

// Account rows for a clicked segment: MRR movement + labels + reasoning,
// sorted by lost $ (churn + downgrade) descending. StartMRR > 0 keeps it to
// the annual GRR base (NewMRR-only customers aren't in the retention math).
export function buildGrrAccountsSql({ month, filters = {} }) {
  return `${labelsCte()}
SELECT
  c.Company,
  SUM(c.StartMRR)      AS start_mrr,
  SUM(c.Cancellations) AS churn_mrr,
  SUM(c.Downgrades)    AS downgrade_mrr,
  lb.l1, lb.l2, lb.l3, lb.operating_model, lb.confidence,
  lb.business_description, lb.short_reasoning
FROM ${MRR_VIEW} c
LEFT JOIN labels lb ON lb.company_account = c.Company
WHERE c.Month = ${sqlStr(month)}
${buildLabelFilterClauses(filters)}
GROUP BY c.Company, lb.l1, lb.l2, lb.l3, lb.operating_model, lb.confidence,
         lb.business_description, lb.short_reasoning
HAVING SUM(c.StartMRR) > 0
ORDER BY (SUM(c.Cancellations) + SUM(c.Downgrades)) DESC, start_mrr DESC
LIMIT 200`.trimEnd();
}
