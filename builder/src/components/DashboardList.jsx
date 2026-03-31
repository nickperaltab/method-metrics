import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchMyDashboards, fetchApprovedDashboardsList, createDashboard, deleteDashboard, setApproved, updateDashboard, fetchStars, starDashboard, unstarDashboard } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';
import { isAdmin, canDelete } from '../lib/permissions';

const s = {
  layout: { padding: 24, maxWidth: 1200, margin: '0 auto', minHeight: 'calc(100vh - 52px)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 20, fontWeight: 600, color: '#1a1a1a' },
  newBtn: {
    background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669',
    padding: '8px 20px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
  },
  section: { marginTop: 32 },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.05em' },
  empty: { color: '#6b7280', fontSize: 13, padding: 40, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '2px solid #e2e5e9' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f1f3f5', fontSize: 13, color: '#374151' },
  row: { cursor: 'pointer' },
  nameCell: { fontWeight: 600, color: '#1a1a1a' },
  badge: {
    display: 'inline-block', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669',
    padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", marginLeft: 8,
  },
  starBtn: { background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', padding: '2px 4px', lineHeight: 1 },
  actionBtn: { background: '#ffffff', border: '1px solid #e2e5e9', color: '#6b7280', cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", padding: '4px 10px', borderRadius: 4 },
};

export default function DashboardList({ userEmail }) {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const [myDashboards, setMyDashboards] = useState([]);
  const [approvedDashboards, setApprovedDashboards] = useState([]);
  const [stars, setStars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        currentUser ? fetchMyDashboards(currentUser.id) : Promise.resolve([]),
        fetchApprovedDashboardsList(),
        currentUser ? fetchStars(currentUser.id) : Promise.resolve([]),
      ]);
      setMyDashboards(results[0].status === 'fulfilled' ? results[0].value : []);
      setApprovedDashboards(results[1].status === 'fulfilled' ? results[1].value : []);
      setStars(results[2].status === 'fulfilled' ? results[2].value : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  const toggleStar = useCallback(async (e, dashboardId) => {
    e.stopPropagation();
    if (!currentUser) return;
    const isStarred = stars.includes(dashboardId);
    try {
      if (isStarred) {
        await unstarDashboard(dashboardId, currentUser.id);
        setStars(prev => prev.filter(id => id !== dashboardId));
      } else {
        await starDashboard(dashboardId, currentUser.id);
        setStars(prev => [...prev, dashboardId]);
      }
      window.dispatchEvent(new Event('stars-changed'));
    } catch (e) {
      console.error('Star toggle failed:', e);
    }
  }, [currentUser, stars]);

  const handleNew = useCallback(async () => {
    const name = window.prompt('Dashboard name:');
    if (!name) return;
    try {
      const result = await createDashboard({
        name,
        createdBy: currentUser?.name || userEmail || 'anonymous',
        createdByUser: currentUser?.id,
        layout: [],
      });
      const created = Array.isArray(result) ? result[0] : result;
      if (created?.id) navigate(`/dashboards/${created.id}`);
    } catch (e) {
      setError(`Create failed: ${e.message}`);
    }
  }, [currentUser, userEmail, navigate]);

  const handleDelete = useCallback(async (e, db) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${db.name}"? This cannot be undone.`)) return;
    try {
      await deleteDashboard(db.id);
      await load();
      window.dispatchEvent(new Event('stars-changed'));
    } catch (e) {
      setError(`Delete failed: ${e.message}`);
    }
  }, [load]);

  const handleRename = useCallback(async (e, db) => {
    e.stopPropagation();
    const name = window.prompt('Rename dashboard:', db.name);
    if (!name || name === db.name) return;
    try {
      await updateDashboard(db.id, { name });
      await load();
      window.dispatchEvent(new Event('stars-changed'));
    } catch (e) {
      setError(`Rename failed: ${e.message}`);
    }
  }, [load]);

  const handleToggleApproval = useCallback(async (e, db) => {
    e.stopPropagation();
    try {
      await setApproved('dashboards', db.id, !db.is_approved);
      await load();
    } catch (e) {
      setError(`Update failed: ${e.message}`);
    }
  }, [load]);

  if (loading) {
    return <div style={s.layout}><div style={s.empty}>Loading...</div></div>;
  }

  function sortDashboards(list) {
    return [...list].sort((a, b) => {
      const aStarred = stars.includes(a.id);
      const bStarred = stars.includes(b.id);
      if (aStarred !== bStarred) return aStarred ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  const sortedMine = sortDashboards(myDashboards.filter(d => !d.is_approved));
  const sortedApproved = sortDashboards(approvedDashboards);
  const admin = isAdmin(currentUser);

  function renderTable(list) {
    return (
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Name</th>
            <th style={s.th}>Owner</th>
            <th style={{ ...s.th, width: 70, textAlign: 'center' }}>Charts</th>
            <th style={{ ...s.th, width: 120 }}>Last Modified</th>
            <th style={{ ...s.th, width: 40, textAlign: 'center' }}></th>
            <th style={{ ...s.th, width: 60, textAlign: 'center' }}></th>
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
                    onClick={e => toggleStar(e, db.id)}
                    aria-label={isStarred ? 'Unstar' : 'Star'}
                  >
                    {isStarred ? '\u2605' : '\u2606'}
                  </button>
                </td>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  <button style={{ ...s.actionBtn, color: '#059669', borderColor: '#a7f3d0' }} onClick={() => navigate(`/dashboards/${db.id}`)}>view</button>
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
      <div style={s.header}>
        <span style={s.title}>Dashboards</span>
        <button style={s.newBtn} onClick={handleNew}>+ New Dashboard</button>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 16 }}>{error}</div>}

      {sortedApproved.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Method Approved</div>
          {renderTable(sortedApproved)}
        </div>
      )}

      <div style={s.section}>
        <div style={s.sectionTitle}>My Dashboards</div>
        {sortedMine.length === 0 ? (
          <div style={s.empty}>No dashboards yet. Create one to get started.</div>
        ) : (
          renderTable(sortedMine)
        )}
      </div>
    </div>
  );
}
