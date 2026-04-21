// Pure SQL builders — no I/O, no globals. Browser+Node safe.
import { validateInt } from '../sanitize.js';

export function wrapChartSql(sql, lastNMonths) {
  if (lastNMonths == null || lastNMonths < 0) return sql;
  const months = validateInt(lastNMonths, 'lastNMonths');
  const dateExpr = months === 0
    ? `FORMAT_DATE('%Y-%m', DATE_TRUNC(CURRENT_DATE(), MONTH))`
    : `FORMAT_DATE('%Y-%m', DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH), MONTH))`;
  return `SELECT * FROM (${sql}) sub WHERE period >= ${dateExpr}`;
}

export function buildBatchSql(queries) {
  if (queries.length === 0) return '';
  const parts = queries.map(q =>
    `SELECT '${q.key}' AS _key, sub.* FROM (${q.sql}) sub`
  );
  return parts.join('\nUNION ALL\n') + '\nORDER BY _key, period';
}

export function splitBatchResults(rows, keyMap) {
  const map = new Map();
  for (const row of rows) {
    const strKey = row._key;
    const originalKey = keyMap.get(strKey) ?? keyMap.get(Number(strKey)) ?? strKey;
    const clean = { ...row };
    delete clean._key;
    if (!map.has(originalKey)) map.set(originalKey, []);
    map.get(originalKey).push(clean);
  }
  return map;
}
