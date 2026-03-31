import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDashboards, createDashboard, loadCharts, fetchStars, starDashboard, unstarDashboard, fetchFolders, createFolder, deleteFolder } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';

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
  folderBtn: {
    background: '#f8f9fa', border: '1px solid #e2e5e9', color: '#6b7280',
    padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
  card: {
    background: '#f8f9fa', border: '1px solid #e2e5e9', borderRadius: 8,
    padding: 20, cursor: 'pointer', transition: 'border-color 0.15s', position: 'relative',
  },
  cardName: { fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 8 },
  cardMeta: { fontSize: 12, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace" },
  starBtn: {
    position: 'absolute', top: 12, right: 12, background: 'none', border: 'none',
    fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1,
  },
  section: { marginTop: 32 },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.05em' },
  empty: { color: '#6b7280', fontSize: 13, padding: 40, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
  folderHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 0', marginBottom: 8, borderBottom: '1px solid #e2e5e9',
  },
  folderName: { fontSize: 13, fontWeight: 600, color: '#374151' },
  deleteBtn: {
    background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
  },
};

export default function DashboardList({ userEmail }) {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const [dashboards, setDashboards] = useState([]);
  const [charts, setCharts] = useState([]);
  const [stars, setStars] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('updated');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.allSettled([
          fetchDashboards(),
          userEmail ? loadCharts(userEmail) : Promise.resolve([]),
          currentUser ? fetchStars(currentUser.id) : Promise.resolve([]),
          currentUser ? fetchFolders(currentUser.id) : Promise.resolve([]),
        ]);
        setDashboards(results[0].status === 'fulfilled' ? results[0].value : []);
        setCharts(results[1].status === 'fulfilled' ? results[1].value : []);
        setStars(results[2].status === 'fulfilled' ? results[2].value : []);
        setFolders(results[3].status === 'fulfilled' ? results[3].value : []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userEmail, currentUser]);

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
        layout: [],
      });
      const created = Array.isArray(result) ? result[0] : result;
      if (created?.id) navigate(`/dashboards/${created.id}`);
    } catch (e) {
      setError(`Create failed: ${e.message}`);
    }
  }, [currentUser, userEmail, navigate]);

  const handleNewFolder = useCallback(async () => {
    const name = window.prompt('Folder name:');
    if (!name || !currentUser) return;
    try {
      const result = await createFolder(name, currentUser.id);
      const created = Array.isArray(result) ? result[0] : result;
      setFolders(prev => [...prev, created]);
    } catch (e) {
      setError(`Create folder failed: ${e.message}`);
    }
  }, [currentUser]);

  const handleDeleteFolder = useCallback(async (e, folderId) => {
    e.stopPropagation();
    try {
      await deleteFolder(folderId);
      setFolders(prev => prev.filter(f => f.id !== folderId));
    } catch (e) {
      setError(`Delete folder failed: ${e.message}`);
    }
  }, []);

  if (loading) {
    return <div style={styles.layout}><div style={styles.empty}>Loading...</div></div>;
  }

  // Sort dashboards
  const sorted = [...dashboards].sort((a, b) => {
    if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'created') return new Date(b.created_at) - new Date(a.created_at);
    return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
  });

  const starred = sorted.filter(d => stars.includes(d.id));
  const unstarred = sorted.filter(d => !stars.includes(d.id));

  // Group unstarred by folder
  const inFolders = {};
  const unfiled = [];
  for (const d of unstarred) {
    if (d.folder_id && folders.some(f => f.id === d.folder_id)) {
      if (!inFolders[d.folder_id]) inFolders[d.folder_id] = [];
      inFolders[d.folder_id].push(d);
    } else {
      unfiled.push(d);
    }
  }

  function renderCard(db) {
    const isStarred = stars.includes(db.id);
    return (
      <div
        key={db.id}
        style={styles.card}
        onClick={() => navigate(`/dashboards/${db.id}`)}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#059669'}
        onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e5e9'}
      >
        <button
          style={{ ...styles.starBtn, color: isStarred ? '#f59e0b' : '#6b7280' }}
          onClick={e => toggleStar(e, db.id)}
          aria-label={isStarred ? 'Unstar' : 'Star'}
        >
          {isStarred ? '\u2605' : '\u2606'}
        </button>
        <div style={styles.cardName}>{db.name}</div>
        <div style={styles.cardMeta}>
          {(db.layout || []).length} chart{(db.layout || []).length !== 1 ? 's' : ''}
          {db.updated_at && ` \u00B7 ${new Date(db.updated_at).toLocaleDateString()}`}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.layout}>
      <div style={styles.header}>
        <span style={styles.title}>My Dashboards</span>
        <div style={styles.controls}>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{ ...styles.folderBtn, padding: '6px 10px' }}
          >
            <option value="updated">Last Updated</option>
            <option value="name">Name</option>
            <option value="created">Created</option>
          </select>
          <button style={styles.folderBtn} onClick={handleNewFolder}>+ Folder</button>
          <button style={styles.newBtn} onClick={handleNew}>+ New Dashboard</button>
        </div>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 16 }}>{error}</div>}

      {dashboards.length === 0 ? (
        <div style={styles.empty}>
          No dashboards yet. Create your first dashboard to start arranging charts.
        </div>
      ) : (
        <>
          {/* Starred section */}
          {starred.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>{'\u2605'} Favorites</div>
              <div style={styles.grid}>{starred.map(renderCard)}</div>
            </div>
          )}

          {/* Folders */}
          {folders.map(folder => {
            const folderDashboards = inFolders[folder.id] || [];
            return (
              <div key={folder.id} style={styles.section}>
                <div style={styles.folderHeader}>
                  <span style={styles.folderName}>{folder.name} ({folderDashboards.length})</span>
                  <button style={styles.deleteBtn} onClick={e => handleDeleteFolder(e, folder.id)}>delete</button>
                </div>
                {folderDashboards.length > 0 ? (
                  <div style={styles.grid}>{folderDashboards.map(renderCard)}</div>
                ) : (
                  <div style={{ ...styles.empty, padding: 16 }}>No dashboards in this folder</div>
                )}
              </div>
            );
          })}

          {/* Unfiled */}
          {unfiled.length > 0 && (
            <div style={styles.section}>
              {folders.length > 0 && <div style={styles.sectionTitle}>Unfiled</div>}
              <div style={styles.grid}>{unfiled.map(renderCard)}</div>
            </div>
          )}
        </>
      )}

      {/* Chart Library */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Chart Library</div>
        {charts.length === 0 ? (
          <div style={styles.empty}>No saved charts yet. Use the Explorer to create and save charts.</div>
        ) : (
          <div style={styles.grid}>
            {charts.map(chart => (
              <div key={chart.id} style={{ background: '#f8f9fa', border: '1px solid #e2e5e9', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>{chart.name}</div>
                <div style={{ fontSize: 11, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace" }}>
                  {(chart.metric_ids || []).length} metric{(chart.metric_ids || []).length !== 1 ? 's' : ''}
                  {chart.created_at && ` \u00B7 ${new Date(chart.created_at).toLocaleDateString()}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
