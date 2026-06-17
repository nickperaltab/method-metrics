// BookHeatmap — L2 view for the End-MRR "current book" drill. Renders the
// standing book as a health-tier (rows) × license-band (cols) grid. Each cell
// shows account count + MRR; clicking a cell drills to that segment's accounts.
//
// Pure display: takes the rows from fetchBookHeatmap ([{tier, licenseBand,
// accounts, mrr}]) and a metric toggle. Color encodes the chosen metric so the
// concentration reads at a glance (cf. the Health × License heatmap mockup).

import { useMemo, useState } from 'react';

// Row order: healthiest at top (mirrors the mockup). Cols left→right by size.
const TIER_ORDER = ['Green', 'Yellow', 'Orange', 'Red', 'Critical', 'No score'];
const BAND_ORDER = ['1', '2', '3', '4-5', '6-9', '10+', '0'];
const TIER_COLOR = {
  Green: '#059669', Yellow: '#ca8a04', Orange: '#ea580c', Red: '#dc2626',
  Critical: '#991b1b', 'No score': '#6b7280',
};
// HealthScore range per tier (shown under the tier name).
const TIER_RANGE = {
  Green: '70–100', Yellow: '55–69', Orange: '40–54', Red: '10–39',
  Critical: '0–9', 'No score': 'n/a',
};
const BAND_LABEL = { '0': 'No bill', '10+': '10+' };

function fmtUsd(v) {
  if (!v) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}

// Teal→amber→red ramp keyed to the cell's share of the max metric value.
function cellBg(frac) {
  if (frac <= 0) return '#f8fafc';
  const stops = [
    [0.0, [236, 253, 245]], [0.25, [167, 243, 208]], [0.5, [45, 212, 191]],
    [0.75, [245, 158, 11]], [1.0, [239, 68, 68]],
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (frac >= stops[i][0] && frac <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const t = (frac - lo[0]) / (hi[0] - lo[0] || 1);
  const c = lo[1].map((ch, i) => Math.round(ch + (hi[1][i] - ch) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const sectionLabel = { fontSize: 13, color: '#6b7280', fontFamily: "'DM Sans', sans-serif" };

export default function BookHeatmap({ data, benchmark, onCellClick }) {
  const [metric, setMetric] = useState('mrr'); // 'mrr' | 'accounts'

  const { grid, bands, tiers, maxVal, totals } = useMemo(() => {
    const map = {};
    const bandSet = new Set();
    const tierSet = new Set();
    let mx = 0;
    const colTot = {};
    for (const r of data || []) {
      map[`${r.tier}|${r.licenseBand}`] = r;
      bandSet.add(r.licenseBand); tierSet.add(r.tier);
      mx = Math.max(mx, r[metric] || 0);
      colTot[r.licenseBand] = (colTot[r.licenseBand] || 0) + (r[metric] || 0);
    }
    return {
      grid: map,
      bands: BAND_ORDER.filter((b) => bandSet.has(b)),
      tiers: TIER_ORDER.filter((t) => tierSet.has(t)),
      maxVal: mx || 1,
      totals: colTot,
    };
  }, [data, metric]);

  if (!data || data.length === 0) {
    return <p style={{ ...sectionLabel, padding: 16 }}>No accounts in the current book.</p>;
  }

  const cellNum = (r) => (metric === 'mrr' ? fmtUsd(r.mrr) : r.accounts.toLocaleString());
  const cellSub = (r) => (metric === 'mrr' ? `${r.accounts} accts` : fmtUsd(r.mrr));

  return (
    <div style={{ margin: '12px 0 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <span style={{ ...sectionLabel, fontWeight: 700, color: '#1a1a1a' }}>
          Current book · health × licenses
        </span>
        <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #d1d5db' }}>
          {[['mrr', 'MRR'], ['accounts', 'Accounts']].map(([k, lbl]) => (
            <button key={k} onClick={() => setMetric(k)} style={{
              padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
              fontFamily: "'DM Sans', sans-serif",
              background: metric === k ? '#059669' : '#fff', color: metric === k ? '#fff' : '#374151',
            }}>{lbl}</button>
          ))}
        </div>
        <span style={{ ...sectionLabel, fontSize: 12 }}>color = {metric === 'mrr' ? 'MRR' : 'account'} concentration · click a cell to drill</span>
      </div>

      <div style={{ ...sectionLabel, fontSize: 11, marginBottom: 8 }}>
        Churn / yr = share of each tier that churned over the trailing 12 months. Health is a current snapshot, so read it as correlation, not a forecast.
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 3, fontFamily: "'DM Sans', sans-serif" }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', fontSize: 11, color: '#6b7280', padding: '0 8px' }}>Health \ Licenses</th>
              <th style={{ fontSize: 11, color: '#6b7280', padding: '4px 8px' }} title="Trailing-12-month churn rate for accounts in this health tier">Churn&nbsp;/&nbsp;yr</th>
              {bands.map((b) => (
                <th key={b} style={{ fontSize: 12, fontWeight: 700, color: '#374151', padding: '4px 8px', minWidth: 78 }}>
                  {BAND_LABEL[b] || b}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t}>
                <td style={{ padding: '0 8px', whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: TIER_COLOR[t] || '#374151' }}>{t}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>{TIER_RANGE[t] || ''}</div>
                </td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} title={benchmark?.[t] ? `${benchmark[t].n} accounts a year ago` : ''}>
                  {benchmark?.[t]
                    ? <span style={{ fontSize: 12.5, fontWeight: 700, color: TIER_COLOR[t] || '#374151' }}>{benchmark[t].churn}%</span>
                    : <span style={{ fontSize: 11, color: '#d1d5db' }}>—</span>}
                </td>
                {bands.map((b) => {
                  const r = grid[`${t}|${b}`];
                  if (!r) return <td key={b} style={{ background: '#f8fafc', borderRadius: 6 }} />;
                  const frac = (r[metric] || 0) / maxVal;
                  const dark = frac > 0.55;
                  return (
                    <td key={b}
                      onClick={() => onCellClick?.(t, b)}
                      title={`${t} · ${b} licenses → ${r.accounts} accounts · ${fmtUsd(r.mrr)}`}
                      style={{
                        background: cellBg(frac), borderRadius: 6, padding: '6px 8px', cursor: 'pointer',
                        textAlign: 'center', minWidth: 78,
                      }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: dark ? '#fff' : '#111827' }}>{cellNum(r)}</div>
                      <div style={{ fontSize: 10.5, color: dark ? 'rgba(255,255,255,.85)' : '#6b7280' }}>{cellSub(r)}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td style={{ fontSize: 10.5, color: '#9ca3af', padding: '4px 8px' }}>Total</td>
              <td />
              {bands.map((b) => (
                <td key={b} style={{ textAlign: 'center', fontSize: 11, color: '#6b7280', paddingTop: 4 }}>
                  {metric === 'mrr' ? fmtUsd(totals[b]) : (totals[b] || 0).toLocaleString()}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
