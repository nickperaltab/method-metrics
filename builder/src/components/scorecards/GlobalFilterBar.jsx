// Net SaaS global filter bar. Single-select dropdowns (V1) for the scorecard's
// dimensions. `primary` dims are always visible; `overflow` dims hide behind a
// "More filters" toggle. Each dropdown's value is filters[dim] (or '' = All).
// Changing a dropdown emits the FULL updated filters object so the controller
// can re-run every query.
//
// `options` is { [dim]: string[] } of available values; a dim may be missing or
// empty if its distinct values aren't loaded yet — we render just an "All" option.

import { useState } from 'react';

const bar = { display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 16 };
const field = { fontSize: 12, color: '#374151', fontFamily: "'DM Sans', sans-serif" };
const fieldLabel = { marginBottom: 4, fontWeight: 600 };
const select = { padding: '7px 10px', border: '1px solid #e2e5e9', borderRadius: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 13, minWidth: 130, background: '#fff' };
const toggleBtn = {
  padding: '7px 12px', fontSize: 12, fontFamily: "'DM Sans', sans-serif",
  border: '1px solid #e2e5e9', borderRadius: 6, background: '#fff', color: '#2563eb',
  cursor: 'pointer', alignSelf: 'flex-end',
};

function Dropdown({ dim, value, opts, onChange }) {
  return (
    <label style={field}>
      <div style={fieldLabel}>{dim}</div>
      <select value={value || ''} onChange={(e) => onChange(dim, e.target.value)} style={select}>
        <option value="">All</option>
        {(opts || []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

export default function GlobalFilterBar({ filters, options, onFilterChange, primary, overflow }) {
  const [showOverflow, setShowOverflow] = useState(false);

  const change = (dim, value) => {
    onFilterChange?.({ ...filters, [dim]: value || undefined });
  };

  const primaryDims = primary || [];
  const overflowDims = overflow || [];

  return (
    <div style={bar}>
      {primaryDims.map((dim) => (
        <Dropdown key={dim} dim={dim} value={filters?.[dim]} opts={options?.[dim]} onChange={change} />
      ))}

      {overflowDims.length > 0 && (
        <button type="button" style={toggleBtn} onClick={() => setShowOverflow((v) => !v)}>
          {showOverflow ? 'Fewer filters' : 'More filters'}
        </button>
      )}

      {showOverflow && overflowDims.map((dim) => (
        <Dropdown key={dim} dim={dim} value={filters?.[dim]} opts={options?.[dim]} onChange={change} />
      ))}
    </div>
  );
}
