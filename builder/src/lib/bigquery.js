const BQ_CLIENT_ID = '546732685010-nojjfak7esmun2taour8r5pakrsrg3aq.apps.googleusercontent.com';
const BQ_PROJECT = 'project-for-method-dw';
const BQ_DATASET = 'revenue';

let bqToken = localStorage.getItem('bq_access_token');

export function getBqToken() {
  return bqToken;
}

export async function initBqAuth(onSuccess, onFail) {
  const stored = localStorage.getItem('bq_access_token');
  if (!stored) return;

  // Validate the token is still alive
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${stored}` },
    });
    if (res.ok) {
      bqToken = stored;
      onSuccess?.(stored);
    } else {
      // Token expired — clear it
      localStorage.removeItem('bq_access_token');
      bqToken = null;
      onFail?.();
    }
  } catch {
    localStorage.removeItem('bq_access_token');
    bqToken = null;
    onFail?.();
  }
}

export function connectBq(onSuccess) {
  if (!window.google?.accounts?.oauth2) return;
  google.accounts.oauth2.initTokenClient({
    client_id: BQ_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/bigquery https://www.googleapis.com/auth/userinfo.email',
    callback: (r) => {
      if (r.access_token) {
        bqToken = r.access_token;
        localStorage.setItem('bq_access_token', bqToken);
        onSuccess?.(bqToken);
      }
    },
  }).requestAccessToken();
}

export function disconnectBq() {
  bqToken = null;
  localStorage.removeItem('bq_access_token');
}

function cleanSql(sql) {
  return sql
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2260/g, '!=')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=');
}

export async function queryBq(sql) {
  if (!bqToken) throw new Error('Not connected to BigQuery');
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
    throw new Error(`BQ ${res.status}`);
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

export const ATT_COL_MAP = {
  SEO: 'Att_SEO', PPC: 'Att_Pay_Per_Click', OPN: 'Att_OPN_Other_Peoples_Networks',
  Social: 'Att_Social', Email: 'Att_Email', Referral: 'Att_Referral_Link',
  Direct: 'Att_Direct', Partners: 'Att_Partners', Content: 'Att_Content',
  Remarketing: 'Att_Remarketing', Other: 'Att_Other', None: 'Att_None',
};

const viewCache = {};

export async function fetchViewData(viewName) {
  if (viewCache[viewName]) return viewCache[viewName];
  const sql = `SELECT * FROM \`${BQ_PROJECT}.${BQ_DATASET}.${viewName}\` LIMIT 10000`;
  const result = await queryBq(sql);
  viewCache[viewName] = result;
  return result;
}

export function clearViewCache() {
  Object.keys(viewCache).forEach(k => delete viewCache[k]);
}

