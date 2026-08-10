const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = (d) => {
  if (!DATE_RE.test(d)) throw new Error(`invalid date (want YYYY-MM-DD): ${d}`);
  return d;
};

// Windowed trajectory query for a picked [start, end] range (inclusive).
// The analysis month = month of `end`; MTD = weights in [start, end];
// days_elapsed / days_in_month are relative to end's month, so
// trajectory = mtd / days_elapsed * days_in_month reproduces Looker's method.
// prior-month / last-year / forecast are relative to end's month. Mirrors the
// int_channel_funnel_trajectory view, but windowed by the injected dates and
// sourced from the daily building-block view.
export function buildChannelTrajectorySql({ start, end }) {
  const ws = isoDate(start);
  const we = isoDate(end);
  const D = 'project-for-method-dw.revenue';
  return `
    WITH cal AS (
      SELECT
        DATE '${ws}' AS win_start,
        DATE '${we}' AS win_end,
        DATE_TRUNC(DATE '${we}', MONTH) AS m_start,
        DATE_TRUNC(DATE_SUB(DATE '${we}', INTERVAL 1 MONTH), MONTH) AS pm_start,
        DATE_TRUNC(DATE_SUB(DATE '${we}', INTERVAL 12 MONTH), MONTH) AS ly_start,
        DATE_TRUNC(DATE_SUB(DATE '${we}', INTERVAL 11 MONTH), MONTH) AS ly_next,
        DATE_DIFF(DATE '${we}', DATE_TRUNC(DATE '${we}', MONTH), DAY) + 1 AS days_elapsed,
        EXTRACT(DAY FROM LAST_DAY(DATE '${we}')) AS days_in_month
    ),
    agg AS (
      -- Backlinks rolls up INTO SEO. The daily view keeps them separate (it's the
      -- building block); the rollup is a reporting choice made here and in
      -- int_channel_funnel_trajectory. Deliberate deviation from Looker, which
      -- reports Backlinks as its own line.
      SELECT
        d.metric, IF(d.channel = 'Backlinks', 'SEO', d.channel) AS channel,
        SUM(CASE WHEN d.event_date BETWEEN c.win_start AND c.win_end THEN d.weight END) AS mtd,
        SUM(CASE WHEN d.event_date >= c.pm_start AND d.event_date < c.m_start THEN d.weight END) AS prior_full,
        SUM(CASE WHEN d.event_date >= c.ly_start AND d.event_date < c.ly_next THEN d.weight END) AS ly_full,
        ANY_VALUE(c.days_elapsed)  AS days_elapsed,
        ANY_VALUE(c.days_in_month) AS days_in_month
      FROM \`${D}.int_channel_funnel_daily\` d CROSS JOIN cal c
      GROUP BY 1, 2
    ),
    fcst AS (
      -- native materialized table (int_channel_forecast) — NOT the Sheets-federated
      -- forecast views, so the browser query needs no Drive scope (avoids 403).
      SELECT f.metric, f.channel, f.forecast_value AS forecast
      FROM \`${D}.int_channel_forecast\` f, cal c WHERE f.forecast_date = c.m_start
    ),
    base AS (
      SELECT a.metric, a.channel, a.mtd, a.prior_full, a.ly_full,
        CASE WHEN a.days_elapsed > 0 THEN a.mtd / a.days_elapsed * a.days_in_month END AS trajectory,
        f.forecast
      FROM agg a LEFT JOIN fcst f USING (metric, channel)
    ),
    rate AS (
      SELECT 'sync_rate' AS metric, t.channel,
        SAFE_DIVIDE(s.mtd, t.mtd)               AS mtd,
        SAFE_DIVIDE(s.prior_full, t.prior_full) AS prior_full,
        SAFE_DIVIDE(s.ly_full, t.ly_full)       AS ly_full,
        SAFE_DIVIDE(s.trajectory, t.trajectory) AS trajectory,
        SAFE_DIVIDE(s.forecast, t.forecast)     AS forecast
      FROM (SELECT * FROM base WHERE metric = 'trials') t
      LEFT JOIN (SELECT * FROM base WHERE metric = 'syncs') s USING (channel)
    ),
    unioned AS (
      SELECT metric, channel, mtd, trajectory, prior_full, ly_full, forecast FROM base
      UNION ALL
      SELECT metric, channel, mtd, trajectory, prior_full, ly_full, forecast FROM rate
    )
    SELECT
      metric, channel,
      mtd AS mtd_actual, trajectory,
      prior_full AS prior_month_full, ly_full AS last_year_full, forecast,
      SAFE_DIVIDE(trajectory - ly_full, ly_full)       AS yoy_pct,
      SAFE_DIVIDE(trajectory - prior_full, prior_full) AS mom_pct,
      SAFE_DIVIDE(trajectory - forecast, forecast)     AS fcst_pct
    FROM unioned
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
