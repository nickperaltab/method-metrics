import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AiPrompt from './AiPrompt';
import EChart from './EChart';
import { useBqData } from '../hooks/useBqData';
import { mapBqSchemaToGwFields } from '../lib/fieldMapper';
import { generateChartSpec } from '../lib/ai';
import { saveChart, fetchDashboards, createDashboard, updateDashboard } from '../lib/supabase';
import { queryBq, fetchAggregatedData, fetchChartData, fetchGroupedData, fetchYoYData, fetchKpiData, fetchViewData } from '../lib/bigquery';
import { fetchChartDatasets } from '../lib/chartDataBuilder';
import SaveChartModal from './SaveChartModal';
import ChartDetails from './ChartDetails';
import DataTableView from './DataTableView';
import KpiCard from './KpiCard';
import {
  castRow,
  aggregateRows,
  computeDerived,
  applyChannelFilter,
  applyLastNMonths,
  buildEChartsOption,
} from '../lib/chartUtils';
import schemaCache from '../lib/schemaCache';

const styles = {
  layout: { padding: 24, maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 'calc(100vh - 52px)' },
  status: { color: '#5a6370', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", padding: 40, textAlign: 'center' },
  chartContainer: { background: '#0c0f12', border: '1px solid #1a1e24', borderRadius: 8, overflow: 'hidden', height: 500 },
  schemasStatus: { color: '#5a6370', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' },
};

export default function Explorer({ metrics, bqConnected, userEmail, userAvatar }) {
  const navigate = useNavigate();
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [chartOption, setChartOption] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiExplanation, setAiExplanation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [schemasLoaded, setSchemasLoaded] = useState(false);
  const [lastSpec, setLastSpec] = useState(null);
  const [queryDetails, setQueryDetails] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [dashboards, setDashboards] = useState([]);
  const [currentTimeRange, setCurrentTimeRange] = useState(null);
  const [tableData, setTableData] = useState(null);
  const [kpiData, setKpiData] = useState(null);
  const { loading: dataLoading, error: dataError, loadView } = useBqData();

  // Pre-load schemas for all primitive/foundational metrics on BQ connect
  useEffect(() => {
    if (!bqConnected || !metrics.length || schemasLoaded) return;

    async function loadSchemas() {
      const viewMetrics = metrics.filter(m =>
        ['primitive', 'foundational'].includes(m.metric_type) && m.view_name && m.status === 'live'
      );
      const uniqueViews = [...new Set(viewMetrics.map(m => m.view_name))];

      await Promise.allSettled(
        uniqueViews.filter(v => !schemaCache[v]).map(async (viewName) => {
          const result = await queryBq(
            `SELECT column_name AS name, data_type AS type FROM \`project-for-method-dw.revenue.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name='${viewName}'`
          );
          if (result.rows) {
            schemaCache[viewName] = result.rows.map(r => ({ name: r.name, type: r.type }));
          }
        })
      );
      setSchemasLoaded(true);
    }

    loadSchemas();
  }, [bqConnected, metrics, schemasLoaded]);

  // Load dashboards for save modal
  useEffect(() => {
    fetchDashboards().then(setDashboards).catch(() => {});
  }, []);

  const loadMetricData = useCallback(async (metric) => {
    if (!metric.view_name) return null;
    const result = await loadView(metric.view_name);
    if (!result) return null;
    schemaCache[metric.view_name] = result.schema;
    const fields = mapBqSchemaToGwFields(result.schema);
    const rows = result.rows.map(row => castRow(row, fields));
    return { rows, fields };
  }, [loadView]);

  const handleAiPrompt = useCallback(async (prompt) => {
    setAiLoading(true);
    setAiError(null);
    setAiExplanation(null);
    setChartOption(null);
    setTableData(null);
    setKpiData(null);
    setQueryDetails([]);
    try {
      const result = await generateChartSpec(prompt, metrics, schemaCache);
      if (result.error) {
        setAiError(result.suggestion ? `${result.error}. ${result.suggestion}` : result.error);
        return;
      }
      setAiExplanation(result.explanation);

      const { dataConfig } = result;
      let { echartsType } = result;
      const channelFilter = dataConfig.channelFilter;
      const xField = dataConfig.xField;
      const timeBucket = dataConfig.timeBucket;

      // Year-over-Year branch
      if (echartsType === 'yoy') {
        const yoyDatasets = [];
        const yoyDetails = [];
        for (let i = 0; i < result.metrics.length; i++) {
          const metric = result.metrics[i];
          if (!metric.view_name) continue;
          const yField = dataConfig.yFields[i] || dataConfig.yFields[0] || 'COUNT';
          const viewSchema = schemaCache[metric.view_name] || [];
          const dateCol = viewSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || xField;
          try {
            const yoyResult = await fetchYoYData(metric.view_name, dateCol, yField, channelFilter);
            for (const year of yoyResult.years) {
              const lbl = result.metrics.length === 1 ? year : `${metric.name} ${year}`;
              yoyDatasets.push({ label: lbl, data: yoyResult.seriesMap[year] });
            }
            yoyDetails.push({ metricName: metric.name, metricId: metric.id, sql: yoyResult.sql, dateColumn: dateCol, labels: yoyResult.months, data: [] });
          } catch { /* skip */ }
        }
        if (yoyDatasets.length > 0) {
          const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const option = buildEChartsOption('yoy', monthLabels, yoyDatasets, dataConfig, { showLabels: result.showLabels, colors: result.colors });
          setChartOption(option);
          setQueryDetails(yoyDetails);
          setSelectedMetric(result.metrics[0]);
          setLastSpec({ metricIds: result.metricIds, echartsType, dataConfig, showLabels: result.showLabels, colors: result.colors });
          setCurrentTimeRange(null);
        } else {
          setAiError('No data loaded for year-over-year comparison');
        }
        return;
      }

      // KPI tile branch — block derived/rate metrics
      if (echartsType === 'kpi' && result.metrics.some(m => m.formula && m.depends_on && !m.view_name)) {
        echartsType = 'bar';
        dataConfig.lastNMonths = dataConfig.lastNMonths || 1;
      }
      if (echartsType === 'kpi') {
        const kpis = [];
        for (let i = 0; i < result.metrics.length; i++) {
          const metric = result.metrics[i];
          const yField = dataConfig.yFields[i] || dataConfig.yFields[0] || 'COUNT';
          const label = dataConfig.labels[i] || metric.name;
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
                  depKpis[depId] = { current: 0, prior: 0, error: true };
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
            const hasError = metric.depends_on.some(depId => depKpis[depId]?.error);
            const current = evalFormula('current');
            const prior = evalFormula('prior');
            const delta = current - prior;
            const deltaPercent = prior !== 0 ? Math.round((delta / prior) * 1000) / 10 : 0;
            kpis.push({ metricName: label, value: current, delta, deltaPercent, isRate: true, hasError });
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
        setKpiData(kpis);
        setSelectedMetric(result.metrics[0]);
        setLastSpec({ metricIds: result.metricIds, echartsType, dataConfig, showLabels: result.showLabels, colors: result.colors });
        return;
      }

      // Fetch and align chart data using shared utility
      const chartData = await fetchChartDatasets({ metricIds: result.metricIds, metrics, dataConfig });
      if (!chartData) {
        setAiError('No data loaded for the requested metrics');
        return;
      }

      const { labels: finalLabels, datasets: finalDatasets, queryDetails: collectedDetails } = chartData;

      if (echartsType === 'table') {
        setTableData({ labels: finalLabels, datasets: finalDatasets });
      } else {
        const option = buildEChartsOption(echartsType, finalLabels, finalDatasets, dataConfig, { showLabels: result.showLabels, colors: result.colors });
        setChartOption(option);
      }
      setQueryDetails(collectedDetails);
      setSelectedMetric(result.metrics[0]);
      setLastSpec({ metricIds: result.metricIds, echartsType, dataConfig, showLabels: result.showLabels, colors: result.colors });
      setCurrentTimeRange(dataConfig.lastNMonths != null ? dataConfig.lastNMonths : null);
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  }, [metrics, loadMetricData]);

  const handleTimeRangeChange = useCallback(async (months) => {
    if (!lastSpec) return;
    setCurrentTimeRange(months);
    setAiLoading(true);
    try {
      const { metricIds, echartsType, dataConfig } = lastSpec;
      const chartData = await fetchChartDatasets({ metricIds, metrics, dataConfig, lastNMonthsOverride: months });
      if (!chartData) return;
      const option = buildEChartsOption(echartsType, chartData.labels, chartData.datasets, dataConfig, { showLabels: lastSpec.showLabels, colors: lastSpec.colors });
      setChartOption(option);
    } catch { /* ignore */ } finally {
      setAiLoading(false);
    }
  }, [lastSpec, metrics]);

  const handleSave = useCallback(async ({ name, dashboardId, newDashboardName }) => {
    if (!selectedMetric || !lastSpec) return;
    setSaving(true);
    setSaveSuccess(false);
    setShowSaveModal(false);
    try {
      const saved = await saveChart({
        name,
        createdBy: userEmail || 'anonymous',
        createdByAvatar: userAvatar,
        metricIds: lastSpec.metricIds,
        gwSpec: { ...lastSpec },
      });

      // If user selected a dashboard or created a new one, add chart to it
      let targetDashboardId = dashboardId;
      if (newDashboardName) {
        const created = await createDashboard({ name: newDashboardName, createdBy: userEmail || 'anonymous' });
        if (created && created.length > 0) {
          targetDashboardId = created[0].id;
          setDashboards(prev => [created[0], ...prev]);
        }
      }
      if (targetDashboardId && saved && saved.length > 0) {
        const chartId = String(saved[0].id);
        const db = dashboards.find(d => String(d.id) === String(targetDashboardId));
        const existingLayout = db?.layout || [];
        const maxY = existingLayout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
        await updateDashboard(targetDashboardId, {
          layout: [...existingLayout, { i: chartId, x: 0, y: maxY, w: 6, h: 4 }],
          updated_by: userEmail,
        });
      }

      setSaveSuccess(true);
      if (targetDashboardId) {
        navigate(`/dashboards/${targetDashboardId}`);
        return;
      }
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setAiError(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [selectedMetric, lastSpec, userEmail, userAvatar, dashboards, navigate]);

  const loading = dataLoading || aiLoading;
  const hasChart = (chartOption || tableData || kpiData) && !loading;

  return (
    <div style={styles.layout}>
      {bqConnected && (
        <>
          <AiPrompt onResult={handleAiPrompt} loading={aiLoading} error={aiError} explanation={aiExplanation} />
          {!schemasLoaded && <div style={styles.schemasStatus}>Loading metric schemas...</div>}
        </>
      )}
      {!bqConnected && <div style={styles.status}>Connect BigQuery to start exploring</div>}
      {bqConnected && !selectedMetric && !loading && schemasLoaded && (
        <div style={styles.status}>Describe the chart you want above</div>
      )}
      {loading && <div style={styles.status}>Loading...</div>}
      {dataError && <div style={{ color: '#f87171', fontSize: 12, padding: '8px 0' }}>{dataError}</div>}
      {hasChart && (
        <>
          {kpiData ? (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {kpiData.map((kpi, ki) => <KpiCard key={ki} {...kpi} />)}
            </div>
          ) : tableData ? (
            <DataTableView labels={tableData.labels} datasets={tableData.datasets} />
          ) : (
            <div style={styles.chartContainer}>
              <EChart option={chartOption} />
            </div>
          )}
          <ChartDetails queryDetails={queryDetails} metrics={metrics} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
            {saveSuccess && <span style={{ color: '#34d399', fontSize: 12 }}>Saved!</span>}
            <button onClick={() => setShowSaveModal(true)} disabled={saving} style={{
              background: '#0a1f17', border: '1px solid #34d399', color: '#34d399',
              padding: '8px 20px', borderRadius: 6, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
              opacity: saving ? 0.5 : 1,
            }}>
              {saving ? 'Saving...' : 'Save Chart'}
            </button>
          </div>
        </>
      )}
      {showSaveModal && (
        <SaveChartModal
          onSave={handleSave}
          onClose={() => setShowSaveModal(false)}
          dashboards={dashboards}
        />
      )}
    </div>
  );
}
