import { validateIdentifier, validateInt, escapeBqString } from './sanitize.js';
import { buildEndDateClause, buildSemanticSql } from './sql/semantic.js';
import { MOCK_MODE } from '../dev/mockMode.js';
import { mockQueryBq } from '../dev/mockBq.js';

// Re-export pure SQL builders for backwards compat with existing imports.
export {
  wrapChartSql,
  buildBatchSql,
  splitBatchResults,
  buildSemanticSql,
  buildSemanticGroupedSql,
  buildEndDateClause,
  buildViewAggSql,
} from './sql/index.js';

const BQ_CLIENT_ID = '546732685010-nojjfak7esmun2taour8r5pakrsrg3aq.apps.googleusercontent.com';
const BQ_PROJECT = 'project-for-method-dw';
const BQ_DATASET = 'revenue';

const BQ_SCOPES = [
  'https://www.googleapis.com/auth/bigquery',
  'https://www.googleapis.com/auth/userinfo.email',
];
// Read-only calendar, requested on top of the BQ scopes so the call-prep week
// strip can show clock times.
//
// `calendar.readonly` rather than the narrower `calendar.events.readonly`
// because the strip also lists which calendars you're subscribed to, so a rep's
// book can show that rep's calendar. calendarList.list is not covered by the
// events-only scope. Still read-only — nothing here writes to a calendar.
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

let bqToken = localStorage.getItem('bq_access_token');

export function getBqToken() {
  // Offline UI mode has no OAuth token; hand back a sentinel so `if (!token)`
  // guards elsewhere don't render a "connect BigQuery" state over the fixtures.
  if (MOCK_MODE) return 'mock-token';
  return bqToken;
}

/** For unit tests only — restores the token without OAuth flow. */
export function _setBqToken(token) {
  bqToken = token;
}

export async function initBqAuth(onSuccess, onFail) {
  const stored = localStorage.getItem('bq_access_token');
  if (!stored) { onFail?.(); return; }

  // Validate the stored token against BigQuery's /queries endpoint (same path
  // that queryBq uses — it's the only BQ endpoint with browser CORS support).
  // userinfo is too lenient and accepts partially-stale tokens, leaving the app
  // showing "BQ Connected" while BQ itself returns 401 on the first real query.
  try {
    const res = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${BQ_PROJECT}/queries`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${stored}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'SELECT 1', useLegacySql: false }),
      }
    );
    if (res.ok) {
      bqToken = stored;
      onSuccess?.(stored);
    } else {
      // Surface WHY the token was rejected so the user can tell expired vs
      // revoked vs missing scope vs project-permission apart.
      let reason = `BQ validation failed (${res.status})`;
      try {
        const body = await res.json();
        const msg = body?.error?.message;
        if (msg) reason += `: ${msg}`;
      } catch {}
      console.warn('[bq-auth]', reason);
      localStorage.removeItem('bq_access_token');
      bqToken = null;
      onFail?.(reason);
    }
  } catch (e) {
    console.warn('[bq-auth] network error validating token:', e);
    localStorage.removeItem('bq_access_token');
    bqToken = null;
    onFail?.(e?.message || 'Network error');
  }
}

function requestToken(scopes, onSuccess) {
  if (!window.google?.accounts?.oauth2) return;
  google.accounts.oauth2.initTokenClient({
    client_id: BQ_CLIENT_ID,
    scope: scopes.join(' '),
    prompt: '',
    callback: (r) => {
      if (r.access_token) {
        bqToken = r.access_token;
        localStorage.setItem('bq_access_token', bqToken);
        onSuccess?.(bqToken);
      }
    },
  }).requestAccessToken();
}

export function connectBq(onSuccess) {
  requestToken([...BQ_SCOPES, CALENDAR_SCOPE], onSuccess);
}

/**
 * Re-request the same token with the calendar scope added.
 *
 * Tokens minted before the calendar scope existed still pass the BigQuery
 * validation in initBqAuth, so those users stay signed in and only discover the
 * gap when a calendar call 403s. This upgrades that token in place — same
 * storage key, one combined token — rather than making everyone reconnect.
 */
export function connectCalendar(onSuccess) {
  requestToken([...BQ_SCOPES, CALENDAR_SCOPE], onSuccess);
}

export function disconnectBq() {
  bqToken = null;
  localStorage.removeItem('bq_access_token');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('bq:disconnect'));
  }
}

function cleanSql(sql) {
  return sql
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2260/g, '!=')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=');
}

// Session-scoped SQL → result cache. Keyed by the exact SQL string, stores the
// in-flight promise so two identical concurrent queries dedupe to one network
// call. Successful results stay cached for the session (a page reload clears it,
// which is the natural refresh); rejected promises are evicted so failures retry.
const queryCache = new Map();

export function clearQueryCache() {
  queryCache.clear();
}

export async function queryBq(sql) {
  // Offline UI mode: serve fixtures instead of BigQuery. Deliberately outside
  // the cache so every render pays the fake latency and loading states stay
  // visible while designing. Dev-only — see src/dev/mockMode.js.
  if (MOCK_MODE) return mockQueryBq(sql);
  if (!bqToken) throw new Error('Not connected to BigQuery');
  const key = cleanSql(sql);
  const cached = queryCache.get(key);
  if (cached) return cached;
  const promise = runQueryBq(sql);
  queryCache.set(key, promise);
  // Evict failures so the next call retries instead of replaying the rejection.
  // Also evict empty results — an empty row set can come from transient BQ rate
  // limiting (same rationale as aggCache), so we don't want to pin it.
  promise.then(
    (r) => { if (!r.rows.length && queryCache.get(key) === promise) queryCache.delete(key); },
    () => { if (queryCache.get(key) === promise) queryCache.delete(key); },
  );
  return promise;
}

async function runQueryBq(sql) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
  let res;
  try {
    res = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${BQ_PROJECT}/queries`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${bqToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanSql(sql), useLegacySql: false, maxResults: 10000 }),
        signal: controller.signal,
      }
    );
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') throw new Error('BigQuery query timed out (30s). Try a narrower time range.');
    throw e;
  }
  clearTimeout(timeoutId);
  if (!res.ok) {
    if (res.status === 401) {
      disconnectBq();
      throw new Error('BQ session expired — please reconnect');
    }
    // Pull the specific message out of the error body so 403 / quota /
    // invalid-table / etc. are debuggable from the console.
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message ? `: ${body.error.message}` : '';
    } catch {}
    console.error(`[bq] ${res.status}${detail}`, { sql });
    throw new Error(`BQ ${res.status}${detail}`);
  }
  const data = await res.json();
  if (!data.rows) return { rows: [], schema: data.schema?.fields || [] };
  const fields = data.schema.fields;
  const rows = data.rows.map(r => {
    const o = {};
    fields.forEach((f, i) => { o[f.name] = r.f[i].v; });
    return o;
  });
  return { rows, schema: fields };
}

