import React, { useState, useEffect } from 'react';
import { fetchChannelTrajectory } from '../../lib/channelTrajectoryData';

const TABS = [
  { key: 'trials', label: 'Trials', pctFmt: false },
  { key: 'syncs', label: 'Syncs', pctFmt: false },
  { key: 'sync_rate', label: 'Sync Rate', pctFmt: true },
];

const num = (v, pct) =>
  v == null ? '—'
  : pct ? `${(v * 100).toFixed(1)}%`
  : Number.isInteger(v) ? String(v) : v.toFixed(1);

function Delta({ v }) {
  if (v == null) return <span style={{ color: '#9ca3af' }}>—</span>;
  const up = v >= 0;
  return (
    <span style={{ color: up ? '#059669' : '#dc2626', fontWeight: 600 }}>
      {up ? '▲' : '▼'} {(v * 100).toFixed(1)}%
    </span>
  );
}

const fmt = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Default = month-to-date excluding today (Looker's default): 1st of this month
// through yesterday. Clamp end >= start for the 1st-of-month edge case.
function defaultRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const end = yest < start ? start : yest;
  return { start: fmt(start), end: fmt(end) };
}

export default function ChannelTrajectoryScorecard({ cfg, bqConnected, onConnect }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('syncs');
  const [compare, setCompare] = useState('yoy');
  const [range, setRange] = useState(defaultRange);

  useEffect(() => {
    if (!bqConnected) return;
    let live = true;
    setData(null); setErr(null);
    fetchChannelTrajectory(range).then(d => live && setData(d)).catch(e => live && setErr(String(e)));
    return () => { live = false; };
  }, [bqConnected, range.start, range.end]);

  if (!bqConnected) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <h2>{cfg.title}</h2>
        <button onClick={onConnect} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer' }}>Connect BigQuery</button>
      </div>
    );
  }
  const isRate = tab === 'sync_rate';

  // The comparison toggle swaps the basis column + delta: YoY compares the
  // trajectory to last year's full month; MoM to last month's; Forecast to plan.
  const cmp = compare === 'yoy'
    ? { label: 'LY Full', basis: 'lastYearFull', delta: 'yoyPct', deltaLabel: 'YoY %' }
    : compare === 'mom'
    ? { label: 'Last Month', basis: 'priorMonthFull', delta: 'momPct', deltaLabel: 'MoM %' }
    : { label: 'Forecast', basis: 'forecast', delta: 'fcstPct', deltaLabel: 'vs Fcst %' };

  const pill = (active) => ({
    padding: '6px 16px', fontSize: 13, fontWeight: active ? 600 : 400,
    background: active ? '#2563eb' : '#f3f4f6', color: active ? '#fff' : '#374151',
    border: 'none', borderRadius: 20, cursor: 'pointer',
  });
  const dateInput = {
    fontSize: 13, padding: '4px 8px', border: '1px solid #e2e5e9', borderRadius: 6,
    color: '#374151', fontFamily: "'DM Sans', sans-serif",
  };

  return (
    <div style={{ padding: 32, maxWidth: 900, fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a' }}>{cfg.title}</h1>
      <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 24 }}>
        Full-month trajectory vs {compare === 'yoy' ? "last year's full month" : compare === 'mom' ? "last month's full month" : "this month's forecast"}. Trajectory projects from the selected date range.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#9ca3af', letterSpacing: '.05em' }}>PERIOD</span>
        <input type="date" value={range.start} max={range.end} style={dateInput}
          onChange={(e) => e.target.value && setRange(r => ({ ...r, start: e.target.value }))} />
        <span style={{ color: '#9ca3af' }}>–</span>
        <input type="date" value={range.end} min={range.start} style={dateInput}
          onChange={(e) => e.target.value && setRange(r => ({ ...r, end: e.target.value }))} />
        <button onClick={() => setRange(defaultRange())} style={{ ...pill(false), fontSize: 12 }}>This month</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={pill(tab === t.key)}>{t.label}</button>
        ))}
        <span style={{ width: 1, height: 20, background: '#e2e5e9', margin: '0 6px' }} />
        <span style={{ fontSize: 11, color: '#9ca3af', letterSpacing: '.05em' }}>COMPARE TO</span>
        <button onClick={() => setCompare('yoy')} style={pill(compare === 'yoy')}>Last Year</button>
        <button onClick={() => setCompare('mom')} style={pill(compare === 'mom')}>Last Month</button>
        <button onClick={() => setCompare('forecast')} style={pill(compare === 'forecast')}>Forecast</button>
      </div>

      {err ? (
        <div style={{ padding: 32, color: '#dc2626' }}>Error: {err}</div>
      ) : !data ? (
        <div style={{ padding: 32, color: '#6b7280' }}>Loading…</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'right', color: '#6b7280', fontSize: 12 }}>
              <th style={{ textAlign: 'left', padding: '8px 0' }}>Channel</th>
              <th>MTD Actual</th><th>Trajectory</th><th>{cmp.label}</th><th>{cmp.deltaLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data[tab].map(r => {
              const isTotal = r.channel === 'Total';
              return (
                <tr key={r.channel} style={{
                  borderTop: isTotal ? '2px solid #1a1a1a' : '1px solid #eef0f2',
                  fontWeight: isTotal ? 700 : 400, textAlign: 'right',
                }}>
                  <td style={{ textAlign: 'left', padding: '8px 0' }}>{r.channel}</td>
                  <td>{num(r.mtdActual, isRate)}</td>
                  <td>{num(r.trajectory, isRate)}</td>
                  <td>{num(r[cmp.basis], isRate)}</td>
                  <td><Delta v={r[cmp.delta]} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
