import React, { useState, useEffect } from 'react';
import { fetchChannelFunnel } from '../../lib/channelFunnelData';

// Default to the full window the view exposes: Jan 2025 to last complete month.
function defaultRange() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { start: '2025-01-01', end: end.toISOString().slice(0, 10) };
}

const n1 = v => (v == null ? '—' : v.toFixed(1));
const pct = v => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

// Rate colouring is relative to the all-channel rate, so a reader can see at a
// glance which channels beat the blended average rather than an absolute bar.
function Rate({ v, base }) {
  if (v == null) return <span style={{ color: '#9ca3af' }}>—</span>;
  const good = base != null && v > base;
  return <span style={{ color: good ? '#059669' : '#4b5563', fontWeight: good ? 600 : 400 }}>{pct(v)}</span>;
}

export default function ChannelFunnelScorecard({ cfg, bqConnected, onConnect }) {
  const [range, setRange] = useState(defaultRange);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!bqConnected) return;
    let live = true;
    setData(null); setErr(null);
    fetchChannelFunnel(range).then(d => live && setData(d)).catch(e => live && setErr(String(e)));
    return () => { live = false; };
  }, [bqConnected, range.start, range.end]);

  if (!bqConnected) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <h2>{cfg.title}</h2>
        <button onClick={onConnect} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer' }}>
          Connect BigQuery
        </button>
      </div>
    );
  }

  const dateInput = {
    fontSize: 13, padding: '4px 8px', border: '1px solid #e2e5e9', borderRadius: 6,
    color: '#374151', fontFamily: "'DM Sans', sans-serif",
  };
  const th = { textAlign: 'right', padding: '8px 12px', fontSize: 11, color: '#9ca3af', fontWeight: 500, letterSpacing: '.03em', borderBottom: '1px solid #e2e5e9' };
  const td = { textAlign: 'right', padding: '10px 12px', fontSize: 14, color: '#1a1a1a', borderBottom: '1px solid #f1f3f5', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ padding: 32, maxWidth: 900, fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a' }}>{cfg.title}</h1>
      <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 4, maxWidth: 680, lineHeight: 1.5 }}>
        Trial to sync to paying, by the channel that touched the account&apos;s browser. This is the
        only channel view that can show AIO, because it derives the channel from the click rather
        than from the Att_* columns, which have no AI slot.
      </div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 24, maxWidth: 680, lineHeight: 1.5 }}>
        FIRST-TOUCH measures. Untagged channels (AIO, Direct, SEO) are recorded only on a browser&apos;s
        first ever visit, so their volume is understated against tagged channels like PPC. Rates are
        comparable; volumes are not. Does not reconcile to Channel Trajectory.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#9ca3af', letterSpacing: '.05em' }}>SIGNUP MONTHS</span>
        <input type="date" value={range.start} max={range.end} style={dateInput}
          onChange={e => e.target.value && setRange(r => ({ ...r, start: e.target.value }))} />
        <span style={{ color: '#9ca3af' }}>–</span>
        <input type="date" value={range.end} min={range.start} style={dateInput}
          onChange={e => e.target.value && setRange(r => ({ ...r, end: e.target.value }))} />
        <button
          onClick={() => setRange(defaultRange())}
          style={{ padding: '6px 16px', fontSize: 12, background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 20, cursor: 'pointer' }}
        >
          All (2025+)
        </button>
      </div>

      {err && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{err}</div>}
      {!data && !err && <div style={{ color: '#9ca3af', fontSize: 13 }}>Loading…</div>}

      {data && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Channel</th>
              <th style={th}>Trials</th>
              <th style={th}>Synced</th>
              <th style={th}>Sync Rate</th>
              <th style={th}>Paying</th>
              <th style={th}>Trial → Pay</th>
            </tr>
          </thead>
          <tbody>
            {data.channels.map(c => {
              const isAio = c.channel === 'AIO';
              return (
                <tr key={c.channel} style={isAio ? { background: '#eff6ff' } : undefined}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: isAio ? 600 : 400, color: isAio ? '#2563eb' : '#1a1a1a' }}>
                    {c.channel}
                  </td>
                  <td style={td}>{n1(c.trials)}</td>
                  <td style={td}>{n1(c.synced)}</td>
                  <td style={td}><Rate v={c.syncRate} base={data.total.syncRate} /></td>
                  <td style={td}>{n1(c.paying)}</td>
                  <td style={td}><Rate v={c.payRate} base={data.total.payRate} /></td>
                </tr>
              );
            })}
            <tr>
              <td style={{ ...td, textAlign: 'left', fontWeight: 700, borderTop: '2px solid #1a1a1a', borderBottom: 'none' }}>Total</td>
              <td style={{ ...td, fontWeight: 700, borderTop: '2px solid #1a1a1a', borderBottom: 'none' }}>{n1(data.total.trials)}</td>
              <td style={{ ...td, fontWeight: 700, borderTop: '2px solid #1a1a1a', borderBottom: 'none' }}>{n1(data.total.synced)}</td>
              <td style={{ ...td, fontWeight: 700, borderTop: '2px solid #1a1a1a', borderBottom: 'none' }}>{pct(data.total.syncRate)}</td>
              <td style={{ ...td, fontWeight: 700, borderTop: '2px solid #1a1a1a', borderBottom: 'none' }}>{n1(data.total.paying)}</td>
              <td style={{ ...td, fontWeight: 700, borderTop: '2px solid #1a1a1a', borderBottom: 'none' }}>{pct(data.total.payRate)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {data && (
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 20, maxWidth: 680, lineHeight: 1.6 }}>
          Counts are fractional: an account touched by three channels contributes 0.333 to each.
          Syncs and paying are lifetime-to-date, not within the signup month, so recent cohorts keep
          rising. Green marks a rate above the all-channel average. Source:{' '}
          <code style={{ fontSize: 11 }}>revenue.v_channel_funnel</code>.
        </div>
      )}
    </div>
  );
}
