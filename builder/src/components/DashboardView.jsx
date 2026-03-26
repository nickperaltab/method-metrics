import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import EChart from './EChart';
import { fetchDashboard, updateDashboard, loadCharts } from '../lib/supabase';

const styles = {
  layout: { padding: 24, maxWidth: 1400, margin: '0 auto', minHeight: 'calc(100vh - 52px)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  titleRow: { display: 'flex', alignItems: 'center', gap: 12 },
  title: { fontSize: 20, fontWeight: 600, color: '#edf0f3' },
  backBtn: {
    background: 'none', border: '1px solid #1a1e24', color: '#5a6370',
    padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
  },
  actions: { display: 'flex', gap: 8 },
  btn: {
    background: '#0a1f17', border: '1px solid #34d399', color: '#34d399',
    padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
  },
  btnSecondary: {
    background: '#111518', border: '1px solid #1a1e24', color: '#c8cdd3',
    padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
  },
  btnActive: {
    background: '#1a3d2e', border: '1px solid #34d399', color: '#34d399',
  },
  gridItem: {
    background: '#0c0f12', border: '1px solid #1a1e24', borderRadius: 8,
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
  },
  gridItemEditing: {
    border: '1px dashed #34d399',
  },
  chartHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 12px', borderBottom: '1px solid #1a1e24',
  },
  chartTitle: { fontSize: 12, fontWeight: 600, color: '#edf0f3' },
  removeBtn: {
    background: 'none', border: 'none', color: '#f87171', cursor: 'pointer',
    fontSize: 14, padding: '0 4px', lineHeight: 1,
  },
  chartBody: { flex: 1, minHeight: 0 },
  empty: { color: '#5a6370', fontSize: 13, padding: 60, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
  modal: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: '#0c0f12', border: '1px solid #1a1e24', borderRadius: 12,
    padding: 24, width: 500, maxHeight: '70vh', overflowY: 'auto',
  },
  modalTitle: { fontSize: 16, fontWeight: 600, color: '#edf0f3', marginBottom: 16 },
  chartOption: {
    padding: 12, border: '1px solid #1a1e24', borderRadius: 6,
    cursor: 'pointer', marginBottom: 8, transition: 'border-color 0.15s',
  },
  chartOptionName: { fontSize: 13, fontWeight: 600, color: '#edf0f3' },
  chartOptionMeta: { fontSize: 11, color: '#5a6370', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 },
};

const ROW_HEIGHT = 80;
const COLS = 12;

