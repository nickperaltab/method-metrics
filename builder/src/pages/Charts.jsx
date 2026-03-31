import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchMyCharts, fetchApprovedCharts, fetchDashboards, deleteChart, setApproved, computeChartUsageCounts, SUPABASE_URL, headers } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';
import { useMetrics } from '../hooks/useMetrics';
import { isAdmin, canDelete } from '../lib/permissions';
import Dialog from '../components/Dialog';

const TYPE_LABELS = { line: 'Line', bar: 'Bar', stacked_bar: 'Stacked Bar', pie: 'Pie', kpi: 'KPI', yoy: 'Year/Year', table: 'Table', area: 'Area', combo: 'Combo', funnel: 'Funnel', heatmap: 'Heatmap', horizontal_bar: 'H. Bar' };

export default function Charts() {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const { metrics } = useMetrics();
  const [myCharts, setMyCharts] = useState([]);
  const [approvedCharts, setApprovedCharts] = useState([]);
  const [usageCounts, setUsageCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [ownerFilter, setOwnerFilter] = useState(null); // null = all, 'mine', 'approved'
  const [metricFilter, setMetricFilter] = useState(new Set());
  const [sortCol, setSortCol] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mine, approved, dashboards] = await Promise.all([
        currentUser ? fetchMyCharts(currentUser.id) : Promise.resolve([]),
        fetchApprovedCharts(),
        fetchDashboards(),
      ]);
      setMyCharts(mine);
      setApprovedCharts(approved);
      setUsageCounts(computeChartUsageCounts(dashboards));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  // Merge and deduplicate
  const allCharts = [...myCharts];
  for (const c of approvedCharts) {
    if (!allCharts.some(x => x.id === c.id)) allCharts.push(c);
  }

  // Filter
  const filtered = allCharts.filter(c => {
    if (ownerFilter === 'mine' && !canDelete(currentUser, c)) return false;
    if (ownerFilter === 'approved' && !c.is_approved) return false;
    if (metricFilter.size > 0 && !(c.metric_ids || []).some(mid => metricFilter.has(mid))) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const chartTypeLabel = (TYPE_LABELS[c.gw_spec?.echartsType] || '').toLowerCase();
    return c.name?.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      chartTypeLabel.includes(q) ||
      (c.metric_ids || []).some(mid => {
        const m = metrics.find(x => x.id === mid);
        return m?.name?.toLowerCase().includes(q);
      });
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let av, bv;
    switch (sortCol) {
      case 'name': av = a.name || ''; bv = b.name || ''; break;
      case 'type': av = TYPE_LABELS[a.gw_spec?.echartsType] || ''; bv = TYPE_LABELS[b.gw_spec?.echartsType] || ''; break;
      case 'metrics': av = (a.metric_ids || []).length; bv = (b.metric_ids || []).length; break;
      case 'dashboards': av = usageCounts[String(a.id)] || 0; bv = usageCounts[String(b.id)] || 0; break;
      case 'created': av = a.created_at || ''; bv = b.created_at || ''; break;
      default: av = a.name || ''; bv = b.name || '';
    }
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // Metric chips
  const metricIdsInCharts = [...new Set(allCharts.flatMap(c => c.metric_ids || []))];
  const metricChipList = metricIdsInCharts
    .map(mid => metrics.find(m => m.id === mid))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  function toggleMetricChip(mid) {
    setMetricFilter(prev => {
      const next = new Set(prev);
      if (next.has(mid)) next.delete(mid); else next.add(mid);
      return next;
    });
  }

  function handleDelete(chart) {
    const count = usageCounts[String(chart.id)] || 0;
    const message = count > 0
      ? `This chart is on ${count} dashboard${count !== 1 ? 's' : ''} and will be removed from them.`
      : 'This cannot be undone.';
    setDialog({
      type: 'confirm', title: `Delete "${chart.name}"?`, message, danger: true, confirmLabel: 'Delete',
      onConfirm: async () => { setDialog(null); try { await deleteChart(chart.id); await load(); } catch (e) { setError(e.message); } },
      onCancel: () => setDialog(null),
    });
  }

  async function handleToggleApproval(chart) {
    try { await setApproved('saved_charts', chart.id, !chart.is_approved); await load(); }
    catch (e) { setError(e.message); }
  }

  function handleRename(chart) {
    setDialog({
      type: 'prompt', title: 'Rename chart', label: 'Name', defaultValue: chart.name || '',
      onConfirm: async (name) => {
        setDialog(null);
        if (name === chart.name) return;
        try {
          await fetch(`${SUPABASE_URL}/rest/v1/saved_charts?id=eq.${chart.id}`, {
            method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ name }),
          });
          await load();
        } catch (e) { setError(e.message); }
      },
      onCancel: () => setDialog(null),
    });
  }

  function handleEditDescription(chart) {
    setDialog({
      type: 'prompt', title: 'Edit description', label: 'Description', defaultValue: chart.description || '',
      onConfirm: async (description) => {
        setDialog(null);
        try {
          await fetch(`${SUPABASE_URL}/rest/v1/saved_charts?id=eq.${chart.id}`, {
            method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ description }),
          });
          await load();
        } catch (e) { setError(e.message); }
      },
      onCancel: () => setDialog(null),
    });
  }

  const sortIcon = (col) => sortCol === col ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';
  const admin = isAdmin(currentUser);

  if (loading) return <div style={s.layout}><div style={s.empty}>Loading...</div></div>;

  return (
    <div style={s.layout}>
      {dialog && <Dialog {...dialog} />}

      <div style={s.header}>
        <span style={s.title}>All Charts</span>
        <button style={s.newBtn} onClick={() => navigate('/chat')}>+ New Chart</button>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12 }}>{error}</div>}

      {/* Search */}
      <input
        type="text"
        placeholder="Search by name, description, metric, or chart type..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={s.search}
      />

      {/* Owner filter chips */}
      <div style={s.chips}>
        <button style={ownerFilter === null ? s.chipActive : s.chip} onClick={() => setOwnerFilter(null)}>
          All ({allCharts.length})
        </button>
        <button style={ownerFilter === 'mine' ? s.chipActive : s.chip} onClick={() => setOwnerFilter(ownerFilter === 'mine' ? null : 'mine')}>
          My Charts ({myCharts.length})
        </button>
        <button style={ownerFilter === 'approved' ? s.chipActive : s.chip} onClick={() => setOwnerFilter(ownerFilter === 'approved' ? null : 'approved')}>
          Method Approved ({approvedCharts.length})
        </button>
      </div>

      {/* Metric filter chips */}
      {metricChipList.length > 0 && (
        <div style={s.chips}>
          {metricChipList.map(m => (
            <button key={m.id} style={metricFilter.has(m.id) ? s.chipActive : s.chip} onClick={() => toggleMetricChip(m.id)}>
              {m.name}
            </button>
          ))}
          {metricFilter.size > 0 && (
            <button style={{ ...s.chip, borderStyle: 'dashed' }} onClick={() => setMetricFilter(new Set())}>clear</button>
          )}
        </div>
      )}

      {/* Table */}
      {sorted.length === 0 ? (
        <div style={s.empty}>
          {search || ownerFilter || metricFilter.size > 0
            ? 'No charts match your filters.'
            : 'No charts yet. Use the Chart Builder to create your first chart.'}
        </div>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: 55, textAlign: 'center' }}></th>
              <th style={s.th} onClick={() => toggleSort('name')}>Name{sortIcon('name')}</th>
              <th style={{ ...s.th, width: 90 }} onClick={() => toggleSort('type')}>Type{sortIcon('type')}</th>
              <th style={{ ...s.th, width: 70, textAlign: 'center' }} onClick={() => toggleSort('metrics')}>Metrics{sortIcon('metrics')}</th>
              <th style={{ ...s.th, width: 85, textAlign: 'center' }} onClick={() => toggleSort('dashboards')}>Dashboards{sortIcon('dashboards')}</th>
              <th style={{ ...s.th, width: 100 }} onClick={() => toggleSort('created')}>Created{sortIcon('created')}</th>
              <th style={{ ...s.th, width: 70, textAlign: 'center' }}></th>
              <th style={{ ...s.th, width: 110, textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(chart => {
              const isMine = canDelete(currentUser, chart);
              const usage = usageCounts[String(chart.id)] || 0;
              const chartType = TYPE_LABELS[chart.gw_spec?.echartsType] || chart.gw_spec?.echartsType || '\u2014';

              return (
                <tr key={chart.id}>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    {isMine && (
                      <button style={{ ...s.actionBtn, color: '#059669', borderColor: '#a7f3d0' }} onClick={() => navigate(`/chat?editChart=${chart.id}`)}>edit</button>
                    )}
                  </td>
                  <td style={s.td}>
                    <span
                      style={{ ...s.nameCell, cursor: isMine ? 'pointer' : 'default', textDecoration: isMine ? 'underline dotted #d1d5db' : 'none' }}
                      onClick={() => isMine && handleRename(chart)}
                      title={isMine ? 'Click to rename' : ''}
                    >
                      {chart.name || 'Untitled'}
                    </span>
                    {chart.is_approved && <span style={s.badge}>Method Approved</span>}
                    <div
                      style={{ ...s.descRow, cursor: isMine ? 'pointer' : 'default' }}
                      onClick={() => isMine && handleEditDescription(chart)}
                      title={isMine ? 'Click to edit description' : ''}
                    >
                      {chart.description || (isMine ? 'Add description...' : '')}
                    </div>
                  </td>
                  <td style={{ ...s.td, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6b7280' }}>{chartType}</td>
                  <td style={{ ...s.td, textAlign: 'center' }}>{(chart.metric_ids || []).length}</td>
                  <td style={{ ...s.td, textAlign: 'center' }}>{usage}</td>
                  <td style={s.td}>{chart.created_at ? new Date(chart.created_at).toLocaleDateString() : '\u2014'}</td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    {isMine && (
                      <button style={{ ...s.actionBtn, color: '#dc2626', borderColor: '#fecaca' }} onClick={() => handleDelete(chart)}>delete</button>
                    )}
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    {isMine && admin && (
                      <button
                        style={{ ...s.actionBtn, color: chart.is_approved ? '#dc2626' : '#059669', borderColor: chart.is_approved ? '#fecaca' : '#a7f3d0' }}
                        onClick={() => handleToggleApproval(chart)}
                      >
                        {chart.is_approved ? 'remove approval' : 'mark approved'}
                      </button>
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
  descRow: { fontSize: 11, color: '#9ca3af', marginTop: 2, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  actionBtn: { background: '#ffffff', border: '1px solid #e2e5e9', color: '#6b7280', cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", padding: '4px 10px', borderRadius: 4 },
  empty: { color: '#6b7280', fontSize: 13, padding: 40, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
};
