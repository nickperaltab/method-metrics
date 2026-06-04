// builder/src/lib/netSaasSql.js
// Pure SQL builders for the Net SaaS drilldown. No I/O. Unit-tested.

const ICM = '`project-for-method-dw.revenue.int_customer_mrr`';
const DECOMP = '`project-for-method-dw.revenue.int_mrr_movement_decomposed`';

// BigQuery string-literal escape: double any single quote.
function sqlStr(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

// Build "AND <col> = '<val>'" clauses for set single-select filters.
// `alias` optionally prefixes columns (e.g. 'c' -> "c.Segment") for joined queries.
export function buildFilterClauses(filters = {}, alias = '') {
  const p = alias ? `${alias}.` : '';
  return Object.entries(filters)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `  AND ${p}${k} = ${sqlStr(v)}`)
    .join('\n');
}

export function buildBridgeSql({ month, filters = {} }) {
  return `SELECT
  SUM(StartMRR)      AS start_mrr,
  SUM(NewMRR)        AS new_mrr,
  SUM(Expansions)    AS expansion_mrr,
  SUM(Downgrades)    AS downgrade_mrr,
  SUM(Cancellations) AS churn_mrr,
  SUM(p2_saas)       AS end_mrr
FROM ${ICM}
WHERE Month = ${sqlStr(month)}
${buildFilterClauses(filters)}`.trimEnd();
}

export function buildDimSplitSql({ month, measure, dim, filters = {} }) {
  return `SELECT
  ${dim} AS bucket,
  SUM(${measure}) AS value
FROM ${ICM}
WHERE Month = ${sqlStr(month)}
  AND ${measure} > 0
${buildFilterClauses(filters)}
GROUP BY ${dim}
ORDER BY value DESC`.trimEnd();
}

export function buildComponentSplitSql({ month, movementKind, filters = {} }) {
  const hasFilters = Object.values(filters).some((v) => v !== null && v !== undefined && v !== '');
  if (!hasFilters) {
    return `SELECT
  SUM(seat_mrr)  AS seats,
  SUM(app_mrr)   AS apps,
  SUM(price_mrr) AS price
FROM ${DECOMP}
WHERE month = ${sqlStr(month)}
  AND movement_kind = ${sqlStr(movementKind)}`.trimEnd();
  }
  return `SELECT
  SUM(d.seat_mrr)  AS seats,
  SUM(d.app_mrr)   AS apps,
  SUM(d.price_mrr) AS price
FROM ${DECOMP} d
JOIN ${ICM} c
  ON c.Month = d.month AND c.EntityRecordID = d.entity_record_id
WHERE d.month = ${sqlStr(month)}
  AND d.movement_kind = ${sqlStr(movementKind)}
${buildFilterClauses(filters, 'c')}`.trimEnd();
}

const ORDER_COL = { seats: 'seat_mrr', apps: 'app_mrr', price: 'price_mrr' };

export function buildAccountTableSql({ month, drill, dim, slice, filters = {} }) {
  if (drill === 'expansion' || drill === 'downgrade') {
    const orderCol = ORDER_COL[slice] || 'seat_mrr';
    return `SELECT
  d.entity_record_id,
  c.Company, c.Segment, c.UserTier,
  (d.p2_saas - d.p1_saas) AS deltaMrr,
  d.seat_mrr, d.app_mrr, d.price_mrr
FROM ${DECOMP} d
JOIN ${ICM} c
  ON c.Month = d.month AND c.EntityRecordID = d.entity_record_id
WHERE d.month = ${sqlStr(month)}
  AND d.movement_kind = ${sqlStr(drill)}
${buildFilterClauses(filters, 'c')}
ORDER BY ABS(d.${orderCol}) DESC
LIMIT 50`.trimEnd();
  }
  // new / churn — straight from int_customer_mrr
  const measure = drill === 'new' ? 'NewMRR' : 'Cancellations';
  const sliceClause = dim && slice ? `  AND ${dim} = ${sqlStr(slice)}\n` : '';
  return `SELECT
  EntityRecordID AS entity_record_id,
  Company, Segment, UserTier, AttributionChannel,
  ${measure} AS deltaMrr
FROM ${ICM}
WHERE Month = ${sqlStr(month)}
  AND ${measure} > 0
${sliceClause}${buildFilterClauses(filters)}
ORDER BY ${measure} DESC
LIMIT 50`.trimEnd();
}
