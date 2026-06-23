// builder/src/lib/grrIndustrySql.js
// Pure SQL builders for the GRR by Industry Labs page. No I/O. Unit-tested.
//
// Sources:
//   revenue.int_customer_annual_mrr        — annual MRR movement, one row per
//                                             entity (EntityRecordID) per month
//   v7_classification.v_entity_primary_label — ONE row per customer_record_id
//                                             (= EntityRecordID). Dedupe,
//                                             fold-UNCLASSIFIABLE and the
//                                             multi-client flag are done in the
//                                             view, so joining it can never fan
//                                             out MRR. (Replaces the old
//                                             company-name join, which fell back
//                                             to fragile string matching and
//                                             dumped ~$16K of already-classified
//                                             MRR into "Unclassified".)
//   v7_classification.account_entity_map / account_labels — only for the
//                                             per-entity account drill, which
//                                             shows the constituent accounts
//                                             behind one billing entity.
//
// Sign convention (matches v_metric__annual_grr): Cancellations and Downgrades
// are positive magnitudes; GRR = (Start − Cancellations − Downgrades) / Start.

const MRR_VIEW = '`project-for-method-dw.revenue.int_customer_annual_mrr`';
const LABEL_VIEW = '`project-for-method-dw.v7_classification.v_entity_primary_label`';
const MAP_TABLE = '`project-for-method-dw.v7_classification.account_entity_map`';
const LABELS_TABLE = '`project-for-method-dw.v7_classification.account_labels`';

export const GRR_DIMENSIONS = ['l1', 'l2', 'l3', 'operating_model'];

// Stable join from MRR rows to the entity primary-label view.
const LABEL_JOIN = `LEFT JOIN ${LABEL_VIEW} v ON v.customer_record_id = c.EntityRecordID`;

// BigQuery string-literal escape: double any single quote.
function sqlStr(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

function assertDim(dim) {
  if (!GRR_DIMENSIONS.includes(dim)) throw new Error(`Unknown GRR dimension: ${dim}`);
}

// The bucket expression for a dimension, on the view alias `v`.
// Only the top industry level (l1) splits multi-client entities into their own
// 'Multi-client' bucket instead of forcing a partner/reseller biller into a
// single industry. Deeper levels (l2/l3) never see multi-client entities — the
// l1 filter routes them out — so they use a plain COALESCE bucket; so does
// operating_model. Using the same expression for SELECT and for filter clauses
// keeps the bars and the drill consistent (filtering l1='Construction'
// excludes multi-client entities, just as the bars route them out).
function segExpr(dim) {
  assertDim(dim);
  if (dim === 'l1') {
    return `CASE WHEN v.is_multi_client THEN 'Multi-client' ELSE COALESCE(v.l1, 'Unclassified') END`;
  }
  return `COALESCE(v.${dim}, 'Unclassified')`;
}

// "AND <bucket expr> = '<val>'" clauses for the drill path + clicked segment.
// Keys must be allowlisted dimensions; values escaped.
export function buildLabelFilterClauses(filters = {}) {
  return Object.entries(filters)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `  AND ${segExpr(k)} = ${sqlStr(v)}`)
    .join('\n');
}

// Annual GRR + base per value of `dimension` for one cohort month, scoped to
// the drill path in `filters`. Unlabeled entities bucket as 'Unclassified',
// multi-client entities as 'Multi-client' (industry dims only).
export function buildGrrBySegmentSql({ month, dimension, filters = {} }) {
  assertDim(dimension);
  return `SELECT
  ${segExpr(dimension)} AS segment,
  SUM(c.StartMRR)      AS start_mrr,
  SUM(c.Cancellations) AS churn_mrr,
  SUM(c.Downgrades)    AS downgrade_mrr,
  SAFE_DIVIDE(SUM(c.StartMRR) - SUM(c.Cancellations) - SUM(c.Downgrades), SUM(c.StartMRR)) AS grr,
  COUNT(DISTINCT IF(c.StartMRR > 0, c.Company, NULL)) AS customers
FROM ${MRR_VIEW} c
${LABEL_JOIN}
WHERE c.Month = ${sqlStr(month)}
${buildLabelFilterClauses(filters)}
GROUP BY segment
HAVING SUM(c.StartMRR) > 0
ORDER BY start_mrr DESC`.trimEnd();
}

