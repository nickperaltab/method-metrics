// PredictorGrid — a small diagnostic shown under the End-MRR heatmap. Answers
// "what predicts MRR churn better, tenure or health?" with the control test:
// trailing-year MRR churn by tenure band (rows) × health band (cols). Health
// dominates (columns swing hard), tenure adds a smaller within-unhealthy effect.
// Display-only; cells colored by churn rate.

import { useMemo } from 'react';

const TENURE_ORDER = ['<1yr', '1-3yr', '4yr+'];
const HEALTH_ORDER = ['<40', '40-69', '70+', 'No score'];
const HEALTH_LABEL = { '<40': 'Health <40', '40-69': 'Health 40–69', '70+': 'Health 70+', 'No score': 'No score' };

const sectionLabel = { fontSize: 13, color: '#6b7280', fontFamily: "'DM Sans', sans-serif" };

// Green (low churn) → amber → red (high churn). frac = churn/maxChurn.
function churnBg(frac) {
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

export default function PredictorGrid({ data }) {
  const { grid, tenures, healths, maxChurn } = useMemo(() => {
    const map = {};
    const tSet = new Set(), hSet = new Set();
    let mx = 0;
    for (const r of data || []) {
      map[`${r.tenureBand}|${r.healthBand}`] = r;
      tSet.add(r.tenureBand); hSet.add(r.healthBand);
      mx = Math.max(mx, r.churn || 0);
    }
    return {
      grid: map,
      tenures: TENURE_ORDER.filter((t) => tSet.has(t)),
      healths: HEALTH_ORDER.filter((h) => hSet.has(h)),
      maxChurn: mx || 1,
    };
  }, [data]);

  if (!data || data.length === 0) return null;

  return (
    <div style={{ margin: '18px 0 8px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 2 }}>
        What predicts MRR churn — health or tenure?
      </div>
      <div style={{ ...sectionLabel, fontSize: 11, marginBottom: 8 }}>
        Trailing-year MRR churn by tenure × health. Read across a row: health swings churn hard (it's the stronger
        signal). Read down a column: tenure adds a smaller effect, mostly among unhealthy accounts. Health is a current
        snapshot, so read as correlation, not forecast.
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
                const frac = (r.churn || 0) / maxChurn;
                const dark = frac > 0.6;
                return (
                  <td key={h} title={`${t} · ${HEALTH_LABEL[h]} → ${r.churn}% MRR churn (n=${r.n})`}
                    style={{ background: churnBg(frac), borderRadius: 6, padding: '7px 10px', textAlign: 'center', minWidth: 92 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: dark ? '#fff' : '#111827' }}>{r.churn}%</div>
                    <div style={{ fontSize: 10, color: dark ? 'rgba(255,255,255,.85)' : '#6b7280' }}>n={r.n}</div>
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
