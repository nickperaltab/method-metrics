// Pure semantic + view-aggregation SQL builders.
import { validateIdentifier, validateInt } from '../sanitize.js';

const BQ_PROJECT = 'project-for-method-dw';
const BQ_DATASET = 'revenue';

export function buildEndDateClause(column, rule) {
  if (!rule) return null;
  if (rule === 'yesterday') {
    return `${column} <= DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)`;
  }
  if (rule === 'previous_sunday') {
    return `${column} <= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), WEEK(MONDAY)), INTERVAL 1 DAY)`;
  }
  const match = /^days_ago_(\d+)$/.exec(rule);
  if (match) {
    const days = Number(match[1]);
    if (!Number.isNaN(days)) {
      return `${column} <= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)`;
    }
  }
  return null;
}

function periodExpr(dateCol, bucket) {
  if (bucket === 'week') return `FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(${dateCol}, WEEK(MONDAY)))`;
  if (bucket === 'quarter') return `CONCAT(FORMAT_DATE('%Y', DATE_TRUNC(${dateCol}, QUARTER)), '-Q', CAST(CEIL(EXTRACT(MONTH FROM DATE_TRUNC(${dateCol}, QUARTER)) / 3.0) AS STRING))`;
  if (bucket === 'day') return `FORMAT_DATE('%Y-%m-%d', ${dateCol})`;
  if (bucket === 'year') return `FORMAT_DATE('%Y', DATE_TRUNC(${dateCol}, YEAR))`;
  return `FORMAT_DATE('%Y-%m', DATE_TRUNC(${dateCol}, MONTH))`;
}

export function buildSemanticSql(metric, timeBucket, lastNMonths, endDateRule) {
  validateIdentifier(metric.semantic_table, 'semantic_table');
  validateIdentifier(metric.semantic_date_col, 'semantic_date_col');
  const table = `\`${BQ_PROJECT}.${BQ_DATASET}.${metric.semantic_table}\``;
  const dateCol = metric.semantic_date_col;
  const pexpr = periodExpr(dateCol, timeBucket || 'month');
  const wheres = [...(metric.semantic_filters || [])];
  if (lastNMonths != null && lastNMonths >= 0) {
    const months = validateInt(lastNMonths, 'lastNMonths');
    wheres.push(
      months === 0
        ? `${dateCol} >= DATE_TRUNC(CURRENT_DATE(), MONTH)`
        : `${dateCol} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH), MONTH)`
    );
  }
  const endClause = buildEndDateClause(dateCol, endDateRule);
  if (endClause) wheres.push(endClause);
  const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';
  return `SELECT ${pexpr} AS period, ${metric.semantic_measure} AS value FROM ${table} ${whereClause} GROUP BY 1 ORDER BY 1`;
}

export function buildSemanticGroupedSql(metric, dimension, timeBucket, lastNMonths, endDateRule) {
  const allowed = metric.semantic_dimensions || [];
  if (!allowed.includes(dimension)) {
    throw new Error(`"${dimension}" is not an approved dimension for metric ${metric.id}. Allowed: [${allowed.join(', ')}]`);
  }
  validateIdentifier(metric.semantic_table, 'semantic_table');
  validateIdentifier(metric.semantic_date_col, 'semantic_date_col');
  validateIdentifier(dimension, 'dimension');
  const table = `\`${BQ_PROJECT}.${BQ_DATASET}.${metric.semantic_table}\``;
  const dateCol = metric.semantic_date_col;
  const pexpr = periodExpr(dateCol, timeBucket || 'month');
  const wheres = [...(metric.semantic_filters || [])];
  if (lastNMonths != null && lastNMonths >= 0) {
    const months = validateInt(lastNMonths, 'lastNMonths');
    wheres.push(
      months === 0
        ? `${dateCol} >= DATE_TRUNC(CURRENT_DATE(), MONTH)`
        : `${dateCol} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH), MONTH)`
    );
  }
  const endClause = buildEndDateClause(dateCol, endDateRule);
  if (endClause) wheres.push(endClause);
  const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';
  return `SELECT ${pexpr} AS period, ${dimension} AS dimension, ${metric.semantic_measure} AS value FROM ${table} ${whereClause} GROUP BY 1, 2 ORDER BY 1, 2`;
}

export function buildViewAggSql(viewName, dateCol, timeBucket, lastNMonths) {
  validateIdentifier(viewName, 'viewName');
  validateIdentifier(dateCol, 'dateCol');
  const table = `\`${BQ_PROJECT}.${BQ_DATASET}.${viewName}\``;
  const pexpr = periodExpr(dateCol, timeBucket || 'month');
  const wheres = [];
  if (lastNMonths != null && lastNMonths >= 0) {
    const months = validateInt(lastNMonths, 'lastNMonths');
    wheres.push(
      months === 0
        ? `${dateCol} >= DATE_TRUNC(CURRENT_DATE(), MONTH)`
        : `${dateCol} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH), MONTH)`
    );
  }
  const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';
  return `SELECT ${pexpr} AS period, COUNT(*) AS value FROM ${table} ${whereClause} GROUP BY 1 ORDER BY 1`;
}
