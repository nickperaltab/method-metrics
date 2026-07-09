export function buildChannelTrajectorySql() {
  return `
    SELECT metric, channel, mtd_actual, trajectory,
           prior_month_full, last_year_full, yoy_pct, mom_pct
    FROM \`project-for-method-dw.revenue.int_channel_funnel_trajectory\`
  `;
}

const toRow = (r) => ({
  channel: r.channel,
  trajectory: r.trajectory,
  lastYearFull: r.last_year_full,
  priorMonthFull: r.prior_month_full,
  mtdActual: r.mtd_actual,
  yoyPct: r.yoy_pct,
  momPct: r.mom_pct,
});

const sum = (xs) => xs.reduce((a, b) => a + (b || 0), 0);

const isEmptyRow = (row) =>
  !row.mtdActual && !row.trajectory && !row.priorMonthFull && !row.lastYearFull;

function totalRow(metric, rows, trialsRows, syncsRows) {
  if (metric === 'sync_rate') {
    // trials-weighted rate total: sum(syncs.X) / sum(trials.X) at each level
    const s = (arr, k) => sum(arr.map((r) => r[k]));
    return {
      channel: 'Total',
      trajectory: s(syncsRows, 'trajectory') / s(trialsRows, 'trajectory') || null,
      lastYearFull: s(syncsRows, 'lastYearFull') / s(trialsRows, 'lastYearFull') || null,
      priorMonthFull: s(syncsRows, 'priorMonthFull') / s(trialsRows, 'priorMonthFull') || null,
      mtdActual: s(syncsRows, 'mtdActual') / s(trialsRows, 'mtdActual') || null,
      yoyPct: null, momPct: null,
    };
  }
  const t = { channel: 'Total' };
  for (const k of ['trajectory', 'lastYearFull', 'priorMonthFull', 'mtdActual']) t[k] = sum(rows.map((r) => r[k]));
  t.yoyPct = t.lastYearFull ? (t.trajectory - t.lastYearFull) / t.lastYearFull : null;
  t.momPct = t.priorMonthFull ? (t.trajectory - t.priorMonthFull) / t.priorMonthFull : null;
  return t;
}

export function shapeChannelTrajectory(rows) {
  const g = { trials: [], syncs: [], sync_rate: [] };
  for (const r of rows) if (g[r.metric]) g[r.metric].push(toRow(r));
  for (const k of Object.keys(g)) g[k] = g[k].filter((row) => !isEmptyRow(row));
  for (const k of Object.keys(g)) g[k].sort((a, b) => (b.trajectory || 0) - (a.trajectory || 0));
  const withTotals = {};
  for (const k of Object.keys(g)) {
    withTotals[k] = [...g[k], totalRow(k, g[k], g.trials, g.syncs)];
  }
  return withTotals;
}
