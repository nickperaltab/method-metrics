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
// Seats per account at `month` — for the Seats column on the book account list
// (the heatmap's size axis is MRR, not seats; see MRR_BAND_CASE).
function seatsCte(month) {
  return `seatcount AS (
  SELECT EntityRecordID, MAX(IFNULL(UserPaidCount, 0)) AS seats
  FROM ${fqn('TransLineFlattened')}
  WHERE DATE_TRUNC(DATE(TxnDate), MONTH) = ${sqlStr(month)}
  GROUP BY EntityRecordID
)`;
}
// MRR-size bands — the account's own SaaS MRR at the anchor month (`c.p2_saas`).
// The grid's second axis: where the dollars concentrate (vs health, the risk axis).
// Bands chosen from the size distribution: <$100 / $100-300 / $300-1k / $1k+.
const MRR_BAND_CASE = `CASE
    WHEN c.p2_saas >= 1000 THEN '$1k+'
    WHEN c.p2_saas >= 300 THEN '$300-1k'
    WHEN c.p2_saas >= 100 THEN '$100-300'
    ELSE '<$100' END`;
const MRR_BAND_RANK = `CASE
    WHEN c.p2_saas >= 1000 THEN 4
    WHEN c.p2_saas >= 300 THEN 3
    WHEN c.p2_saas >= 100 THEN 2
    ELSE 1 END`;
const MRR_BAND_BOUNDS = { '<$100': [null, 100], '$100-300': [100, 300], '$300-1k': [300, 1000], '$1k+': [1000, null] };
function mrrBandClause(band, mrrExpr) {
  const b = MRR_BAND_BOUNDS[band];
  if (!b) return '';
  const [lo, hi] = b;
  const parts = [];
  if (lo != null) parts.push(`${mrrExpr} >= ${lo}`);
  if (hi != null) parts.push(`${mrrExpr} < ${hi}`);
  return parts.length ? `  AND ${parts.join(' AND ')}\n` : '';
}

// "Untouched cohort" exclusions for the book views. PS = ever bought paid
// professional services (the Paid help tier, NOT DEP — that's separate).
// DEP uses the HasDEP column on the bridge view. Each returns SQL fragments
// the four book builders splice in: a CTE, a join, and WHERE clauses.
function psExcludeCte(excludePS) {
  return excludePS
    ? `,\nps_accts AS (
  SELECT DISTINCT EntityRecordID
  FROM ${fqn('TransLineFlattened')}
  WHERE Amount > 0
    AND REGEXP_CONTAINS(ItemFullName, r'Premium App Configuration|Offline Consulting Services|Customization:Meetings|Pro Services:Meetings')
)`
    : '';
}
function psExcludeJoin(excludePS) {
  return excludePS ? `LEFT JOIN ps_accts pe ON pe.EntityRecordID = c.EntityRecordID\n` : '';
}
function cohortExcludeClause(excludePS, excludeDEP) {
  let s = '';
  if (excludePS) s += `  AND pe.EntityRecordID IS NULL\n`;
  if (excludeDEP) s += `  AND c.HasDEP = FALSE\n`;
  return s;
}

