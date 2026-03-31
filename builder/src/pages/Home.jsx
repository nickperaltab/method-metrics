import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { fetchMyDashboards, fetchApprovedDashboardsList, fetchStars, fetchRecentViews, starDashboard, unstarDashboard, deleteDashboard, setApproved, updateDashboard } from '../lib/supabase';
import { isAdmin, canDelete } from '../lib/permissions';
import Dialog from '../components/Dialog';

const s = {
  layout: { padding: '32px 24px', maxWidth: 1200, margin: '0 auto' },
  greeting: { fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 },
  subtitle: { color: '#6b7280', fontSize: 14, marginBottom: 32 },
  section: { marginBottom: 40 },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.05em' },
  empty: { color: '#6b7280', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", padding: '12px 0' },
  table: { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' },
  th: { textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '2px solid #e2e5e9' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f1f3f5', fontSize: 13, color: '#374151' },
  nameCell: { fontWeight: 600, color: '#1a1a1a' },
  badge: {
    display: 'inline-block', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669',
    padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", marginLeft: 8,
  },
  starBtn: { background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', padding: '2px 4px', lineHeight: 1 },
  actionBtn: { background: '#ffffff', border: '1px solid #e2e5e9', color: '#6b7280', cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", padding: '4px 10px', borderRadius: 4 },
};

export default function Home() {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const [dashboards, setDashboards] = useState([]);
  const [stars, setStars] = useState([]);
  const [recentIds, setRecentIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dbs, approvedDbs, starIds, views] = await Promise.allSettled([
        currentUser ? fetchMyDashboards(currentUser.id) : Promise.resolve([]),
        fetchApprovedDashboardsList(),
        currentUser ? fetchStars(currentUser.id) : Promise.resolve([]),
        currentUser ? fetchRecentViews(currentUser.id, 10) : Promise.resolve([]),
      ]);
      const mine = dbs.status === 'fulfilled' ? dbs.value : [];
      const approved = approvedDbs.status === 'fulfilled' ? approvedDbs.value : [];
      const all = [...mine];
      for (const d of approved) {
        if (!all.some(x => x.id === d.id)) all.push(d);
      }
      setDashboards(all);
      setStars(starIds.status === 'fulfilled' ? starIds.value : []);
      const viewData = views.status === 'fulfilled' ? views.value : [];
      const seen = new Set();
      const uniqueRecent = [];
      for (const v of viewData) {
        if (!seen.has(v.dashboard_id)) {
          seen.add(v.dashboard_id);
          uniqueRecent.push(v.dashboard_id);
        }
      }
      setRecentIds(uniqueRecent);
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
    try {
      if (isStarred) {
        await unstarDashboard(db.id, currentUser.id);
        setStars(prev => prev.filter(id => id !== db.id));
      } else {
        await starDashboard(db.id, currentUser.id);
        setStars(prev => [...prev, db.id]);
      }
      window.dispatchEvent(new Event('stars-changed'));
    } catch (e) {
      console.error('Star toggle failed:', e);
    }
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

  if (loading) return <div style={s.layout}><div style={s.empty}>Loading...</div></div>;

  const starredDashboards = dashboards.filter(d => stars.includes(d.id));
  const recentDashboards = recentIds
    .map(id => dashboards.find(d => d.id === id))
    .filter(Boolean)
    .filter(d => !stars.includes(d.id));

  const admin = isAdmin(currentUser);

  function renderTable(list) {
    return (
      <table style={s.table}>
        <thead>
          <tr>
            <th style={{ ...s.th, width: 60, textAlign: 'center' }}></th>
            <th style={s.th}>Name</th>
            <th style={s.th}>Owner</th>
            <th style={{ ...s.th, width: 70, textAlign: 'center' }}>Charts</th>
            <th style={{ ...s.th, width: 120 }}>Last Modified</th>
            <th style={{ ...s.th, width: 40, textAlign: 'center' }}></th>
            <th style={{ ...s.th, width: 70, textAlign: 'center' }}></th>
            <th style={{ ...s.th, width: 110, textAlign: 'center' }}></th>
          </tr>
        </thead>
        <tbody>
          {list.map(db => {
            const isStarred = stars.includes(db.id);
            const isMine = canDelete(currentUser, db);
            return (
              <tr key={db.id}>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  <button style={{ ...s.actionBtn, color: '#059669', borderColor: '#a7f3d0' }} onClick={() => navigate(`/dashboards/${db.id}`)}>view</button>
                </td>
                <td style={s.td}>
                  <span
                    style={{ ...s.nameCell, cursor: isMine ? 'pointer' : 'default', textDecoration: isMine ? 'underline dotted #d1d5db' : 'none' }}
                    onClick={e => isMine ? handleRename(e, db) : null}
                    title={isMine ? 'Click to rename' : ''}
                  >
                    {db.name}
                  </span>
                  {db.is_approved && <span style={s.badge}>Method Approved</span>}
                </td>
                <td style={s.td}>{db.created_by?.split('@')[0] || '\u2014'}</td>
                <td style={{ ...s.td, textAlign: 'center' }}>{(db.layout || []).length}</td>
                <td style={s.td}>{db.updated_at ? new Date(db.updated_at).toLocaleDateString() : '\u2014'}</td>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  <button
                    style={{ ...s.starBtn, color: isStarred ? '#f59e0b' : '#d1d5db' }}
                    onClick={e => toggleStar(e, db)}
                    aria-label={isStarred ? 'Unstar' : 'Star'}
                  >
                    {isStarred ? '\u2605' : '\u2606'}
                  </button>
                </td>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  {isMine && (
                    <button style={{ ...s.actionBtn, color: '#dc2626', borderColor: '#fecaca' }} onClick={e => handleDelete(e, db)}>delete</button>
                  )}
                </td>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  {isMine && admin && (
                    <button
                      style={{ ...s.actionBtn, color: db.is_approved ? '#dc2626' : '#059669', borderColor: db.is_approved ? '#fecaca' : '#a7f3d0' }}
                      onClick={e => handleToggleApproval(e, db)}
                    >
                      {db.is_approved ? 'remove approval' : 'mark approved'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <div style={s.layout}>
      {dialog && <Dialog {...dialog} />}

      <div style={s.greeting}>{currentUser ? `Hey ${currentUser.name}` : 'Metrics Hub'}</div>
      <div style={s.subtitle}>Single source of truth for Method's revenue and marketing metrics.</div>

      <div style={s.section}>
        <div style={s.sectionTitle}>{'\u2605'} Favorites</div>
        {starredDashboards.length > 0 ? renderTable(starredDashboards) : (
          <div style={s.empty}>Star a dashboard to see it here.</div>
        )}
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Recently Viewed</div>
        {recentDashboards.length > 0 ? renderTable(recentDashboards) : (
          <div style={s.empty}>Dashboards you open will appear here.</div>
        )}
      </div>
    </div>
  );
}
