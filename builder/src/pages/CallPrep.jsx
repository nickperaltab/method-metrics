// Call Prep — consultant directory. Route: #/call-prep
// Lists consultants found in call_prep.snapshots as a searchable table.
//
// The signed-in rep sorts to the top rather than being auto-opened: the
// snapshots feed writes two name conventions for the same person ("Sherry
// Zarei" and "S. Zarei" are both in the table), so a single rep can own more
// than one row and there is no safe row to redirect to. Matching reuses the
// same fuzzy email→name pattern the /ps board uses.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchConsultants } from '../lib/callPrep';
import { consultantPatternFromEmail } from '../lib/psOverview';
import { useUser } from '../contexts/UserContext';

const s = {
  wrap: { maxWidth: 860, margin: '0 auto', padding: '40px 24px', fontFamily: "'DM Sans', sans-serif" },
  title: { fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 20 },

  searchRow: { marginBottom: 20 },
  label: {
    display: 'block', fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
    fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
    color: '#6b7280', marginBottom: 6,
  },
  input: {
    width: '100%', maxWidth: 320, padding: '8px 10px', fontSize: 14,
    fontFamily: "'DM Sans', sans-serif", color: '#1a1a1a',
    border: '1px solid #e2e5e9', borderRadius: 6, background: '#fff',
  },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700,
    letterSpacing: '.12em', textTransform: 'uppercase', color: '#6b7280',
    fontFamily: "'JetBrains Mono', monospace", borderBottom: '1px solid #e2e5e9',
  },
  thNum: { textAlign: 'right' },
  td: { padding: '12px', borderBottom: '1px solid #f0f1f3', color: '#1a1a1a' },
  tdNum: { textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 13 },
  rowClickable: { cursor: 'pointer' },
  name: { fontWeight: 600, color: '#1a1a1a', textDecoration: 'none' },
  you: {
    display: 'inline-block', marginLeft: 8, fontSize: 11, fontWeight: 600,
    color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0',
    borderRadius: 4, padding: '1px 6px', verticalAlign: 'middle',
  },

  note: { fontSize: 14, color: '#6b7280', padding: 24, textAlign: 'center' },
  srOnly: {
    position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
    overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
  },
  error: { fontSize: 14, color: '#b91c1c', padding: 24, textAlign: 'center' },
  clear: {
    background: 'none', border: 'none', padding: 0, marginLeft: 6,
    color: '#047857', fontSize: 14, fontFamily: "'DM Sans', sans-serif",
    cursor: 'pointer', textDecoration: 'underline',
  },
};

/** Match a consultant name against the signed-in rep's email. */
function makeIsMe(email) {
  const pattern = consultantPatternFromEmail(email);
  if (!pattern) return () => false;
  const re = new RegExp(pattern);
  return (name) => re.test(String(name || '').toLowerCase().trim());
}

export default function CallPrep() {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const [consultants, setConsultants] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchConsultants()
      .then((c) => { if (!cancelled) setConsultants(c); })
      .catch((e) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    if (!consultants) return [];
    const isMe = makeIsMe(currentUser?.email);
    return consultants
      .map((c) => ({ ...c, isMe: isMe(c.consultant) }))
      .sort((a, b) => (b.isMe - a.isMe) || (a.consultant ?? '').localeCompare(b.consultant ?? ''));
  }, [consultants, currentUser]);

  const term = search.trim().toLowerCase();
  const visible = term
    ? rows.filter((r) => (r.consultant ?? '').toLowerCase().includes(term))
    : rows;

  const open = (name) => navigate(`/call-prep/${encodeURIComponent(name)}`);

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

      <div style={s.searchRow}>
        <label htmlFor="consultant-search" style={s.label}>Search</label>
        <input
          id="consultant-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={s.input}
        />
      </div>

      {/* The table filters as you type with no on-screen count; this is the
          only announcement a screen-reader user gets. */}
      <p style={s.srOnly} role="status" aria-live="polite">
        {visible.length} {visible.length === 1 ? 'consultant' : 'consultants'}
      </p>

      {!visible.length ? (
        <div style={s.note}>
          No consultants match “{search.trim()}”.
          <button type="button" style={s.clear} onClick={() => setSearch('')}>Clear search</button>
        </div>
      ) : (
        <table style={s.table} aria-label="Consultants">
          <thead>
            <tr>
              <th scope="col" style={s.th}>Consultant</th>
              <th scope="col" style={{ ...s.th, ...s.thNum }}>Accounts</th>
              <th scope="col" style={s.th}>Last snapshot</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.consultant} style={s.rowClickable} onClick={() => open(c.consultant)}>
                <td style={s.td}>
                  <Link
                    to={`/call-prep/${encodeURIComponent(c.consultant)}`}
                    style={s.name}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {c.consultant}
                  </Link>
                  {c.isMe && <span style={s.you}>You</span>}
                </td>
                <td style={{ ...s.td, ...s.tdNum }}>{c.accountCount}</td>
                <td style={s.td}>{c.lastSnapshotDate ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