export function buildAccountTableSql({ month, drill, dim, slice, filters = {}, bridgeView = 'int_customer_mrr', decompView = 'int_mrr_movement_decomposed', minAgeMonths = 0, sizeBand = null, excludePS = false, excludeDEP = false }) {
  const icm = fqn(bridgeView);
  const decomp = fqn(decompView);
  // End-MRR "current book" drill (drill key matches the End MRR bar): standing
  // accounts (end MRR > 0) at `month`, optionally sliced to a health tier (slice)
  // and/or an MRR-size band (sizeBand, from the heatmap cell), riskiest first.
  if (drill === 'end') {
    return `WITH ${accountAttrsCte()},
${seatsCte(month)},
prior AS (
  SELECT EntityRecordID, p2_saas AS prior_mrr
  FROM ${icm}
  WHERE Month = DATE_SUB(DATE ${sqlStr(month)}, INTERVAL 6 MONTH) AND p2_saas > 0
),
-- Projected prepay run-out, reconstructed from the prepayment-liability ledger
-- (no contractual ExpiresDate in BQ). balance ÷ burn, where burn = the ACTUAL
-- recent monthly drawdown (median of the last 3 months) — so it covers whatever
-- the prepay funds (SaaS + DEP + PS), NOT just SaaS MRR (which mis-estimates the
-- ~135 DEP accounts, whose draw ≈ half their SaaS MRR). Median + recent window
-- avoids both regime-smear (a recently-expanded account) and one-time adjustment
-- spikes. Capped at 36 mo.
pp_bal AS (
  SELECT EntityRecordID, ROUND(SUM(Amount)) AS cur_balance
  FROM ${fqn('TransLineFlattened')}
  WHERE AccountFullName IN ('US-Client Prepayments', 'CAN-Client Prepayments')
    AND TxnDate < DATE_ADD(DATE ${sqlStr(month)}, INTERVAL 1 MONTH)
  GROUP BY EntityRecordID
  HAVING SUM(Amount) > 100
),
pp_md AS (
  SELECT EntityRecordID, DATE_TRUNC(TxnDate, MONTH) AS mo, SUM(-Amount) AS mo_draw
  FROM ${fqn('TransLineFlattened')}
  WHERE AccountFullName IN ('US-Client Prepayments', 'CAN-Client Prepayments')
    AND Qty = 1 AND Amount < 0 AND TxnDate < DATE_ADD(DATE ${sqlStr(month)}, INTERVAL 1 MONTH)
  GROUP BY EntityRecordID, mo
),
pp_burn AS (
  SELECT EntityRecordID, APPROX_QUANTILES(mo_draw, 2)[OFFSET(1)] AS burn
  FROM (SELECT EntityRecordID, mo_draw, ROW_NUMBER() OVER (PARTITION BY EntityRecordID ORDER BY mo DESC) AS rn FROM pp_md)
  WHERE rn <= 3 GROUP BY EntityRecordID
),
prepay AS (
  SELECT b.EntityRecordID,
    DATE_ADD(DATE ${sqlStr(month)}, INTERVAL LEAST(GREATEST(CAST(CEIL(b.cur_balance / x.burn) AS INT64), 1), 36) MONTH) AS prepay_expires,
    b.cur_balance AS prepay_balance
  FROM pp_bal b JOIN pp_burn x USING (EntityRecordID)
  WHERE x.burn > 0
)${psExcludeCte(excludePS)}
SELECT
  c.EntityRecordID AS entity_record_id,
  c.Company, c.Segment, c.UserTier,
  c.p2_saas AS deltaMrr,
  a.health_score,
  IFNULL(s.seats, 0) AS seats,
  ROUND(c.p2_saas - p.prior_mrr, 0) AS trend6,
  DATE_DIFF(DATE ${sqlStr(month)}, a.first_month, MONTH) AS age_mo,
  pp.prepay_expires,
  pp.prepay_balance
FROM ${icm} c
JOIN accts a ON a.EntityRecordID = c.EntityRecordID
LEFT JOIN seatcount s ON s.EntityRecordID = c.EntityRecordID
LEFT JOIN prior p ON p.EntityRecordID = c.EntityRecordID
LEFT JOIN prepay pp ON pp.EntityRecordID = c.EntityRecordID
${psExcludeJoin(excludePS)}WHERE c.Month = ${sqlStr(month)}
  AND c.p2_saas > 0
${bookAgeClause(month, minAgeMonths)}${slice ? healthTierClause(slice, 'a.health_score') : ''}${sizeBand ? mrrBandClause(sizeBand, 'c.p2_saas') : ''}${cohortExcludeClause(excludePS, excludeDEP)}${buildFilterClauses(filters, 'c')}
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
// (rows) × MRR-size band (cols), each cell carrying account count + MRR. Click a
// cell → its accounts (buildAccountTableSql with both slice + sizeBand).
export function buildBookHeatmapSql({ month, filters = {}, bridgeView = 'int_customer_mrr', minAgeMonths = 0, excludePS = false, excludeDEP = false }) {
  const icm = fqn(bridgeView);
  return `WITH ${accountAttrsCte()}${psExcludeCte(excludePS)}
SELECT
  ${HEALTH_TIER_CASE} AS tier,
  ${MRR_BAND_CASE} AS mrr_band,
  COUNT(*) AS accounts,
  SUM(c.p2_saas) AS mrr
FROM ${icm} c
JOIN accts a ON a.EntityRecordID = c.EntityRecordID
${psExcludeJoin(excludePS)}WHERE c.Month = ${sqlStr(month)}
  AND c.p2_saas > 0
${bookAgeClause(month, minAgeMonths)}${cohortExcludeClause(excludePS, excludeDEP)}${buildFilterClauses(filters, 'c')}
GROUP BY tier, mrr_band, ${HEALTH_TIER_RANK}, ${MRR_BAND_RANK}
ORDER BY ${HEALTH_TIER_RANK}, ${MRR_BAND_RANK}`.trimEnd();
}

// Trailing-12-month churn rate by health tier — the correlation shown on the
// heatmap. Cohort = accounts paying 12 months before `month`; churned if not
// paying at `month`. Health tier is the current Account snapshot (HealthScore
// isn't historized), so read it as "tier today × survived the last year" — a
// stable correlation, not a forward forecast. Same tiers as the heatmap rows.
export function buildHealthChurnBenchmarkSql({ month, filters = {}, bridgeView = 'int_customer_mrr', minAgeMonths = 0, excludePS = false, excludeDEP = false }) {
  const icm = fqn(bridgeView);
  return `WITH ${accountAttrsCte()},
kept AS (
  SELECT EntityRecordID FROM ${icm}
  WHERE Month = ${sqlStr(month)} AND p2_saas > 0
)${psExcludeCte(excludePS)}
SELECT
  ${HEALTH_TIER_CASE} AS tier,
  COUNT(*) AS n,
  ROUND(100 * COUNTIF(k.EntityRecordID IS NULL) / COUNT(*), 1) AS churn_pct
FROM ${icm} c
JOIN accts a ON a.EntityRecordID = c.EntityRecordID
LEFT JOIN kept k ON k.EntityRecordID = c.EntityRecordID
${psExcludeJoin(excludePS)}WHERE c.Month = DATE_SUB(DATE ${sqlStr(month)}, INTERVAL 12 MONTH)
  AND c.p2_saas > 0
${bookAgeClause(month, minAgeMonths)}${cohortExcludeClause(excludePS, excludeDEP)}${buildFilterClauses(filters, 'c')}
GROUP BY tier, ${HEALTH_TIER_RANK}
ORDER BY ${HEALTH_TIER_RANK}`.trimEnd();
}

// Predictor diagnostic: trailing-year MRR churn by tenure band × health band.
// Shows which signal separates churn better (health dominates; tenure adds a
// smaller, mostly-within-unhealthy effect). Cohort = accounts paying 12 months
// before `month`; churned if not paying at `month`. MRR-weighted churn = start
// MRR of churned ÷ start MRR. Tenure is measured at the anchor (clean point-in-
// time); health is the current snapshot (correlation, not forecast).
// Gross retention loss = full MRR of churned accounts + the shed delta of
// survivors who downgraded (expansion is NOT netted — this is bleeding, not net).
const GROSS_LOSS = 'SUM(GREATEST(c.p2_saas - IFNULL(k.end_mrr, 0), 0))';

export function buildPredictorGridSql({ month, filters = {}, bridgeView = 'int_customer_mrr', minAgeMonths = 0, excludePS = false, excludeDEP = false }) {
  const icm = fqn(bridgeView);
  const anchorTenure = `DATE_DIFF(DATE_SUB(DATE ${sqlStr(month)}, INTERVAL 12 MONTH), a.first_month, MONTH)`;
  return `WITH ${accountAttrsCte()},
kept AS (SELECT EntityRecordID, p2_saas AS end_mrr FROM ${icm} WHERE Month = ${sqlStr(month)} AND p2_saas > 0)${psExcludeCte(excludePS)}
SELECT
  CASE WHEN ${anchorTenure} <= 11 THEN '<1yr'
       WHEN ${anchorTenure} <= 35 THEN '1-2yr'
       ELSE '3yr+' END AS tenure_band,
  CASE WHEN a.health_score IS NULL THEN 'No score'
       WHEN a.health_score < 30 THEN '<30'
       WHEN a.health_score < 50 THEN '30-49'
       WHEN a.health_score < 70 THEN '50-69'
       ELSE '70+' END AS health_band,
  COUNT(*) AS n,
  ROUND(${GROSS_LOSS}, 0) AS lost_mrr,
  ROUND(100 * ${GROSS_LOSS} / NULLIF(SUM(c.p2_saas), 0), 1) AS loss_pct
FROM ${icm} c
JOIN accts a ON a.EntityRecordID = c.EntityRecordID
LEFT JOIN kept k ON k.EntityRecordID = c.EntityRecordID
${psExcludeJoin(excludePS)}WHERE c.Month = DATE_SUB(DATE ${sqlStr(month)}, INTERVAL 12 MONTH)
  AND c.p2_saas > 0
${bookAgeClause(month, minAgeMonths)}${cohortExcludeClause(excludePS, excludeDEP)}${buildFilterClauses(filters, 'c')}
GROUP BY tenure_band, health_band
ORDER BY tenure_band, health_band`.trimEnd();
}

// Tenure / coarse-health band clauses for drilling a predictor-grid cell.
function predictorTenureClause(band, ageExpr) {
  if (band === '<1yr') return `  AND ${ageExpr} <= 11\n`;
  if (band === '1-2yr') return `  AND ${ageExpr} BETWEEN 12 AND 35\n`;
  if (band === '3yr+') return `  AND ${ageExpr} >= 36\n`;
  return '';
}
function healthCoarseClause(band, hsExpr) {
  if (band === 'No score') return `  AND ${hsExpr} IS NULL\n`;
  if (band === '<30') return `  AND ${hsExpr} < 30\n`;
  if (band === '30-49') return `  AND ${hsExpr} >= 30 AND ${hsExpr} < 50\n`;
  if (band === '50-69') return `  AND ${hsExpr} >= 50 AND ${hsExpr} < 70\n`;
  if (band === '70+') return `  AND ${hsExpr} >= 70\n`;
  return '';
}

// Accounts behind a predictor-grid cell: the trailing-year cohort (paying 12mo
// before `month`) in a tenure × health band, with what happened to each — MRR a
// year ago, MRR now, $ lost, and outcome (Churned / Downgraded / Held-Grew),
// ordered by $ lost so the biggest bleeders surface first.
export function buildPredictorAccountsSql({ month, tenureBand, healthBand, filters = {}, bridgeView = 'int_customer_mrr', excludePS = false, excludeDEP = false }) {
  const icm = fqn(bridgeView);
  const anchorTenure = `DATE_DIFF(DATE_SUB(DATE ${sqlStr(month)}, INTERVAL 12 MONTH), a.first_month, MONTH)`;
  return `WITH ${accountAttrsCte()},
nowmrr AS (SELECT EntityRecordID, p2_saas AS end_mrr FROM ${icm} WHERE Month = ${sqlStr(month)} AND p2_saas > 0)${psExcludeCte(excludePS)}
SELECT
  c.EntityRecordID AS entity_record_id,
  c.Company, c.Segment, c.UserTier,
  ROUND(c.p2_saas, 0) AS start_mrr,
  ROUND(IFNULL(n.end_mrr, 0), 0) AS end_mrr,
  ROUND(GREATEST(c.p2_saas - IFNULL(n.end_mrr, 0), 0), 0) AS lost_mrr,
  CASE WHEN n.EntityRecordID IS NULL THEN 'Churned'
       WHEN n.end_mrr < c.p2_saas THEN 'Downgraded'
       ELSE 'Held/Grew' END AS outcome,
  a.health_score
FROM ${icm} c
JOIN accts a ON a.EntityRecordID = c.EntityRecordID
LEFT JOIN nowmrr n ON n.EntityRecordID = c.EntityRecordID
${psExcludeJoin(excludePS)}WHERE c.Month = DATE_SUB(DATE ${sqlStr(month)}, INTERVAL 12 MONTH)
  AND c.p2_saas > 0
${predictorTenureClause(tenureBand, anchorTenure)}${healthCoarseClause(healthBand, 'a.health_score')}${cohortExcludeClause(excludePS, excludeDEP)}${buildFilterClauses(filters, 'c')}
ORDER BY lost_mrr DESC, c.p2_saas DESC
LIMIT 50`.trimEnd();
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