export default function DashboardView({ userEmail }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [dashboard, setDashboard] = useState(null);
  const [charts, setCharts] = useState([]);
  const [chartMap, setChartMap] = useState({});
  const [gridLayout, setGridLayout] = useState([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1352);

  // Measure container width for GridLayout
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [db, savedCharts] = await Promise.allSettled([
          fetchDashboard(id),
          userEmail ? loadCharts(userEmail) : Promise.resolve([]),
        ]);

        const dbVal = db.status === 'fulfilled' ? db.value : null;
        const chartsVal = savedCharts.status === 'fulfilled' ? savedCharts.value : [];

        if (!dbVal) {
          setError('Dashboard not found');
          setLoading(false);
          return;
        }

        setDashboard(dbVal);
        setCharts(chartsVal);
        setGridLayout(dbVal.layout || []);

        // Build chart lookup map
        const map = {};
        for (const c of chartsVal) {
          map[String(c.id)] = c;
        }
        setChartMap(map);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, userEmail]);

  const handleLayoutChange = useCallback((newLayout) => {
    if (!editing) return;
    setGridLayout(prev => {
      // Preserve chart IDs from previous layout items, merge with new positions
      return newLayout.map(item => ({
        i: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      }));
    });
  }, [editing]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateDashboard(id, { layout: gridLayout });
      setEditing(false);
    } catch (e) {
      setError(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [id, gridLayout]);

  const handleRemoveChart = useCallback((chartId) => {
    setGridLayout(prev => prev.filter(item => item.i !== chartId));
  }, []);

  const handleAddChart = useCallback((chart) => {
    const chartId = String(chart.id);
    // Don't add duplicates
    if (gridLayout.some(item => item.i === chartId)) {
      setShowAddModal(false);
      return;
    }
    // Find next available Y position
    const maxY = gridLayout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    setGridLayout(prev => [
      ...prev,
      { i: chartId, x: 0, y: maxY, w: 6, h: 4 },
    ]);
    setShowAddModal(false);
  }, [gridLayout]);

  if (loading) {
    return <div style={styles.layout}><div style={styles.empty}>Loading dashboard...</div></div>;
  }

  if (error && !dashboard) {
    return (
      <div style={styles.layout}>
        <div style={styles.empty}>{error}</div>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button style={styles.backBtn} onClick={() => navigate('/dashboards')}>Back to Dashboards</button>
        </div>
      </div>
    );
  }

  const availableCharts = charts.filter(c => !gridLayout.some(item => item.i === String(c.id)));

  return (
    <div style={styles.layout} ref={containerRef}>
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <button style={styles.backBtn} onClick={() => navigate('/dashboards')}>&#8592;</button>
          <span style={styles.title}>{dashboard?.name || 'Dashboard'}</span>
        </div>
        <div style={styles.actions}>
          {editing && (
            <>
              <button style={styles.btnSecondary} onClick={() => setShowAddModal(true)}>+ Add Chart</button>
              <button style={styles.btn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Layout'}
              </button>
            </>
          )}
          <button
            style={{ ...styles.btnSecondary, ...(editing ? styles.btnActive : {}) }}
            onClick={() => setEditing(!editing)}
          >
            {editing ? 'Done' : 'Edit Layout'}
          </button>
        </div>
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 16 }}>{error}</div>}

      {gridLayout.length === 0 ? (
        <div style={styles.empty}>
          {editing
            ? 'Click "+ Add Chart" to add charts from your library.'
            : 'This dashboard is empty. Click "Edit Layout" to start adding charts.'}
        </div>
      ) : (
        <GridLayout
          className="layout"
          layout={gridLayout}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          width={containerWidth}
          isDraggable={editing}
          isResizable={editing}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".drag-handle"
          compactType="vertical"
          margin={[16, 16]}
        >
          {gridLayout.map(item => {
            const chart = chartMap[item.i];
            return (
              <div key={item.i} style={{ ...styles.gridItem, ...(editing ? styles.gridItemEditing : {}) }}>
                <div style={styles.chartHeader} className="drag-handle">
                  <span style={styles.chartTitle}>{chart?.name || `Chart ${item.i}`}</span>
                  {editing && (
                    <button style={styles.removeBtn} onClick={() => handleRemoveChart(item.i)} title="Remove">
                      &#10005;
                    </button>
                  )}
                </div>
                <div style={styles.chartBody}>
                  {chart?.gw_spec?.echartsOption ? (
                    <EChart option={chart.gw_spec.echartsOption} />
                  ) : (
                    <div style={{ ...styles.empty, padding: 20, fontSize: 11 }}>
                      No chart data available
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </GridLayout>
      )}

      {showAddModal && (
        <div style={styles.modal} onClick={() => setShowAddModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>Add Chart</div>
            {availableCharts.length === 0 ? (
              <div style={{ ...styles.empty, padding: 20 }}>
                No charts available. Save charts from the Explorer first.
              </div>
            ) : (
              availableCharts.map(chart => (
                <div
                  key={chart.id}
                  style={styles.chartOption}
                  onClick={() => handleAddChart(chart)}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#34d399'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#1a1e24'}
                >
                  <div style={styles.chartOptionName}>{chart.name}</div>
                  <div style={styles.chartOptionMeta}>
                    {(chart.metric_ids || []).length} metric{(chart.metric_ids || []).length !== 1 ? 's' : ''}
                    {chart.created_at && ` · ${new Date(chart.created_at).toLocaleDateString()}`}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
