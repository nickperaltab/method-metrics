// Net SaaS L3 account table. Renders the queried account rows for a drilled
// slice (top 50 by impact). Columns are path-aware: config.l3.core (always) +
// config.l3.extras[drill] (per drilled bar). This component only DISPLAYS the
// rows it's handed — no derived math (cf. ChannelTable, which we borrow the
// sort/header approach from but not its ARR/CAD computation).
//
// Missing keys render as '—' (New/Churn rows lack seat/app/price_mrr;
// Expansion/Downgrade rows lack signupMonth/cohortAgeMonths).

import { useMemo, useState } from 'react';

function formatUsd(v) {
  if (v == null || v === '' || isNaN(v)) return '—';
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
}

const fmt = {
  currency: (v) => formatUsd(v),
  number: (v) => (v == null || v === '' || isNaN(v)) ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }),
  month: (v) => (v == null || v === '') ? '—' : String(v).slice(0, 7),
  date: (v) => (v == null || v === '') ? '—' : String(v).slice(0, 10),
  text: (v) => (v == null || v === '') ? '—' : String(v),
  // Signed trend: ▲ up / ▼ down / · flat / — new (no prior). Colored in-cell.
  delta: (v) => {
    if (v == null || v === '' || isNaN(v)) return '—';
    const n = Number(v);
    if (n === 0) return '·';
    return `${n > 0 ? '▲' : '▼'} ${formatUsd(Math.abs(n))}`;
  },
};

// Cell text color for the signed 'delta' (trend) column.
function deltaColor(v) {
  if (v == null || v === '' || isNaN(v) || Number(v) === 0) return null;
  return Number(v) > 0 ? '#059669' : '#dc2626';
}

const th = { textAlign: 'right', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '2px solid #e2e5e9', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' };
const thL = { ...th, textAlign: 'left' };
const td = { textAlign: 'right', padding: '7px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#374151', borderBottom: '1px solid #f1f3f5', whiteSpace: 'nowrap' };
const tdL = { ...td, textAlign: 'left', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 };

// `columns` (optional) lets a caller supply an explicit column list
// ([{key,label,format}]) — used by the funnel drill, whose rows don't map onto
// the netSaas config.l3 shape. When omitted, columns derive from config.l3 as
// before (unchanged for DecompositionDrill).
export default function NetSaasAccountTable({ rows, drill, config, onRowClick, columns: columnsProp }) {
  const columns = useMemo(() => {
    if (columnsProp) return columnsProp;
    const core = config?.l3?.core || [];
    const extras = (config?.l3?.extras && drill && config.l3.extras[drill]) || [];
    return [...core, ...extras];
  }, [columnsProp, config, drill]);

  // First text column renders left-aligned (e.g. Company); rest right-aligned.
  const firstTextKey = columns.find((c) => c.format === 'text')?.key;

  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  const sorted = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    if (!sortKey) return rows;
    const norm = (v) => (v == null || v === '' || (typeof v === 'number' && isNaN(v))) ? -Infinity : v;
    const out = [...rows];
    out.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const an = norm(av), bn = norm(bv);
      let cmp;
      if (typeof an === 'string' || typeof bn === 'string') {
        cmp = String(an === -Infinity ? '' : an).localeCompare(String(bn === -Infinity ? '' : bn));
      } else {
        cmp = an - bn;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  if (!rows || rows.length === 0) {
    return <p style={{ color: '#6b7280', fontSize: 13, padding: 16 }}>No accounts in this slice.</p>;
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '8px 0 10px', fontFamily: "'DM Sans', sans-serif" }}>
        {rows.length} account{rows.length === 1 ? '' : 's'} · top 50 by impact
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={c.key === firstTextKey ? thL : th} onClick={() => toggleSort(c.key)}
                  title={c.help || 'Click header to sort'}>
                  {c.label}{c.help ? ' ⓘ' : ''}{sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr
                key={r.id ?? r.Company ?? i}
                onClick={() => onRowClick?.(r)}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
                onMouseEnter={onRowClick ? (e) => { e.currentTarget.style.background = '#f1f5f9'; } : undefined}
                onMouseLeave={onRowClick ? (e) => { e.currentTarget.style.background = ''; } : undefined}
              >
                {columns.map((c) => {
                  const dc = c.format === 'delta' ? deltaColor(r[c.key]) : null;
                  const base = c.key === firstTextKey ? tdL : td;
                  return (
                    <td key={c.key} style={dc ? { ...base, color: dc, fontWeight: 700 } : base}>
                      {(fmt[c.format] || fmt.text)(r[c.key])}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
