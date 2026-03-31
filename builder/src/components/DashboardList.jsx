import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchMyDashboards, fetchApprovedDashboardsList, createDashboard, deleteDashboard, setApproved, fetchStars, starDashboard, unstarDashboard } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';
import { isAdmin, canDelete } from '../lib/permissions';

const styles = {
  layout: { padding: 24, maxWidth: 1200, margin: '0 auto', minHeight: 'calc(100vh - 52px)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 20, fontWeight: 600, color: '#1a1a1a' },
  controls: { display: 'flex', gap: 8 },
  newBtn: {
    background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669',
    padding: '8px 20px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
  card: {
    background: '#f8f9fa', border: '1px solid #e2e5e9', borderRadius: 8,
    padding: 20, cursor: 'pointer', transition: 'border-color 0.15s', position: 'relative',
  },
  cardName: { fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 },
  cardMeta: { fontSize: 12, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace" },
  cardActions: { display: 'flex', gap: 8, marginTop: 8 },
  starBtn: {
    position: 'absolute', top: 12, right: 12, background: 'none', border: 'none',
    fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1,
  },
  badge: {
    display: 'inline-block', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669',
    padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace", marginBottom: 6,
  },
  section: { marginTop: 32 },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.05em' },
  empty: { color: '#6b7280', fontSize: 13, padding: 40, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
  smallBtn: {
    background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace", padding: '2px 0',
  },
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
    } catch (e) {
      setError(`Delete failed: ${e.message}`);
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
    return <div style={styles.layout}><div style={styles.empty}>Loading...</div></div>;
  }

  // Sort: starred first, then alphabetical
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

  function renderCard(db, showActions = false) {
    const isStarred = stars.includes(db.id);
    const isMine = canDelete(currentUser, db);
    const admin = isAdmin(currentUser);

    return (
      <div
        key={db.id}
        style={styles.card}
        onClick={() => navigate(`/dashboards/${db.id}`)}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#059669'}
        onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e5e9'}
      >
        <button
          style={{ ...styles.starBtn, color: isStarred ? '#f59e0b' : '#9ca3af' }}
          onClick={e => toggleStar(e, db.id)}
          aria-label={isStarred ? 'Unstar' : 'Star'}
        >
          {isStarred ? '\u2605' : '\u2606'}
        </button>
        {db.is_approved && <div style={styles.badge}>Method Approved</div>}
        <div style={styles.cardName}>{db.name}</div>
        <div style={styles.cardMeta}>
          {(db.layout || []).length} chart{(db.layout || []).length !== 1 ? 's' : ''}
          {db.updated_at && ` \u00B7 ${new Date(db.updated_at).toLocaleDateString()}`}
        </div>
        {(isMine || showActions) && (
          <div style={styles.cardActions}>
            {isMine && <button style={styles.smallBtn} onClick={e => handleDelete(e, db)}>delete</button>}
            {isMine && admin && (
              <button style={{ ...styles.smallBtn, color: db.is_approved ? '#dc2626' : '#059669' }} onClick={e => handleToggleApproval(e, db)}>
                {db.is_approved ? 'remove approval' : 'mark approved'}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={styles.layout}>
      <div style={styles.header}>
        <span style={styles.title}>Dashboards</span>
        <div style={styles.controls}>
          <button style={styles.newBtn} onClick={handleNew}>+ New Dashboard</button>
        </div>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 16 }}>{error}</div>}

      {/* Method Approved */}
      {sortedApproved.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Method Approved</div>
          <div style={styles.grid}>{sortedApproved.map(db => renderCard(db, true))}</div>
        </div>
      )}

      {/* My Dashboards */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>My Dashboards</div>
        {sortedMine.length === 0 ? (
          <div style={styles.empty}>No dashboards yet. Create one to get started.</div>
        ) : (
          <div style={styles.grid}>{sortedMine.map(db => renderCard(db, true))}</div>
        )}
      </div>
    </div>
  );
}
