// PredictorGrid — the "bleeding map" shown under the End-MRR heatmap. Answers
// "where's the biggest dollar bleeding?" with trailing-year gross MRR loss
// (full churn + downgrades — expansion is NOT netted) by tenure band (rows) ×
// health band (cols). Toggle $ lost vs % of the band's starting MRR. Reddest =
// most lost. Click a cell to drill into the accounts that bled.

import { useMemo, useState } from 'react';

const TENURE_ORDER = ['<1yr', '1-2yr', '3yr+'];
const HEALTH_ORDER = ['<30', '30-49', '50-69', '70+', 'No score'];
const HEALTH_LABEL = { '<30': 'Health <30', '30-49': 'Health 30–49', '50-69': 'Health 50–69', '70+': 'Health 70+', 'No score': 'No score' };

const sectionLabel = { fontSize: 13, color: '#6b7280', fontFamily: "'DM Sans', sans-serif" };

function formatUsd(v) {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${Math.round(abs)}`;
}

// Green (low loss) → amber → red (high loss). frac = value/max.
function lossBg(frac) {
  if (frac <= 0) return '#ecfdf5';
  const stops = [[0, [167, 243, 208]], [0.4, [253, 230, 138]], [0.7, [251, 146, 60]], [1, [239, 68, 68]]];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (frac >= stops[i][0] && frac <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const t = (frac - lo[0]) / (hi[0] - lo[0] || 1);
  const c = lo[1].map((ch, i) => Math.round(ch + (hi[1][i] - ch) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export default function PredictorGrid({ data, onCellClick }) {
  const [metric, setMetric] = useState('dollars'); // 'dollars' | 'rate'
  const { grid, tenures, healths, maxVal } = useMemo(() => {
    const map = {};
    const tSet = new Set(), hSet = new Set();
    let mx = 0;
    for (const r of data || []) {
      map[`${r.tenureBand}|${r.healthBand}`] = r;
      tSet.add(r.tenureBand); hSet.add(r.healthBand);
      mx = Math.max(mx, metric === 'dollars' ? (r.lost || 0) : (r.lossPct || 0));
    }
    return {
      grid: map,
      tenures: TENURE_ORDER.filter((t) => tSet.has(t)),
      healths: HEALTH_ORDER.filter((h) => hSet.has(h)),
      maxVal: mx || 1,
    };
  }, [data, metric]);

  if (!data || data.length === 0) return null;

  const clickable = typeof onCellClick === 'function';

  return (
    <div style={{ margin: '18px 0 8px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 2 }}>
        Where’s the bleeding? Gross MRR lost by tenure × health
      </div>
      <div style={{ ...sectionLabel, fontSize: 11, marginBottom: 8 }}>
        Trailing-year gross retention loss — full churn + downgrades, expansion not netted — per tenure × health band.
        Reddest = most lost. Toggle $ lost vs % of the band’s starting MRR. Click a cell to see the accounts that bled.
        Health is a current snapshot, so read as correlation, not forecast.
      </div>

      {/* $ / % toggle */}
      <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #d1d5db', marginBottom: 10 }}>
        {[['dollars', '$ lost'], ['rate', '% lost']].map(([k, label]) => (
          <button key={k} onClick={() => setMetric(k)}
            style={{
              padding: '3px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
              fontFamily: "'DM Sans', sans-serif", background: metric === k ? '#059669' : '#fff',
              color: metric === k ? '#fff' : '#374151',
            }}>
            {label}
          </button>
        ))}
      </div>

      <table style={{ borderCollapse: 'separate', borderSpacing: 3, fontFamily: "'DM Sans', sans-serif" }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', fontSize: 11, color: '#6b7280', padding: '0 8px' }}>Tenure \ Health</th>
            {healths.map((h) => (
              <th key={h} style={{ fontSize: 11.5, fontWeight: 700, color: '#374151', padding: '4px 10px', minWidth: 92 }}>
                {HEALTH_LABEL[h] || h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tenures.map((t) => (
            <tr key={t}>
              <td style={{ fontSize: 12, fontWeight: 700, color: '#374151', padding: '0 8px', whiteSpace: 'nowrap' }}>{t}</td>
              {healths.map((h) => {
                const r = grid[`${t}|${h}`];
                if (!r) return <td key={h} style={{ background: '#f8fafc', borderRadius: 6 }} />;
                const val = metric === 'dollars' ? (r.lost || 0) : (r.lossPct || 0);
                const frac = val / maxVal;
                const dark = frac > 0.6;
                const display = metric === 'dollars' ? formatUsd(r.lost) : `${r.lossPct}%`;
                const sub = metric === 'dollars' ? `${r.lossPct}% · n=${r.n}` : `${formatUsd(r.lost)} · n=${r.n}`;
                return (
                  <td key={h}
                    onClick={clickable ? () => onCellClick(t, h) : undefined}
                    title={`${t} · ${HEALTH_LABEL[h] || h} → ${formatUsd(r.lost)} lost (${r.lossPct}% of band, n=${r.n})${clickable ? ' — click to see accounts' : ''}`}
                    style={{ background: lossBg(frac), borderRadius: 6, padding: '7px 10px', textAlign: 'center', minWidth: 92, cursor: clickable ? 'pointer' : 'default' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: dark ? '#fff' : '#111827' }}>{display}</div>
                    <div style={{ fontSize: 10, color: dark ? 'rgba(255,255,255,.85)' : '#6b7280' }}>{sub}</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
