// PS — the professional-services landing page. Route: #/ps
// One screen for "what's my day and what's my book": calls prepped for today,
// my accounts ranked by what needs attention, and my in-flight handoffs.
// Everything here is scoped to the signed-in consultant.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import {
  consultantPatternFromEmail,
  fetchMyToday,
  fetchMyBoard,
  fetchMyHandoffs,
  localIsoDate,
  summarizeBoard,
} from '../lib/psOverview';
import { statusRank } from '../lib/handoffs';

const s = {
  wrap: { maxWidth: 1040, margin: '0 auto', padding: '40px 24px', fontFamily: "'DM Sans', sans-serif" },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  title: { fontSize: 22, fontWeight: 700, color: '#1a1a1a' },
  sub: { fontSize: 14, color: '#6b7280', marginBottom: 24 },
  mono: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#6b7280' },

  stats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 32 },
  stat: { border: '1px solid #e2e5e9', borderRadius: 8, padding: '14px 16px', background: '#fff' },
  statLabel: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
    letterSpacing: '.12em', textTransform: 'uppercase', color: '#8a9099', marginBottom: 6,
  },
  statValue: { fontSize: 22, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.1 },
  statValueAlert: { fontSize: 22, fontWeight: 700, color: '#b45309', lineHeight: 1.1 },

  section: { marginBottom: 36 },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#1a1a1a' },
  link: { fontSize: 12, color: '#059669', textDecoration: 'none', fontFamily: "'JetBrains Mono', monospace" },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700,
    letterSpacing: '.12em', textTransform: 'uppercase', color: '#8a9099',
    fontFamily: "'JetBrains Mono', monospace", borderBottom: '1px solid #e2e5e9',
  },
  thNum: { textAlign: 'right' },
  td: { padding: '12px', borderBottom: '1px solid #f0f1f3', color: '#1a1a1a', verticalAlign: 'top' },
  tdNum: { textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 13 },
  rowClickable: { cursor: 'pointer' },

  card: {
    border: '1px solid #e2e5e9', borderRadius: 8, padding: '14px 16px', background: '#fff',
    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
  },
  cardList: { display: 'grid', gap: 8 },
  cardName: { fontSize: 15, fontWeight: 600, color: '#1a1a1a' },

  flag: {
    display: 'inline-block', fontSize: 11, fontWeight: 600, color: '#b45309',
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4,
    padding: '2px 8px', marginRight: 6, marginBottom: 2, whiteSpace: 'nowrap',
  },
  tag: {
    display: 'inline-block', fontSize: 11, fontWeight: 600, color: '#059669',
    background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 4,
    padding: '2px 8px', marginRight: 6, whiteSpace: 'nowrap',
  },
  tagNeutral: {
    display: 'inline-block', fontSize: 11, fontWeight: 600, color: '#6b7280',
    background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4,
    padding: '2px 8px', marginRight: 6, whiteSpace: 'nowrap',
  },
  muted: { color: '#8a9099' },
  empty: {
    fontSize: 13, color: '#6b7280', padding: '20px 16px', textAlign: 'center',
    border: '1px dashed #e2e5e9', borderRadius: 8, background: '#fafbfc',
  },
  note: { fontSize: 14, color: '#6b7280', padding: 24, textAlign: 'center' },
  error: { fontSize: 14, color: '#b91c1c', padding: 24, textAlign: 'center' },
};

