import { queryBq } from './bigquery.js';

const D = 'project-for-method-dw.revenue';

/**
 * Trial -> sync -> paying funnel by click-derived channel, including AIO.
 *
 * Backed by revenue.v_channel_funnel, which roots in int_cookie_clicks rather
 * than Account.Att_*. That is the whole reason AIO can appear here and cannot
 * appear on Channel Trajectory: there is no Att_AIO column.
 *
 * DOES NOT RECONCILE to Channel Trajectory or v_channel_scorecard. Different
 * basis, same channel vocabulary. Do not chase the delta.
 */
export function buildChannelFunnelSql({ start, end }) {
  return `
    SELECT
      channel,
      SUM(trials) AS trials,
      SUM(synced) AS synced,
      SUM(paying) AS paying
    FROM \`${D}.v_channel_funnel\`
    WHERE signup_month >= DATE('${start}')
      AND signup_month <= DATE('${end}')
    GROUP BY channel
    ORDER BY trials DESC
  `;
}

/**
 * BigQuery returns every value as a string, including numerics, so coerce
 * before any arithmetic. Rates are computed here rather than in SQL so a
 * zero-trial channel yields null instead of a divide-by-zero.
 */
export function shapeChannelFunnel(rows) {
  const channels = (rows || []).map(r => {
    const trials = Number(r.trials) || 0;
    const synced = Number(r.synced) || 0;
    const paying = Number(r.paying) || 0;
    return {
      channel: r.channel,
      trials,
      synced,
      paying,
      syncRate: trials > 0 ? synced / trials : null,
      payRate: trials > 0 ? paying / trials : null,
    };
  });

  const total = channels.reduce(
    (a, c) => ({ trials: a.trials + c.trials, synced: a.synced + c.synced, paying: a.paying + c.paying }),
    { trials: 0, synced: 0, paying: 0 },
  );

  return {
    channels,
    total: {
      ...total,
      syncRate: total.trials > 0 ? total.synced / total.trials : null,
      payRate: total.trials > 0 ? total.paying / total.trials : null,
    },
  };
}

export async function fetchChannelFunnel({ start, end }) {
  const { rows } = await queryBq(buildChannelFunnelSql({ start, end }));
  return shapeChannelFunnel(rows);
}
