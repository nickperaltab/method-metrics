import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchPsAccount } from '../lib/psHub';

export default function PsHubAccount() {
  const { id } = useParams();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchPsAccount(id)
      .then(setAccount)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={s.layout}><div style={s.empty}>Loading account...</div></div>;
  if (error) return <div style={s.layout}><div style={{ ...s.empty, color: '#dc2626' }}>{error}</div></div>;
  if (!account) return <div style={s.layout}><div style={s.empty}>Account not found.</div></div>;

  const callPreps = [...(account.ps_call_preps || [])].sort((a, b) => b.call_date.localeCompare(a.call_date));
  const audits = [...(account.ps_audits || [])].sort((a, b) => b.call_date.localeCompare(a.call_date));
  const projectNotes = [...(account.ps_project_notes || [])].sort(
    (a, b) => new Date(b.updated_at) - new Date(a.updated_at),
  );
  const latestCallPrep = callPreps[0];

  return (
    <div style={s.layout}>
      <Link to="/ps-hub" style={s.backLink}>← Accounts</Link>
      <div style={s.header}>
        <h1 style={s.title}>{account.name}</h1>
        <p style={s.subtitle}>
          {account.account_type}
          {account.is_dedicated ? ' · Dedicated' : ''}
        </p>
      </div>

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Latest call prep</h2>
        {latestCallPrep ? (
          <div style={s.card}>
            <p style={s.meta}>
              {latestCallPrep.call_date}
              {latestCallPrep.dep_score != null ? ` · DEP ${latestCallPrep.dep_score}` : ''}
            </p>
            <p style={s.cardSummary}>{latestCallPrep.summary}</p>
            <pre style={s.pre}>{latestCallPrep.content}</pre>
          </div>
        ) : (
          <div style={s.empty}>No call preps yet.</div>
        )}
      </section>

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Recent audits</h2>
        {audits.length === 0 ? (
          <div style={s.empty}>No audits yet.</div>
        ) : (
          <ul style={s.list}>
            {audits.map((audit) => (
              <li key={audit.id} style={s.listRow}>
                <span>{audit.audit_type} · {audit.call_date}</span>
                <span style={{ color: '#6b7280' }}>
                  {audit.total_score != null && audit.max_score != null
                    ? `${audit.total_score}/${audit.max_score}`
                    : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Project notes</h2>
        {projectNotes.length === 0 ? (
          <div style={s.empty}>No project notes yet.</div>
        ) : (
          <ul style={s.list}>
            {projectNotes.map((note) => (
              <li key={note.id} style={s.listRow}>
                <span>{note.title}</span>
                <span style={{ color: '#6b7280' }}>{note.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const s = {
  layout: { padding: 24, maxWidth: 1200, margin: '0 auto' },
  backLink: { fontSize: 13, color: '#6b7280', textDecoration: 'none' },
  header: { margin: '8px 0 24px' },
  title: { fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: 0 },
  subtitle: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 10 },
  card: { background: '#ffffff', border: '1px solid #e2e5e9', borderRadius: 8, padding: 16 },
  meta: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  cardSummary: { fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 10 },
  pre: { whiteSpace: 'pre-wrap', fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#374151', margin: 0 },
  list: { listStyle: 'none', margin: 0, padding: 0, border: '1px solid #e2e5e9', borderRadius: 8, overflow: 'hidden' },
  listRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 16px', fontSize: 13, borderBottom: '1px solid #f1f3f5', color: '#374151' },
  empty: { color: '#6b7280', fontSize: 13, padding: 40, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
};
