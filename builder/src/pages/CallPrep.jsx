// Call Prep — consultant picker. Route: #/call-prep
// Lists consultants found in call_prep.snapshots; remembers the last
// selection so returning users land one click from their book.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchConsultants } from '../lib/callPrep';

const CONSULTANT_KEY = 'method_callprep_consultant';

const s = {
  wrap: { maxWidth: 720, margin: '0 auto', padding: '40px 24px', fontFamily: "'DM Sans', sans-serif" },
  title: { fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 },
  sub: { fontSize: 14, color: '#6b7280', marginBottom: 28 },
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px', border: '1px solid #e2e5e9', borderRadius: 8,
    marginBottom: 8, cursor: 'pointer', background: '#fff',
  },
  rowName: { fontSize: 15, fontWeight: 600, color: '#1a1a1a' },
  rowMeta: { fontSize: 12, color: '#8a9099', fontFamily: "'JetBrains Mono', monospace" },
  note: { fontSize: 14, color: '#6b7280', padding: 24, textAlign: 'center' },
  error: { fontSize: 14, color: '#b91c1c', padding: 24, textAlign: 'center' },
};

export default function CallPrep() {
  const navigate = useNavigate();
  const [consultants, setConsultants] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // Returning user: skip the picker.
    const remembered = localStorage.getItem(CONSULTANT_KEY);
    if (remembered) {
      navigate(`/call-prep/${encodeURIComponent(remembered)}`, { replace: true });
      return;
    }
    fetchConsultants()
      .then(setConsultants)
      .catch((e) => setError(e?.message || String(e)));
  }, [navigate]);

  const pick = (name) => {
    localStorage.setItem(CONSULTANT_KEY, name);
    navigate(`/call-prep/${encodeURIComponent(name)}`);
  };

  if (error) {
    return (
      <div style={s.wrap}>
        <div style={s.error}>
          {/BQ 403/.test(error)
            ? 'You don’t have access to the call_prep dataset yet. Ask Nic for the BigQuery grant.'
            : `Couldn’t load consultants: ${error}`}
        </div>
      </div>
    );
  }
  if (!consultants) return <div style={s.wrap}><div style={s.note}>Loading consultants…</div></div>;
  if (!consultants.length) {
    return <div style={s.wrap}><div style={s.note}>No snapshots in call_prep yet.</div></div>;
  }

  return (
    <div style={s.wrap}>
      <h1 style={s.title}>Call Prep</h1>
      <p style={s.sub}>Pick your name to see your accounts. We’ll remember it next time.</p>
      {consultants.map((c) => (
        <div key={c.consultant} style={s.row} onClick={() => pick(c.consultant)}>
          <span style={s.rowName}>{c.consultant}</span>
          <span style={s.rowMeta}>
            {c.accountCount} account{c.accountCount === 1 ? '' : 's'} · last snapshot {c.lastSnapshotDate}
          </span>
        </div>
      ))}
    </div>
  );
}
