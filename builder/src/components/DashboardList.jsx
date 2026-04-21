import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchMyDashboards, fetchApprovedDashboardsList, createDashboard, deleteDashboard, setApproved, updateDashboard, fetchStars, starDashboard, unstarDashboard, duplicateDashboard, dashboardShareUrl } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';
import { useMetrics } from '../hooks/useMetrics';
import { isAdmin, canDelete } from '../lib/permissions';
import Dialog from './Dialog';
import OverflowMenu from './OverflowMenu';
import posthog from '../lib/posthog';

export default function DashboardList({ userEmail }) {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const { metrics } = useMetrics();
  const [myDashboards, setMyDashboards] = useState([]);
  const [approvedDashboards, setApprovedDashboards] = useState([]);
  const [stars, setStars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [ownerFilter, setOwnerFilter] = useState(null); // null = all, 'mine', 'approved'
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

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

  // Merge and deduplicate
  const allDashboards = [...myDashboards];
  for (const d of approvedDashboards) {
    if (!allDashboards.some(x => x.id === d.id)) allDashboards.push(d);
  }

  // Collect unique chart metric IDs across dashboard layouts (for metric chips)
  // Dashboards don't directly have metric IDs, so we skip metric chips for dashboards

  // Filter
  const filtered = allDashboards.filter(db => {
    if (ownerFilter === 'mine' && !canDelete(currentUser, db)) return false;
    if (ownerFilter === 'approved' && !db.is_approved) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return db.name?.toLowerCase().includes(q) ||
      db.created_by?.toLowerCase().includes(q);
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let av, bv;
    switch (sortCol) {
      case 'name': av = a.name || ''; bv = b.name || ''; break;
      case 'owner': av = a.created_by || ''; bv = b.created_by || ''; break;
      case 'charts': av = (a.layout || []).length; bv = (b.layout || []).length; break;
      case 'modified': av = a.updated_at || ''; bv = b.updated_at || ''; break;
      default: av = a.name || ''; bv = b.name || '';
    }
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const sortIcon = (col) => sortCol === col ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';

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

  const handleNew = useCallback(() => {
    setDialog({
      type: 'prompt', title: 'New dashboard', label: 'Name', defaultValue: '',
      onConfirm: async (name) => {
        setDialog(null);
        try {
          const result = await createDashboard({ name, createdBy: currentUser?.name || userEmail || 'anonymous', createdByUser: currentUser?.id, layout: [] });
          const created = Array.isArray(result) ? result[0] : result;
          if (created?.id) navigate(`/dashboards/${created.id}`);
        } catch (e) { setError(`Create failed: ${e.message}`); }
      },
      onCancel: () => setDialog(null),
    });
  }, [currentUser, userEmail, navigate]);

  const handleDelete = useCallback((e, db) => {
    e.stopPropagation();
    setDialog({
      type: 'confirm', title: `Delete "${db.name}"?`, message: 'This cannot be undone.', danger: true, confirmLabel: 'Delete',
      onConfirm: async () => {
        setDialog(null);
        try { await deleteDashboard(db.id); await load(); window.dispatchEvent(new Event('stars-changed')); }
        catch (e) { setError(`Delete failed: ${e.message}`); }
      },
      onCancel: () => setDialog(null),
    });
  }, [load]);

  const handleRename = useCallback((e, db) => {
    e.stopPropagation();
    setDialog({
      type: 'prompt', title: 'Rename dashboard', label: 'Name', defaultValue: db.name,
      onConfirm: async (name) => {
        setDialog(null);
        if (name === db.name) return;
        try { await updateDashboard(db.id, { name }); await load(); window.dispatchEvent(new Event('stars-changed')); }
        catch (e) { setError(`Rename failed: ${e.message}`); }
      },
      onCancel: () => setDialog(null),
    });
  }, [load]);

  const handleShare = useCallback(async (db) => {
    posthog.capture('dashboard_share_clicked', { dashboard_id: db.id, surface: 'dashboard_list' });
    const url = dashboardShareUrl(db.id);
    try {
      await navigator.clipboard.writeText(url);
      setDialog({
        type: 'info',
        title: 'Share link copied',
        message: 'Anyone with the link will see a read-only copy of this dashboard.',
        confirmLabel: 'OK',
        onConfirm: () => setDialog(null),
        onCancel: () => setDialog(null),
      });
    } catch {
      setDialog({
        type: 'info',
        title: 'Share link',
        message: url,
        confirmLabel: 'OK',
        onConfirm: () => setDialog(null),
        onCancel: () => setDialog(null),
      });
    }
  }, []);

  const handleDuplicate = useCallback(async (db) => {
    if (!currentUser) return;
    posthog.capture('dashboard_duplicate_clicked', { dashboard_id: db.id, surface: 'dashboard_list' });
    try {
      const copy = await duplicateDashboard(db.id, currentUser);
      if (copy?.id) {
        await load();
        navigate(`/dashboards/${copy.id}`);
      }
    } catch (e) {
      setError(`Duplicate failed: ${e.message}`);
    }
  }, [currentUser, load, navigate]);

  const admin = isAdmin(currentUser);

  if (loading) return <div style={s.layout}><div style={s.empty}>Loading...</div></div>;

  return (
    <div style={s.layout}>
      {dialog && <Dialog {...dialog} />}

      <div style={s.header}>
        <span style={s.title}>All Dashboards</span>
        <button style={s.newBtn} onClick={handleNew}>+ New Dashboard</button>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 16 }}>{error}</div>}

      {/* Search */}
      <input
        type="text"
        placeholder="Search by name or owner..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={s.search}
      />

      {/* Owner filter chips */}
      <div style={s.chips}>
        <button style={ownerFilter === null ? s.chipActive : s.chip} onClick={() => setOwnerFilter(null)}>
          All ({allDashboards.length})
        </button>
        <button style={ownerFilter === 'mine' ? s.chipActive : s.chip} onClick={() => setOwnerFilter(ownerFilter === 'mine' ? null : 'mine')}>
          My Dashboards ({myDashboards.length})
        </button>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div style={s.empty}>
          {search || ownerFilter
            ? 'No dashboards match your filters.'
            : 'No dashboards yet. Create one to get started.'}
        </div>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: 60, textAlign: 'center' }}></th>
              <th style={s.th} onClick={() => toggleSort('name')}>Name{sortIcon('name')}</th>
              <th style={s.th} onClick={() => toggleSort('owner')}>Owner{sortIcon('owner')}</th>
              <th style={{ ...s.th, width: 70, textAlign: 'center' }} onClick={() => toggleSort('charts')}>Charts{sortIcon('charts')}</th>
              <th style={{ ...s.th, width: 120 }} onClick={() => toggleSort('modified')}>Last Modified{sortIcon('modified')}</th>
              <th style={{ ...s.th, width: 40, textAlign: 'center' }}></th>
              <th style={{ ...s.th, width: 70, textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(db => {
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
                    {isMine && (
                      <OverflowMenu items={[
                        { label: 'Share', onClick: () => handleShare(db) },
                        { label: 'Duplicate', onClick: () => handleDuplicate(db), disabled: !currentUser },
                        { label: 'Delete', onClick: (e) => handleDelete(e, db), danger: true },
                      ]} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

const s = {
  layout: { padding: 24, maxWidth: 1200, margin: '0 auto', minHeight: 'calc(100vh - 52px)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 20, fontWeight: 600, color: '#1a1a1a' },
  newBtn: {
    background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669',
    padding: '8px 20px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
  },
  search: {
    width: '100%', background: '#ffffff', border: '1px solid #e2e5e9', color: '#374151',
    padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12, boxSizing: 'border-box',
  },
  chips: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  chip: {
    background: '#f1f3f5', border: '1px solid #e2e5e9', color: '#374151',
    padding: '3px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
  },
  chipActive: {
    background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669',
    padding: '3px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
  },
  table: { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' },
  th: { textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '2px solid #e2e5e9', cursor: 'pointer', userSelect: 'none' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f1f3f5', fontSize: 13, color: '#374151' },
  nameCell: { fontWeight: 600, color: '#1a1a1a' },
  badge: {
    display: 'inline-block', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669',
    padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", marginLeft: 8,
  },
  badgeInactive: {
    display: 'inline-block', background: '#f8f9fa', border: '1px dashed #d1d5db', color: '#9ca3af',
    padding: '1px 6px', borderRadius: 10, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", marginLeft: 8,
  },
  starBtn: { background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', padding: '2px 4px', lineHeight: 1 },
  actionBtn: { background: '#ffffff', border: '1px solid #e2e5e9', color: '#6b7280', cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", padding: '4px 10px', borderRadius: 4 },
  empty: { color: '#6b7280', fontSize: 13, padding: 40, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
};
