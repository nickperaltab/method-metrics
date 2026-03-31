import React, { useState, useEffect, useCallback } from 'react';
import { fetchMyCharts, fetchApprovedCharts, fetchDashboards, deleteChart, setApproved, computeChartUsageCounts } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';
import { isAdmin, canDelete } from '../lib/permissions';

const TYPE_LABELS = { line: 'Line', bar: 'Bar', stacked_bar: 'Stacked Bar', pie: 'Pie', kpi: 'KPI', yoy: 'Year/Year', table: 'Table', area: 'Area', combo: 'Combo', funnel: 'Funnel', heatmap: 'Heatmap', horizontal_bar: 'H. Bar' };

export default function Charts() {
  const { currentUser } = useUser();
  const [myCharts, setMyCharts] = useState([]);
  const [approvedCharts, setApprovedCharts] = useState([]);
  const [usageCounts, setUsageCounts] = useState({});
  const [tab, setTab] = useState('mine');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);

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

  const charts = tab === 'mine' ? myCharts : approvedCharts;

  const filtered = charts.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.description?.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  async function handleDelete(chart) {
    const count = usageCounts[String(chart.id)] || 0;
    const msg = count > 0
      ? `Delete "${chart.name}"? It's on ${count} dashboard(s) and will be removed from them.`
      : `Delete "${chart.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await deleteChart(chart.id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleToggleApproval(chart) {
    try {
      await setApproved('saved_charts', chart.id, !chart.is_approved);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleRename(chart) {
    const name = window.prompt('New name:', chart.name);
    if (!name || name === chart.name) return;
    try {
      const { SUPABASE_URL, headers } = await import('../lib/supabase');
      await fetch(`${SUPABASE_URL}/rest/v1/saved_charts?id=eq.${chart.id}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ name }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div style={s.layout}><div style={s.empty}>Loading...</div></div>;

  return (
    <div style={s.layout}>
      <h1 style={s.title}>Charts</h1>

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12 }}>{error}</div>}

      <div style={s.controls}>
        <div style={s.tabs}>
          <button style={tab === 'mine' ? s.tabActive : s.tab} onClick={() => setTab('mine')}>
            My Charts ({myCharts.length})
          </button>
          <button style={tab === 'approved' ? s.tabActive : s.tab} onClick={() => setTab('approved')}>
            Method Approved ({approvedCharts.length})
          </button>
        </div>
        <input
          type="text"
          placeholder="Search charts..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={s.search}
        />
      </div>

      {sorted.length === 0 ? (
        <div style={s.empty}>
          {search ? 'No charts match your search.' :
           tab === 'mine' ? 'No charts yet. Use the Chart Builder to create your first chart.' :
           'No Method Approved charts yet.'}
        </div>
      ) : (
        <div style={s.list}>
          {sorted.map(chart => {
            const isMine = canDelete(currentUser, chart);
            const admin = isAdmin(currentUser);
            const usage = usageCounts[String(chart.id)] || 0;
            const chartType = TYPE_LABELS[chart.gw_spec?.echartsType] || chart.gw_spec?.echartsType || 'chart';

            return (
              <div key={chart.id} style={s.row}>
                <div style={s.chartInfo}>
                  <div style={s.chartNameRow}>
                    {chart.is_approved && <span style={s.badge}>Method Approved</span>}
                    <span style={s.chartName}>{chart.name || 'Untitled'}</span>
                  </div>
                  <div style={s.chartMeta}>
                    <span style={s.typeBadge}>{chartType}</span>
                    {' \u00B7 '}
                    {(chart.metric_ids || []).length} metric{(chart.metric_ids || []).length !== 1 ? 's' : ''}
                    {' \u00B7 '}
                    {usage} dashboard{usage !== 1 ? 's' : ''}
                    {chart.created_at && ` \u00B7 ${new Date(chart.created_at).toLocaleDateString()}`}
                  </div>
                </div>
                <div style={s.actions}>
                  {isMine && <button style={s.actionBtn} onClick={() => handleRename(chart)}>rename</button>}
                  {isMine && admin && (
                    <button
                      style={{ ...s.actionBtn, color: chart.is_approved ? '#dc2626' : '#059669' }}
                      onClick={() => handleToggleApproval(chart)}
                    >
                      {chart.is_approved ? 'remove approval' : 'mark approved'}
                    </button>
                  )}
                  {isMine && <button style={{ ...s.actionBtn, color: '#dc2626' }} onClick={() => handleDelete(chart)}>delete</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s = {
  layout: { padding: 24, maxWidth: 900, margin: '0 auto' },
  title: { fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: '0 0 24px' },
  controls: { display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' },
  tabs: { display: 'flex', gap: 0 },
  tab: { background: '#f8f9fa', border: '1px solid #e2e5e9', color: '#6b7280', padding: '6px 16px', cursor: 'pointer', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" },
  tabActive: { background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669', padding: '6px 16px', cursor: 'pointer', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" },
  search: { background: '#ffffff', border: '1px solid #e2e5e9', color: '#374151', padding: '6px 12px', borderRadius: 4, fontSize: 12, flex: 1, maxWidth: 300 },
  list: { display: 'flex', flexDirection: 'column', gap: 4 },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#f8f9fa', border: '1px solid #e2e5e9', borderRadius: 6 },
  chartInfo: { flex: 1 },
  chartNameRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 },
  chartName: { fontSize: 14, fontWeight: 600, color: '#1a1a1a' },
  chartMeta: { fontSize: 11, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 },
  typeBadge: { background: '#f1f3f5', border: '1px solid #e2e5e9', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" },
  badge: {
    display: 'inline-block', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669',
    padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
  },
  actions: { display: 'flex', gap: 8 },
  actionBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", padding: '2px 6px' },
  empty: { color: '#6b7280', fontSize: 13, padding: 40, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
};
