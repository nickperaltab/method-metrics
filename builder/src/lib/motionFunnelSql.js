// builder/src/lib/motionFunnelSql.js
// Pure SQL builders for the Motion + Lifecycle funnel. No I/O.
const fqn = (v) => `\`project-for-method-dw.revenue.${v}\``;
const sqlStr = (v) => `'${String(v).replace(/'/g, "''")}'`;

const COUNT_COLS = [
  'trials', 'synced', 'demo_booked', 'demo_attended', 'free_booked', 'free_attended',
  'converted', 'customized',
  'retained_1mo', 'eligible_1mo', 'retained_3mo', 'eligible_3mo',
  'retained_6mo', 'eligible_6mo', 'retained_12mo', 'eligible_12mo',
];

// Sum the aggregated view over a signup-month window, per motion.
export function buildMotionFunnelSql({ startMonth, endMonth }) {
  const sums = COUNT_COLS.map((c) => `  SUM(${c}) AS ${c}`).join(',\n');
  return `SELECT
  motion,
${sums}
FROM ${fqn('v_motion_funnel')}
WHERE signup_month BETWEEN ${sqlStr(startMonth)} AND ${sqlStr(endMonth)}
GROUP BY motion
ORDER BY motion`;
}

// Lens breakdown from the per-customer table: spine counts by motion × lens value.
const LENS_EXPR = {
  industry:      `COALESCE(industry_l1, 'Unclassified')`,
  dep:           `IF(has_dep, 'DEP', 'No DEP')`,
  prepay:        `IF(is_prepay, 'Prepay', 'Monthly')`,
  customization: `IF(is_customized, 'Customized', 'No customization')`,
};

export function buildMotionLensSql({ startMonth, endMonth, lens }) {
  const expr = LENS_EXPR[lens];
  if (!expr) throw new Error(`unknown lens: ${lens}`);
  return `SELECT
  motion,
  ${expr} AS lens_value,
  COUNT(*) AS trials,
  COUNTIF(synced) AS synced,
  COUNTIF(converted) AS converted
FROM ${fqn('int_motion_funnel')}
WHERE signup_month BETWEEN ${sqlStr(startMonth)} AND ${sqlStr(endMonth)}
GROUP BY motion, lens_value
ORDER BY motion, trials DESC`;
}

export const LENSES = [
  { key: null, label: 'None' },
  { key: 'industry', label: 'Industry (V7)' },
  { key: 'dep', label: 'DEP' },
  { key: 'prepay', label: 'Prepay vs Monthly' },
  { key: 'customization', label: 'Customized' },
];