/**
 * Fetch pre-aggregated data from a BQ view.
 * Instead of SELECT * and client-side aggregation, this builds a proper
 * GROUP BY query so BQ does the aggregation server-side.
 *
 * @param {string} viewName - BQ view name (e.g., 'v_trials')
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
}

export async function fetchYoYData(viewName, dateCol, yField, channelFilter, yearFilter) {
  const table = `\`${BQ_PROJECT}.${BQ_DATASET}.${viewName}\``;
  const valueExpr = yField === 'COUNT' ? 'COUNT(*)' : `SUM(CAST(${yField} AS FLOAT64))`;

  const wheres = [];
  // Default: last 3 years. If yearFilter provided (e.g., [2025, 2026]), use that.
  if (yearFilter && yearFilter.length > 0) {
    wheres.push(`FORMAT_DATE('%Y', ${dateCol}) IN (${yearFilter.map(y => `'${y}'`).join(',')})`);
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

export async function fetchChartData(metric, dateCol, yField, timeBucket, channelFilter, lastNMonths) {
  // If metric has a pre-written chart_sql query, use it directly
  if (metric.chart_sql) {
    const cacheKey = `chart_sql|${metric.id}|${lastNMonths}`;
    if (aggCache[cacheKey]) return aggCache[cacheKey];

    let sql = metric.chart_sql;
    // Apply time filter by wrapping the query
    if (lastNMonths != null && lastNMonths >= 0) {
      const dateExpr = lastNMonths === 0
        ? `FORMAT_DATE('%Y-%m', DATE_TRUNC(CURRENT_DATE(), MONTH))`
        : `FORMAT_DATE('%Y-%m', DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${lastNMonths} MONTH), MONTH))`;
      sql = `SELECT * FROM (${sql}) sub WHERE period >= ${dateExpr}`;
    }
    const result = await queryBq(sql);
    const output = {
      labels: result.rows.map(r => r.period),
      data: result.rows.map(r => Number(r.value) || 0),
      sql,
    };
    aggCache[cacheKey] = output;
    return output;
  }
  // Otherwise use the standard aggregation query
  return fetchAggregatedData(metric.view_name, dateCol, yField, timeBucket, channelFilter, lastNMonths);
}

export async function fetchAggregatedData(viewName, xField, yField, timeBucket, channelFilter, lastNMonths) {
  const cacheKey = `${viewName}|${xField}|${yField}|${timeBucket}|${channelFilter}|${lastNMonths}`;
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
    if (lastNMonths === 0) {
      wheres.push(`${xField} >= DATE_TRUNC(CURRENT_DATE(), MONTH)`);
    } else {
      wheres.push(`${xField} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${lastNMonths} MONTH), MONTH)`);
    }
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
 * @param {number} topN - Max dimension values to include (default 10)
 * @returns {{ labels: string[], seriesMap: Object<string, number[]>, sql: string }}
 */
export async function fetchGroupedData(viewName, xField, yField, timeBucket, groupByField, channelFilter, lastNMonths, topN = 10) {
  // Validate groupByField is alphanumeric/underscore only (defense against SQL injection from AI responses)
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(groupByField)) {
    throw new Error(`Invalid groupByField: ${groupByField}`);
  }

  const cacheKey = `grouped|${viewName}|${xField}|${yField}|${timeBucket}|${groupByField}|${channelFilter}|${lastNMonths}|${topN}`;
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
    if (lastNMonths === 0) {
      baseWheres.push(`${xField} >= DATE_TRUNC(CURRENT_DATE(), MONTH)`);
    } else {
      baseWheres.push(`${xField} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${lastNMonths} MONTH), MONTH)`);
    }
  }

  // First pass: find top N dimension values by total volume
  const topWheres = [...baseWheres, `${groupByField} IS NOT NULL AND TRIM(CAST(${groupByField} AS STRING)) != ''`];
  const topWhereClause = `WHERE ${topWheres.join(' AND ')}`;
  const topSql = `SELECT ${groupByField} AS dimension, ${valueExpr} AS total FROM ${table} ${topWhereClause} GROUP BY 1 ORDER BY 2 DESC LIMIT ${topN}`;
  const topResult = await queryBq(topSql);
  const topDimensions = topResult.rows.map(r => r.dimension);

  if (topDimensions.length === 0) {
    const output = { labels: [], seriesMap: {}, sql: topSql };
    aggCache[cacheKey] = output;
    return output;
  }

  // Second pass: get full time series for top dimensions only
  const inList = topDimensions.map(d => `'${String(d).replace(/'/g, "\\'")}'`).join(',');
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
 * Fetch KPI data: current month value + prior month value with delta.
 *
 * @param {string} viewName - BQ view name
 * @param {string} dateCol - Date column name
 * @param {string} yField - Column for value, or 'COUNT'
 * @param {string|null} channelFilter - Channel name or null
 * @returns {{ current: number, prior: number, delta: number, deltaPercent: number, sql: string }}
 */
export async function fetchKpiData(viewName, dateCol, yField, channelFilter) {
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
