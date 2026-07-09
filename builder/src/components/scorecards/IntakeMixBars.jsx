// builder/src/components/scorecards/IntakeMixBars.jsx
// Div-based horizontal stacked bars, one row per quarter. Each row is a
// 100%-width track split into size-band segments proportional to that quarter's
// share. '$5M+' is drawn first (left) so the "good" share reads left-aligned.
// A `benchmarkPct` prop draws a dashed vertical reference line at that % across
// all rows (the top-30% share of $5M+). No ECharts — pure divs.
import { useState } from 'react';

const fontMono = "'JetBrains Mono', monospace";
const fontSans = "'DM Sans', sans-serif";

// Order matters: $5M+ leftmost, No data (grey) rightmost. Grey = never synced,
// which is itself signal, not noise.
const BAND_ORDER = ['$5M+', '$1M–$5M', '<$1M', 'No data'];
const BAND_COLOR = {
  '$5M+': '#085c40',
  '$1M–$5M': '#1d9f74',
  '<$1M': '#6fc4a3',
  'No data': '#d1d5db',
};

// rows: [{ quarter, label, total, bands: { band: n } }]
export default function IntakeMixBars({ rows, benchmarkPct }) {
  const [hovered, setHovered] = useState(null);
  if (!rows) return null;
  if (rows.length === 0) {
    return <p style={{ color: '#6b7280', fontSize: 13, padding: 16, fontFamily: fontSans }}>No quarters in this slice.</p>;
  }
  return (
    <div style={{ margin: '8px 0 16px' }}>
      {/* legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '0 0 10px' }}>
        {BAND_ORDER.map((band) => (
          <span key={band} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', fontFamily: fontSans }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: BAND_COLOR[band], display: 'inline-block' }} />
            {band}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r) => (
          <div key={r.quarter} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 110, fontSize: 13, fontWeight: 600, color: '#374151', fontFamily: fontSans,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right',
            }}>
              {r.label}
            </div>
            <div style={{ position: 'relative', flex: 1, background: '#f3f4f6', borderRadius: 4, height: 22, display: 'flex', overflow: 'hidden' }}>
              {BAND_ORDER.map((band) => {
                const n = Number(r.bands?.[band] || 0);
                const pct = r.total > 0 ? (n / r.total) * 100 : 0;
                if (pct <= 0) return null;
                const key = `${r.quarter}:${band}`;
                return (
                  <div
                    key={band}
                    title={`${band} · ${n.toLocaleString()} (${pct.toFixed(1)}%)`}
                    onMouseEnter={() => setHovered(key)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      width: `${pct}%`, height: '100%', background: BAND_COLOR[band],
                      opacity: hovered === key ? 1 : 0.88, transition: 'opacity 120ms',
                    }}
                  />
                );
              })}
              {benchmarkPct != null && (
                <div
                  title={`top-30% share of $5M+: ${Number(benchmarkPct).toFixed(1)}%`}
                  style={{
                    position: 'absolute', top: -2, bottom: -2, left: `${Math.max(0, Math.min(100, benchmarkPct))}%`,
                    borderLeft: '2px dashed #1a1a1a', pointerEvents: 'none',
                  }}
                />
              )}
            </div>
            <div style={{ width: 90, fontFamily: fontMono, fontSize: 12, color: '#374151', whiteSpace: 'nowrap', textAlign: 'right' }}>
              {Number(r.total || 0).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {benchmarkPct != null && (
        <p style={{ fontSize: 11, color: '#6b7280', margin: '8px 0 0', fontFamily: fontSans }}>
          <span style={{ display: 'inline-block', width: 14, borderTop: '2px dashed #1a1a1a', marginRight: 6, verticalAlign: 'middle' }} />
          top-30% share of $5M+: {Number(benchmarkPct).toFixed(1)}%
        </p>
      )}
    </div>
  );
}
