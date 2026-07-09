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

  return (
    <div style={{ padding: 32, maxWidth: 900, fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a' }}>{cfg.title}</h1>
      <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 24 }}>
        Current-month trajectory vs last year's full month (YoY) and last month (MoM). MTD excludes today.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '6px 16px', fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
            background: tab === t.key ? '#2563eb' : '#f3f4f6', color: tab === t.key ? '#fff' : '#374151',
            border: 'none', borderRadius: 20, cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'right', color: '#6b7280', fontSize: 12 }}>
            <th style={{ textAlign: 'left', padding: '8px 0' }}>Channel</th>
            <th>Trajectory</th><th>LY Full</th><th>YoY %</th><th>MoM %</th>
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
                <td>{num(r.trajectory, isRate)}</td>
                <td>{num(r.lastYearFull, isRate)}</td>
                <td><Delta v={r.yoyPct} /></td>
                <td><Delta v={r.momPct} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
