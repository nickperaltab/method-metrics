/**
 * Pure semantic SQL builders for the MCP. Ported from builder/src/lib/sql/
 * so the edge function doesn't need cross-tree imports at deploy time.
 *
 * KEEP IN SYNC with builder/src/lib/sql/semantic.js + sanitize.js. If the
 * shared builder changes, mirror the change here. Nightly CI can diff these
 * two once we care.
 */

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateIdentifier(value: unknown, label = 'identifier'): string {
  if (typeof value !== 'string' || !IDENTIFIER_RE.test(value)) {
    throw new Error(`Invalid ${label}: ${String(value).slice(0, 50)}`);
  }
  return value;
}

export function validateInt(value: unknown, label = 'int'): number {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`Invalid ${label}: ${String(value).slice(0, 50)}`);
  }
  return n;
}

const BQ_PROJECT = 'project-for-method-dw';
const BQ_DATASET = 'revenue';

export function buildEndDateClause(column: string, rule: string | undefined): string | null {
  if (!rule) return null;
  if (rule === 'yesterday') return `${column} <= DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)`;
  if (rule === 'previous_sunday') {
    return `${column} <= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), WEEK(MONDAY)), INTERVAL 1 DAY)`;
  }
  const m = /^days_ago_(\d+)$/.exec(rule);
  if (m) return `${column} <= DATE_SUB(CURRENT_DATE(), INTERVAL ${Number(m[1])} DAY)`;
  return null;
}

function periodExpr(dateCol: string, bucket: string): string {
  if (bucket === 'week') return `FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(${dateCol}, WEEK(MONDAY)))`;
  if (bucket === 'quarter') {
    return `CONCAT(FORMAT_DATE('%Y', DATE_TRUNC(${dateCol}, QUARTER)), '-Q', CAST(CEIL(EXTRACT(MONTH FROM DATE_TRUNC(${dateCol}, QUARTER)) / 3.0) AS STRING))`;
  }
  if (bucket === 'day') return `FORMAT_DATE('%Y-%m-%d', ${dateCol})`;
  if (bucket === 'year') return `FORMAT_DATE('%Y', DATE_TRUNC(${dateCol}, YEAR))`;
  return `FORMAT_DATE('%Y-%m', DATE_TRUNC(${dateCol}, MONTH))`;
}

interface SemanticMetric {
  id: number;
  semantic_table: string | null;
  semantic_measure: string | null;
  semantic_date_col: string | null;
  semantic_filters: string[] | null;
  semantic_dimensions: string[] | null;
}

function buildWhereClause(metric: SemanticMetric, lastNMonths: number | undefined, endDateRule: string | undefined): string {
  const dateCol = metric.semantic_date_col!;
  const wheres = [...(metric.semantic_filters ?? [])];
  if (lastNMonths != null && lastNMonths >= 0) {
    const months = validateInt(lastNMonths, 'lastNMonths');
    wheres.push(
      months === 0
        ? `${dateCol} >= DATE_TRUNC(CURRENT_DATE(), MONTH)`
        : `${dateCol} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH), MONTH)`,
    );
  }
  const endClause = buildEndDateClause(dateCol, endDateRule);
  if (endClause) wheres.push(endClause);
  return wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';
}

export function buildSemanticSql(metric: SemanticMetric, timeBucket: string, lastNMonths?: number, endDateRule?: string): string {
  validateIdentifier(metric.semantic_table, 'semantic_table');
  validateIdentifier(metric.semantic_date_col, 'semantic_date_col');
  const table = `\`${BQ_PROJECT}.${BQ_DATASET}.${metric.semantic_table}\``;
  const pexpr = periodExpr(metric.semantic_date_col!, timeBucket || 'month');
  const whereClause = buildWhereClause(metric, lastNMonths, endDateRule);
  return `SELECT ${pexpr} AS period, ${metric.semantic_measure} AS value FROM ${table} ${whereClause} GROUP BY 1 ORDER BY 1`;
}

export function buildSemanticGroupedSql(metric: SemanticMetric, dimension: string, timeBucket: string, lastNMonths?: number, endDateRule?: string): string {
  const allowed = metric.semantic_dimensions ?? [];
  if (!allowed.includes(dimension)) {
    throw new Error(`"${dimension}" is not an approved dimension for metric ${metric.id}. Allowed: [${allowed.join(', ')}]`);
  }
  validateIdentifier(metric.semantic_table, 'semantic_table');
  validateIdentifier(metric.semantic_date_col, 'semantic_date_col');
  validateIdentifier(dimension, 'dimension');
  const table = `\`${BQ_PROJECT}.${BQ_DATASET}.${metric.semantic_table}\``;
  const pexpr = periodExpr(metric.semantic_date_col!, timeBucket || 'month');
  const whereClause = buildWhereClause(metric, lastNMonths, endDateRule);
  return `SELECT ${pexpr} AS period, ${dimension} AS dimension, ${metric.semantic_measure} AS value FROM ${table} ${whereClause} GROUP BY 1, 2 ORDER BY 1, 2`;
}
