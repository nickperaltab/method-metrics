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

export default function ChannelTrajectoryScorecard({ cfg, bqConnected, onConnect }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('syncs');
  const [compare, setCompare] = useState('yoy');

  useEffect(() => {
    if (!bqConnected) return;
    let live = true;
    fetchChannelTrajectory().then(d => live && setData(d)).catch(e => live && setErr(String(e)));
    return () => { live = false; };
  }, [bqConnected]);

  if (!bqConnected) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <h2>{cfg.title}</h2>
        <button onClick={onConnect} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer' }}>Connect BigQuery</button>
      </div>
    );
  }
  if (err) return <div style={{ padding: 48, color: '#dc2626' }}>Error: {err}</div>;
  if (!data) return <div style={{ padding: 48, color: '#6b7280' }}>Loading…</div>;

  const rows = data[tab];
  const isRate = tab === 'sync_rate';

  // The comparison toggle swaps the basis column + delta: YoY compares the
  // trajectory to last year's full month; MoM compares it to last month's full.
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

  return (
    <div style={{ padding: 32, maxWidth: 900, fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a' }}>{cfg.title}</h1>
      <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 24 }}>
        Full-month trajectory vs {compare === 'yoy' ? "last year's full month" : compare === 'mom' ? "last month's full month" : "this month's forecast"}. MTD excludes today.
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

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'right', color: '#6b7280', fontSize: 12 }}>
            <th style={{ textAlign: 'left', padding: '8px 0' }}>Channel</th>
            <th>MTD Actual</th><th>Trajectory</th><th>{cmp.label}</th><th>{cmp.deltaLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
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
    </div>
  );
}
