import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AiPrompt from './AiPrompt';
import EChart from './EChart';
import { useBqData } from '../hooks/useBqData';
import { mapBqSchemaToGwFields } from '../lib/fieldMapper';
import { generateChartSpec } from '../lib/ai';
import { saveChart, fetchDashboards, createDashboard, updateDashboard } from '../lib/supabase';
import { queryBq, fetchAggregatedData, fetchViewData } from '../lib/bigquery';
import SaveChartModal from './SaveChartModal';
import ChartDetails from './ChartDetails';
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
  const { loading: dataLoading, error: dataError, loadView } = useBqData();

  // Pre-load schemas for all primitive/foundational metrics on BQ connect
  useEffect(() => {
    if (!bqConnected || !metrics.length || schemasLoaded) return;

    async function loadSchemas() {
      const viewMetrics = metrics.filter(m =>
        ['primitive', 'foundational'].includes(m.metric_type) && m.view_name && m.status === 'live'
      );
      const uniqueViews = [...new Set(viewMetrics.map(m => m.view_name))];

      for (const viewName of uniqueViews) {
        if (schemaCache[viewName]) continue;
        try {
          const result = await queryBq(
            `SELECT column_name AS name, data_type AS type FROM \`project-for-method-dw.revenue.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name='${viewName}'`
          );
          if (result.rows) {
            schemaCache[viewName] = result.rows.map(r => ({ name: r.name, type: r.type }));
          }
        } catch { /* skip failed schemas */ }
      }
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
    setQueryDetails([]);
    try {
      const result = await generateChartSpec(prompt, metrics, schemaCache);
      if (result.error) {
        setAiError(result.suggestion ? `${result.error}. ${result.suggestion}` : result.error);
        return;
      }
      setAiExplanation(result.explanation);

      const { dataConfig, echartsType } = result;
      const channelFilter = dataConfig.channelFilter;
      const xField = dataConfig.xField;
      const timeBucket = dataConfig.timeBucket;

      // Build datasets: one per metric
      const rawDatasets = [];
      const collectedDetails = [];

      for (let i = 0; i < result.metrics.length; i++) {
        const metric = result.metrics[i];
        const yField = dataConfig.yFields[i] || dataConfig.yFields[0] || 'COUNT';
        const label = dataConfig.labels[i] || metric.name;

        if (metric.formula && metric.depends_on && !metric.view_name) {
          // Derived metric — aggregate each dependency server-side, then apply formula
          const depAggregated = {};
          for (const depId of metric.depends_on) {
            const depMetric = metrics.find(dm => dm.id === depId);
            if (depMetric && depMetric.view_name) {
              // Find the right date column for this view
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
          // Get all time labels (union across deps)
          const allDepLabels = new Set();
          for (const counts of Object.values(depAggregated)) {
            Object.keys(counts).forEach(k => allDepLabels.add(k));
          }
          const sortedDepLabels = [...allDepLabels].sort();
          // Apply formula per time bucket
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
          const depNames = metric.depends_on.map(id => {
            const dm = metrics.find(m => m.id === id);
            return dm ? `${dm.name} (${id})` : String(id);
          });
          collectedDetails.push({
            metricName: label,
            metricId: metric.id,
            sql: `Derived: ${metric.formula}`,
            dateColumn: 'N/A (computed from dependencies)',
            labels: computedLabels,
            data: computedData,
            dependsOn: depNames,
          });
        } else {
          // Use the correct date column for this specific view (may differ from AI's xField)
          const viewSchema = schemaCache[metric.view_name] || [];
          const dateCol = viewSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || xField;
          try {
            const agg = await fetchAggregatedData(
              metric.view_name, dateCol, yField, timeBucket, channelFilter, dataConfig.lastNMonths
            );
            rawDatasets.push({ label, ...agg });
            collectedDetails.push({
              metricName: label,
              metricId: metric.id,
              sql: agg.sql,
              dateColumn: dateCol,
              labels: agg.labels,
              data: agg.data,
            });
          } catch (e) {
            // Fallback to client-side aggregation if SQL fails
            const loaded = await loadMetricData(metric);
            if (loaded) {
              const filteredRows = applyChannelFilter(loaded.rows, channelFilter);
              const agg = aggregateRows(filteredRows, dateCol, yField, timeBucket);
              rawDatasets.push({ label, ...agg });
              collectedDetails.push({
                metricName: label,
                metricId: metric.id,
                sql: '(client-side fallback — server query failed)',
                dateColumn: dateCol,
                labels: agg.labels,
                data: agg.data,
              });
            }
          }
        }
      }

      if (rawDatasets.length === 0) {
        setAiError('No data loaded for the requested metrics');
        return;
      }

      // Merge all labels (union) and align datasets
      const allLabelsSet = new Set();
      for (const ds of rawDatasets) {
        ds.labels.forEach(l => allLabelsSet.add(l));
      }
      const allLabels = [...allLabelsSet].sort();

      const alignedDatasets = rawDatasets.map(ds => {
        const labelMap = {};
        ds.labels.forEach((l, i) => { labelMap[l] = ds.data[i]; });
        return {
          label: ds.label,
          data: allLabels.map(l => labelMap[l] || 0),
        };
      });

      // Note: lastNMonths is handled server-side in fetchAggregatedData.
      // For derived metrics (client-side), apply it here.
      const hasDerived = result.metrics.some(m => m.formula && m.depends_on && !m.view_name);
      let finalLabels = allLabels;
      let finalDatasets = alignedDatasets;
      if (hasDerived && dataConfig.lastNMonths) {
        ({ labels: finalLabels, datasets: finalDatasets } = applyLastNMonths(
          allLabels, alignedDatasets, dataConfig.lastNMonths, timeBucket
        ));
      }

      // Build ECharts option
      const option = buildEChartsOption(echartsType, finalLabels, finalDatasets, dataConfig, { showLabels: result.showLabels });
      setChartOption(option);
      setQueryDetails(collectedDetails);
      setSelectedMetric(result.metrics[0]);
      setLastSpec({ metricIds: result.metricIds, echartsType, dataConfig, showLabels: result.showLabels });
      setCurrentTimeRange(dataConfig.lastNMonths || null);
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
      const effectiveLastNMonths = months;
      const channelFilter = dataConfig.channelFilter;
      const xField = dataConfig.xField;
      const timeBucket = dataConfig.timeBucket;
      const rawDatasets = [];

      for (let i = 0; i < metricIds.length; i++) {
        const metricId = metricIds[i];
        const metric = metrics.find(m => m.id === metricId);
        if (!metric) continue;
        const yField = dataConfig.yFields?.[i] || dataConfig.yFields?.[0] || 'COUNT';
        const label = dataConfig.labels?.[i] || metric.name;

        if (metric.formula && metric.depends_on && !metric.view_name) {
          const depAggregated = {};
          for (const depId of metric.depends_on) {
            const depMetric = metrics.find(dm => dm.id === depId);
            if (depMetric && depMetric.view_name) {
              const depSchema = schemaCache[depMetric.view_name] || [];
              const dateCol = depSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || xField;
              try {
                const depAgg = await fetchAggregatedData(
                  depMetric.view_name, dateCol, 'COUNT', timeBucket, channelFilter, effectiveLastNMonths
                );
                const counts = {};
                depAgg.labels.forEach((l, idx) => { counts[l] = depAgg.data[idx]; });
                depAggregated[depId] = counts;
              } catch { depAggregated[depId] = {}; }
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
          const viewSchema = schemaCache[metric.view_name] || [];
          const dateCol = viewSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || xField;
          try {
            const agg = await fetchAggregatedData(
              metric.view_name, dateCol, yField, timeBucket, channelFilter, effectiveLastNMonths
            );
            rawDatasets.push({ label, ...agg });
          } catch { /* skip */ }
        }
      }

      if (rawDatasets.length === 0) return;

      const allLabelsSet = new Set();
      for (const ds of rawDatasets) { ds.labels.forEach(l => allLabelsSet.add(l)); }
      const allLabels = [...allLabelsSet].sort();
      const alignedDatasets = rawDatasets.map(ds => {
        const labelMap = {};
        ds.labels.forEach((l, idx) => { labelMap[l] = ds.data[idx]; });
        return { label: ds.label, data: allLabels.map(l => labelMap[l] || 0) };
      });

      const hasDerived = metricIds.some(mid => {
        const m = metrics.find(mm => mm.id === mid);
        return m && m.formula && m.depends_on && !m.view_name;
      });
      let finalLabels = allLabels;
      let finalDatasets = alignedDatasets;
      if (hasDerived && effectiveLastNMonths) {
        ({ labels: finalLabels, datasets: finalDatasets } = applyLastNMonths(
          allLabels, alignedDatasets, effectiveLastNMonths, timeBucket
        ));
      }

      const option = buildEChartsOption(echartsType, finalLabels, finalDatasets, dataConfig, { showLabels: lastSpec.showLabels });
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
  const hasChart = chartOption && !loading;

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
          <div style={styles.chartContainer}>
            <EChart option={chartOption} />
          </div>
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
