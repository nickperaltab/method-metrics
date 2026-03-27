import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import ChatInterface from './ChatInterface';
import SaveChartModal from './SaveChartModal';
import { useBqData } from '../hooks/useBqData';
import { mapBqSchemaToGwFields } from '../lib/fieldMapper';
import { generateChartSpecWithHistory } from '../lib/ai';
import { saveConversation, saveChart, updateChart, fetchDashboards, createDashboard, updateDashboard, loadChart, loadConversations, loadConversation } from '../lib/supabase';
import { queryBq, fetchAggregatedData, fetchChartData, fetchGroupedData, fetchYoYData, fetchKpiData, fetchViewData } from '../lib/bigquery';
import {
  castRow,
  aggregateRows,
  computeDerived,
  applyChannelFilter,
  applyLastNMonths,
  buildEChartsOption,
} from '../lib/chartUtils';
import schemaCache from '../lib/schemaCache';

export default function ChatExplorer({ metrics, bqConnected, userEmail, userAvatar, modalMode, onChartSaved, editChartId: editChartIdProp }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const addToDashboardId = searchParams.get('addToDashboard');
  const editChartId = editChartIdProp || searchParams.get('editChart');
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastSpec, setLastSpec] = useState(null);
  const [schemasLoaded, setSchemasLoaded] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveMessageIndex, setSaveMessageIndex] = useState(null);
  const [dashboards, setDashboards] = useState([]);
  const [currentTimeRange, setCurrentTimeRange] = useState(null);
  const [recentConversations, setRecentConversations] = useState([]);
  const [editingChartInfo, setEditingChartInfo] = useState(null);
  const { loadView } = useBqData();

  // Pre-load schemas (same pattern as Explorer)
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

  // Load recent conversations
  useEffect(() => {
    if (userEmail) {
      loadConversations(userEmail).then(setRecentConversations).catch(() => {});
    }
  }, [userEmail]);

  // Build a chart from a spec (shared by editChart, time range change, and conversation restore)
  const buildChartFromSpec = useCallback(async (spec, overrideLastNMonths) => {
    const { metricIds, echartsType, dataConfig, showLabels, colors } = spec;
    const effectiveLastNMonths = overrideLastNMonths !== undefined ? overrideLastNMonths : dataConfig.lastNMonths;
    const channelFilter = dataConfig.channelFilter;
    const xField = dataConfig.xField;
    const timeBucket = dataConfig.timeBucket;
    const rawDatasets = [];

    // Year-over-Year: fetch YoY data and return early
    if (echartsType === 'yoy') {
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
            rawDatasets.push({ label: lbl, labels: yoyResult.months, data: yoyResult.seriesMap[year] });
          }
        } catch { /* skip */ }
      }
      if (rawDatasets.length === 0) return null;
      const monthLabels = rawDatasets[0].labels;
      const yoyDatasets = rawDatasets.map(ds => ({ label: ds.label, data: ds.data }));
      return buildEChartsOption('yoy', monthLabels, yoyDatasets, dataConfig, { showLabels, colors });
    }

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
      } else if (dataConfig.groupByDimension && metric.view_name) {
        const viewSchema = schemaCache[metric.view_name] || [];
        const dateCol = viewSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || xField;
        try {
          const grouped = await fetchGroupedData(
            metric.view_name, dateCol, yField, timeBucket,
            dataConfig.groupByDimension, channelFilter, effectiveLastNMonths
          );
          Object.entries(grouped.seriesMap).forEach(([dimValue, data]) => {
            rawDatasets.push({ label: dimValue, labels: grouped.labels, data });
          });
        } catch { /* skip */ }
      } else if (metric.view_name) {
        const viewSchema = schemaCache[metric.view_name] || [];
        const dateCol = viewSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || xField;
        try {
          const agg = await fetchChartData(
            metric, dateCol, yField, timeBucket, channelFilter, effectiveLastNMonths
          );
          rawDatasets.push({ label, ...agg });
        } catch { /* skip */ }
      }
    }

    if (rawDatasets.length === 0) return null;

    const allLabelsSet = new Set();
    for (const ds of rawDatasets) {
      ds.labels.forEach(l => allLabelsSet.add(l));
    }
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

    return buildEChartsOption(echartsType, finalLabels, finalDatasets, dataConfig, { showLabels, colors });
  }, [metrics]);

  // Handle editChart query param — load saved chart and render it
  useEffect(() => {
    if (!editChartId || !bqConnected || !metrics.length || !schemasLoaded) return;

    async function loadEditChart() {
      setLoading(true);
      try {
        const chart = await loadChart(editChartId);
        if (!chart || !chart.gw_spec) {
          setMessages([{ role: 'assistant', content: 'Could not load chart for editing.' }]);
          setLoading(false);
          return;
        }

        const { metricIds, echartsType, dataConfig } = chart.gw_spec;
        if (!metricIds || !echartsType || !dataConfig) {
          setMessages([{ role: 'assistant', content: 'Chart spec is incomplete.' }]);
          setLoading(false);
          return;
        }

        const spec = { metricIds, echartsType, dataConfig };
        const chartOption = await buildChartFromSpec(spec);

        setLastSpec(spec);
        setCurrentTimeRange(dataConfig.lastNMonths || null);
        setEditingChartInfo({ id: chart.id, name: chart.name });
        setMessages([
          { role: 'assistant', content: `Editing "${chart.name}". You can modify this chart by describing changes.`, chartOption },
        ]);
      } catch (e) {
        setMessages([{ role: 'assistant', content: `Error loading chart: ${e.message}` }]);
      } finally {
        setLoading(false);
      }
    }

    loadEditChart();
  }, [editChartId, bqConnected, metrics, schemasLoaded, buildChartFromSpec]);

  const handleTimeRangeChange = useCallback(async (months) => {
    if (!lastSpec) return;
    setCurrentTimeRange(months);
    setLoading(true);
    try {
      const chartOption = await buildChartFromSpec(lastSpec, months);
      if (chartOption) {
        setMessages(prev => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].role === 'assistant' && updated[i].chartOption) {
              updated[i] = { ...updated[i], chartOption };
              break;
            }
          }
          return updated;
        });
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [lastSpec, buildChartFromSpec]);

  const handleSaveChart = useCallback((messageIndex) => {
    setSaveMessageIndex(messageIndex);
    setShowSaveModal(true);
  }, []);

  const handleUpdateChart = useCallback(async () => {
    if (!editingChartInfo || !lastSpec) return;
    setShowSaveModal(false);
    try {
      await updateChart(editingChartInfo.id, { gwSpec: { ...lastSpec }, updatedBy: userEmail || 'anonymous' });
      if (modalMode && onChartSaved) {
        onChartSaved(editingChartInfo.id);
      } else {
        navigate(-1);
      }
    } catch { /* non-critical */ }
  }, [editingChartInfo, lastSpec, userEmail, modalMode, onChartSaved, navigate]);

  const handleSaveConfirm = useCallback(async ({ name, dashboardId, newDashboardName }) => {
    setShowSaveModal(false);
    if (!lastSpec) return;
    try {
      const saved = await saveChart({
        name,
        createdBy: userEmail || 'anonymous',
        createdByAvatar: userAvatar,
        metricIds: lastSpec.metricIds,
        gwSpec: { ...lastSpec },
      });

      let targetDashboardId = dashboardId || addToDashboardId;
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
        if (modalMode && onChartSaved) {
          onChartSaved(chartId);
          return;
        }
        // Navigate to the dashboard after saving
        navigate(`/dashboards/${targetDashboardId}`);
        return;
      }
      if (modalMode && onChartSaved && saved && saved.length > 0) {
        onChartSaved(String(saved[0].id));
        return;
      }
    } catch { /* non-critical */ }
  }, [lastSpec, userEmail, userAvatar, dashboards, addToDashboardId, navigate, modalMode, onChartSaved]);

  const loadMetricData = useCallback(async (metric) => {
    if (!metric.view_name) return null;
    const result = await loadView(metric.view_name);
    if (!result) return null;
    schemaCache[metric.view_name] = result.schema;
    const fields = mapBqSchemaToGwFields(result.schema);
    const rows = result.rows.map(row => castRow(row, fields));
    return { rows, fields };
  }, [loadView]);

  const handleSend = useCallback(async (prompt) => {
    const userMsg = { role: 'user', content: prompt };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setLoading(true);
    setError(null);

    try {
      const result = await generateChartSpecWithHistory(updatedMessages, metrics, schemaCache, lastSpec);

      if (result.type === 'text') {
        const content = result.suggestion
          ? `${result.content}\n\n${result.suggestion}`
          : result.content;
        setMessages(prev => [...prev, { role: 'assistant', content }]);
        setLoading(false);
        return;
      }

      if (result.error) {
        const errText = result.suggestion ? `${result.error}. ${result.suggestion}` : result.error;
        setMessages(prev => [...prev, { role: 'assistant', content: errText }]);
        setLoading(false);
        return;
      }

      // Merge AI response with previous spec — preserve fields the AI didn't explicitly change
      // This ensures follow-ups like "just do march" keep chart type, time bucket, etc. from before
      const dataConfig = result.dataConfig;
      if (lastSpec && lastSpec.dataConfig) {
        const prevDC = lastSpec.dataConfig;
        if (dataConfig.timeBucket == null && prevDC.timeBucket) dataConfig.timeBucket = prevDC.timeBucket;
        if (dataConfig.lastNMonths == null && prevDC.lastNMonths != null) dataConfig.lastNMonths = prevDC.lastNMonths;
        if (dataConfig.channelFilter == null && prevDC.channelFilter) dataConfig.channelFilter = prevDC.channelFilter;
        if (dataConfig.groupByDimension == null && prevDC.groupByDimension) dataConfig.groupByDimension = prevDC.groupByDimension;
        if (!result.echartsType && lastSpec.echartsType) result.echartsType = lastSpec.echartsType;
        if (!result.colors && lastSpec.colors) result.colors = lastSpec.colors;
        if (result.showLabels == null && lastSpec.showLabels != null) result.showLabels = lastSpec.showLabels;
      }

      let { echartsType } = result;
      const channelFilter = dataConfig.channelFilter;
      const xField = dataConfig.xField;
      const timeBucket = dataConfig.timeBucket;

      // KPI tile branch — block derived/rate metrics (they produce misleading single-point values)
      if (echartsType === 'kpi' && result.metrics.some(m => m.formula && m.depends_on && !m.view_name)) {
        echartsType = 'bar'; // Fall back to bar chart for rates
        dataConfig.lastNMonths = dataConfig.lastNMonths || 1; // Default to current month
      }
      if (echartsType === 'kpi') {
        const kpiData = [];
        const collectedDetails = [];
        for (let i = 0; i < result.metrics.length; i++) {
          const metric = result.metrics[i];
          const yField = dataConfig.yFields[i] || dataConfig.yFields[0] || 'COUNT';
          const label = dataConfig.labels[i] || metric.name;
          const isRate = !!(metric.formula && metric.depends_on && !metric.view_name);

          if (isRate) {
            // Derived metric: fetch KPI for each dependency, apply formula for current + prior
            const depKpis = {};
            const depDetails = [];
            for (const depId of metric.depends_on) {
              const depMetric = metrics.find(dm => dm.id === depId);
              if (depMetric && depMetric.view_name) {
                const depSchema = schemaCache[depMetric.view_name] || [];
                const dateCol = depSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name;
                if (!dateCol) { depKpis[depId] = { current: 0, prior: 0, error: true }; continue; }
                try {
                  const kpiResult = await fetchKpiData(depMetric.view_name, dateCol, 'COUNT', channelFilter);
                  depKpis[depId] = kpiResult;
                  depDetails.push({ metricName: depMetric.name, metricId: depId, sql: kpiResult.sql, dateColumn: dateCol, labels: ['current', 'prior'], data: [kpiResult.current, kpiResult.prior] });
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
            const current = Math.round(evalFormula('current') * 100) / 100;
            const prior = Math.round(evalFormula('prior') * 100) / 100;
            const delta = Math.round((current - prior) * 100) / 100;
            const deltaPercent = prior !== 0 ? Math.round((delta / prior) * 1000) / 10 : 0;
            kpiData.push({ metricName: label, value: current, delta, deltaPercent, isRate: true, hasError });
            collectedDetails.push({ metricName: label, metricId: metric.id, sql: `Derived: ${metric.formula}`, dateColumn: 'N/A (computed)', labels: ['current', 'prior'], data: [current, prior], dependsOn: metric.depends_on });
            depDetails.forEach(d => collectedDetails.push(d));
          } else if (metric.view_name) {
            const viewSchema = schemaCache[metric.view_name] || [];
            const dateCol = viewSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name;
            if (!dateCol) {
              kpiData.push({ metricName: label, value: 0, delta: 0, deltaPercent: 0, isRate: false, hasError: true });
              continue;
            }
            try {
              const kpi = await fetchKpiData(metric.view_name, dateCol, yField, channelFilter);
              kpiData.push({ metricName: label, value: kpi.current, delta: kpi.delta, deltaPercent: kpi.deltaPercent, isRate: false });
              collectedDetails.push({ metricName: label, metricId: metric.id, sql: kpi.sql, dateColumn: dateCol, labels: ['current', 'prior'], data: [kpi.current, kpi.prior] });
            } catch (err) {
              kpiData.push({ metricName: label, value: 0, delta: 0, deltaPercent: 0, isRate: false, hasError: true });
              collectedDetails.push({ metricName: label, metricId: metric.id, sql: `ERROR: ${err.message}`, dateColumn: dateCol, labels: [], data: [] });
            }
          }
        }

        const newSpec = { metricIds: result.metricIds, echartsType, dataConfig, showLabels: result.showLabels, colors: result.colors };
        setLastSpec(newSpec);

        const assistantMsg = {
          role: 'assistant',
          content: result.explanation || '',
          kpiData,
        };
        const allMessages = [...updatedMessages, assistantMsg];
        setMessages(allMessages);

        try {
          const title = updatedMessages[0]?.content?.slice(0, 80) || 'Untitled';
          const saved = await saveConversation({
            id: conversationId,
            userEmail: userEmail || 'anonymous',
            title,
            messages: allMessages.map(m => ({ role: m.role, content: m.content })),
            currentChartSpec: newSpec,
          });
          if (!conversationId && saved && saved.length > 0) {
            setConversationId(saved[0].id);
          }
          if (userEmail) {
            loadConversations(userEmail).then(setRecentConversations).catch(() => {});
          }
        } catch { /* non-critical */ }

        setLoading(false);
        return;
      }

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
              yoyDatasets.push({ label: lbl, labels: yoyResult.months, data: yoyResult.seriesMap[year] });
            }
            yoyDetails.push({ metricName: metric.name, metricId: metric.id, sql: yoyResult.sql, dateColumn: dateCol, labels: yoyResult.months, data: [] });
          } catch { /* skip */ }
        }
        if (yoyDatasets.length === 0) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'No data loaded for year-over-year comparison.' }]);
          setLoading(false);
          return;
        }
        const monthLabels = yoyDatasets[0].labels;
        const alignedYoy = yoyDatasets.map(ds => ({ label: ds.label, data: ds.data }));
        const chartOption = buildEChartsOption('yoy', monthLabels, alignedYoy, dataConfig, { showLabels: result.showLabels, colors: result.colors });
        const newSpec = { metricIds: result.metricIds, echartsType, dataConfig, showLabels: result.showLabels, colors: result.colors };
        setLastSpec(newSpec);
        setCurrentTimeRange(null);
        const assistantMsg = { role: 'assistant', content: result.explanation || '', chartOption, queryDetails: yoyDetails };
        const allMessages = [...updatedMessages, assistantMsg];
        setMessages(allMessages);
        try {
          const title = updatedMessages[0]?.content?.slice(0, 80) || 'Untitled';
          const saved = await saveConversation({ id: conversationId, userEmail: userEmail || 'anonymous', title, messages: allMessages.map(m => ({ role: m.role, content: m.content })), currentChartSpec: newSpec });
          if (!conversationId && saved && saved.length > 0) setConversationId(saved[0].id);
          if (userEmail) loadConversations(userEmail).then(setRecentConversations).catch(() => {});
        } catch { /* non-critical */ }
        setLoading(false);
        return;
      }

      // Build datasets (same logic as Explorer)
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
        } else if (dataConfig.groupByDimension && metric.view_name) {
          const viewSchema = schemaCache[metric.view_name] || [];
          const dateCol = viewSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || xField;
          try {
            const grouped = await fetchGroupedData(
              metric.view_name, dateCol, yField, timeBucket,
              dataConfig.groupByDimension, channelFilter, dataConfig.lastNMonths
            );
            Object.entries(grouped.seriesMap).forEach(([dimValue, data]) => {
              rawDatasets.push({ label: dimValue, labels: grouped.labels, data });
            });
            collectedDetails.push({
              metricName: label,
              metricId: metric.id,
              sql: grouped.sql,
              dateColumn: dateCol,
              labels: grouped.labels,
              data: [],
              groupedBy: dataConfig.groupByDimension,
            });
          } catch (err) {
            collectedDetails.push({
              metricName: label,
              metricId: metric.id,
              sql: `ERROR: ${err.message || 'Grouped query failed'}`,
              dateColumn: dateCol,
              labels: [],
              data: [],
            });
          }
        } else {
          // Use the correct date column for this specific view (may differ from AI's xField)
          const viewSchema = schemaCache[metric.view_name] || [];
          const dateCol = viewSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || xField;
          try {
            const agg = await fetchChartData(
              metric, dateCol, yField, timeBucket, channelFilter, dataConfig.lastNMonths
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
          } catch (err) {
            collectedDetails.push({
              metricName: label,
              metricId: metric.id,
              sql: `ERROR: ${err.message || 'Query failed'}`,
              dateColumn: dateCol,
              labels: [],
              data: [],
            });
            try {
              const loaded = await loadMetricData(metric);
              if (loaded) {
                const filteredRows = applyChannelFilter(loaded.rows, channelFilter);
                const agg = aggregateRows(filteredRows, dateCol, yField, timeBucket);
                rawDatasets.push({ label, ...agg });
                collectedDetails[collectedDetails.length - 1].sql += ' → client-side fallback succeeded';
                collectedDetails[collectedDetails.length - 1].labels = agg.labels;
                collectedDetails[collectedDetails.length - 1].data = agg.data;
              }
            } catch { /* both paths failed */ }
          }
        }
      }

      if (rawDatasets.length === 0) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'No data loaded for the requested metrics.' }]);
        setLoading(false);
        return;
      }

      // Merge labels and align datasets
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

      const { labels: finalLabels, datasets: finalDatasets } = applyLastNMonths(
        allLabels, alignedDatasets, dataConfig.lastNMonths, timeBucket
      );

      const newSpec = { metricIds: result.metricIds, echartsType, dataConfig, showLabels: result.showLabels, colors: result.colors };
      setLastSpec(newSpec);
      setCurrentTimeRange(dataConfig.lastNMonths || null);

      let assistantMsg;
      if (echartsType === 'table') {
        assistantMsg = {
          role: 'assistant',
          content: result.explanation || '',
          tableData: { labels: finalLabels, datasets: finalDatasets },
          queryDetails: collectedDetails,
        };
      } else {
        const chartOption = buildEChartsOption(echartsType, finalLabels, finalDatasets, dataConfig, { showLabels: result.showLabels, colors: result.colors });
        assistantMsg = {
          role: 'assistant',
          content: result.explanation || '',
          chartOption,
          queryDetails: collectedDetails,
        };
      }
      const allMessages = [...updatedMessages, assistantMsg];
      setMessages(allMessages);

      // Save conversation to Supabase (fire and forget)
      try {
        const title = updatedMessages[0]?.content?.slice(0, 80) || 'Untitled';
        const saved = await saveConversation({
          id: conversationId,
          userEmail: userEmail || 'anonymous',
          title,
          messages: allMessages.map(m => ({ role: m.role, content: m.content })),
          currentChartSpec: newSpec,
        });
        if (!conversationId && saved && saved.length > 0) {
          setConversationId(saved[0].id);
        }
        // Refresh recent conversations
        if (userEmail) {
          loadConversations(userEmail).then(setRecentConversations).catch(() => {});
        }
      } catch { /* non-critical */ }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }, [messages, metrics, lastSpec, loadMetricData, conversationId, userEmail]);

  const handleNewThread = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setLastSpec(null);
    setError(null);
    setCurrentTimeRange(null);
  }, []);

  const handleLoadConversation = useCallback(async (convId) => {
    setLoading(true);
    try {
      const conv = await loadConversation(convId);
      if (!conv) {
        setLoading(false);
        return;
      }
      setConversationId(conv.id);
      setMessages(conv.messages || []);
      if (conv.current_chart_spec) {
        setLastSpec(conv.current_chart_spec);
        setCurrentTimeRange(conv.current_chart_spec.dataConfig?.lastNMonths || null);

        // Re-build the chart for the last assistant message
        const chartOption = await buildChartFromSpec(conv.current_chart_spec);
        if (chartOption) {
          setMessages(prev => {
            const updated = [...prev];
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].role === 'assistant') {
                updated[i] = { ...updated[i], chartOption };
                break;
              }
            }
            return updated;
          });
        }
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [buildChartFromSpec]);

  if (!bqConnected) {
    return (
      <div style={{ color: '#5a6370', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", padding: 40, textAlign: 'center' }}>
        Connect BigQuery to start chatting
      </div>
    );
  }

  if (!schemasLoaded) {
    return (
      <div style={{ color: '#5a6370', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", padding: 40, textAlign: 'center' }}>
        Loading metric schemas...
      </div>
    );
  }

  return (
    <>
      <ChatInterface
        messages={messages}
        onSend={handleSend}
        loading={loading}
        onNewThread={handleNewThread}
        metrics={metrics}
        onSaveChart={handleSaveChart}
        recentConversations={recentConversations}
        onLoadConversation={handleLoadConversation}
      />
      {showSaveModal && (
        <SaveChartModal
          onSave={handleSaveConfirm}
          onClose={() => setShowSaveModal(false)}
          dashboards={dashboards}
          defaultName={addToDashboardId ? '' : ''}
          editingChart={editingChartInfo}
          onUpdate={handleUpdateChart}
        />
      )}
    </>
  );
}
