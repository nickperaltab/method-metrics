// Channel ARR — data layer for the marketing Revenue-by-Channel page.
//
// Reads the dbt-managed, Looker-parity-verified directional view
// `revenue.v_channel_arr` (one row per channel x month, pre-FX SaaS split) and
// derives ARPC / ARR / CAD ARR + a 3-month rolling CAD ARR. FX is applied here
// (not in the view) so the USD->CAD rate stays an adjustable control.
//
// BASIS: Custdatlastsaasamount (run-rate snapshot) — DIRECTIONAL, not
// accounting-grade. See docs/metric-definitions.md "Channel ARR".

import { queryBq } from './bigquery';

const VIEW = 'project-for-method-dw.revenue.v_channel_arr';

// Trailing 3 calendar months [m-2, m-1, m] as 'YYYY-MM-01' strings.
function trailing3(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const out = [];
  for (let k = 2; k >= 0; k--) {
    const d = new Date(Date.UTC(y, m - 1 - k, 1));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function addRollingCadArr(rows) {
  const byChannel = {};
  for (const r of rows) (byChannel[r.channel] ||= []).push(r);
  for (const ch of Object.keys(byChannel)) {
    const series = byChannel[ch].sort((a, b) => a.month.localeCompare(b.month));
    const valByMonth = new Map(series.map((r) => [r.month, r.cadArr]));
    for (const r of series) {
      const vals = trailing3(r.month)
        .map((m) => valByMonth.get(m))
        .filter((v) => v != null);
      // average over the calendar months present in the trailing window
      r.cadArr3mo = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : r.cadArr;
    }
  }
}

export async function fetchChannelArr({ rate = 1.33 } = {}) {
  const sql = `
    SELECT FORMAT_DATE('%Y-%m-%d', month) AS month, channel,
      customers, attribution_value, saas_usd,
      saas_us_portion, saas_nonus_portion, first_invoice_weighted
    FROM \`${VIEW}\`
    ORDER BY channel, month`;
  const { rows } = await queryBq(sql);

  const data = rows.map((r) => {
    const att = Number(r.attribution_value) || 0;
    const saas = Number(r.saas_usd) || 0;
    const saasCad = (Number(r.saas_us_portion) || 0) * rate + (Number(r.saas_nonus_portion) || 0);
    return {
      month: r.month,
      channel: r.channel,
      customers: Number(r.customers) || 0,
      attributionValue: att,
      saas,
      arpc: att ? saas / att : 0,
      arr: att ? (saas / att) * 12 : 0,
      cadArr: att ? (saasCad / att) * 12 : 0,
      avgFirstInvoice: att ? (Number(r.first_invoice_weighted) || 0) / att : 0,
    };
  });

  addRollingCadArr(data);
  return data;
}

// Distinct months present in the data, newest first.
export function monthsOf(data) {
  return [...new Set(data.map((d) => d.month))].sort().reverse();
}
