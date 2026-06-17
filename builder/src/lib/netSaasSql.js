// builder/src/lib/netSaasSql.js
// Pure SQL builders for the Net SaaS drilldown. No I/O. Unit-tested.

// Fully-qualify a revenue-dataset view name into a BQ-quoted FQN.
const fqn = (view) => `\`project-for-method-dw.revenue.${view}\``;

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

// Headline GRR/NRR % comes from the validated monthly metric views in
// `revenue_metrics` (period DATE + value NUMERIC ratio) — never recomputed.
export function buildRateSql({ metric, period }) {
  return `SELECT value
FROM \`project-for-method-dw.revenue_metrics.${metric}\`
WHERE period = ${sqlStr(period)}`;
}

export function buildBridgeSql({ month, filters = {}, bridgeView = 'int_customer_mrr' }) {
  const icm = fqn(bridgeView);
  return `SELECT
  SUM(StartMRR)      AS start_mrr,
  SUM(NewMRR)        AS new_mrr,
  SUM(Expansions)    AS expansion_mrr,
  SUM(Downgrades)    AS downgrade_mrr,
  SUM(Cancellations) AS churn_mrr,
  SUM(p2_saas)       AS end_mrr
FROM ${icm}
WHERE Month = ${sqlStr(month)}
${buildFilterClauses(filters)}`.trimEnd();
}

export function buildDimSplitSql({ month, measure, dim, filters = {}, bridgeView = 'int_customer_mrr' }) {
  const icm = fqn(bridgeView);
  return `SELECT
  ${dim} AS bucket,
  SUM(${measure}) AS value
FROM ${icm}
WHERE Month = ${sqlStr(month)}
  AND ${measure} > 0
${buildFilterClauses(filters)}
GROUP BY ${dim}
ORDER BY value DESC`.trimEnd();
}

export function buildComponentSplitSql({ month, movementKind, filters = {}, decompView = 'int_mrr_movement_decomposed', bridgeView = 'int_customer_mrr' }) {
  const decomp = fqn(decompView);
  const icm = fqn(bridgeView);
  const hasFilters = Object.values(filters).some((v) => v !== null && v !== undefined && v !== '');
  if (!hasFilters) {
    return `SELECT
  SUM(seat_mrr)  AS seats,
  SUM(app_mrr)   AS apps,
  SUM(price_mrr) AS price
FROM ${decomp}
WHERE month = ${sqlStr(month)}
  AND movement_kind = ${sqlStr(movementKind)}`.trimEnd();
  }
  return `SELECT
  SUM(d.seat_mrr)  AS seats,
  SUM(d.app_mrr)   AS apps,
  SUM(d.price_mrr) AS price
FROM ${decomp} d
JOIN ${icm} c
  ON c.Month = d.month AND c.EntityRecordID = d.entity_record_id
WHERE d.month = ${sqlStr(month)}
  AND d.movement_kind = ${sqlStr(movementKind)}
${buildFilterClauses(filters, 'c')}`.trimEnd();
}

const ORDER_COL = { seats: 'seat_mrr', apps: 'app_mrr', price: 'price_mrr' };

// CohortAge is a DERIVED bucket (tenure since first paid invoice), not a column.
// Drilling an L3 account table by a cohort slice must reproduce the bucket's age
// range, not filter `AND CohortAge = '...'` (which 400s: no such column).
const COHORT_AGE_RANGE = { '0-3': [0, 3], '4-12': [4, 12], '13-24': [13, 24], '25+': [25, null] };
function cohortAgeClause(slice, ageExpr) {
  const r = COHORT_AGE_RANGE[slice];
  if (!r) return '';
  const [lo, hi] = r;
  return hi == null
    ? `  AND ${ageExpr} >= ${lo}\n`
    : `  AND ${ageExpr} BETWEEN ${lo} AND ${hi}\n`;
}