// Entity rows for a clicked segment: MRR movement + the view's primary label +
// multi-client flag, sorted by lost $ (churn + downgrade) descending.
// EntityRecordID travels so a row can drill into its constituent accounts via
// buildCustomerAccountsSql. StartMRR > 0 keeps it to the annual GRR base.
export function buildGrrAccountsSql({ month, filters = {} }) {
  return `SELECT
  c.EntityRecordID,
  c.Company,
  SUM(c.StartMRR)      AS start_mrr,
  SUM(c.Cancellations) AS churn_mrr,
  SUM(c.Downgrades)    AS downgrade_mrr,
  v.l1, v.l2, v.l3, v.operating_model, v.confidence, v.is_multi_client
FROM ${MRR_VIEW} c
${LABEL_JOIN}
WHERE c.Month = ${sqlStr(month)}
${buildLabelFilterClauses(filters)}
GROUP BY c.EntityRecordID, c.Company, v.l1, v.l2, v.l3, v.operating_model, v.confidence, v.is_multi_client
HAVING SUM(c.StartMRR) > 0
ORDER BY (SUM(c.Cancellations) + SUM(c.Downgrades)) DESC, start_mrr DESC
LIMIT 200`.trimEnd();
}

// The constituent accounts behind one billing entity, each with its own label
// + reasoning. This is what makes a multi-client biller legible (one entity =
// a gutter co + a landscaper + a CPA firm) instead of collapsed to one row.
// `entityRecordId` is the entity's numeric RecordID; rejected unless integer.
export function buildCustomerAccountsSql({ entityRecordId }) {
  const id = Number(entityRecordId);
  if (entityRecordId == null || String(entityRecordId).trim() === '' || !Number.isInteger(id)) {
    throw new Error(`buildCustomerAccountsSql: entityRecordId must be an integer, got ${entityRecordId}`);
  }
  return `SELECT
  m.company_account,
  l.l1, l.l2, l.l3, l.operating_model, l.confidence,
  l.business_description, l.short_reasoning
FROM ${MAP_TABLE} m
JOIN (
  SELECT account_record_id, l1, l2, l3, operating_model, confidence,
         business_description, short_reasoning
  FROM ${LABELS_TABLE}
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY account_record_id
    ORDER BY confidence DESC, classified_at DESC
  ) = 1
) l USING (account_record_id)
WHERE m.customer_record_id = ${id}
ORDER BY l.confidence DESC`.trimEnd();
}

// Annual GRR per L1 per month over the trailing `months` window ending at
// `endMonth` (inclusive). Always L1 grain, independent of the drill state —
// answers "is this industry's retention rising or falling".
export function buildGrrTrendSql({ endMonth, months = 12 }) {
  const back = Math.max(1, parseInt(months, 10) || 12) - 1;
  return `SELECT
  c.Month AS month,
  ${segExpr('l1')} AS segment,
  SUM(c.StartMRR) AS start_mrr,
  COUNT(DISTINCT IF(c.StartMRR > 0, c.Company, NULL)) AS customers,
  SAFE_DIVIDE(SUM(c.StartMRR) - SUM(c.Cancellations) - SUM(c.Downgrades), SUM(c.StartMRR)) AS grr
FROM ${MRR_VIEW} c
${LABEL_JOIN}
WHERE c.Month BETWEEN DATE_SUB(DATE ${sqlStr(endMonth)}, INTERVAL ${back} MONTH) AND ${sqlStr(endMonth)}
GROUP BY month, segment
HAVING SUM(c.StartMRR) > 0
ORDER BY month, segment`.trimEnd();
}
