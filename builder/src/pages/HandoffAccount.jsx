// Handoff detail — one account's packet + full status timeline.
// Route: #/handoffs/account/:recordId
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchAccountHandoffs } from '../lib/handoffs';

const STATUS_STYLE = {
  'Draft':             { color: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb' },
  'Questions Pending': { color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  'Ready':             { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  'Shared':            { color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  'Accepted':          { color: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' },
  'Complete':          { color: '#374151', bg: '#f9fafb', border: '#e5e7eb' },
};
const UNKNOWN_STYLE = { color: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb' };
const statusStyle = (status) => STATUS_STYLE[status] || UNKNOWN_STYLE;

const s = {
  wrap: { maxWidth: 820, margin: '0 auto', padding: '40px 24px', fontFamily: "'DM Sans', sans-serif" },
  back: { fontSize: 13, color: '#059669', cursor: 'pointer', textDecoration: 'none', marginBottom: 20, display: 'inline-block' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 6 },
  title: { fontSize: 24, fontWeight: 700, color: '#1a1a1a' },
  transition: { fontSize: 14, color: '#6b7280', marginBottom: 24 },
  card: { border: '1px solid #e2e5e9', borderRadius: 12, padding: 24, marginBottom: 28, background: '#fff' },
  metrics: { display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 20 },
  metric: {},
  metricVal: { fontSize: 24, fontWeight: 700, color: '#1a1a1a' },
  metricLbl: { fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8a9099', fontFamily: "'JetBrains Mono', monospace" },
  priorityLbl: { fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8a9099', fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 },
  priority: { fontSize: 15, color: '#1a1a1a', marginBottom: 20 },
  flags: { marginBottom: 20 },
  flag: {
    display: 'inline-block', fontSize: 12, fontWeight: 600, color: '#b45309',
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4,
    padding: '3px 10px', marginRight: 6, marginBottom: 4,
  },
  docBtn: {
    display: 'inline-block', padding: '9px 18px', background: '#059669', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    textDecoration: 'none',
  },
  docMissing: { fontSize: 13, color: '#8a9099' },
  badge: (st) => ({
    display: 'inline-block', fontSize: 12, fontWeight: 700, color: st.color,
    background: st.bg, border: `1px solid ${st.border}`, borderRadius: 999, padding: '3px 12px',
  }),
  sectionTitle: { fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#8a9099', fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 },
  timeline: { listStyle: 'none', padding: 0, margin: 0, borderLeft: '2px solid #e2e5e9' },
  step: { position: 'relative', padding: '0 0 20px 20px' },
  dot: { position: 'absolute', left: -7, top: 4, width: 10, height: 10, borderRadius: '50%', border: '2px solid #fff' },
  stepRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 },
  stepMeta: { fontSize: 12, color: '#8a9099', fontFamily: "'JetBrains Mono', monospace" },
  note: { fontSize: 14, color: '#6b7280', padding: 24, textAlign: 'center' },
  error: { fontSize: 14, color: '#b91c1c', padding: 24, textAlign: 'center' },
};

export default function HandoffAccount() {
  const { recordId } = useParams();
  const navigate = useNavigate();
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    setError('');
    fetchAccountHandoffs(recordId)
      .then((h) => { if (!cancelled) setHistory(h); })
      .catch((e) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, [recordId]);

  if (error) return <div style={s.wrap}><div style={s.error}>Couldn’t load handoff: {error}</div></div>;
  if (!history) return <div style={s.wrap}><div style={s.note}>Loading…</div></div>;
  if (!history.length) return (
    <div style={s.wrap}>
      <span style={s.back} onClick={() => navigate('/handoffs')}>← All handoffs</span>
      <div style={s.note}>No handoff found for this account.</div>
    </div>
  );

  const latest = history[0];

  return (
    <div style={s.wrap}>
      <span style={s.back} onClick={() => navigate('/handoffs')}>← All handoffs</span>

      <div style={s.head}>
        <h1 style={s.title}>{latest.accountName ?? `#${latest.accountRecordId}`}</h1>
        <span style={s.badge(statusStyle(latest.status))}>{latest.status ?? '—'}</span>
      </div>
      <div style={s.transition}>
        {latest.outgoingRep ?? '—'} → {latest.incomingRep ?? 'TBD'}
      </div>

      <div style={s.card}>
        <div style={s.metrics}>
          <div style={s.metric}>
            <div style={s.metricVal}>{latest.openInProgress}</div>
            <div style={s.metricLbl}>In progress</div>
          </div>
          <div style={s.metric}>
            <div style={s.metricVal}>{latest.openPromised}</div>
            <div style={s.metricLbl}>Promised</div>
          </div>
          <div style={s.metric}>
            <div style={s.metricVal}>{latest.catalogueMatches}</div>
            <div style={s.metricLbl}>Catalogue matches</div>
          </div>
        </div>

        {latest.firstPriority && (
          <>
            <div style={s.priorityLbl}>First priority</div>
            <div style={s.priority}>{latest.firstPriority}</div>
          </>
        )}

        {latest.flags.length > 0 && (
          <div style={s.flags}>
            {latest.flags.map((f) => <span key={f} style={s.flag}>{f}</span>)}
          </div>
        )}

        {latest.docLink
          ? <a style={s.docBtn} href={latest.docLink} target="_blank" rel="noopener noreferrer">Open handoff packet ↗</a>
          : <span style={s.docMissing}>No document link recorded.</span>}
      </div>

      <div style={s.sectionTitle}>Status timeline</div>
      <ul style={s.timeline}>
        {history.map((h, i) => {
          const st = statusStyle(h.status);
          return (
            <li key={`${h.createdAt}-${i}`} style={s.step}>
              <span style={{ ...s.dot, background: st.color }} />
              <div style={s.stepRow}>
                <span style={s.badge(st)}>{h.status ?? '—'}</span>
              </div>
              <div style={s.stepMeta}>
                {(h.createdAt ?? '').slice(0, 10)} · {h.outgoingRep ?? '—'} → {h.incomingRep ?? 'TBD'}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
