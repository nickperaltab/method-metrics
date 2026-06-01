// Channel ARR — marketing "Revenue by Channel" replica + 3-month rolling CAD ARR.
//
// Backed by the dbt-managed, Looker-parity-verified view revenue.v_channel_arr
// (see docs/metric-definitions.md "Channel ARR"). DIRECTIONAL run-rate basis
// (Custdatlastsaasamount), NOT accounting-grade — it will not tie to RevCogs.

import { useEffect, useMemo, useState } from 'react';
import { fetchChannelArr, monthsOf } from '../lib/channelArr';

const usd2 = (n) => `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num1 = (n) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const card = { background: '#fff', border: '1px solid #e2e5e9', borderRadius: 10, padding: 20, marginBottom: 20 };
const th = { textAlign: 'right', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '2px solid #e2e5e9', whiteSpace: 'nowrap' };
const thL = { ...th, textAlign: 'left' };
const td = { textAlign: 'right', padding: '7px 10px', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#374151', borderBottom: '1px solid #f1f3f5', whiteSpace: 'nowrap' };
const tdL = { ...td, textAlign: 'left', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 };

function grandTotal(rows) {
  const att = rows.reduce((s, r) => s + r.attributionValue, 0);
  const w = (key) => (att ? rows.reduce((s, r) => s + r[key] * r.attributionValue, 0) / att : 0);
  const saas = rows.reduce((s, r) => s + r.saas, 0);
  return {
    channel: 'Grand total',
    customers: rows.reduce((s, r) => s + r.customers, 0),
    attributionValue: att,
    avgFirstInvoice: w('avgFirstInvoice'),
    saas,
    arpc: att ? saas / att : 0,
    arr: att ? (saas / att) * 12 : 0,
    cadArr: w('cadArr'),
  };
}

export default function ChannelArr() {
  const [rate, setRate] = useState(1.33);
  const [rateInput, setRateInput] = useState('1.33');
  const [data, setData] = useState([]);
  const [month, setMonth] = useState('');
  const [channel, setChannel] = useState('SEO');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async (r) => {
    setBusy(true); setError('');
    try {
      const rows = await fetchChannelArr({ rate: r });
      setData(rows);
      const months = monthsOf(rows);
      if (months.length && !months.includes(month)) setMonth(months[0]);
    } catch (e) {
      console.error('[channel-arr]', e);
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(rate); }, [rate]);

  const months = useMemo(() => monthsOf(data), [data]);
  const channels = useMemo(
    () => [...new Set(data.map((d) => d.channel))].sort(),
    [data],
  );
  const snapshot = useMemo(
    () => data.filter((d) => d.month === month).sort((a, b) => b.attributionValue - a.attributionValue),
    [data, month],
  );
  const total = useMemo(() => (snapshot.length ? grandTotal(snapshot) : null), [snapshot]);
  const trend = useMemo(
    () => data.filter((d) => d.channel === channel).sort((a, b) => b.month.localeCompare(a.month)),
    [data, channel],
  );

  const applyRate = () => {
    const r = parseFloat(rateInput);
    if (!Number.isNaN(r) && r > 0) setRate(r);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Channel ARR</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginTop: 6, lineHeight: 1.5 }}>
        New-customer ARR by marketing channel — replica of the Looker "Revenue by Channel" dashboard,
        from the verified <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>revenue.v_channel_arr</code> view.
        <strong> Directional run-rate</strong> (Custdatlastsaasamount), not accounting-grade — does not tie to RevCogs.
      </p>

      {/* Controls */}
      <div style={{ ...card, display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: '#374151' }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>First-invoice month</div>
          <select value={month} onChange={(e) => setMonth(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #e2e5e9', borderRadius: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
            {months.map((m) => <option key={m} value={m}>{m.slice(0, 7)}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: '#374151' }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>USD → CAD rate</div>
          <input value={rateInput} onChange={(e) => setRateInput(e.target.value)}
            onBlur={applyRate} onKeyDown={(e) => e.key === 'Enter' && applyRate()}
            style={{ width: 80, padding: '7px 10px', border: '1px solid #e2e5e9', borderRadius: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }} />
        </label>
        {busy && <span style={{ fontSize: 12, color: '#059669' }}>Loading…</span>}
        {error && <span style={{ fontSize: 12, color: '#dc2626' }}>Error: {error}</span>}
      </div>

      {/* Snapshot: Revenue by Channel */}
      <div style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginTop: 0, marginBottom: 12 }}>
          Revenue by Channel — {month.slice(0, 7)}
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={thL}>Marketing Channel</th>
                <th style={th}>Unique Customers</th>
                <th style={th}>AttributionValue</th>
                <th style={th}>Avg First Invoice</th>
                <th style={th}>SaaS</th>
                <th style={th}>ARPC</th>
                <th style={th}>ARR</th>
                <th style={th}>CAD ARR</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.map((r) => (
                <tr key={r.channel}>
                  <td style={tdL}>{r.channel}</td>
                  <td style={td}>{r.customers}</td>
                  <td style={td}>{num1(r.attributionValue)}</td>
                  <td style={td}>{usd2(r.avgFirstInvoice)}</td>
                  <td style={td}>{usd2(r.saas)}</td>
                  <td style={td}>{usd2(r.arpc)}</td>
                  <td style={td}>{usd2(r.arr)}</td>
                  <td style={td}>{usd2(r.cadArr)}</td>
                </tr>
              ))}
              {total && (
                <tr style={{ borderTop: '2px solid #e2e5e9' }}>
                  <td style={{ ...tdL, fontWeight: 700 }}>{total.channel}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{total.customers}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{num1(total.attributionValue)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{usd2(total.avgFirstInvoice)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{usd2(total.saas)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{usd2(total.arpc)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{usd2(total.arr)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{usd2(total.cadArr)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trend: 3-month rolling CAD ARR for a channel */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>CAD ARR — 3-month rolling avg</h2>
          <select value={channel} onChange={(e) => setChannel(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #e2e5e9', borderRadius: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
            {channels.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 380 }}>
            <thead>
              <tr>
                <th style={thL}>Month</th>
                <th style={th}>CAD ARR</th>
                <th style={th}>3-mo Rolling</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((r) => (
                <tr key={r.month}>
                  <td style={tdL}>{r.month.slice(0, 7)}</td>
                  <td style={td}>{usd2(r.cadArr)}</td>
                  <td style={{ ...td, color: '#059669', fontWeight: 600 }}>{usd2(r.cadArr3mo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
