export function buildChannelTrajectorySql() {
  return `
    SELECT metric, channel, mtd_actual, trajectory,
           prior_month_full, last_year_full, forecast, yoy_pct, mom_pct, fcst_pct
    FROM \`project-for-method-dw.revenue.int_channel_funnel_trajectory\`
  `;
}

const n = (v) => (v == null ? null : Number(v));

const toRow = (r) => ({
  channel: r.channel,
  trajectory: n(r.trajectory),
  lastYearFull: n(r.last_year_full),
  priorMonthFull: n(r.prior_month_full),
  forecast: n(r.forecast),
  mtdActual: n(r.mtd_actual),
  yoyPct: n(r.yoy_pct),
  momPct: n(r.mom_pct),
  fcstPct: n(r.fcst_pct),
});

const sum = (xs) => xs.reduce((a, b) => a + (b || 0), 0);

const isEmptyRow = (row) =>
  !row.mtdActual && !row.trajectory && !row.priorMonthFull && !row.lastYearFull && !row.forecast;

function totalRow(metric, rows, trialsRows, syncsRows) {
  if (metric === 'sync_rate') {
    // trials-weighted (blended) rate total: sum(syncs.X) / sum(trials.X) at each
    // level. Matches Looker's grand-total Sync %, incl. its YoY/MoM %Δ computed
    // off the blended rate (not left blank).
    const s = (arr, k) => sum(arr.map((r) => r[k]));
    const rate = (k) => (s(trialsRows, k) ? s(syncsRows, k) / s(trialsRows, k) : null);
    const trajectory = rate('trajectory');
    const lastYearFull = rate('lastYearFull');
    const priorMonthFull = rate('priorMonthFull');
    const mtdActual = rate('mtdActual');
    const forecast = rate('forecast');
    return {
      channel: 'Total',
      trajectory, lastYearFull, priorMonthFull, mtdActual, forecast,
      yoyPct: lastYearFull ? (trajectory - lastYearFull) / lastYearFull : null,
      momPct: priorMonthFull ? (trajectory - priorMonthFull) / priorMonthFull : null,
      fcstPct: forecast ? (trajectory - forecast) / forecast : null,
    };
  }
  const t = { channel: 'Total' };
  for (const k of ['trajectory', 'lastYearFull', 'priorMonthFull', 'mtdActual', 'forecast']) t[k] = sum(rows.map((r) => r[k]));
  t.yoyPct = t.lastYearFull ? (t.trajectory - t.lastYearFull) / t.lastYearFull : null;
  t.momPct = t.priorMonthFull ? (t.trajectory - t.priorMonthFull) / t.priorMonthFull : null;
  t.fcstPct = t.forecast ? (t.trajectory - t.forecast) / t.forecast : null;
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
