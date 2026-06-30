// builder/src/lib/motionFunnelSql.js
const fqn = (v) => `\`project-for-method-dw.revenue.${v}\``;
const s = (v) => `'${String(v).replace(/'/g, "''")}'`;
export const SPLITS = [
  { key:null, label:'None' },
  { key:'user_tier', label:'Customer size' },
  { key:'has_dep', label:'DEP' },
  { key:'industry_l1', label:'Industry' },
  { key:'is_prepay', label:'Prepay vs Monthly' },
];
const FLAGS = 'synced, demo_attended, free_attended, converted, is_customized';
const win = (a, b) => `signup_month BETWEEN ${s(a)} AND ${s(b)}`;
const BOOL_SPLITS = new Set(['has_dep', 'is_prepay']);
const splitFilter = (k, v) => (k && v != null && v !== '') ? ` AND ${k} = ${BOOL_SPLITS.has(k) ? (v === true || v === 'true') : s(v)}` : '';

export function buildJointSql({ startMonth, endMonth, splitKey, splitValue }) {
  return `SELECT ${FLAGS}, COUNT(*) AS n FROM ${fqn('int_motion_funnel')}
WHERE ${win(startMonth, endMonth)}${splitFilter(splitKey, splitValue)}
GROUP BY 1,2,3,4,5`;
}
export function buildSplitValuesSql({ startMonth, endMonth, splitKey }) {
  return `SELECT ${splitKey} AS value, COUNT(*) AS n FROM ${fqn('int_motion_funnel')}
WHERE ${win(startMonth, endMonth)} GROUP BY 1 ORDER BY n DESC`;
}
export function buildGoalRetentionSql({ startMonth, endMonth, goal, splitKey, splitValue }) {
  const gate = goal === 'convert' ? 'converted' : 'is_customized';
  const f = (k) => `COUNTIF(eligible_${k}mo) AS e${k}, COUNTIF(retained_${k}mo) AS r${k}`;
  return `SELECT ${[1,3,6,12].map(f).join(', ')} FROM ${fqn('int_motion_funnel')}
WHERE ${win(startMonth, endMonth)} AND ${gate}${splitFilter(splitKey, splitValue)}`;
}