// Cohort age = TENURE AT CHURN, i.e. how long the customer actually paid:
// last active month − first paid month. NOT "months since signup to today" —
// that would add dead time for customers who churned long before the analysis
// month (esp. in the annual lens, where churn can be up to 12 months old).
//   firsts: true first paid month (Account.FirstSaaSInvoiceTxnDate, sentinel-NULLIF'd)
//   lasts:  last month with SaaS MRR (int_customer_mrr_lines)
// Aliases f (firsts) / l (lasts) join to the bridge view aliased c.
function cohortTenureCtes() {
  return `WITH firsts AS (
  SELECT EntityRecordID,
    DATE_TRUNC(MIN(NULLIF(FirstSaaSInvoiceTxnDate, DATE '0001-01-01')), MONTH) AS first_month
  FROM ${fqn('Account')}
  GROUP BY EntityRecordID
),
lasts AS (
  SELECT entity_record_id, MAX(month) AS last_month
  FROM ${fqn('int_customer_mrr_lines')}
  WHERE saas != 0
  GROUP BY entity_record_id
)`;
}
const COHORT_TENURE_EXPR = 'DATE_DIFF(l.last_month, f.first_month, MONTH)';

// ── Health tier (End-MRR "current book" drill) ───────────────────────────────
// Deduped per-account attributes. Account has ~1.22 rows per EntityRecordID, so
// joining it raw fans out the standing-book account list — MUST dedup. Carries
// HealthScore (0-100) and first paid month (for the tenure/cohort filter).
function accountAttrsCte() {
  return `accts AS (
  SELECT EntityRecordID,
    MAX(HealthScore) AS health_score,
    DATE_TRUNC(MIN(NULLIF(FirstSaaSInvoiceTxnDate, DATE '0001-01-01')), MONTH) AS first_month
  FROM ${fqn('Account')}
  GROUP BY EntityRecordID
)`;
}
// Tier bands match the scorecard heatmap: Critical <10 / Red 10-39 / Orange
// 40-54 / Yellow 55-69 / Green 70+ / No score (null). Alias `a` = accts CTE.
const HEALTH_TIER_CASE = `CASE
    WHEN a.health_score IS NULL THEN 'No score'
    WHEN a.health_score < 10 THEN 'Critical'
    WHEN a.health_score < 40 THEN 'Red'
    WHEN a.health_score < 55 THEN 'Orange'
    WHEN a.health_score < 70 THEN 'Yellow'
    ELSE 'Green' END`;
// Sort rank so tiers read Critical → Green, No score last.
const HEALTH_TIER_RANK = `CASE
    WHEN a.health_score IS NULL THEN 9
    WHEN a.health_score < 10 THEN 0
    WHEN a.health_score < 40 THEN 1
    WHEN a.health_score < 55 THEN 2
    WHEN a.health_score < 70 THEN 3
    ELSE 4 END`;
const HEALTH_TIER_BOUNDS = { Critical: [null, 10], Red: [10, 40], Orange: [40, 55], Yellow: [55, 70], Green: [70, null] };
// Reproduce a tier's score range when drilling its accounts (slice is a tier label).
function healthTierClause(slice, hsExpr) {
  if (slice === 'No score') return `  AND ${hsExpr} IS NULL\n`;
  const b = HEALTH_TIER_BOUNDS[slice];
  if (!b) return '';
  const [lo, hi] = b;
  const parts = [];
  if (lo != null) parts.push(`${hsExpr} >= ${lo}`);
  if (hi != null) parts.push(`${hsExpr} < ${hi}`);
  return parts.length ? `  AND ${parts.join(' AND ')}\n` : '';
}
// Optional tenure-cohort filter (e.g. 48 = 4yr+): months from first paid month
// to the analysis month. Empty when minAgeMonths <= 0.
function bookAgeClause(month, minAgeMonths) {
  return minAgeMonths > 0
    ? `  AND DATE_DIFF(DATE ${sqlStr(month)}, a.first_month, MONTH) >= ${Number(minAgeMonths)}\n`
    : '';
}

// Paid seats per account at `month` (billed UserPaidCount). Backs the End-MRR
// health × license heatmap and the Seats column on the book account list.
function seatsCte(month) {
  return `seatcount AS (
  SELECT EntityRecordID, MAX(IFNULL(UserPaidCount, 0)) AS seats
  FROM ${fqn('TransLineFlattened')}
  WHERE DATE_TRUNC(DATE(TxnDate), MONTH) = ${sqlStr(month)}
  GROUP BY EntityRecordID
)`;
}
// License bands. 10+ = >=10 (matches our standing seat-utilization convention,
// so '6-9' rather than the screenshot's overlapping '6-10'). Alias `s` = seatcount.
const LICENSE_BAND_CASE = `CASE
    WHEN s.seats >= 10 THEN '10+'
    WHEN s.seats >= 6 THEN '6-9'
    WHEN s.seats >= 4 THEN '4-5'
    WHEN s.seats >= 1 THEN CAST(s.seats AS STRING)
    ELSE '0' END`;
