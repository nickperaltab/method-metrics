import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPsAccounts } from '../lib/psHub';

const TYPE_COLOR = { DEDICATED: '#059669', PPU: '#2563eb', FREE: '#6b7280' };

export default function PsHub() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchPsAccounts()
      .then(setAccounts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = accounts.filter(
    (a) => !search || a.name?.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) return <div style={s.layout}><div style={s.empty}>Loading accounts...</div></div>;

  return (
    <div style={s.layout}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>PS Hub</h1>
          <p style={s.subtitle}>Call preps, audits, and project notes for every dedicated account.</p>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search accounts..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={s.search}
      />

      {error && <div style={{ ...s.empty, color: '#dc2626' }}>{error}</div>}

      {!error && filtered.length === 0 && (
        <div style={s.empty}>No accounts yet. Routines populate this as call preps and audits come in.</div>
      )}

      {!error && filtered.length > 0 && (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Account</th>
                <th style={s.th}>Type</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} style={s.row}>
                  <td style={s.td}>
                    <Link to={`/ps-hub/${a.id}`} style={s.link}>{a.name}</Link>
                  </td>
                  <td style={s.td}>
                    <span style={{ fontSize: 11, color: TYPE_COLOR[a.account_type] || '#6b7280' }}>
                      {a.account_type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s = {
  layout: { padding: 24, maxWidth: 1200, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 },
  title: { fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: 0 },
  subtitle: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  search: { background: '#ffffff', border: '1px solid #e2e5e9', color: '#374151', padding: '6px 12px', borderRadius: 4, fontSize: 12, fontFamily: "'DM Sans', sans-serif", width: '100%', maxWidth: 300, marginBottom: 16 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #e2e5e9' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f1f3f5', fontSize: 13, color: '#374151' },
  row: { transition: 'background .1s' },
  link: { color: '#1a1a1a', fontWeight: 600, textDecoration: 'none' },
  empty: { color: '#6b7280', fontSize: 13, padding: 40, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
};
