// builder/src/components/scorecards/GrrSegmentBars.jsx
// Clickable horizontal GRR bars, one per segment value. Bar width ∝ GRR
// (clamped 0–100%), annotated with GRR %, StartMRR base, and customer count
// so a high GRR on a tiny base reads as tiny. Click → onSelect(segment).
import { useState } from 'react';

const fontMono = "'JetBrains Mono', monospace";
const fontSans = "'DM Sans', sans-serif";

function formatUsd(v) {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${Math.round(abs)}`;
}
const pctLabel = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

export default function GrrSegmentBars({ rows, onSelect, selected }) {
  const [hovered, setHovered] = useState(null);
  if (!rows) return null;
  if (rows.length === 0) {
    return <p style={{ color: '#6b7280', fontSize: 13, padding: 16, fontFamily: fontSans }}>No segments in this slice.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0 16px' }}>
      {rows.map((r) => {
        const active = selected === r.segment || hovered === r.segment;
        const w = Math.max(0, Math.min(1, r.grr ?? 0)) * 100;
        const unclassified = r.segment === 'Unclassified';
        return (
          <div
            key={r.segment}
            onClick={() => onSelect?.(r.segment)}
            onMouseEnter={() => setHovered(r.segment)}
            onMouseLeave={() => setHovered(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: onSelect ? 'pointer' : 'default' }}
          >
            <div style={{
              width: 220, fontSize: 13, fontWeight: selected === r.segment ? 700 : 600,
              color: unclassified ? '#9ca3af' : '#374151', fontFamily: fontSans,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right',
            }} title={r.segment}>
              {r.segment}
            </div>
            <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 4, height: 22 }}>
              <div style={{
                width: `${w}%`, height: '100%', borderRadius: 4,
                background: unclassified ? '#9ca3af' : '#059669',
                opacity: active ? 1 : 0.8, transition: 'opacity 120ms',
              }} />
            </div>
            <div style={{ width: 260, fontFamily: fontMono, fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>
              <strong>{pctLabel(r.grr)}</strong>
              <span style={{ color: '#9ca3af' }}>{` · ${formatUsd(r.start_mrr)} base · ${Number(r.customers || 0).toLocaleString()} cust`}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