const LICENSE_BAND_RANK = `CASE
    WHEN s.seats >= 10 THEN 6
    WHEN s.seats >= 6 THEN 5
    WHEN s.seats >= 4 THEN 4
    WHEN s.seats = 3 THEN 3
    WHEN s.seats = 2 THEN 2
    WHEN s.seats = 1 THEN 1
    ELSE 0 END`;
const LICENSE_BAND_BOUNDS = { '1': [1, 1], '2': [2, 2], '3': [3, 3], '4-5': [4, 5], '6-9': [6, 9], '10+': [10, null] };
function licenseBandClause(band, seatsExpr) {
  const b = LICENSE_BAND_BOUNDS[band];
  if (!b) return '';
  const [lo, hi] = b;
  const parts = [];
  if (lo != null) parts.push(`${seatsExpr} >= ${lo}`);
  if (hi != null) parts.push(`${seatsExpr} <= ${hi}`);
  return parts.length ? `  AND ${parts.join(' AND ')}\n` : '';
}

export function buildAccountTableSql({ month, drill, dim, slice, filters = {}, bridgeView = 'int_customer_mrr', decompView = 'int_mrr_movement_decomposed', minAgeMonths = 0, licenseBand = null }) {
  const icm = fqn(bridgeView);
  const decomp = fqn(decompView);
  // End-MRR "current book" drill (drill key matches the End MRR bar): standing
  // accounts (end MRR > 0) at `month`, optionally sliced to a health tier (slice)
  // and/or a license band (licenseBand, from the heatmap cell) and/or a tenure
  // cohort, riskiest first.
  if (drill === 'end') {
    return `WITH ${accountAttrsCte()},
${seatsCte(month)}
SELECT
  c.EntityRecordID AS entity_record_id,
  c.Company, c.Segment, c.UserTier,
  c.p2_saas AS deltaMrr,
  a.health_score,
  IFNULL(s.seats, 0) AS seats,
  DATE_DIFF(DATE ${sqlStr(month)}, a.first_month, MONTH) AS age_mo
FROM ${icm} c
JOIN accts a ON a.EntityRecordID = c.EntityRecordID
LEFT JOIN seatcount s ON s.EntityRecordID = c.EntityRecordID
WHERE c.Month = ${sqlStr(month)}
  AND c.p2_saas > 0
${bookAgeClause(month, minAgeMonths)}${slice ? healthTierClause(slice, 'a.health_score') : ''}${licenseBand ? licenseBandClause(licenseBand, 's.seats') : ''}${buildFilterClauses(filters, 'c')}
ORDER BY a.health_score IS NULL, a.health_score ASC, c.p2_saas DESC
LIMIT 50`.trimEnd();
  }
  if (drill === 'expansion' || drill === 'downgrade') {
    const orderCol = ORDER_COL[slice] || 'seat_mrr';
    return `SELECT
  d.entity_record_id,
  c.Company, c.Segment, c.UserTier,
  (d.p2_saas - d.p1_saas) AS deltaMrr,
  d.seat_mrr, d.app_mrr, d.price_mrr
FROM ${decomp} d
JOIN ${icm} c
  ON c.Month = d.month AND c.EntityRecordID = d.entity_record_id
WHERE d.month = ${sqlStr(month)}
  AND d.movement_kind = ${sqlStr(drill)}
${buildFilterClauses(filters, 'c')}
ORDER BY ABS(d.${orderCol}) DESC
LIMIT 50`.trimEnd();
  }
  // new / churn — straight from int_customer_mrr
  const measure = drill === 'new' ? 'NewMRR' : 'Cancellations';
  // CohortAge slice: derived from FirstSaaSInvoiceTxnDate tenure (no such column),
  // so join the firsts CTE and filter by the bucket's age range.
  if (dim === 'CohortAge') {
    return `${cohortTenureCtes()}
SELECT
  c.EntityRecordID AS entity_record_id,
  c.Company, c.Segment, c.UserTier, c.AttributionChannel,
  c.${measure} AS deltaMrr
FROM ${icm} c
JOIN firsts f ON f.EntityRecordID = c.EntityRecordID
JOIN lasts  l ON l.entity_record_id = c.EntityRecordID
WHERE c.Month = ${sqlStr(month)}
  AND c.${measure} > 0
${cohortAgeClause(slice, COHORT_TENURE_EXPR)}${buildFilterClauses(filters, 'c')}
ORDER BY c.${measure} DESC
LIMIT 50`.trimEnd();
  }
  const sliceClause = dim && slice ? `  AND ${dim} = ${sqlStr(slice)}\n` : '';
  return `SELECT
  EntityRecordID AS entity_record_id,
  Company, Segment, UserTier, AttributionChannel,
  ${measure} AS deltaMrr
FROM ${icm}
WHERE Month = ${sqlStr(month)}
  AND ${measure} > 0
${sliceClause}${buildFilterClauses(filters)}
ORDER BY ${measure} DESC
LIMIT 50`.trimEnd();
}

