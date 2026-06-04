// Net SaaS L2 split panel. Renders below the bridge when a delta bar is drilled.
//
// Two modes (driven by `mode` from config.drills[bar].mode):
//   'component'  (Expansion / Downgrade): data = { seats, apps, price }. Three
//                labeled rows, each clickable -> onSliceClick('seats'|'apps'|'price').
//   'dimension'  (New / Churn): data = [{ bucket, value }] sorted desc. One row
//                per bucket, clickable -> onSliceClick(bucket), plus a dim switcher
//                (segmented buttons over `dims`) calling onDimChange(dim).
//
// Each row is a DOM button (not an ECharts click) for reliable slice selection,
// with an inline magnitude bar (width = % of the max abs value). Color by sign.
// When showDelta && priorData, annotate each row with a ▲/▼ % via computeDelta
// against the matching prior value (component matched by name, dim by bucket).

import { useMemo } from 'react';
import { computeDelta } from '../../lib/netSaasTransform';

const COLOR_POSITIVE = '#059669';
const COLOR_NEGATIVE = '#dc2626';

function formatUsd(v) {
  if (v == null || isNaN(v)) return '';
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
}

const COMPONENT_ORDER = ['seats', 'apps', 'price'];
const COMPONENT_LABELS = { seats: 'Seats', apps: 'Apps', price: 'Price' };

const panel = { margin: '8px 0 4px', fontFamily: "'DM Sans', sans-serif" };
const switcher = { display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' };
const segBtn = (active) => ({
  padding: '5px 12px', fontSize: 12, fontFamily: "'DM Sans', sans-serif",
  border: '1px solid #e2e5e9', borderRadius: 6, cursor: 'pointer',
  background: active ? '#2563eb' : '#fff', color: active ? '#fff' : '#374151',
  fontWeight: active ? 700 : 500,
});
const rowBtn = {
  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
  background: 'none', border: 'none', borderBottom: '1px solid #f1f3f5',
  padding: '8px 4px', cursor: 'pointer', textAlign: 'left',
};
const rowLabel = { flex: '0 0 140px', fontSize: 13, color: '#374151', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const barTrack = { flex: 1, height: 10, background: '#f1f3f5', borderRadius: 3, overflow: 'hidden', minWidth: 40 };
const rowValue = { flex: '0 0 auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#374151', minWidth: 64, textAlign: 'right' };
const deltaChip = (dir) => ({
  flex: '0 0 auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
  minWidth: 52, textAlign: 'right',
  color: dir === 'up' ? COLOR_POSITIVE : dir === 'down' ? COLOR_NEGATIVE : '#9ca3af',
});

function deltaLabel(current, prior) {
  if (prior == null) return null;
  const { pct, direction } = computeDelta(current, prior);
  if (direction === 'flat') return null;
  const arrow = direction === 'up' ? '▲' : '▼';
  const text = pct == null ? arrow : `${arrow} ${Math.abs(pct * 100).toFixed(0)}%`;
  return { text, direction };
}

export default function L2Panel({ drill, mode, data, dims, activeDim, onDimChange, onSliceClick, showDelta, priorData }) {
  // Normalize both modes into a uniform list of rows: {key, label, value}.
  const rows = useMemo(() => {
    // component mode: data is a {seats,apps,price} object. Guard against an array
    // (stale dimension data) so we never read array indices as components.
    if (mode === 'component') {
      const d = data && !Array.isArray(data) ? data : {};
      return COMPONENT_ORDER
        .filter((k) => k in d)
        .map((k) => ({ key: k, label: COMPONENT_LABELS[k] || k, value: Number(d[k]) || 0 }));
    }
    // dimension mode: data is [{bucket, value}] (already sorted desc by caller).
    // Guard against a non-array (stale component object) to avoid a .map crash.
    if (!Array.isArray(data)) return [];
    return data.map((r) => ({ key: r.bucket, label: r.bucket ?? '(none)', value: Number(r.value) || 0 }));
  }, [mode, data]);

  // Prior lookup for delta annotations.
  const priorMap = useMemo(() => {
    if (!showDelta || !priorData) return null;
    const m = {};
    if (mode === 'component') {
      if (Array.isArray(priorData)) return null; // stale dimension prior; skip deltas
      for (const k of COMPONENT_ORDER) {
        if (k in priorData) m[k] = Number(priorData[k]) || 0;
      }
    } else {
      if (!Array.isArray(priorData)) return null; // stale component prior; skip deltas
      for (const r of priorData) m[r.bucket] = Number(r.value) || 0;
    }
    return m;
  }, [showDelta, priorData, mode]);

  const maxAbs = useMemo(() => rows.reduce((mx, r) => Math.max(mx, Math.abs(r.value)), 0) || 1, [rows]);

  return (
    <div style={panel}>
      {mode === 'dimension' && dims && dims.length > 0 && (
        <div style={switcher} role="group" aria-label="Split dimension">
          {dims.map((dim) => (
            <button key={dim} type="button" style={segBtn(dim === activeDim)} onClick={() => onDimChange?.(dim)}>
              {dim}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 13, padding: '8px 0' }}>No split data for this slice.</p>
      ) : (
        rows.map((r) => {
          const color = r.value >= 0 ? COLOR_POSITIVE : COLOR_NEGATIVE;
          const width = `${Math.round((Math.abs(r.value) / maxAbs) * 100)}%`;
          const delta = priorMap && (r.key in priorMap) ? deltaLabel(r.value, priorMap[r.key]) : null;
          return (
            <button key={r.key} type="button" style={rowBtn} onClick={() => onSliceClick?.(r.key)}
              title={`Drill into ${r.label} accounts`}>
              <span style={rowLabel}>{r.label}</span>
              <span style={barTrack}>
                <span style={{ display: 'block', height: '100%', width, background: color }} />
              </span>
              <span style={{ ...rowValue, color }}>{formatUsd(r.value)}</span>
              <span style={deltaChip(delta?.direction)}>{delta ? delta.text : ''}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
