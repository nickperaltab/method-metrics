// Channel ARR breakdown table — Looker "Revenue by Channel" replica as a
// scorecard section. Fetches the BASE metrics grouped by channel (390-395),
// computes the derived columns (ARPC/ARR/CAD ARR/Avg First Invoice) client-side,
// and wires each cell to the MetricInspector drill-down via onMetricClick.
//
// Filters: month selector + adjustable USD->CAD rate. Sortable headers, grand
// total row. DIRECTIONAL (run-rate); see docs/metric-definitions.md "Channel ARR".

import { useMemo, useState } from 'react';

// base-metric ids (grouped by channel)
const M = { saas: 390, us: 391, nonus: 392, attr: 393, customers: 394, firstInv: 395 };

const DEFAULT_COLUMNS = [
  { key: 'customers',       label: 'Unique Customers', metricId: 394, format: 'number'  },
  { key: 'attribution',     label: 'AttributionValue', metricId: 393, format: 'number2' },
  { key: 'avgFirstInvoice', label: 'Avg First Invoice', metricId: 396, format: 'currency' },
  { key: 'saas',            label: 'SaaS',             metricId: 390, format: 'currency' },
  { key: 'arpc',            label: 'ARPC',             metricId: 397, format: 'currency' },
  { key: 'arr',             label: 'ARR',              metricId: 398, format: 'currency' },
  { key: 'cadArr',          label: 'CAD ARR',          metricId: 399, format: 'currency' },
  { key: 'cadArr3mo',       label: 'CAD ARR (3-mo)',   format: 'currency' },
];

