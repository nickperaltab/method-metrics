import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import '../styles/grid-overrides.css';
import EChart from './EChart';
import DataTableView from './DataTableView';
import KpiCard from './KpiCard';
import OverflowMenu from './OverflowMenu';
import posthog from '../lib/posthog';
import { fetchDashboard, updateDashboard, loadChartsByIds, deleteDashboard, setApproved, fetchStars, starDashboard, unstarDashboard, fetchMyCharts, fetchDashboards, computeChartUsageCounts, recordView, duplicateDashboard, dashboardShareUrl } from '../lib/supabase';
import { fetchAggregatedData, fetchChartData, fetchGroupedData, fetchKpiData, fetchYoYData, clearAllCaches, queryBq, fetchDrillData } from '../lib/bigquery';
import { fetchChartDatasets, fetchPivotData } from '../lib/chartDataBuilder';
import FeedbackButtons from './FeedbackButtons';
import { buildEChartsOption, applyLastNMonths } from '../lib/chartUtils';
import { evaluateFormula } from '../lib/sanitize';
import schemaCache from '../lib/schemaCache';
import ChatModal from './ChatModal';
import Dialog from './Dialog';
import { useUser } from '../contexts/UserContext';
import { isAdmin, canDelete } from '../lib/permissions';
import { getMonthIndices, formatMonthLabels, sliceSeries, computeGrowthSeries } from '../lib/yoyUtils';

