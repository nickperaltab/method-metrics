import { useState, useEffect } from 'react';
import { queryBq } from '../../lib/bigquery';
import { buildRetentionTriangleSql, toTriangle, filterOptions, FILTER_DIMS } from '../../lib/retentionTriangleSql';
import MultiSelect from './MultiSelect';

const MEASURES = [{ k: 'customers', l: 'Customers (%)' }, { k: 'mrr', l: 'MRR (net %)' }];
const BASES = [{ k: 'from_start', l: 'From start' }, { k: 'mom', l: 'Previous month' }];

// Red (low) -> amber -> green (high), auto-scaled to the grid's actual min..max for
// the current view, so the spread is visible whatever range the data occupies
// (MoM clusters near 100; from-start spans ~35..100).
function retentionColor(pct, min, max) {
  if (pct == null) return 'transparent';
  const span = max - min;
  const frac = span > 0 ? Math.max(0, Math.min(1, (pct - min) / span)) : 0.5;
  const stops = [[0, [220, 38, 38]], [0.5, [245, 158, 11]], [1, [5, 150, 105]]];
  let lo = stops[0], hi = stops[2];
  for (let i = 0; i < 2; i++) if (frac >= stops[i][0] && frac <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  const t = (frac - lo[0]) / (hi[0] - lo[0] || 1);
  const c = lo[1].map((ch, i) => Math.round(ch + (hi[1][i] - ch) * t));
  return `rgba(${c[0]},${c[1]},${c[2]},0.55)`;
}

const cell = { padding: '4px 6px', fontSize: 11, textAlign: 'center', borderRadius: 3, minWidth: 46 };

function Toggle({ opts, val, set }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, marginRight: 16 }}>
      {opts.map((o) => (
        <button key={o.k} onClick={() => set(o.k)} style={{
          padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid #d1d5db',
          background: val === o.k ? '#059669' : '#fff', color: val === o.k ? '#fff' : '#374151',
        }}>{o.l}</button>
      ))}
    </span>
  );
}

const MIN_COHORT = 20;

export default function RetentionTriangle() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [measure, setMeasure] = useState('customers');
  const [basis, setBasis] = useState('mom');
  const [filters, setFilters] = useState({ l1: new Set(), segment: new Set(), country: new Set(), channel: new Set() });

  useEffect(() => {
    let alive = true;
    queryBq(buildRetentionTriangleSql())
      .then((res) => { if (alive) setRows(res?.rows ?? []); })
      .catch((e) => { if (alive) setError(e.message || String(e)); });
    return () => { alive = false; };
  }, []);

  if (error) return <div style={{ color: '#b91c1c', padding: 16 }}>Failed to load: {error}</div>;
  if (!rows) return <div style={{ color: '#6b7280', padding: 16 }}>Loading retention triangle…</div>;

  const options = filterOptions(rows);
  const { cohorts, tenures, cells, averages } = toTriangle(rows, measure, basis, filters, MIN_COHORT);
  // Auto-scale the color ramp to the values actually on screen for this view.
  const flat = cohorts.flatMap((c) => cells[c.cohort_month]).filter((v) => v != null);
  const vmin = flat.length ? Math.min(...flat) : 0;
  const vmax = flat.length ? Math.max(...flat) : 100;

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        {FILTER_DIMS.map((d) => (
          <MultiSelect
            key={d.key}
            label={d.label}
            options={options[d.key] || []}
            selected={filters[d.key]}
            onChange={(s) => setFilters({ ...filters, [d.key]: s })}
          />
        ))}
      </div>
      <div style={{ marginBottom: 10 }}>
        <Toggle opts={MEASURES} val={measure} set={setMeasure} />
        <Toggle opts={BASES} val={basis} set={setBasis} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontFamily: "'DM Sans', sans-serif" }}>
          <thead>
            <tr>
              <th style={{ ...cell, color: '#6b7280', textAlign: 'left' }}>Cohort</th>
              <th style={{ ...cell, color: '#6b7280' }}>n</th>
              {tenures.map((k) => <th key={k} style={{ ...cell, color: '#6b7280' }}>{k}</th>)}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => (
              <tr key={c.cohort_month}>
                <td style={{ ...cell, textAlign: 'left', color: '#1a1a1a' }}>{c.cohort_month.slice(0, 7)}</td>
                <td style={{ ...cell, color: '#6b7280' }}>{c.n_start}</td>
                {tenures.map((k) => {
                  const v = cells[c.cohort_month][k];
                  return <td key={k} style={{ ...cell, background: retentionColor(v, vmin, vmax), color: '#1a1a1a' }}>{v == null ? '' : v + '%'}</td>;
                })}
              </tr>
            ))}
            <tr>
              <td style={{ ...cell, textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>Avg (last 6)</td>
              <td style={cell}></td>
              {tenures.map((k) => <td key={k} style={{ ...cell, fontWeight: 700 }}>{averages[k] == null ? '' : averages[k] + '%'}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
