import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPsBoard } from '../lib/psHub';
import { useCalendarAuth } from '../hooks/useCalendarAuth';
import { matchEventToAccount } from '../lib/calendar';
import { useUser } from '../contexts/UserContext';

const TYPE_COLOR = { DEDICATED: '#059669', PPU: '#2563eb', FREE: '#6b7280' };

function formatEventTime(iso, allDay) {
  if (allDay) return 'All day';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function scoreColor(total, max) {
  if (total == null || !max) return '#6b7280';
  const pct = total / max;
  if (pct >= 0.85) return '#059669';
  if (pct >= 0.65) return '#f59e0b';
  return '#dc2626';
}

function TodayPanel({ accounts }) {
  const cal = useCalendarAuth();

  if (!cal.connected) {
    return (
      <div style={s.todayCard}>
        <div>
          <h2 style={s.sectionTitle}>Today</h2>
          <p style={{ ...s.emptyInline }}>Connect your calendar to see today's calls here.</p>
        </div>
        <button style={s.connectBtn} onClick={cal.connect}>Connect Calendar</button>
      </div>
    );
  }

  const events = cal.events.map((e) => ({ ...e, account: matchEventToAccount(e, accounts) }));

  return (
    <div style={s.section}>
      <div style={s.header}>
        <h2 style={s.sectionTitle}>Today</h2>
        <button style={s.linkBtn} onClick={cal.disconnect}>Disconnect calendar</button>
      </div>
      {cal.loading && <div style={s.emptyInline}>Loading calendar...</div>}
      {cal.error && <div style={{ ...s.emptyInline, color: '#dc2626' }}>{cal.error}</div>}
      {!cal.loading && !cal.error && events.length === 0 && (
        <div style={s.emptyInline}>Nothing on your calendar today.</div>
      )}
      {events.length > 0 && (
        <div style={s.eventList}>
          {events.map((e) => (
            <div key={e.id} style={s.eventRow}>
              <span style={s.eventTime}>{formatEventTime(e.start, e.allDay)}</span>
              <span style={s.eventTitle}>{e.title}</span>
              {e.account ? (
                <Link to={`/ps-hub/${e.account.id}`} style={s.eventAccountLink}>
                  {e.account.name}
                </Link>
              ) : (
                <span style={s.eventNoMatch}>No account match</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PsHub() {
  const { currentUser } = useUser();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('mine');
  const [activeOnly, setActiveOnly] = useState(true);
  const [typeFilter, setTypeFilter] = useState('DEDICATED');

  useEffect(() => {
    setLoading(true);
    fetchPsBoard({ activeOnly, accountType: typeFilter || undefined })
      .then(setAccounts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeOnly, typeFilter]);

  const owners = useMemo(
    () => [...new Set(accounts.map((a) => a.owner_email).filter(Boolean))].sort(),
    [accounts],
  );

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      if (search && !a.name?.toLowerCase().includes(search.toLowerCase())) return false;
      if (ownerFilter === 'mine') return a.owner_email === currentUser?.email;
      if (ownerFilter === 'all') return true;
      return a.owner_email === ownerFilter;
    });
  }, [accounts, search, ownerFilter, currentUser]);

  return (
    <div style={s.layout}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>PS Hub</h1>
          <p style={s.subtitle}>Your day, your book, and every snapshot in one place.</p>
        </div>
      </div>

      <TodayPanel accounts={accounts} />

      <div style={s.section}>
        <div style={s.header}>
          <h2 style={s.sectionTitle}>Accounts</h2>
        </div>

        <div style={s.filterBar}>
          <input
            type="text"
            placeholder="Search accounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={s.search}
          />
          <select style={s.select} value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
            <option value="mine">Mine</option>
            <option value="all">Everyone</option>
            {owners.filter((o) => o !== currentUser?.email).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <select style={s.select} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="DEDICATED">Managed billable (Dedicated)</option>
            <option value="PPU">PPU</option>
            <option value="FREE">Free</option>
            <option value="">All types</option>
          </select>
          <label style={s.checkboxLabel}>
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Active only
          </label>
        </div>

        {loading && <div style={s.empty}>Loading accounts...</div>}
        {error && <div style={{ ...s.empty, color: '#dc2626' }}>{error}</div>}

        {!loading && !error && filtered.length === 0 && (
          <div style={s.empty}>
            No accounts match these filters.
            {ownerFilter === 'mine' && ' Try "Everyone" — accounts may not have an owner assigned yet.'}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div style={s.grid}>
            {filtered.map((a) => (
              <Link key={a.id} to={`/ps-hub/${a.id}`} style={s.card}>
                <div style={s.cardHeader}>
                  <span style={s.cardName}>{a.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: TYPE_COLOR[a.account_type] || '#6b7280' }}>
                    {a.account_type}
                  </span>
                </div>
                <div style={s.cardStats}>
                  <div style={s.stat}>
                    <span style={s.statLabel}>DEP</span>
                    <span style={s.statValue}>{a.latestCallPrep?.dep_score ?? '—'}</span>
                  </div>
                  <div style={s.stat}>
                    <span style={s.statLabel}>Last audit</span>
                    <span style={{ ...s.statValue, color: scoreColor(a.latestAudit?.total_score, a.latestAudit?.max_score) }}>
                      {a.latestAudit ? `${a.latestAudit.total_score ?? '—'}/${a.latestAudit.max_score ?? '—'}` : '—'}
                    </span>
                  </div>
                  <div style={s.stat}>
                    <span style={s.statLabel}>Open notes</span>
                    <span style={s.statValue}>{a.openNoteCount}</span>
                  </div>
                </div>
                {!a.is_active && <span style={s.inactiveBadge}>Inactive</span>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  layout: { padding: 24, maxWidth: 1200, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 16 },
  title: { fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: 0 },
  subtitle: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: '#374151', margin: 0 },
  todayCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', border: '1px solid #e2e5e9', borderRadius: 8, padding: 20, marginBottom: 32 },
  connectBtn: { padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  linkBtn: { background: 'none', border: 'none', color: '#6b7280', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontFamily: "'DM Sans', sans-serif" },
  emptyInline: { color: '#6b7280', fontSize: 13, marginTop: 8 },
  eventList: { border: '1px solid #e2e5e9', borderRadius: 8, overflow: 'hidden', background: '#fff' },
  eventRow: { display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px', borderBottom: '1px solid #f1f3f5', fontSize: 13 },
  eventTime: { width: 90, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 },
  eventTitle: { flex: 1, color: '#374151' },
  eventAccountLink: { color: '#059669', fontWeight: 600, textDecoration: 'none' },
  eventNoMatch: { color: '#9ca3af', fontSize: 12 },
  filterBar: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0 16px' },
  search: { background: '#ffffff', border: '1px solid #e2e5e9', color: '#374151', padding: '6px 12px', borderRadius: 4, fontSize: 12, fontFamily: "'DM Sans', sans-serif", width: 220 },
  select: { background: '#ffffff', border: '1px solid #e2e5e9', color: '#374151', padding: '6px 10px', borderRadius: 4, fontSize: 12, fontFamily: "'DM Sans', sans-serif" },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
  card: { display: 'block', background: '#ffffff', border: '1px solid #e2e5e9', borderRadius: 8, padding: 14, textDecoration: 'none', position: 'relative' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardName: { fontSize: 14, fontWeight: 700, color: '#1a1a1a' },
  cardStats: { display: 'flex', justifyContent: 'space-between', gap: 8 },
  stat: { display: 'flex', flexDirection: 'column', gap: 2 },
  statLabel: { fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em' },
  statValue: { fontSize: 13, fontWeight: 600, color: '#374151' },
  inactiveBadge: { position: 'absolute', top: 10, right: 10, fontSize: 9, fontWeight: 700, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 3, padding: '2px 6px' },
  empty: { color: '#6b7280', fontSize: 13, padding: 40, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
};