export function buildCohortAgeChurnSql({ month, filters = {}, bridgeView = 'int_customer_mrr' }) {
  const icm = fqn(bridgeView);
  const age = COHORT_TENURE_EXPR;
  // Bucket churned MRR by tenure at churn (see cohortTenureCtes). ORDER BY the
  // bucket's minimum tenure so buckets read 0-3 → 4-12 → 13-24 → 25+ (not lexically).
  return `${cohortTenureCtes()}
SELECT
  CASE
    WHEN ${age} <= 3  THEN '0-3'
    WHEN ${age} <= 12 THEN '4-12'
    WHEN ${age} <= 24 THEN '13-24'
    ELSE '25+'
  END AS bucket,
  SUM(c.Cancellations) AS value
FROM ${icm} c
JOIN firsts f ON f.EntityRecordID = c.EntityRecordID
JOIN lasts  l ON l.entity_record_id = c.EntityRecordID
WHERE c.Month = ${sqlStr(month)}
  AND c.Cancellations > 0
${buildFilterClauses(filters, 'c')}
GROUP BY bucket
ORDER BY MIN(${age})`.trimEnd();
}

// L2 for the End-MRR "current book" drill: standing accounts (end MRR > 0) at
// `month`, split by health tier with both MRR and account count. `minAgeMonths`
// scopes to a tenure cohort (48 = 4yr+). Deduped Account join (accountAttrsCte).
export function buildBookSplitSql({ month, filters = {}, bridgeView = 'int_customer_mrr', minAgeMonths = 0 }) {
  const icm = fqn(bridgeView);
  return `WITH ${accountAttrsCte()}
SELECT
  ${HEALTH_TIER_CASE} AS bucket,
  SUM(c.p2_saas) AS value,
  COUNT(*) AS accounts
FROM ${icm} c
JOIN accts a ON a.EntityRecordID = c.EntityRecordID
WHERE c.Month = ${sqlStr(month)}
  AND c.p2_saas > 0
${bookAgeClause(month, minAgeMonths)}${buildFilterClauses(filters, 'c')}
GROUP BY bucket, ${HEALTH_TIER_RANK}
ORDER BY ${HEALTH_TIER_RANK}`.trimEnd();
}

// L2 for the End-MRR drill, 2-D heatmap form: current book split by health tier
// (rows) × license band (cols), each cell carrying account count + MRR. Click a
// cell → its accounts (buildAccountTableSql with both slice + licenseBand).
export function buildBookHeatmapSql({ month, filters = {}, bridgeView = 'int_customer_mrr', minAgeMonths = 0 }) {
  const icm = fqn(bridgeView);
  return `WITH ${accountAttrsCte()},
${seatsCte(month)}
SELECT
  ${HEALTH_TIER_CASE} AS tier,
  ${LICENSE_BAND_CASE} AS license_band,
  COUNT(*) AS accounts,
  SUM(c.p2_saas) AS mrr
FROM ${icm} c
JOIN accts a ON a.EntityRecordID = c.EntityRecordID
LEFT JOIN seatcount s ON s.EntityRecordID = c.EntityRecordID
WHERE c.Month = ${sqlStr(month)}
  AND c.p2_saas > 0
${bookAgeClause(month, minAgeMonths)}${buildFilterClauses(filters, 'c')}
GROUP BY tier, license_band, ${HEALTH_TIER_RANK}, ${LICENSE_BAND_RANK}
ORDER BY ${HEALTH_TIER_RANK}, ${LICENSE_BAND_RANK}`.trimEnd();
}