const fmt = {
  number:   (v) => (Number(v) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }),
  number2:  (v) => (Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  currency: (v) => '$' + (Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

const th = { textAlign: 'right', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '2px solid #e2e5e9', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' };
const thL = { ...th, textAlign: 'left' };
const td = { textAlign: 'right', padding: '7px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#374151', borderBottom: '1px solid #f1f3f5', whiteSpace: 'nowrap' };
const tdClick = { ...td, cursor: 'pointer' };
const tdL = { ...td, textAlign: 'left', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 };

function valAt(series, channel, month) {
  if (!series?.labels) return 0;
  const idx = series.labels.indexOf(month);
  if (idx < 0) return 0;
  return Number(series.seriesMap?.[channel]?.[idx]) || 0;
}

export default function ChannelTable({ config, dataMap, onMetricClick }) {
  const dim = config.dimension || 'channel';
  const columns = config.columns || DEFAULT_COLUMNS;
  const g = (id) => dataMap.get(`${id}:grouped:${dim}`);
  const series = { saas: g(M.saas), us: g(M.us), nonus: g(M.nonus), attr: g(M.attr), customers: g(M.customers), firstInv: g(M.firstInv) };

  const months = useMemo(
    () => [...new Set(series.attr?.labels || series.saas?.labels || [])].sort().reverse(),
    [series.attr, series.saas],
  );
  const [month, setMonth] = useState('');
  const activeMonth = month && months.includes(month) ? month : (months[0] || '');
  const [rateInput, setRateInput] = useState('1.33');
  const rate = parseFloat(rateInput) > 0 ? parseFloat(rateInput) : 1.33;
  const [sortKey, setSortKey] = useState('attribution');
  const [sortDir, setSortDir] = useState('desc');

  // trailing 3 calendar months ending at the selected month (for the rolling avg)
  const windowMonths = useMemo(() => {
    const asc = [...new Set(series.attr?.labels || [])].sort();
    const i = asc.indexOf(activeMonth);
    return i >= 0 ? asc.slice(Math.max(0, i - 2), i + 1) : (activeMonth ? [activeMonth] : []);
  }, [series.attr, activeMonth]);

  // a channel's CAD ARR for one month (per-customer, current FX); null if no data
  const cadArrFor = (ch, m) => {
    const a = valAt(series.attr, ch, m);
    if (!a) return null;
    return ((valAt(series.us, ch, m) * rate + valAt(series.nonus, ch, m)) / a) * 12;
  };

  const rows = useMemo(() => {
    const channels = [...new Set(Object.keys(series.attr?.seriesMap || {}))];
    const out = channels.map((ch) => {
      const saas = valAt(series.saas, ch, activeMonth);
      const us = valAt(series.us, ch, activeMonth);
      const nonus = valAt(series.nonus, ch, activeMonth);
      const attribution = valAt(series.attr, ch, activeMonth);
      const customers = valAt(series.customers, ch, activeMonth);
      const firstInv = valAt(series.firstInv, ch, activeMonth);
      // simple average of the per-month CAD ARR over the trailing 3 months (skip empty months)
      const detail = windowMonths.map((m) => ({ month: m, value: cadArrFor(ch, m) }))
        .filter((d) => d.value != null);
      const cadArr3mo = detail.length ? detail.reduce((s, d) => s + d.value, 0) / detail.length : null;
      return {
        channel: ch, customers, attribution, saas,
        avgFirstInvoice: attribution ? firstInv / attribution : 0,
        arpc: attribution ? saas / attribution : 0,
        arr: attribution ? (saas / attribution) * 12 : 0,
        cadArr: attribution ? ((us * rate + nonus) / attribution) * 12 : 0,
        cadArr3mo, cadArr3moDetail: detail,
        _us: us, _nonus: nonus,
      };
    }).filter((r) => r.attribution || r.customers);
    const norm = (v) => (v == null ? -Infinity : v);
    out.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : (norm(av) - norm(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [series, activeMonth, rate, sortKey, sortDir, windowMonths]);

  const total = useMemo(() => {
    const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
    const attribution = sum('attribution');
    const saas = sum('saas'), us = sum('_us'), nonus = sum('_nonus');
    const firstInvW = rows.reduce((s, r) => s + r.avgFirstInvoice * r.attribution, 0);
    // total CAD ARR per window month (all channels pooled), then simple-averaged
    const channels = Object.keys(series.attr?.seriesMap || {});
    const detail = windowMonths.map((m) => {
      let su = 0, sn = 0, sa = 0;
      for (const ch of channels) {
        const a = valAt(series.attr, ch, m);
        if (!a) continue;
        su += valAt(series.us, ch, m); sn += valAt(series.nonus, ch, m); sa += a;
      }
      return { month: m, value: sa ? ((su * rate + sn) / sa) * 12 : null };
    }).filter((d) => d.value != null);
    const cadArr3mo = detail.length ? detail.reduce((s, d) => s + d.value, 0) / detail.length : null;
    return {
      channel: 'Grand total', customers: sum('customers'), attribution, saas,
      avgFirstInvoice: attribution ? firstInvW / attribution : 0,
      arpc: attribution ? saas / attribution : 0,
      arr: attribution ? (saas / attribution) * 12 : 0,
      cadArr: attribution ? ((us * rate + nonus) / attribution) * 12 : 0,
      cadArr3mo, cadArr3moDetail: detail,
    };
  }, [rows, rate, series, windowMonths]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };
  const click = (col, value) => col.metricId && onMetricClick?.(col.metricId, value, col.format);

  const renderCell = (c, row, bold) => {
    if (c.key === 'cadArr3mo') {
      const tip = (row.cadArr3moDetail || [])
        .map((d) => `${String(d.month).slice(0, 7)}: ${fmt.currency(d.value)}`).join('    ');
      return (
        <td key={c.key} style={bold ? { ...td, fontWeight: 700 } : td} title={tip || undefined}>
          {row.cadArr3mo == null ? '—' : fmt.currency(row.cadArr3mo)}
        </td>
      );
    }
    const base = c.metricId ? tdClick : td;
    return (
      <td key={c.key} style={bold ? { ...base, fontWeight: 700 } : base}
        onClick={() => click(c, row[c.key])}
        title={c.metricId ? 'Click to see how this is derived' : undefined}>
        {(fmt[c.format] || fmt.number)(row[c.key])}
      </td>
    );
  };

  if (!series.attr) {
    return <p style={{ color: '#6b7280', fontSize: 13, padding: 16 }}>Loading channel data…</p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: '#374151' }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>First-invoice month</div>
          <select value={activeMonth} onChange={(e) => setMonth(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #e2e5e9', borderRadius: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
            {months.map((m) => <option key={m} value={m}>{String(m).slice(0, 7)}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: '#374151' }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>USD → CAD rate</div>
          <input value={rateInput} onChange={(e) => setRateInput(e.target.value)}
            style={{ width: 80, padding: '7px 10px', border: '1px solid #e2e5e9', borderRadius: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }} />
        </label>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={thL} onClick={() => toggleSort('channel')}>Marketing Channel</th>
              {columns.map((c) => (
                <th key={c.key} style={th} onClick={() => toggleSort(c.key)}
                  title="Click header to sort">{c.label}{sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.channel}>
                <td style={tdL}>{r.channel}</td>
                {columns.map((c) => renderCell(c, r, false))}
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid #e2e5e9' }}>
              <td style={{ ...tdL, fontWeight: 700 }}>{total.channel}</td>
              {columns.map((c) => renderCell(c, total, true))}
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 10 }}>
        Directional run-rate (Custdatlastsaasamount), real multi-touch attribution. Not accounting-grade — will not tie to RevCogs. Click any derived value to see its derivation.
      </p>
    </div>
  );
}