const styles = {
  layout: { padding: 24, maxWidth: 1400, margin: '0 auto', minHeight: 'calc(100vh - 52px)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  titleRow: { display: 'flex', alignItems: 'center', gap: 12 },
  title: { fontSize: 20, fontWeight: 600, color: '#1a1a1a' },
  backBtn: {
    background: 'none', border: '1px solid #e2e5e9', color: '#6b7280',
    padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
  },
  actions: { display: 'flex', gap: 8 },
  btn: {
    background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669',
    padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
  },
  btnSecondary: {
    background: '#f8f9fa', border: '1px solid #e2e5e9', color: '#374151',
    padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
  },
  btnActive: {
    background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669',
  },
  btnDelete: {
    background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
    padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
  },
  btnDanger: {
    background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
    padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
  },
  starBtn: {
    background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
    padding: '0 4px', lineHeight: 1,
  },
  approvedBadge: {
    display: 'inline-block', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669',
    padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
  },
  gridItem: {
    background: '#ffffff', border: '1px solid #e2e5e9', borderRadius: 8,
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
  },
  ownerBanner: {
    fontSize: 13, color: '#6b7280', marginBottom: 16,
    padding: '8px 12px', background: '#f8f9fa', border: '1px solid #e2e5e9',
    borderRadius: 6, display: 'inline-block',
  },
  chartHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 12px', borderBottom: '1px solid #e2e5e9',
  },
  chartTitle: { fontSize: 12, fontWeight: 600, color: '#1a1a1a' },
  removeBtn: {
    background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer',
    fontSize: 14, padding: '0 4px', lineHeight: 1,
  },
  chartBody: { flex: 1, minHeight: 0 },
  empty: { color: '#6b7280', fontSize: 13, padding: 60, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
  emptyCanvas: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    minHeight: 'calc(100vh - 180px)', textAlign: 'center', padding: '0 40px',
  },
  emptyCanvasText: {
    fontSize: 15, color: '#6b7280', maxWidth: 480, lineHeight: 1.7, marginBottom: 32,
  },
  emptyCanvasActions: {
    display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
  },
  emptyBtn: {
    background: '#ffffff', border: '1px solid #e2e5e9', color: '#374151',
    padding: '10px 24px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
  },
  emptyBtnPrimary: {
    background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669',
    padding: '10px 24px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
  },
  modal: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: '#ffffff', border: '1px solid #e2e5e9', borderRadius: 12,
    width: 860, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
  },
  modalHeader: {
    padding: '20px 24px 0', flexShrink: 0,
  },
  modalTitle: { fontSize: 16, fontWeight: 600, color: '#1a1a1a', marginBottom: 12 },
  modalSearch: {
    width: '100%', background: '#f8f9fa', border: '1px solid #e2e5e9', color: '#1a1a1a',
    padding: '9px 12px', borderRadius: 6, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
    outline: 'none', boxSizing: 'border-box', marginBottom: 12,
  },
  modalCreateBtn: {
    width: '100%', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669',
    padding: '9px 16px', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, marginBottom: 16,
  },
  modalTabs: { display: 'flex', gap: 0, borderBottom: '1px solid #e2e5e9', marginBottom: 0 },
  modalTab: {
    background: 'none', border: 'none', borderBottom: '2px solid transparent', color: '#6b7280',
    padding: '8px 16px', cursor: 'pointer', fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
    marginBottom: -1,
  },
  modalTabActive: {
    background: 'none', border: 'none', borderBottom: '2px solid #059669', color: '#059669',
    padding: '8px 16px', cursor: 'pointer', fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
    marginBottom: -1, fontWeight: 600,
  },
  modalList: { overflowY: 'auto', flex: 1, padding: '8px 0' },
  chartRow: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px',
    cursor: 'pointer', borderBottom: '1px solid #f1f3f5',
  },
  chartRowInfo: { flex: 1, minWidth: 0 },
  chartRowName: { fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 2 },
  chartRowMeta: { fontSize: 11, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  chartRowDesc: { fontSize: 11, color: '#9ca3af', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chartRowCount: { fontSize: 13, fontWeight: 600, color: '#374151', minWidth: 60, textAlign: 'right', flexShrink: 0, fontFamily: "'JetBrains Mono', monospace" },
  chartRowDate: { fontSize: 11, color: '#6b7280', minWidth: 80, textAlign: 'right', flexShrink: 0 },
  approvedBadgeSmall: {
    display: 'inline-block', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669',
    padding: '1px 5px', borderRadius: 8, fontSize: 9, fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace", marginLeft: 6, verticalAlign: 'middle',
  },
  modalHint: {
    fontSize: 11, color: '#6b7280', marginBottom: 12, lineHeight: 1.5,
  },
  metricChips: { display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 24px', borderBottom: '1px solid #f1f3f5' },
  metricChip: {
    background: '#f1f3f5', border: '1px solid #e2e5e9', color: '#374151',
    padding: '3px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
  },
  metricChipActive: {
    background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669',
    padding: '3px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
  },
};

const ROW_HEIGHT = 80;
const COLS = 12;
const TYPE_LABELS = { line: 'line chart', bar: 'bar chart', stacked_bar: 'stacked bar chart', pie: 'pie chart', kpi: 'kpi', yoy: 'year over year', table: 'table', area: 'area chart', combo: 'combo chart', funnel: 'funnel', heatmap: 'heatmap', horizontal_bar: 'horizontal bar chart', drill_table: 'detail table' };

export default function DashboardView({ userEmail, userAvatar, metrics = [], bqConnected }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isSharedView = searchParams.get('view') === 'shared';
  const { currentUser } = useUser();
  const containerRef = useRef(null);
  const [dashboard, setDashboard] = useState(null);
  const [myCharts, setMyCharts] = useState([]);
  const [usageCounts, setUsageCounts] = useState({});
  const [chartMap, setChartMap] = useState({});
  const [gridLayout, setGridLayout] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalMetricFilter, setModalMetricFilter] = useState(new Set()); // set of metric ids
  const [containerWidth, setContainerWidth] = useState(1352);
  const [chartOptions, setChartOptions] = useState({});
  const [kpiDataMap, setKpiDataMap] = useState({});
  const [pivotDataMap, setPivotDataMap] = useState({});
  const [drillDataMap, setDrillDataMap] = useState({});
  const [chartLoading, setChartLoading] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [editChartId, setEditChartId] = useState(null);
  const [isStarred, setIsStarred] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [titleHovered, setTitleHovered] = useState(false);

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
      setKpiDataMap({});
      setPivotDataMap({});
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

        // Record this view for Recently Viewed on Home
        if (currentUser) recordView(dbVal.id, currentUser.id);

        // Load charts by IDs from the dashboard layout (not filtered by user)
        const chartIds = (dbVal.layout || []).map(item => item.i);
        const chartsVal = await loadChartsByIds(chartIds);

        // Load charts for the Add modal — mine only, per Ticket polish
        const [mine, allDashboards] = await Promise.all([
          currentUser ? fetchMyCharts(currentUser.id) : Promise.resolve([]),
          fetchDashboards(),
        ]);
        setMyCharts(mine);
        setUsageCounts(computeChartUsageCounts(allDashboards));

        // Load star state for this dashboard
        if (currentUser) {
          const stars = await fetchStars(currentUser.id).catch(() => []);
          setIsStarred(stars.includes(dbVal.id));
        }

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

  // Ensure schemaCache has the column metadata needed for charts on this dashboard
  useEffect(() => {
    if (!bqConnected || !metrics.length || !Object.keys(chartMap).length) return;

    const neededMetricIds = new Set();
    for (const item of gridLayout) {
      const chart = chartMap[item.i];
      const ids = chart?.gw_spec?.metricIds || chart?.metric_ids;
      if (Array.isArray(ids)) {
        ids.forEach(id => neededMetricIds.add(id));
      }
    }
    if (!neededMetricIds.size) return;

    const viewsToLoad = [];
    neededMetricIds.forEach(id => {
      const metric = metrics.find(m => m.id === id);
      if (metric && metric.view_name && ['primitive', 'derived'].includes(metric.metric_type) && metric.status === 'live') {
        if (!schemaCache[metric.view_name]) viewsToLoad.push(metric.view_name);
      }
    });
    if (!viewsToLoad.length) return;

    Promise.allSettled(
      [...new Set(viewsToLoad)].map(async (viewName) => {
        const result = await queryBq(
          `SELECT column_name AS name, data_type AS type FROM \`project-for-method-dw.revenue.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name='${viewName}'`
        );
        if (result.rows) {
          schemaCache[viewName] = result.rows.map(r => ({ name: r.name, type: r.type }));
        }
      })
    ).catch(() => {});
  }, [bqConnected, metrics, chartMap, gridLayout]);

  // Pre-warm chart_sql cache — fetch sequentially to avoid BQ rate limiting
  const [cacheWarmed, setCacheWarmed] = useState(false);
  useEffect(() => {
    if (!bqConnected || !metrics.length || !gridLayout.length || !Object.keys(chartMap).length) return;
    setCacheWarmed(false);
    async function preWarmCache() {
      const seenIds = new Set();
      for (const item of gridLayout) {
        const chart = chartMap[item.i];
        const ids = chart?.gw_spec?.metricIds || chart?.metric_ids;
        if (!Array.isArray(ids)) continue;
        for (const id of ids) {
          if (seenIds.has(id)) continue;
          seenIds.add(id);
          const metric = metrics.find(m => m.id === id);
          if (!metric) continue;
          if (metric.chart_sql) {
            try { await fetchChartData(metric, null, 'COUNT', 'month', null, null, null); } catch {}
          }
          if (metric.depends_on?.length) {
            for (const depId of metric.depends_on) {
              if (seenIds.has(depId)) continue;
              seenIds.add(depId);
              const dep = metrics.find(m => m.id === depId);
              if (dep?.chart_sql) {
                try { await fetchChartData(dep, null, 'COUNT', 'month', null, null, null); } catch {}
              }
            }
          }
        }
      }
      setCacheWarmed(true);
    }
    preWarmCache();
  }, [bqConnected, metrics, chartMap, gridLayout]);

  // Fetch live BQ data for each chart in the layout (waits for cache warm)
  useEffect(() => {
    if (!bqConnected || !metrics.length || !gridLayout.length || !Object.keys(chartMap).length || !cacheWarmed) return;

    async function buildChartOption(chartId) {
      const chart = chartMap[chartId];
      if (!chart?.gw_spec) return;
      const { metricIds, echartsType, dataConfig, colors, showLabels } = chart.gw_spec;
      if (!metricIds || !echartsType || !dataConfig) return;

      setChartLoading(prev => ({ ...prev, [chartId]: true }));
      try {
        const timeBucket = dataConfig.timeBucket;
        const channelFilter = dataConfig.channelFilter;
        const xField = dataConfig.xField;
        const rawDatasets = [];

        // Year-over-Year branch
        if (echartsType === 'yoy') {
          const monthIndices = getMonthIndices(dataConfig.yoyMonths);
          const monthLabels = formatMonthLabels(monthIndices);
          const yoyMode = dataConfig.yoyMode || 'value';
          const yoyDatasets = [];
          let valueFormat = null;
          for (let i = 0; i < metricIds.length; i++) {
            const metricId = metricIds[i];
            const metric = metrics.find(m => m.id === metricId);
            if (!metric || !metric.view_name) continue;
            const yField = dataConfig.yFields?.[i] || dataConfig.yFields?.[0] || 'COUNT';
            const viewSchema = schemaCache[metric.view_name] || [];
            const dateCol = viewSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || xField;
            try {
              const yoyResult = await fetchYoYData(metric.view_name, dateCol, yField, channelFilter, dataConfig.yearFilter);
              if (yoyMode === 'growth_pct') {
                const growth = computeGrowthSeries(yoyResult.seriesMap, yoyResult.years, monthIndices);
                if (growth) {
                  const lbl = metricIds.length === 1
                    ? `${growth.latest} vs ${growth.prior}`
                    : `${metric.name} ${growth.latest} vs ${growth.prior}`;
                  yoyDatasets.push({ label: lbl, data: growth.data });
                  valueFormat = 'percent';
                }
              } else {
                for (const year of yoyResult.years) {
                  const lbl = metricIds.length === 1 ? year : `${metric.name} ${year}`;
                  yoyDatasets.push({ label: lbl, data: sliceSeries(yoyResult.seriesMap[year], monthIndices) });
                }
              }
            } catch { /* skip */ }
          }
          if (yoyDatasets.length > 0) {
            const option = buildEChartsOption('yoy', monthLabels, yoyDatasets, dataConfig, { valueFormat, showLabels, colors });
            setChartOptions(prev => ({ ...prev, [chartId]: option }));
          }
          return;
        }

        // Drill table branch
        if (echartsType === 'drill_table') {
          const metric = metrics.find(m => m.id === metricIds[0]);
          if (metric?.view_name) {
            try {
              const drillResult = await fetchDrillData(metric.view_name, dataConfig.lastNMonths);
              setDrillDataMap(prev => ({ ...prev, [chartId]: { rows: drillResult.rows, columns: drillResult.columns } }));
            } catch { /* leave unset */ }
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
            const isDerived = !!(metric.formula && metric.depends_on && !metric.view_name);
            const isRate = false;
            const isPercent = isDerived && (metric.formula.includes('* 100') || metric.formula.includes('*100'));

            if (isDerived) {
              const depKpis = {};
              for (const depId of metric.depends_on) {
                const depMetric = metrics.find(dm => dm.id === depId);
                if (!depMetric) continue;
                if (depMetric.chart_sql) {
                  try {
                    const agg = await fetchChartData(depMetric, null, 'COUNT', 'month', channelFilter, null, null);

                    const now = new Date();
                    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    const prevMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0')}`;
                    const curIdx = agg.labels.indexOf(curMonth);
                    const prevIdx = agg.labels.indexOf(prevMonth);
                    const current = curIdx >= 0 ? agg.data[curIdx] : (agg.data.length > 0 ? agg.data[agg.data.length - 1] : 0);
                    const prior = prevIdx >= 0 ? agg.data[prevIdx] : 0;
                    depKpis[depId] = { current, prior };
                  } catch {
                    depKpis[depId] = { current: 0, prior: 0, error: true };
                  }
                } else if (depMetric.view_name) {
                  const depSchema = schemaCache[depMetric.view_name] || [];
                  const dateCol = depSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || xField;
                  try {
                    depKpis[depId] = await fetchKpiData(depMetric.view_name, dateCol, 'COUNT', channelFilter);
                  } catch {
                    depKpis[depId] = { current: 0, prior: 0, error: true };
                  }
                }
              }
              const evalFormula = (period) => {
                const depValues = {};
                for (const depId of metric.depends_on) {
                  depValues[depId] = depKpis[depId]?.[period] || 0;
                }
                return evaluateFormula(metric.formula, depValues);
              };
              const hasError = metric.depends_on.some(depId => depKpis[depId]?.error);
              const current = Math.round(evalFormula('current') * 100) / 100;
              const prior = Math.round(evalFormula('prior') * 100) / 100;
              const delta = Math.round((current - prior) * 100) / 100;
              const deltaPercent = prior !== 0 ? Math.round((delta / prior) * 1000) / 10 : 0;
              kpis.push({ metricName: label, value: current, delta, deltaPercent, isRate: false, isPercent, displayFormat: metric.display_format, hasError });
            } else if (metric.chart_sql) {
              try {
                const agg = await fetchChartData(metric, null, yField, 'month', channelFilter, null, null);

                const now = new Date();
                const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                const prevMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0')}`;
                const curIdx = agg.labels.indexOf(curMonth);
                const prevIdx = agg.labels.indexOf(prevMonth);
                const current = curIdx >= 0 ? agg.data[curIdx] : (agg.data.length > 0 ? agg.data[agg.data.length - 1] : 0);
                const prior = prevIdx >= 0 ? agg.data[prevIdx] : 0;
                const delta = Math.round((current - prior) * 100) / 100;
                const deltaPercent = prior !== 0 ? Math.round((delta / prior) * 1000) / 10 : 0;
                const noData = agg.labels.length === 0;
                kpis.push({ metricName: label, value: current, delta, deltaPercent, isRate: false, displayFormat: metric.display_format, hasError: noData });
              } catch (err) {

                kpis.push({ metricName: label, value: 0, delta: 0, deltaPercent: 0, isRate: false, hasError: true });
              }
            } else if (metric.view_name) {
              const viewSchema = schemaCache[metric.view_name] || [];
              const dateCol = viewSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || xField;
              try {
                const kpi = await fetchKpiData(metric.view_name, dateCol, yField, channelFilter);
                kpis.push({ metricName: label, value: kpi.current, delta: kpi.delta, deltaPercent: kpi.deltaPercent, isRate: false });
              } catch {
                kpis.push({ metricName: label, value: 0, delta: 0, deltaPercent: 0, isRate: false, hasError: true });
              }
            }
          }
          setKpiDataMap(prev => ({ ...prev, [chartId]: kpis }));
          return;
        }

        if (echartsType === 'table' && dataConfig.groupByDimension) {
          const pivotResult = await fetchPivotData({ metricIds, metrics, dataConfig });
          if (!pivotResult.empty) {
            setPivotDataMap(prev => ({ ...prev, [chartId]: { pivotData: pivotResult.pivotData, columns: pivotResult.columns } }));
            return;
          }
          // Pivot returned empty — fall through to regular table path
        }

        const chartData = await fetchChartDatasets({ metricIds, metrics, dataConfig });
        if (!chartData || chartData.empty) return;

        if (echartsType === 'table') {
          setChartOptions(prev => ({ ...prev, [chartId]: { _tableData: true, labels: chartData.labels, datasets: chartData.datasets } }));
        } else {
          const option = buildEChartsOption(echartsType, chartData.labels, chartData.datasets, dataConfig, { showLabels, colors });
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
  }, [bqConnected, metrics, gridLayout, chartMap, cacheWarmed]);

  const handleLayoutChange = useCallback((newLayout) => {
    setGridLayout(newLayout.map(item => ({
      i: item.i, x: item.x, y: item.y, w: item.w, h: item.h,
    })));
  }, []);

  const handleLayoutSave = useCallback((newLayout) => {
    const cleaned = newLayout.map(item => ({
      i: item.i, x: item.x, y: item.y, w: item.w, h: item.h,
    }));
    setGridLayout(cleaned);
    updateDashboard(id, { layout: cleaned }).catch(() => {});
  }, [id]);

  const handleRemoveChart = useCallback((chartId) => {
    setGridLayout(prev => {
      const updated = prev.filter(item => item.i !== chartId);
      // Auto-save layout after removal
      updateDashboard(id, { layout: updated }).catch(() => {});
      return updated;
    });
  }, [id]);

  const handleAddChart = useCallback((chart) => {
    const chartId = String(chart.id);
    // Don't add duplicates
    if (gridLayout.some(item => item.i === chartId)) {
      setShowAddModal(false);
      return;
    }
    // Add chart to the lookup map so it renders immediately
    setChartMap(prev => ({ ...prev, [chartId]: chart }));
    // Find next available Y position
    const maxY = gridLayout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    const newLayout = [...gridLayout, { i: chartId, x: 0, y: maxY, w: 6, h: 4 }];
    setGridLayout(newLayout);
    setShowAddModal(false);
    // Save layout — chartMap + gridLayout changes trigger the data build effect automatically
    updateDashboard(id, { layout: newLayout }).catch(() => {});
  }, [gridLayout, id]);

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

  const handleStar = useCallback(async () => {
    if (!currentUser || !dashboard) return;
    try {
      if (isStarred) {
        await unstarDashboard(dashboard.id, currentUser.id);
        setIsStarred(false);
      } else {
        await starDashboard(dashboard.id, currentUser.id);
        setIsStarred(true);
      }
      window.dispatchEvent(new Event('stars-changed'));
    } catch (e) {
      console.error('Star toggle failed:', e);
    }
  }, [currentUser, dashboard, isStarred]);

  const handleDelete = useCallback(() => {
    if (!dashboard) return;
    setDialog({
      type: 'confirm',
      title: `Delete "${dashboard.name}"?`,
      message: 'This cannot be undone.',
      danger: true,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setDialog(null);
        try {
          await deleteDashboard(dashboard.id);
          window.dispatchEvent(new Event('stars-changed'));
          navigate('/dashboards');
        } catch (e) {
          setError(`Delete failed: ${e.message}`);
        }
      },
      onCancel: () => setDialog(null),
    });
  }, [dashboard, navigate]);

  const handleShare = useCallback(async () => {
    if (!dashboard) return;
    posthog.capture('dashboard_share_clicked', { dashboard_id: dashboard.id, surface: 'dashboard_view' });
    const url = dashboardShareUrl(dashboard.id);
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
  }, [dashboard]);

  const handleDuplicate = useCallback(async () => {
    if (!dashboard || !currentUser) return;
    posthog.capture('dashboard_duplicate_clicked', { dashboard_id: dashboard.id, surface: 'dashboard_view', shared: isSharedView });
    try {
      const copy = await duplicateDashboard(dashboard.id, currentUser);
      if (copy?.id) navigate(`/dashboards/${copy.id}`);
    } catch (e) {
      setError(`Duplicate failed: ${e.message}`);
    }
  }, [dashboard, currentUser, navigate, isSharedView]);

  const handleToggleApproval = useCallback(async () => {
    if (!dashboard) return;
    try {
      await setApproved('dashboards', dashboard.id, !dashboard.is_approved);
      setDashboard(prev => ({ ...prev, is_approved: !prev.is_approved }));
    } catch (e) {
      setError(`Update failed: ${e.message}`);
    }
  }, [dashboard]);

  const handleRenameTitle = useCallback(() => {
    if (!dashboard) return;
    setDialog({
      type: 'prompt',
      title: 'Rename dashboard',
      label: 'Name',
      defaultValue: dashboard.name,
      onConfirm: async (name) => {
        setDialog(null);
        if (name === dashboard.name) return;
        try {
          await updateDashboard(id, { name });
          setDashboard(prev => ({ ...prev, name }));
          window.dispatchEvent(new Event('stars-changed'));
        } catch (e) {
          setError(`Rename failed: ${e.message}`);
        }
      },
      onCancel: () => setDialog(null),
    });
  }, [dashboard, id]);

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

  const isMine = canDelete(currentUser, dashboard);
  const admin = isAdmin(currentUser);

  return (
    <div style={styles.layout} ref={containerRef}>
      {dialog && <Dialog {...dialog} />}
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <button style={styles.backBtn} onClick={() => navigate('/dashboards')}>&#8592;</button>
          <span
            style={{
              ...styles.title,
              cursor: isMine ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            onClick={isMine ? handleRenameTitle : undefined}
            onMouseEnter={() => isMine && setTitleHovered(true)}
            onMouseLeave={() => setTitleHovered(false)}
          >
            {dashboard?.name || 'Dashboard'}
            {isMine && (
              <span style={{ fontSize: 13, color: titleHovered ? '#6b7280' : 'transparent', transition: 'color .15s' }}>&#9998;</span>
            )}
          </span>
          {!isSharedView && (
            <button
              style={{ ...styles.starBtn, color: isStarred ? '#f59e0b' : '#d1d5db' }}
              onClick={handleStar}
              title={isStarred ? 'Remove from favorites' : 'Add to favorites'}
            >
              {isStarred ? '\u2605' : '\u2606'}
            </button>
          )}
          {isSharedView && (
            <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8, fontFamily: "'DM Sans', sans-serif" }}>
              \u2014 shared view
            </span>
          )}
        </div>
        <div style={styles.actions}>
          {isSharedView ? (
            currentUser && (
              <button style={styles.btnSecondary} onClick={handleDuplicate}>
                Duplicate to my dashboards
              </button>
            )
          ) : (
            <>
              {isMine && (
                <button style={styles.btnSecondary} onClick={() => { posthog.capture('add_chart_clicked', { dashboard_id: dashboard?.id }); setShowAddModal(true); }}>+ Add Chart</button>
              )}
              {isMine && (
                <OverflowMenu items={[
                  { label: 'Share', onClick: handleShare },
                  { label: 'Duplicate', onClick: handleDuplicate, disabled: !currentUser },
                  { label: 'Delete', onClick: handleDelete, danger: true },
                ]} />
              )}
            </>
          )}
        </div>
      </div>

      {!isMine && dashboard?.created_by && (
        <div style={styles.ownerBanner}>
          This dashboard is owned by <strong>{dashboard.created_by.split('@')[0]}</strong>
        </div>
      )}

      {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 16 }}>{error}</div>}

      {gridLayout.length === 0 ? (
        <div style={styles.emptyCanvas}>
          <div style={styles.emptyCanvasText}>
            This is your blank canvas to add charts. Once you add charts, you can drag them around, increase or decrease the size and make it your own.
          </div>
          {isMine && (
            <div style={styles.emptyCanvasActions}>
              <button style={styles.emptyBtn} onClick={() => setShowAddModal(true)}>
                Add Existing Charts
              </button>
              <button style={styles.emptyBtnPrimary} onClick={() => setShowChatModal(true)}>
                Create a New Chart from Scratch
              </button>
            </div>
          )}
        </div>
      ) : (
        <GridLayout
          className="layout"
          layout={gridLayout}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          width={containerWidth}
          isDraggable={isMine && !isSharedView}
          isResizable={isMine && !isSharedView}
          onLayoutChange={handleLayoutChange}
          onDragStop={handleLayoutSave}
          onResizeStop={handleLayoutSave}
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
                    {isMine && !isSharedView && (
                      <span className="drag-handle" style={{ cursor: 'grab', color: '#d1d5db', fontSize: 14, padding: '0 2px', flexShrink: 0 }}>{'\u2630'}</span>
                    )}
                    {chart?.created_by_avatar && (
                      <img
                        src={chart.created_by_avatar}
                        alt=""
                        style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0 }}
                      />
                    )}
                    <span style={styles.chartTitle}>{chart?.name || `Chart ${item.i}`}</span>
                  </div>
                  {isMine && !isSharedView && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13, padding: '0 4px', lineHeight: 1 }}
                        onClick={() => { setEditChartId(item.i); setShowChatModal(true); }}
                        title="Edit chart"
                      >
                        &#9998;
                      </button>
                      <button style={styles.removeBtn} onClick={() => handleRemoveChart(item.i)} title="Remove">
                        &#10005;
                      </button>
                    </div>
                  )}
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
                  ) : drillDataMap[item.i] ? (
                    <DataTableView pivotData={drillDataMap[item.i].rows} columns={drillDataMap[item.i].columns} noTotal />
                  ) : pivotDataMap[item.i] ? (
                    <DataTableView pivotData={pivotDataMap[item.i].pivotData} columns={pivotDataMap[item.i].columns} />
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
                <div style={{ padding: '0 12px 8px', display: 'flex' }}>
                  <FeedbackButtons
                    userEmail={userEmail}
                    source="dashboard"
                    chartId={item.i}
                    chartSpec={chart?.gw_spec}
                  />
                </div>
              </div>
            );
          })}
        </GridLayout>
      )}

      {showAddModal && (() => {
        const onDashboard = new Set(gridLayout.map(item => item.i));

        // Only my charts — excluding ones already on this dashboard
        const available = myCharts.filter(c => !onDashboard.has(String(c.id)));

        // Collect unique metrics for chips (use Number() to normalize IDs)
        const metricIdsInCharts = [...new Set(available.flatMap(c => (c.metric_ids || []).map(Number)))];
        const metricChipList = metricIdsInCharts
          .map(mid => metrics.find(m => Number(m.id) === mid))
          .filter(Boolean)
          .sort((a, b) => a.name.localeCompare(b.name));

        // Filter
        const filtered = available.filter(c => {
          if (modalMetricFilter.size > 0 && !(c.metric_ids || []).some(mid => modalMetricFilter.has(Number(mid)))) return false;
          if (!modalSearch) return true;
          const q = modalSearch.toLowerCase();
          const chartTypeLabel = TYPE_LABELS[c.gw_spec?.echartsType] || '';
          return c.name?.toLowerCase().includes(q) ||
            c.description?.toLowerCase().includes(q) ||
            chartTypeLabel.includes(q) ||
            (c.metric_ids || []).some(mid => {
              const m = metrics.find(x => Number(x.id) === Number(mid));
              return m?.name?.toLowerCase().includes(q);
            });
        });

        const closeModal = () => { setShowAddModal(false); setModalSearch(''); setModalMetricFilter(new Set()); };
        const toggleMetricChip = (mid) => setModalMetricFilter(prev => {
          const next = new Set(prev);
          if (next.has(mid)) next.delete(mid); else next.add(mid);
          return next;
        });

        return (
          <div style={styles.modal} onClick={closeModal}>
            <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <div style={styles.modalTitle}>Add Chart</div>
                <input
                  autoFocus
                  type="text"
                  placeholder="Search by chart name or metric..."
                  value={modalSearch}
                  onChange={e => setModalSearch(e.target.value)}
                  style={styles.modalSearch}
                />
                <button
                  style={styles.modalCreateBtn}
                  onClick={() => { closeModal(); setShowChatModal(true); }}
                >
                  + Create a New Chart from Scratch
                </button>
              </div>

              {/* Metric chips */}
              {metricChipList.length > 0 && (
                <div style={styles.metricChips}>
                  {metricChipList.map(m => (
                    <button
                      key={m.id}
                      style={modalMetricFilter.has(Number(m.id)) ? styles.metricChipActive : styles.metricChip}
                      onClick={() => toggleMetricChip(Number(m.id))}
                    >
                      {m.name}
                    </button>
                  ))}
                  {modalMetricFilter.size > 0 && (
                    <button
                      style={{ ...styles.metricChip, color: '#6b7280', borderStyle: 'dashed' }}
                      onClick={() => setModalMetricFilter(new Set())}
                    >
                      clear
                    </button>
                  )}
                </div>
              )}

              <div style={styles.modalList}>
                {filtered.length === 0 ? (
                  <div style={{ ...styles.empty, padding: 32 }}>
                    {modalSearch || modalMetricFilter.size > 0 ? 'No charts match your filters.' : 'No charts available.'}
                  </div>
                ) : (
                  filtered.map(chart => {
                    const metricNames = (chart.metric_ids || [])
                      .map(mid => metrics.find(m => m.id === mid)?.name)
                      .filter(Boolean)
                      .join(', ');
                    const count = usageCounts[String(chart.id)] || 0;
                    return (
                      <div
                        key={chart.id}
                        style={styles.chartRow}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        onClick={() => { handleAddChart(chart); closeModal(); }}
                      >
                        <div style={styles.chartRowInfo}>
                          <div style={styles.chartRowName}>
                            {chart.name || 'Untitled'}
                            {chart.is_approved && <span style={styles.approvedBadgeSmall}>Approved</span>}
                          </div>
                          <div style={styles.chartRowMeta}>
                            {metricNames || `${(chart.metric_ids || []).length} metric(s)`}
                          </div>
                          {chart.description ? (
                            <div style={styles.chartRowDesc}>{chart.description}</div>
                          ) : (
                            <div style={{ ...styles.chartRowDesc, fontStyle: 'italic' }}>No description</div>
                          )}
                        </div>
                        <div style={styles.chartRowDate}>
                          {chart.created_at ? new Date(chart.created_at).toLocaleDateString() : '—'}
                        </div>
                        <div style={styles.chartRowCount} title="Dashboards using this chart">
                          {count} {count === 1 ? 'dashboard' : 'dashboards'}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })()}

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
