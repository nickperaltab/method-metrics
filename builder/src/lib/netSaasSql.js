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

export function buildCohortAgeChurnSql({ month, filters = {} }) {
  return `WITH firsts AS (
  SELECT EntityRecordID, MIN(Month) AS first_month
  FROM ${ICM}
  GROUP BY EntityRecordID
)
SELECT
  CASE
    WHEN DATE_DIFF(${sqlStr(month)}, f.first_month, MONTH) <= 3  THEN '0-3'
    WHEN DATE_DIFF(${sqlStr(month)}, f.first_month, MONTH) <= 12 THEN '4-12'
    WHEN DATE_DIFF(${sqlStr(month)}, f.first_month, MONTH) <= 24 THEN '13-24'
    ELSE '25+'
  END AS bucket,
  SUM(c.Cancellations) AS value
FROM ${ICM} c
JOIN firsts f ON f.EntityRecordID = c.EntityRecordID
WHERE c.Month = ${sqlStr(month)}
  AND c.Cancellations > 0
${buildFilterClauses(filters, 'c')}
GROUP BY bucket
ORDER BY bucket`.trimEnd();
}

// Distinct values per filter dimension, scoped to recent months for relevance.
// `dims` are trusted config identifiers (column names on int_customer_mrr), so
// they're interpolated directly — both as the 'dim' literal label and as the
// CAST(... AS STRING) column reference (STRING cast handles BOOL dims like HasDEP).
export function buildDistinctValuesSql({ dims, months = 24 }) {
  const window = `Month >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL ${Number(months)} MONTH)`;
  const parts = dims.map((d) => `SELECT '${d}' AS dim, CAST(${d} AS STRING) AS val
FROM ${ICM}
WHERE ${window} AND ${d} IS NOT NULL AND CAST(${d} AS STRING) != ''
GROUP BY val`);
  return `${parts.join('\nUNION ALL\n')}
ORDER BY dim, val`;
}