// Distinct values per filter dimension, scoped to recent months for relevance.
// `dims` are trusted config identifiers (column names on int_customer_mrr), so
// they're interpolated directly — both as the 'dim' literal label and as the
// CAST(... AS STRING) column reference (STRING cast handles BOOL dims like HasDEP).
export function buildDistinctValuesSql({ dims, months = 24, bridgeView = 'int_customer_mrr' }) {
  const icm = fqn(bridgeView);
  const window = `Month >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL ${Number(months)} MONTH)`;
  const parts = dims.map((d) => `SELECT '${d}' AS dim, CAST(${d} AS STRING) AS val
FROM ${icm}
WHERE ${window} AND ${d} IS NOT NULL AND CAST(${d} AS STRING) != ''
GROUP BY val`);
  return `${parts.join('\nUNION ALL\n')}
ORDER BY dim, val`;
}

// Per-account monthly MRR / licenses / apps history (full timeline) for the detail
// view. entityRecordId is a trusted numeric from the L3 row — coerced via
// Number() and interpolated as a number (no quotes), which also neutralizes any
// injection attempt (Number('100037; DROP') === 100037).
export function buildAccountHistorySql({ entityRecordId }) {
  const id = parseInt(entityRecordId, 10);
  return `SELECT
  month,
  ROUND(SUM(saas), 2) AS mrr,
  MAX(user_paid_count) AS licenses,
  COUNT(DISTINCT CASE WHEN NOT is_discount AND saas != 0 THEN item END) AS apps
FROM \`project-for-method-dw.revenue.int_customer_mrr_lines\`
WHERE entity_record_id = ${id}
GROUP BY month
ORDER BY month`;
}

// Lifecycle milestone dates for one account, aggregated from the Account source.
export function buildAccountLifecycleSql({ entityRecordId }) {
  const id = parseInt(entityRecordId, 10);
  // NULLIF the '0001-01-01' sentinel (Method's no-date marker) so MIN doesn't
  // grab it from never-invoiced sub-accounts. One entity can have many
  // CompanyAccounts (e.g. backup/restore "...restoreYYYYMMDD" rows); MIN over
  // real dates gives the entity's true founding events. No cancellation marker:
  // MAX(CancellationDate) across sub-accounts is unreliable (restore accounts
  // cancel while the customer is live); the MRR line already shows when revenue stops.
  return `SELECT
  MIN(NULLIF(SignUpDate, DATE '0001-01-01')) AS signup,
  MIN(NULLIF(CustDatFirstSyncCompleted, DATE '0001-01-01')) AS first_sync,
  MIN(NULLIF(FirstSaaSInvoiceTxnDate, DATE '0001-01-01')) AS first_invoice
FROM \`project-for-method-dw.revenue.Account\`
WHERE EntityRecordID = ${id}`;
}

// Recent activities for one account (calls, emails, summaries). Comments is raw
// HTML, capped to 4 KB to bound payload; the UI strips tags for display.
// entityRecordId coerced to a number (injection-safe, cf. buildAccountHistorySql).
export function buildAccountActivitiesSql({ entityRecordId, limit = 40 }) {
  const id = parseInt(entityRecordId, 10);
  const n = parseInt(limit, 10) || 40;
  return `SELECT
  RecordID AS record_id,
  ActivityType AS activity_type,
  CAST(DueDateStart AS STRING) AS date,
  SUBSTR(Comments, 1, 4000) AS body
FROM \`project-for-method-dw.revenue.Activity\`
WHERE EntityRecordID = ${id}
  AND COALESCE(IsDeleted, FALSE) = FALSE
  AND DueDateStart IS NOT NULL
  AND DueDateStart <= CURRENT_DATE()
ORDER BY DueDateStart DESC
LIMIT ${n}`;
}

// Support cases for one account. Description capped to 4 KB; UI strips tags.
export function buildAccountCasesSql({ entityRecordId, limit = 40 }) {
  const id = parseInt(entityRecordId, 10);
  const n = parseInt(limit, 10) || 40;
  return `SELECT
  RecordID AS record_id,
  COALESCE(NULLIF(Subject, ''), CaseSubject) AS subject,
  CaseStatus AS status,
  CaseCategory AS category,
  CAST(DATE(CreatedDate) AS STRING) AS date,
  CAST(DATE(ClosedDate) AS STRING) AS closed,
  SUBSTR(Description, 1, 4000) AS body
FROM \`project-for-method-dw.revenue.Cases\`
WHERE EntityRecordID = ${id}
  AND COALESCE(IsDeleted, FALSE) = FALSE
ORDER BY CreatedDate DESC
LIMIT ${n}`;
}
