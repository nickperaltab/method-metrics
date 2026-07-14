// Call Prep — one consultant's book. Route: #/call-prep/:consultant
// One row per account (latest snapshot), flagged accounts sort first.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchBook, computeFlags } from '../lib/callPrep';

const CONSULTANT_KEY = 'method_callprep_consultant';

const s = {
  wrap: { maxWidth: 920, margin: '0 auto', padding: '40px 24px', fontFamily: "'DM Sans', sans-serif" },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, color: '#1a1a1a' },
  switchLink: { fontSize: 13, color: '#059669', cursor: 'pointer', textDecoration: 'underline' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700,
    letterSpacing: '.12em', textTransform: 'uppercase', color: '#8a9099',
    fontFamily: "'JetBrains Mono', monospace", borderBottom: '1px solid #e2e5e9',
  },
  td: { padding: '12px', borderBottom: '1px solid #f0f1f3', color: '#1a1a1a' },
  rowClickable: { cursor: 'pointer' },
  flag: {
    display: 'inline-block', fontSize: 11, fontWeight: 600, color: '#b45309',
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4,
    padding: '2px 8px', marginRight: 6,
  },
  ok: { fontSize: 12, color: '#059669' },
  note: { fontSize: 14, color: '#6b7280', padding: 24, textAlign: 'center' },
  error: { fontSize: 14, color: '#b91c1c', padding: 24, textAlign: 'center' },
};

export default function CallPrepBook() {
  const { consultant } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setBook(null);
    fetchBook(consultant)
      .then(setBook)
      .catch((e) => setError(e?.message || String(e)));
  }, [consultant]);

  const todayIso = new Date().toISOString().slice(0, 10);

  const rows = useMemo(() => {
    if (!book) return [];
    return book
      .map((snap) => ({ snap, flags: computeFlags(snap, todayIso) }))
      .sort((a, b) => b.flags.length - a.flags.length || a.snap.accountName.localeCompare(b.snap.accountName));
  }, [book, todayIso]);

  const switchConsultant = () => {
    localStorage.removeItem(CONSULTANT_KEY);
    navigate('/call-prep');
  };

  if (error) return <div style={s.wrap}><div style={s.error}>Couldn’t load book: {error}</div></div>;
  if (!book) return <div style={s.wrap}><div style={s.note}>Loading {consultant}’s accounts…</div></div>;

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h1 style={s.title}>{consultant} — {book.length} account{book.length === 1 ? '' : 's'}</h1>
        <span style={s.switchLink} onClick={switchConsultant}>switch consultant</span>
      </div>
      {!book.length && <div style={s.note}>No snapshots for {consultant} yet.</div>}
      {book.length > 0 && (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Account</th>
              <th style={s.th}>Sync</th>
              <th style={s.th}>Open cases</th>
              <th style={s.th}>Last session</th>
              <th style={s.th}>Last snapshot</th>
              <th style={s.th}>Attention</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ snap, flags }) => (
              <tr
                key={snap.accountRecordId}
                style={s.rowClickable}
                onClick={() => navigate(`/call-prep/account/${snap.accountRecordId}`)}
              >
                <td style={{ ...s.td, fontWeight: 600 }}>{snap.accountName}</td>
                <td style={s.td}>{snap.syncStatus ?? '—'}</td>
                <td style={s.td}>{snap.casesOpenCount}</td>
                <td style={s.td}>{snap.ttLastSessionDate ?? '—'}</td>
                <td style={s.td}>{snap.snapshotDate}</td>
                <td style={s.td}>
                  {flags.length
                    ? flags.map((f) => <span key={f} style={s.flag}>{f}</span>)
                    : <span style={s.ok}>ok</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