const money = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString()}`);
const daysSince = (iso, todayIso) => (
  iso ? Math.floor((Date.parse(todayIso) - Date.parse(iso)) / 86400000) : null
);

function Stat({ label, value, alert }) {
  return (
    <div style={s.stat}>
      <div style={s.statLabel}>{label}</div>
      <div style={alert ? s.statValueAlert : s.statValue}>{value}</div>
    </div>
  );
}

export default function PsOverview() {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const email = currentUser?.email ?? null;
  const todayIso = useMemo(() => localIsoDate(), []);

  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  // No first/last structure in the address → nothing to scope a book to.
  const scopable = Boolean(consultantPatternFromEmail(email));

  useEffect(() => {
    if (!email || !scopable) return undefined;
    let cancelled = false;
    setError('');
    setData(null);
    Promise.all([
      fetchMyToday(email, todayIso),
      fetchMyBoard(email, todayIso),
      fetchMyHandoffs(email),
    ])
      .then(([today, board, handoffs]) => {
        if (!cancelled) setData({ today, board, handoffs });
      })
      .catch((e) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, [email, todayIso, scopable]);

  const stats = useMemo(() => (data ? summarizeBoard(data.board) : null), [data]);
  const myHandoffs = useMemo(() => (
    data ? [...data.handoffs].sort((a, b) => statusRank(a.status) - statusRank(b.status)) : []
  ), [data]);

  if (!email) return <div style={s.wrap}><div style={s.note}>Identifying you…</div></div>;

  if (!scopable) {
    return (
      <div style={s.wrap}>
        <h1 style={s.title}>PS</h1>
        <div style={s.note}>
          Can’t work out which consultant <code>{email}</code> is. This page matches
          your book on first-initial + last name from your address.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={s.wrap}>
        <div style={s.error}>
          {/BQ 403/.test(error)
            ? 'You don’t have access to the call_prep dataset yet. Ask Nic for the BigQuery grant.'
            : `Couldn’t load your PS overview: ${error}`}
        </div>
      </div>
    );
  }

  if (!data) return <div style={s.wrap}><div style={s.note}>Loading your book…</div></div>;

  const { today, board } = data;

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h1 style={s.title}>PS</h1>
        <span style={s.mono}>{todayIso}</span>
      </div>
      <p style={s.sub}>
        Your day and your book. Accounts come from the call-prep snapshots written for you —
        there’s no rep→account mapping in BigQuery yet, so this is every account you’ve been prepped for.
      </p>

      <div style={s.stats}>
        <Stat label="Accounts" value={stats.accounts} />
        <Stat label="Active MRR" value={money(stats.activeMrr)} />
        <Stat label="Licenses" value={stats.licenses || '—'} />
        <Stat label="Needs attention" value={stats.needsAttention} alert={stats.needsAttention > 0} />
      </div>

      {/* ── Today ─────────────────────────────────────────────── */}
      <section style={s.section}>
        <div style={s.sectionHead}>
          <h2 style={s.sectionTitle}>Today</h2>
          <span style={s.mono}>{today.length} call{today.length === 1 ? '' : 's'}</span>
        </div>
        {!today.length ? (
          <div style={s.empty}>
            No call prep written for you today. The call-prep routine writes these the morning of a call.
          </div>
        ) : (
          <div style={s.cardList}>
            {today.map((c) => (
              <div
                key={c.accountRecordId}
                style={s.card}
                onClick={() => navigate(`/call-prep/account/${encodeURIComponent(c.accountRecordId)}`)}
              >
                <div>
                  <div style={s.cardName}>{c.accountName ?? `#${c.accountRecordId}`}</div>
                  <div style={{ marginTop: 6 }}>
                    {c.callType && <span style={s.tagNeutral}>{c.callType}</span>}
                    {c.depEnrolled && <span style={s.tag}>DEP</span>}
                    {c.casesOpenCount > 0 && <span style={s.flag}>{c.casesOpenCount} open case{c.casesOpenCount === 1 ? '' : 's'}</span>}
                    {c.syncFailCount > 0 && <span style={s.flag}>sync failing</span>}
                  </div>
                </div>
                <span style={s.link}>Open brief →</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Board ─────────────────────────────────────────────── */}
      <section style={s.section}>
        <div style={s.sectionHead}>
          <h2 style={s.sectionTitle}>My accounts</h2>
          <span style={s.mono}>needs attention first</span>
        </div>
        {!board.length ? (
          <div style={s.empty}>No accounts yet — nothing has written a call-prep snapshot for you.</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Account</th>
                <th style={s.th}>Type</th>
                <th style={{ ...s.th, ...s.thNum }}>MRR</th>
                <th style={{ ...s.th, ...s.thNum }}>Seats</th>
                <th style={{ ...s.th, ...s.thNum }}>Last session</th>
                <th style={s.th}>Attention</th>
              </tr>
            </thead>
            <tbody>
              {board.map((r) => {
                const stale = daysSince(r.ttLastSessionDate, todayIso);
                return (
                  <tr
                    key={r.accountRecordId}
                    style={s.rowClickable}
                    onClick={() => navigate(`/call-prep/account/${encodeURIComponent(r.accountRecordId)}`)}
                  >
                    <td style={{ ...s.td, fontWeight: 600 }}>
                      {r.accountName ?? `#${r.accountRecordId}`}
                      {r.overview?.isActive === false && <span style={{ ...s.tagNeutral, marginLeft: 8 }}>inactive</span>}
                    </td>
                    <td style={s.td}>
                      {r.depEnrolled ? <span style={s.tag}>DEP</span> : <span style={s.muted}>{r.callType ?? '—'}</span>}
                    </td>
                    <td style={{ ...s.td, ...s.tdNum }}>{money(r.overview?.mrrRunRate)}</td>
                    <td style={{ ...s.td, ...s.tdNum }}>{r.overview?.userLicenses ?? '—'}</td>
                    <td style={{ ...s.td, ...s.tdNum }}>
                      {stale == null ? <span style={s.muted}>never</span> : `${stale}d`}
                    </td>
                    <td style={s.td}>
                      {r.flags.length
                        ? r.flags.map((f) => <span key={f} style={s.flag}>{f}</span>)
                        : <span style={s.muted}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Handoffs ──────────────────────────────────────────── */}
      <section style={s.section}>
        <div style={s.sectionHead}>
          <h2 style={s.sectionTitle}>My handoffs</h2>
          <a href="#/handoffs" style={s.link}>All handoffs →</a>
        </div>
        {!myHandoffs.length ? (
          <div style={s.empty}>
            No handoffs involve you yet. Run <code>/handoff [Account]</code> to create one.
          </div>
        ) : (
          <div style={s.cardList}>
            {myHandoffs.map((h) => (
              <div
                key={h.accountRecordId}
                style={s.card}
                onClick={() => navigate(`/handoffs/account/${encodeURIComponent(h.accountRecordId)}`)}
              >
                <div>
                  <div style={s.cardName}>{h.accountName ?? `#${h.accountRecordId}`}</div>
                  <div style={{ ...s.mono, marginTop: 4 }}>
                    {h.outgoingRep ?? '—'} → {h.incomingRep ?? 'TBD'}
                  </div>
                </div>
                <span style={s.tagNeutral}>{h.status ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
