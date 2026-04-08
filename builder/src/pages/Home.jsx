import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { isAdmin, canDelete } from '../lib/permissions';
import { fetchMyDashboards, fetchApprovedDashboardsList, fetchStars, starDashboard, unstarDashboard, deleteDashboard, setApproved, updateDashboard } from '../lib/supabase';
import { SCORECARDS } from '../config/scorecards';
import Dialog from '../components/Dialog';

const s = {
  layout: { padding: '32px 24px', maxWidth: 1000, margin: '0 auto' },
  pageTitle: { fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 24 },
  sectionTitle: { fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 10 },
  list: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 32 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fff', border: '1px solid #e2e5e9', borderRadius: 8, cursor: 'pointer' },
  rowName: { flex: 1, fontSize: 13, fontWeight: 500, color: '#1a1a1a' },
  rowMeta: { fontSize: 11, color: '#9ca3af' },
  badge: { fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 10, padding: '2px 8px' },
  starBtn: { background: 'none', border: 'none', fontSize: 15, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, color: '#d1d5db' },
  actionBtn: { background: '#fff', border: '1px solid #e2e5e9', color: '#6b7280', cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", padding: '3px 8px', borderRadius: 4 },
  search: { width: '100%', padding: '8px 12px', border: '1px solid #e2e5e9', borderRadius: 6, fontSize: 13, background: '#fff', color: '#374151', marginBottom: 20, outline: 'none', boxSizing: 'border-box' },
  empty: { fontSize: 13, color: '#9ca3af', padding: '8px 0', fontFamily: "'JetBrains Mono', monospace" },
};

const approvedScorecards = Object.values(SCORECARDS).filter(sc => !sc.group);

export default function Home() {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const [dashboards, setDashboards] = useState([]);
  const [stars, setStars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mine, approved, starIds] = await Promise.all([
        currentUser ? fetchMyDashboards(currentUser.id) : [],
        fetchApprovedDashboardsList(),
        currentUser ? fetchStars(currentUser.id) : [],
      ]);
      const all = [...mine];
      for (const d of approved) {
        if (!all.some(x => x.id === d.id)) all.push(d);
      }
      setDashboards(all);
      setStars(starIds);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('stars-changed', handler);
    return () => window.removeEventListener('stars-changed', handler);
  }, [load]);

  const toggleStar = useCallback(async (e, db) => {
    e.stopPropagation();
    if (!currentUser) return;
    const isStarred = stars.includes(db.id);
    if (isStarred) {
      await unstarDashboard(db.id, currentUser.id);
      setStars(prev => prev.filter(id => id !== db.id));
    } else {
      await starDashboard(db.id, currentUser.id);
      setStars(prev => [...prev, db.id]);
    }
    window.dispatchEvent(new Event('stars-changed'));
  }, [currentUser, stars]);

  const handleDelete = useCallback((e, db) => {
    e.stopPropagation();
    setDialog({
      type: 'confirm',
      title: `Delete "${db.name}"?`,
      message: 'This cannot be undone.',
      danger: true,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setDialog(null);
        await deleteDashboard(db.id);
        window.dispatchEvent(new Event('stars-changed'));
        await load();
      },
      onCancel: () => setDialog(null),
    });
  }, [load]);

  const handleRename = useCallback((e, db) => {
    e.stopPropagation();
    setDialog({
      type: 'prompt',
      title: 'Rename dashboard',
      label: 'Name',
      defaultValue: db.name,
      onConfirm: async (name) => {
        setDialog(null);
        if (name === db.name) return;
        await updateDashboard(db.id, { name });
        await load();
        window.dispatchEvent(new Event('stars-changed'));
      },
      onCancel: () => setDialog(null),
    });
  }, [load]);

  const handleToggleApproval = useCallback(async (e, db) => {
    e.stopPropagation();
    await setApproved('dashboards', db.id, !db.is_approved);
    await load();
  }, [load]);

  const admin = isAdmin(currentUser);

  const filtered = dashboards.filter(db => {
    if (!search) return true;
    return db.name?.toLowerCase().includes(search.toLowerCase());
  });

  function DashboardRow({ db }) {
    const isStarred = stars.includes(db.id);
    const isMine = canDelete(currentUser, db);
    return (
      <div
        style={s.row}
        onClick={() => navigate(`/dashboards/${db.id}`)}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#059669'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e5e9'; }}
      >
        <button
          style={{ ...s.starBtn, color: isStarred ? '#f59e0b' : '#d1d5db' }}
          onClick={e => toggleStar(e, db)}
          aria-label={isStarred ? 'Unstar' : 'Star'}
        >
          {isStarred ? '★' : '☆'}
        </button>
        <span
          style={s.rowName}
          onClick={isMine ? e => handleRename(e, db) : undefined}
          title={isMine ? 'Click to rename' : ''}
        >
          {db.name}
        </span>
        {db.is_approved && <span style={s.badge}>Review Requested</span>}
        <span style={s.rowMeta}>{db.created_by?.split('@')[0] || '—'}</span>
        {isMine && (
          <button style={{ ...s.actionBtn, color: '#dc2626', borderColor: '#fecaca' }} onClick={e => handleDelete(e, db)}>
            delete
          </button>
        )}
        {isMine && admin && (
          <button
            style={{ ...s.actionBtn, color: db.is_approved ? '#6b7280' : '#c2410c', borderColor: db.is_approved ? '#e2e5e9' : '#fed7aa' }}
            onClick={e => handleToggleApproval(e, db)}
          >
            {db.is_approved ? 'unrequest' : 'request review'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={s.layout}>
      {dialog && <Dialog {...dialog} />}

      <div style={s.pageTitle}>Home</div>

      {/* Method Approved scorecards */}
      <div style={s.sectionTitle}>Method Approved</div>
      <div style={s.list}>
        {approvedScorecards.map(sc => (
          <div
            key={sc.id}
            style={s.row}
            onClick={() => navigate(`/scorecards/${sc.id}`)}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#059669'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e5e9'; }}
          >
            <span style={{ width: 19 }} />
            <span style={s.rowName}>{sc.title}</span>
            <span style={s.rowMeta}>Scorecard</span>
          </div>
        ))}
      </div>

      {/* AI Dashboards */}
      <div style={s.sectionTitle}>AI Dashboards</div>
      <input
        style={s.search}
        placeholder="Search dashboards…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {loading ? (
        <div style={s.empty}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={s.empty}>No dashboards found.</div>
      ) : (
        <div style={s.list}>
          {filtered.map(db => <DashboardRow key={db.id} db={db} />)}
        </div>
      )}
    </div>
  );
}