/**
 * queryBq wrapper with retry for transient BQ failures.
 * Retries on: BQ 400, BQ 429, timeout messages.
 * Does NOT retry: 401 (auth), unknown errors (likely SQL bugs).
 */
export async function queryBqWithRetry(sql, { maxRetries = 2, retryOnEmpty = false, baseDelay = 500 } = {}) {
  const RETRYABLE = /BQ 4(00|29)|timed out/;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await queryBq(sql);
      if (retryOnEmpty && result.rows.length === 0 && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        continue;
      }
      return result;
    } catch (e) {
      lastError = e;
      if (!RETRYABLE.test(e.message) || attempt >= maxRetries) throw e;
      await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

export const ATT_COL_MAP = {
  SEO: 'Att_SEO', PPC: 'Att_Pay_Per_Click', OPN: 'Att_OPN_Other_Peoples_Networks',
  Social: 'Att_Social', Email: 'Att_Email', Referral: 'Att_Referral_Link',
  Direct: 'Att_Direct', Partners: 'Att_Partners', Content: 'Att_Content',
  Remarketing: 'Att_Remarketing', Other: 'Att_Other', None: 'Att_None',
};

const viewCache = {};

export async function fetchViewData(viewName) {
  validateIdentifier(viewName, 'viewName');
  if (viewCache[viewName]) return viewCache[viewName];
  const sql = `SELECT * FROM \`${BQ_PROJECT}.${BQ_DATASET}.${viewName}\` LIMIT 10000`;
  const result = await queryBq(sql);
  viewCache[viewName] = result;
  return result;
}

/**
 * Fetch the live queried window (period / elapsed_days / days_in_month) for
 * the Method Monday scorecard from `int_method_monday` — the same
 * complete-days figures every trajectory on that page divides by (see
 * models/intermediate/int_method_monday.sql). A direct view read, not a
 * registered metric: these are supporting figures for a header label, not
 * a business metric a user would look up by id.
 *
 * BQ's REST API returns every field as a string; elapsed_days and
 * days_in_month are coerced to Number here so callers get real numbers.
 * Returns null when the view has no rows (should not happen — the model
 * guarantees exactly one row — but this keeps the header from throwing if
 * it ever does).
 */
export async function fetchMethodMondayWindow() {
  const { rows } = await fetchViewData('int_method_monday');
  if (!rows.length) return null;
  const row = rows[0];
  return {
    period: row.period,
    elapsedDays: Number(row.elapsed_days),
    daysInMonth: Number(row.days_in_month),
  };
}

export function clearViewCache() {
  Object.keys(viewCache).forEach(k => delete viewCache[k]);
}

const viewDefCache = new Map();

export function clearViewDefCache() {
  viewDefCache.clear();
}

/**
 * Fetch a view's DDL live from INFORMATION_SCHEMA. Returns a CREATE OR REPLACE
 * VIEW statement so the displayed shape matches knowledge/verified-queries.
 * Returns null when the view does not exist in the dataset.
 */
export async function fetchViewDefinition(viewName) {
  validateIdentifier(viewName, 'viewName');
  if (viewDefCache.has(viewName)) return viewDefCache.get(viewName);
  const sql = `
    SELECT view_definition
    FROM \`${BQ_PROJECT}.${BQ_DATASET}.INFORMATION_SCHEMA.VIEWS\`
    WHERE table_name = '${escapeBqString(viewName)}'
  `;
  const result = await queryBq(sql);
  if (!result.rows.length) {
    viewDefCache.set(viewName, null);
    return null;
  }
  const body = result.rows[0].view_definition;
  const ddl = `CREATE OR REPLACE VIEW \`${BQ_PROJECT}.${BQ_DATASET}.${viewName}\` AS\n${body}`;
  viewDefCache.set(viewName, ddl);
  return ddl;
}

/**
 * Fetch pre-aggregated data from a BQ view.
 * Instead of SELECT * and client-side aggregation, this builds a proper
 * GROUP BY query so BQ does the aggregation server-side.
 *
 * @param {string} viewName - BQ view name (e.g., 'int_trials')
 * @param {string} xField - Column for X axis (e.g., 'SignupDate')
 * @param {string} yField - Column for Y axis, or 'COUNT'
 * @param {string} timeBucket - 'month' | 'week' | 'day' | null
 * @param {string|null} channelFilter - Channel name (e.g., 'SEO') or null
 * @param {number|null} lastNMonths - Filter to last N months, or null
 * @returns {{ labels: string[], data: number[] }}
 */
const aggCache = {};

export function clearAggCache() {
  Object.keys(aggCache).forEach(k => delete aggCache[k]);
}

export function clearAllCaches() {
  clearViewCache();
  clearAggCache();
  clearQueryCache();
}

export async function fetchYoYData(viewName, dateCol, yField, channelFilter, yearFilter) {
  validateIdentifier(viewName, 'viewName');
  validateIdentifier(dateCol, 'dateCol');
  if (yField !== 'COUNT') validateIdentifier(yField, 'yField');
  const table = `\`${BQ_PROJECT}.${BQ_DATASET}.${viewName}\``;
  const valueExpr = yField === 'COUNT' ? 'COUNT(*)' : `SUM(CAST(${yField} AS FLOAT64))`;

  const wheres = [];
  // Default: last 3 years. If yearFilter provided (e.g., [2025, 2026]), use that.
  if (yearFilter && yearFilter.length > 0) {
    wheres.push(`FORMAT_DATE('%Y', ${dateCol}) IN (${yearFilter.map(y => `'${validateInt(y, 'year')}'`).join(',')})`);
  } else {
    wheres.push(`${dateCol} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 3 YEAR), YEAR)`);
  }
  if (channelFilter) {
    const col = ATT_COL_MAP[channelFilter];
    if (col) wheres.push(`${col} > 0`);
  }
  const whereClause = `WHERE ${wheres.join(' AND ')}`;

  const sql = `SELECT FORMAT_DATE('%Y', ${dateCol}) AS year, FORMAT_DATE('%m', ${dateCol}) AS month_num, FORMAT_DATE('%b', ${dateCol}) AS month_name, ${valueExpr} AS value FROM ${table} ${whereClause} GROUP BY 1, 2, 3 ORDER BY 1, 2`;

  const result = await queryBq(sql);

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const years = [...new Set(result.rows.map(r => r.year))].sort();
  const seriesMap = {};
  for (const year of years) {
    seriesMap[year] = new Array(12).fill(0);
  }
  for (const row of result.rows) {
    const monthIdx = parseInt(row.month_num, 10) - 1;
    if (seriesMap[row.year]) {
      seriesMap[row.year][monthIdx] = Number(row.value) || 0;
    }
  }

  return { years, months: MONTHS, seriesMap, sql };
}

export async function fetchChartData(metric, dateCol, yField, timeBucket, channelFilter, lastNMonths, endDateRule = null) {
  // Semantic fields take priority — builds SQL dynamically for any grain
  if (metric.semantic_table && metric.semantic_measure && metric.semantic_date_col) {
    const cacheKey = `semantic|${metric.id}|${timeBucket}|${lastNMonths}|${endDateRule || 'none'}|${channelFilter || ''}`;
    if (aggCache[cacheKey]) return aggCache[cacheKey];
    const sql = buildSemanticSql(metric, timeBucket, lastNMonths, endDateRule);
    const result = await queryBq(sql);
    const output = {
      labels: result.rows.map(r => r.period),
      data: result.rows.map(r => Number(r.value) || 0),
      sql,
    };
    if (output.labels.length > 0) aggCache[cacheKey] = output;
    return output;
  }

  // If metric has a pre-written chart_sql query, use it directly
  if (metric.chart_sql) {
    const cacheKey = `chart_sql|${metric.id}|${lastNMonths}|${endDateRule || 'none'}`;
    if (aggCache[cacheKey]) return aggCache[cacheKey];

    let sql = metric.chart_sql;
    // Apply time filter by wrapping the query
    if (lastNMonths != null && lastNMonths >= 0) {
      const months = validateInt(lastNMonths, 'lastNMonths');
      const dateExpr = months === 0
        ? `FORMAT_DATE('%Y-%m', DATE_TRUNC(CURRENT_DATE(), MONTH))`
        : `FORMAT_DATE('%Y-%m', DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH), MONTH))`;
      sql = `SELECT * FROM (${sql}) sub WHERE period >= ${dateExpr}`;
    }
    const result = await queryBq(sql);
    // Handle multi-series results (chart_sql returns a `series` column)
    if (result.rows.length > 0 && result.rows[0].series != null) {
      const seriesMap = {};
      for (const row of result.rows) {
        if (!seriesMap[row.series]) seriesMap[row.series] = { data: [], labels: [] };
        seriesMap[row.series].labels.push(row.period);
        seriesMap[row.series].data.push(Number(row.value) || 0);
      }
      const output = { multiSeries: true, series: seriesMap, sql };
      aggCache[cacheKey] = output;
      return output;
    }
    const output = {
      labels: result.rows.map(r => r.period),
      data: result.rows.map(r => Number(r.value) || 0),
      sql,
    };
    // Only cache non-empty results — empty may be from BQ rate limiting
    if (output.labels.length > 0) aggCache[cacheKey] = output;
    return output;
  }
  // No chart_sql — fall back to standard aggregation query
  return fetchAggregatedData(metric.view_name, dateCol, yField, timeBucket, channelFilter, lastNMonths, endDateRule);
}

export async function fetchAggregatedData(viewName, xField, yField, timeBucket, channelFilter, lastNMonths, endDateRule = null) {
  validateIdentifier(viewName, 'viewName');
  validateIdentifier(xField, 'xField');
  if (yField !== 'COUNT') validateIdentifier(yField, 'yField');
  const cacheKey = `${viewName}|${xField}|${yField}|${timeBucket}|${channelFilter}|${lastNMonths}|${endDateRule || 'none'}`;
  if (aggCache[cacheKey]) return aggCache[cacheKey];

  const table = `\`${BQ_PROJECT}.${BQ_DATASET}.${viewName}\``;
  const bucket = timeBucket || 'month';

  // Build the period expression
  let periodExpr;
  if (bucket === 'month') {
    periodExpr = `FORMAT_DATE('%Y-%m', ${xField})`;
  } else if (bucket === 'week') {
    periodExpr = `FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(${xField}, WEEK(MONDAY)))`;
  } else {
    periodExpr = `FORMAT_DATE('%Y-%m-%d', ${xField})`;
  }

  // Build the value expression
  const valueExpr = yField === 'COUNT' ? 'COUNT(*)' : `SUM(CAST(${yField} AS FLOAT64))`;

  // Build WHERE clauses
  const wheres = [];

  // Channel filter
  if (channelFilter) {
    const col = ATT_COL_MAP[channelFilter];
    if (col) wheres.push(`${col} > 0`);
  }

  // Time range filter — snap to 1st of month so we always get full calendar months
  if (lastNMonths != null && lastNMonths >= 0) {
    const months = validateInt(lastNMonths, 'lastNMonths');
    if (months === 0) {
      wheres.push(`${xField} >= DATE_TRUNC(CURRENT_DATE(), MONTH)`);
    } else {
      wheres.push(`${xField} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH), MONTH)`);
    }
  }

  const endClause = buildEndDateClause(xField, endDateRule);
  if (endClause) {
    wheres.push(endClause);
  }

  const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';

  const sql = `SELECT ${periodExpr} AS period, ${valueExpr} AS value FROM ${table} ${whereClause} GROUP BY 1 ORDER BY 1`;

  const result = await queryBq(sql);
  const output = {
    labels: result.rows.map(r => r.period),
    data: result.rows.map(r => Number(r.value) || 0),
    sql,
  };
  aggCache[cacheKey] = output;
  return output;
}

/**
 * Fetch data grouped by a dimension column (e.g., Channel, SignupCountry).
 * Returns one series per dimension value — used for heatmaps, stacked bars, pies by category.
 *
 * @param {string} viewName - BQ view name
 * @param {string} xField - Date column for time axis
 * @param {string} yField - Column for value, or 'COUNT'
 * @param {string} timeBucket - 'month' | 'week' | 'day'
 * @param {string} groupByField - Column to group by (e.g., 'Channel', 'SignupCountry')
 * @param {string|null} channelFilter - Channel name or null
 * @param {number|null} lastNMonths - Time range filter
 * @param {string|null} endDateRule - Upper bound rule (e.g., 'yesterday', 'previous_sunday')
 * @param {number} topN - Max dimension values to include (default 10)
 * @returns {{ labels: string[], seriesMap: Object<string, number[]>, sql: string }}
 */
export async function fetchGroupedData(viewName, xField, yField, timeBucket, groupByField, channelFilter, lastNMonths, endDateRule = null, topN = 10) {
  validateIdentifier(viewName, 'viewName');
  validateIdentifier(xField, 'xField');
  if (yField !== 'COUNT') validateIdentifier(yField, 'yField');
  validateIdentifier(groupByField, 'groupByField');

  const cacheKey = `grouped|${viewName}|${xField}|${yField}|${timeBucket}|${groupByField}|${channelFilter}|${lastNMonths}|${endDateRule || 'none'}|${topN}`;
  if (aggCache[cacheKey]) return aggCache[cacheKey];

  const table = `\`${BQ_PROJECT}.${BQ_DATASET}.${viewName}\``;
  const bucket = timeBucket || 'month';

  let periodExpr;
  if (bucket === 'month') periodExpr = `FORMAT_DATE('%Y-%m', ${xField})`;
  else if (bucket === 'week') periodExpr = `FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(${xField}, WEEK(MONDAY)))`;
  else periodExpr = `FORMAT_DATE('%Y-%m-%d', ${xField})`;

  const valueExpr = yField === 'COUNT' ? 'COUNT(*)' : `SUM(CAST(${yField} AS FLOAT64))`;

  const baseWheres = [];
  if (channelFilter) {
    const col = ATT_COL_MAP[channelFilter];
    if (col) baseWheres.push(`${col} > 0`);
  }
  if (lastNMonths != null && lastNMonths >= 0) {
    const months = validateInt(lastNMonths, 'lastNMonths');
    if (months === 0) {
      baseWheres.push(`${xField} >= DATE_TRUNC(CURRENT_DATE(), MONTH)`);
    } else {
      baseWheres.push(`${xField} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH), MONTH)`);
    }
  }
  const groupEndClause = buildEndDateClause(xField, endDateRule);
  if (groupEndClause) {
    baseWheres.push(groupEndClause);
  }

  // First pass: find top N dimension values by total volume
  const safeTopN = validateInt(topN, 'topN');
  const topWheres = [...baseWheres, `${groupByField} IS NOT NULL AND TRIM(CAST(${groupByField} AS STRING)) != ''`];
  const topWhereClause = `WHERE ${topWheres.join(' AND ')}`;
  const topSql = `SELECT ${groupByField} AS dimension, ${valueExpr} AS total FROM ${table} ${topWhereClause} GROUP BY 1 ORDER BY 2 DESC LIMIT ${safeTopN}`;
  const topResult = await queryBq(topSql);
  const topDimensions = topResult.rows.map(r => r.dimension);

  if (topDimensions.length === 0) {
    const output = { labels: [], seriesMap: {}, sql: topSql };
    aggCache[cacheKey] = output;
    return output;
  }

  // Second pass: get full time series for top dimensions only
  const inList = topDimensions.map(d => `'${escapeBqString(d)}'`).join(',');
  const fullWheres = [...baseWheres, `${groupByField} IN (${inList})`];
  const fullWhereClause = `WHERE ${fullWheres.join(' AND ')}`;

  const sql = `SELECT ${periodExpr} AS period, ${groupByField} AS dimension, ${valueExpr} AS value FROM ${table} ${fullWhereClause} GROUP BY 1, 2 ORDER BY 1, 2`;
  const result = await queryBq(sql);

  const labelsSet = new Set();
  const tempMap = {};
  for (const row of result.rows) {
    labelsSet.add(row.period);
    if (!tempMap[row.dimension]) tempMap[row.dimension] = {};
    tempMap[row.dimension][row.period] = Number(row.value) || 0;
  }

  const labels = [...labelsSet].sort();
  const seriesMap = {};
  for (const dim of Object.keys(tempMap)) {
    seriesMap[dim] = labels.map(l => tempMap[dim][l] || 0);
  }

  const output = { labels, seriesMap, sql };
  aggCache[cacheKey] = output;
  return output;
}

/**
 * Fetch a dimension snapshot: total value per dimension value for a given period.
 * Unlike fetchGroupedData (time-series), this returns a single number per dimension.
 * Used for pivot tables: rows=channels, columns=metrics.
 *
 * @param {string} viewName - BQ view name
 * @param {string} xField - Date column for time filter
 * @param {string} yField - Column for value, or 'COUNT'
 * @param {string} groupByField - Dimension column (e.g., 'AttributionChannel')
 * @param {string|null} channelFilter - Channel name or null
 * @param {number|null} lastNMonths - 0 = current month MTD, 1 = last full month, etc.
 * @param {number} topN - Max dimension values (default 20)
 * @returns {{ snapshot: Object<string, number>, sql: string }}
 */
export async function fetchDimensionSnapshot(viewName, xField, yField, groupByField, channelFilter, lastNMonths, topN = 20) {
  validateIdentifier(viewName, 'viewName');
  validateIdentifier(xField, 'xField');
  if (yField !== 'COUNT') validateIdentifier(yField, 'yField');
  validateIdentifier(groupByField, 'groupByField');

  const cacheKey = `dimsnap|${viewName}|${xField}|${yField}|${groupByField}|${channelFilter}|${lastNMonths}|${topN}`;
  if (aggCache[cacheKey]) return aggCache[cacheKey];

  const table = `\`${BQ_PROJECT}.${BQ_DATASET}.${viewName}\``;
  const valueExpr = yField === 'COUNT' ? 'COUNT(*)' : `SUM(CAST(${yField} AS FLOAT64))`;
  const safeTopN = validateInt(topN, 'topN');

  const wheres = [`${groupByField} IS NOT NULL`, `TRIM(CAST(${groupByField} AS STRING)) != ''`];

  if (channelFilter) {
    const col = ATT_COL_MAP[channelFilter];
    if (col) wheres.push(`${col} > 0`);
  }

  if (lastNMonths != null && lastNMonths >= 0) {
    const months = validateInt(lastNMonths, 'lastNMonths');
    if (months === 0) {
      wheres.push(`${xField} >= DATE_TRUNC(CURRENT_DATE(), MONTH)`);
      wheres.push(`${xField} < CURRENT_DATE()`);
    } else {
      wheres.push(`${xField} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH), MONTH)`);
      wheres.push(`${xField} < DATE_TRUNC(CURRENT_DATE(), MONTH)`);
    }
  }

  const whereClause = `WHERE ${wheres.join(' AND ')}`;
  const sql = `SELECT ${groupByField} AS dim_value, ${valueExpr} AS value FROM ${table} ${whereClause} GROUP BY 1 ORDER BY 2 DESC LIMIT ${safeTopN}`;

  const result = await queryBq(sql);
  const snapshot = {};
  for (const row of result.rows) {
    snapshot[String(row.dim_value)] = Number(row.value) || 0;
  }

  const output = { snapshot, sql };
  aggCache[cacheKey] = output;
  return output;
}

/**
 * Fetch KPI data: current month value + prior month value with delta.
 *
 * @param {string} viewName - BQ view name
 * @param {string} dateCol - Date column name
 * @param {string} yField - Column for value, or 'COUNT'
 * @param {string|null} channelFilter - Channel name or null
 * @returns {{ current: number, prior: number, delta: number, deltaPercent: number, sql: string }}
 */
export async function fetchKpiData(viewName, dateCol, yField, channelFilter) {
  validateIdentifier(viewName, 'viewName');
  validateIdentifier(dateCol, 'dateCol');
  if (yField !== 'COUNT') validateIdentifier(yField, 'yField');
  const table = `\`${BQ_PROJECT}.${BQ_DATASET}.${viewName}\``;
  const valueExpr = yField === 'COUNT' ? 'COUNT(*)' : `SUM(CAST(${yField} AS FLOAT64))`;

  const wheres = [`${dateCol} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH)`];
  if (channelFilter) {
    const col = ATT_COL_MAP[channelFilter];
    if (col) wheres.push(`${col} > 0`);
  }

  const sql = `SELECT
    CASE WHEN ${dateCol} >= DATE_TRUNC(CURRENT_DATE(), MONTH) THEN 'current'
         WHEN ${dateCol} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH)
              AND ${dateCol} < DATE_TRUNC(CURRENT_DATE(), MONTH) THEN 'prior'
    END AS period,
    ${valueExpr} AS value
  FROM ${table}
  WHERE ${wheres.join(' AND ')}
  GROUP BY 1`;

  const result = await queryBq(sql);
  const current = Number(result.rows.find(r => r.period === 'current')?.value) || 0;
  const prior = Number(result.rows.find(r => r.period === 'prior')?.value) || 0;
  const delta = current - prior;
  const deltaPercent = prior !== 0 ? Math.round((delta / prior) * 1000) / 10 : 0;

  return { current, prior, delta, deltaPercent, sql };
}

// Allowlist of views that support drill-through (raw row queries).
// Per-view config: which column to use for date ordering.
const DRILL_VIEWS = {
  v_new_net_saas: { dateCol: 'TxnDate' },
  v_dep_revenue: { dateCol: 'TxnDate' },
  v_total_dep_revenue: { dateCol: 'TxnDate' },
  int_cancellations: { dateCol: 'CancellationDate' },
  v_total_net_saas: { dateCol: 'TxnDate' },
};

/**
 * Fetch raw rows from a view for drill-through detail tables.
 * Only permitted views (DRILL_VIEWS allowlist) can be queried.
 *
 * @param {string} viewName - Must be in DRILL_VIEWS allowlist
 * @param {number|null} lastNMonths - Filter to last N months, or null for all
 * @param {number} [limit=1000] - Max rows to return (capped at 1000)
 * @returns {{ rows, columns, sql }}
 */
export async function fetchDrillData(viewName, lastNMonths, limit = 1000) {
  validateIdentifier(viewName, 'viewName');
  if (!DRILL_VIEWS[viewName]) throw new Error(`"${viewName}" is not a permitted drill view`);

  const safeLimit = Math.min(validateInt(Math.min(limit, 1000), 'limit'), 1000);
  const { dateCol } = DRILL_VIEWS[viewName];
  const table = `\`${BQ_PROJECT}.${BQ_DATASET}.${viewName}\``;

  const wheres = [];
  if (lastNMonths != null) {
    const months = validateInt(lastNMonths, 'lastNMonths');
    if (months === 0) {
      wheres.push(`${dateCol} >= DATE_TRUNC(CURRENT_DATE(), MONTH)`);
    } else {
      wheres.push(`${dateCol} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH), MONTH)`);
    }
    wheres.push(`${dateCol} < CURRENT_DATE()`);
  }

  const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';
  const sql = `SELECT * FROM ${table} ${whereClause} ORDER BY ${dateCol} DESC LIMIT ${safeLimit}`;

  const result = await queryBq(sql);
  const columns = result.schema.map(f => ({ key: f.name, label: f.name, type: f.type }));
  return { rows: result.rows, columns, sql };
}
