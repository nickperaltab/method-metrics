import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import EChart from './EChart';
import DataTableView from './DataTableView';
import KpiCard from './KpiCard';
import { fetchDashboard, updateDashboard, loadCharts, loadChartsByIds } from '../lib/supabase';
import { fetchAggregatedData, fetchKpiData, fetchYoYData, clearAllCaches } from '../lib/bigquery';
import { buildEChartsOption, applyLastNMonths } from '../lib/chartUtils';
import schemaCache from '../lib/schemaCache';
import ChatModal from './ChatModal';

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

export default function DashboardView({ userEmail, userAvatar, metrics = [], bqConnected }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [dashboard, setDashboard] = useState(null);
  const [charts, setCharts] = useState([]);
  const [chartMap, setChartMap] = useState({});
  const [gridLayout, setGridLayout] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1352);
  const [chartOptions, setChartOptions] = useState({});
  const [kpiDataMap, setKpiDataMap] = useState({});
  const [chartLoading, setChartLoading] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [editChartId, setEditChartId] = useState(null);

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
      setChartOptions({});
      setChartLoading({});
      clearAllCaches(); // Clear BQ data + aggregation caches to ensure fresh data
      try {
        const dbVal = await fetchDashboard(id);

        if (!dbVal) {
          setError('Dashboard not found');
          setLoading(false);
          return;
        }

        setDashboard(dbVal);
        setGridLayout(dbVal.layout || []);

        // Load charts by IDs from the dashboard layout (not filtered by user)
        const chartIds = (dbVal.layout || []).map(item => item.i);
        const chartsVal = await loadChartsByIds(chartIds);

        // Also load user's charts for the Add modal
        const userCharts = userEmail ? await loadCharts(userEmail) : [];
        setCharts(userCharts);

        // Build chart lookup map from dashboard charts
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
  }, [id, userEmail, refreshKey]);

  // Fetch live BQ data for each chart in the layout
  useEffect(() => {
    if (!bqConnected || !metrics.length || !gridLayout.length || !Object.keys(chartMap).length) return;

    async function buildChartOption(chartId) {
      const chart = chartMap[chartId];
      if (!chart?.gw_spec) return;
      const { metricIds, echartsType, dataConfig } = chart.gw_spec;
      if (!metricIds || !echartsType || !dataConfig) return;

      setChartLoading(prev => ({ ...prev, [chartId]: true }));
      try {
        const timeBucket = dataConfig.timeBucket;
        const channelFilter = dataConfig.channelFilter;
        const xField = dataConfig.xField;
        const rawDatasets = [];

        // Year-over-Year branch
        if (echartsType === 'yoy') {
          const yoyDatasets = [];
          for (let i = 0; i < metricIds.length; i++) {
            const metricId = metricIds[i];
            const metric = metrics.find(m => m.id === metricId);
            if (!metric || !metric.view_name) continue;
            const yField = dataConfig.yFields?.[i] || dataConfig.yFields?.[0] || 'COUNT';
            const viewSchema = schemaCache[metric.view_name] || [];
            const dateCol = viewSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || xField;
            try {
              const yoyResult = await fetchYoYData(metric.view_name, dateCol, yField, channelFilter);
              for (const year of yoyResult.years) {
                const lbl = metricIds.length === 1 ? year : `${metric.name} ${year}`;
                yoyDatasets.push({ label: lbl, data: yoyResult.seriesMap[year] });
              }
            } catch { /* skip */ }
          }
          if (yoyDatasets.length > 0) {
            const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const option = buildEChartsOption('yoy', monthLabels, yoyDatasets, dataConfig);
            setChartOptions(prev => ({ ...prev, [chartId]: option }));
          }
          return;
        }

        // KPI tile branch
        if (echartsType === 'kpi') {
          const kpis = [];
          for (let i = 0; i < metricIds.length; i++) {
            const metricId = metricIds[i];
            const metric = metrics.find(m => m.id === metricId);
            if (!metric) continue;
            const yField = dataConfig.yFields?.[i] || dataConfig.yFields?.[0] || 'COUNT';
            const label = dataConfig.labels?.[i] || metric.name;
            const isRate = !!(metric.formula && metric.depends_on && !metric.view_name);

            if (isRate) {
              const depKpis = {};
              for (const depId of metric.depends_on) {
                const depMetric = metrics.find(dm => dm.id === depId);
                if (depMetric && depMetric.view_name) {
                  const depSchema = schemaCache[depMetric.view_name] || [];
                  const dateCol = depSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || xField;
                  try {
                    depKpis[depId] = await fetchKpiData(depMetric.view_name, dateCol, 'COUNT', channelFilter);
                  } catch {
                    depKpis[depId] = { current: 0, prior: 0 };
                  }
                }
              }
              const evalFormula = (period) => {
                let f = metric.formula;
                for (const depId of metric.depends_on) {
                  const val = depKpis[depId]?.[period] || 0;
                  f = f.replace(new RegExp(`\\{${depId}\\}`, 'g'), String(val));
                }
                f = f.replace(/SAFE_DIVIDE\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, (_, a, b) => {
                  const numA = Number(a) || 0;
                  const numB = Number(b) || 0;
                  return String(numB === 0 ? 0 : numA / numB);
                });
                try { return Function('"use strict"; return (' + f + ')')(); } catch { return 0; }
              };
              const current = evalFormula('current');
              const prior = evalFormula('prior');
              const delta = current - prior;
              const deltaPercent = prior !== 0 ? Math.round((delta / prior) * 1000) / 10 : 0;
              kpis.push({ metricName: label, value: current, delta, deltaPercent, isRate: true });
            } else if (metric.view_name) {
              const viewSchema = schemaCache[metric.view_name] || [];
              const dateCol = viewSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || xField;
              try {
                const kpi = await fetchKpiData(metric.view_name, dateCol, yField, channelFilter);
                kpis.push({ metricName: label, value: kpi.current, delta: kpi.delta, deltaPercent: kpi.deltaPercent, isRate: false });
              } catch {
                kpis.push({ metricName: label, value: 0, delta: 0, deltaPercent: 0, isRate: false });
              }
            }
          }
          setKpiDataMap(prev => ({ ...prev, [chartId]: kpis }));
          return;
        }

        for (let i = 0; i < metricIds.length; i++) {
          const metricId = metricIds[i];
          const metric = metrics.find(m => m.id === metricId);
          if (!metric) continue;

          const yField = dataConfig.yFields?.[i] || dataConfig.yFields?.[0] || 'COUNT';
          const label = dataConfig.labels?.[i] || metric.name;

          if (metric.formula && metric.depends_on && !metric.view_name) {
            // Derived metric — aggregate each dependency, then apply formula
            const depAggregated = {};
            for (const depId of metric.depends_on) {
              const depMetric = metrics.find(dm => dm.id === depId);
              if (depMetric && depMetric.view_name) {
                const depSchema = schemaCache[depMetric.view_name] || [];
                const dateCol = depSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || xField;
                try {
                  const depAgg = await fetchAggregatedData(
                    depMetric.view_name, dateCol, 'COUNT', timeBucket, channelFilter, dataConfig.lastNMonths
                  );
                  const counts = {};
                  depAgg.labels.forEach((l, idx) => { counts[l] = depAgg.data[idx]; });
                  depAggregated[depId] = counts;
                } catch {
                  depAggregated[depId] = {};
                }
              }
            }
            const allDepLabels = new Set();
            for (const counts of Object.values(depAggregated)) {
              Object.keys(counts).forEach(k => allDepLabels.add(k));
            }
            const sortedDepLabels = [...allDepLabels].sort();
            const computedLabels = [];
            const computedData = [];
            for (const lbl of sortedDepLabels) {
              let formula = metric.formula;
              for (const depId of metric.depends_on) {
                const val = depAggregated[depId]?.[lbl] || 0;
                formula = formula.replace(new RegExp(`\\{${depId}\\}`, 'g'), String(val));
              }
              formula = formula.replace(/SAFE_DIVIDE\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, (_, a, b) => {
                const numA = Number(a) || 0;
                const numB = Number(b) || 0;
                return String(numB === 0 ? 0 : numA / numB);
              });
              let value;
              try { value = Function('"use strict"; return (' + formula + ')')(); } catch { value = 0; }
              if (!isFinite(value)) value = 0;
              computedLabels.push(lbl);
              computedData.push(Math.round(value * 100) / 100);
            }
            rawDatasets.push({ label, labels: computedLabels, data: computedData });
          } else if (metric.view_name) {
            // Primitive metric — fetch aggregated data from BQ
            const viewSchema = schemaCache[metric.view_name] || [];
            const dateCol = viewSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || xField;
            try {
              const agg = await fetchAggregatedData(
                metric.view_name, dateCol, yField, timeBucket, channelFilter, dataConfig.lastNMonths
              );
              rawDatasets.push({ label, ...agg });
            } catch {
              // skip failed metrics
            }
          }
        }

        if (rawDatasets.length === 0) return;

        // Merge all labels (union) and align datasets
        const allLabelsSet = new Set();
        for (const ds of rawDatasets) {
          ds.labels.forEach(l => allLabelsSet.add(l));
        }
        const allLabels = [...allLabelsSet].sort();

        const alignedDatasets = rawDatasets.map(ds => {
          const labelMap = {};
          ds.labels.forEach((l, idx) => { labelMap[l] = ds.data[idx]; });
          return {
            label: ds.label,
            data: allLabels.map(l => labelMap[l] || 0),
          };
        });

        // Apply lastNMonths for derived metrics
        const hasDerived = metricIds.some(mid => {
          const m = metrics.find(mm => mm.id === mid);
          return m && m.formula && m.depends_on && !m.view_name;
        });
        let finalLabels = allLabels;
        let finalDatasets = alignedDatasets;
        if (hasDerived && dataConfig.lastNMonths) {
          ({ labels: finalLabels, datasets: finalDatasets } = applyLastNMonths(
            allLabels, alignedDatasets, dataConfig.lastNMonths, timeBucket
          ));
        }

        if (echartsType === 'table') {
          setChartOptions(prev => ({ ...prev, [chartId]: { _tableData: true, labels: finalLabels, datasets: finalDatasets } }));
        } else {
          const option = buildEChartsOption(echartsType, finalLabels, finalDatasets, dataConfig);
          setChartOptions(prev => ({ ...prev, [chartId]: option }));
        }
      } catch {
        // leave chartOptions[chartId] unset
      } finally {
        setChartLoading(prev => ({ ...prev, [chartId]: false }));
      }
    }

    for (const item of gridLayout) {
      buildChartOption(item.i);
    }
  }, [bqConnected, metrics, gridLayout, chartMap]);

  const handleLayoutChange = useCallback((newLayout) => {
    setGridLayout(newLayout.map(item => ({
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    })));
  }, []);

  const handleRemoveChart = useCallback((chartId) => {
    setGridLayout(prev => {
      const updated = prev.filter(item => item.i !== chartId);
      // Auto-save layout after removal
      updateDashboard(id, { layout: updated }).catch(() => {});
      return updated;
    });
    setRefreshKey(prev => prev + 1);
  }, [id]);

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

  const handleChatChartSaved = useCallback((chartId) => {
    const maxY = gridLayout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    // Only add to layout if it's a new chart (not already in layout)
    if (!gridLayout.some(item => item.i === chartId)) {
      setGridLayout(prev => [
        ...prev,
        { i: chartId, x: 0, y: maxY, w: 6, h: 4 },
      ]);
    }
    setShowChatModal(false);
    setEditChartId(null);
    // Small delay to let Supabase propagate the write before re-fetching
    setTimeout(() => setRefreshKey(prev => prev + 1), 500);
  }, [gridLayout]);

  const handleModalClose = useCallback(() => {
    setShowChatModal(false);
    setEditChartId(null);
    setRefreshKey(prev => prev + 1);
  }, []);

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
          <button style={styles.btnSecondary} onClick={() => setShowAddModal(true)}>+ Add Chart</button>
        </div>
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 16 }}>{error}</div>}

      {gridLayout.length === 0 ? (
        <div style={styles.empty}>
          This dashboard is empty. Click "+ Add Chart" to add charts.
        </div>
      ) : (
        <GridLayout
          className="layout"
          layout={gridLayout}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          width={containerWidth}
          isDraggable={false}
          isResizable={false}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".drag-handle"
          compactType="vertical"
          margin={[16, 16]}
        >
          {gridLayout.map(item => {
            const chart = chartMap[item.i];
            return (
              <div key={item.i} style={styles.gridItem}>
                <div style={styles.chartHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {chart?.created_by_avatar && (
                      <img
                        src={chart.created_by_avatar}
                        alt=""
                        style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0 }}
                      />
                    )}
                    <span style={styles.chartTitle}>{chart?.name || `Chart ${item.i}`}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      style={{ background: 'none', border: 'none', color: '#5a6370', cursor: 'pointer', fontSize: 13, padding: '0 4px', lineHeight: 1 }}
                      onClick={() => { setEditChartId(item.i); setShowChatModal(true); }}
                      title="Edit chart"
                    >
                      &#9998;
                    </button>
                    <button style={styles.removeBtn} onClick={() => handleRemoveChart(item.i)} title="Remove">
                      &#10005;
                    </button>
                  </div>
                </div>
                <div style={styles.chartBody}>
                  {chartLoading[item.i] ? (
                    <div style={{ ...styles.empty, padding: 20, fontSize: 11 }}>
                      Loading chart data...
                    </div>
                  ) : kpiDataMap[item.i] ? (
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: 16, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      {kpiDataMap[item.i].map((kpi, ki) => <KpiCard key={ki} {...kpi} />)}
                    </div>
                  ) : chartOptions[item.i]?._tableData ? (
                    <DataTableView labels={chartOptions[item.i].labels} datasets={chartOptions[item.i].datasets} />
                  ) : chartOptions[item.i] ? (
                    <EChart option={chartOptions[item.i]} />
                  ) : (
                    <div style={{ ...styles.empty, padding: 20, fontSize: 11 }}>
                      {bqConnected ? 'No chart data available' : 'Connect BigQuery to load charts'}
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
            <div style={{ marginBottom: 16 }}>
              <button
                style={{
                  ...styles.btn,
                  width: '100%',
                  padding: '10px 16px',
                  fontSize: 13,
                  textAlign: 'center',
                }}
                onClick={() => {
                  setShowAddModal(false);
                  setShowChatModal(true);
                }}
              >
                Create New Chart
              </button>
            </div>
            {availableCharts.length === 0 ? (
              <div style={{ ...styles.empty, padding: 20 }}>
                No saved charts available. Create a new chart or save charts from the Explorer first.
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

      {showChatModal && (
        <ChatModal
          onClose={handleModalClose}
          onChartSaved={handleChatChartSaved}
          metrics={metrics}
          bqConnected={bqConnected}
          userEmail={userEmail}
          userAvatar={userAvatar}
          editChartId={editChartId}
        />
      )}
    </div>
  );
}
