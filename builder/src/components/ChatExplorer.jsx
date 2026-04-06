import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import ChatInterface from './ChatInterface';
import SaveChartModal from './SaveChartModal';
import { useBqData } from '../hooks/useBqData';
import { useUser } from '../contexts/UserContext';
import { mapBqSchemaToGwFields } from '../lib/fieldMapper';
import { generateChartSpecWithHistory } from '../lib/ai';
import { saveConversation, saveChart, updateChart, fetchDashboards, createDashboard, updateDashboard, loadChart, loadConversations, loadConversation, fetchAllApprovedDimensions } from '../lib/supabase';
import { queryBq, fetchAggregatedData, fetchChartData, fetchGroupedData, fetchYoYData, fetchKpiData, fetchViewData, fetchDrillData } from '../lib/bigquery';
import { fetchChartDatasets, fetchPivotData } from '../lib/chartDataBuilder';
import {
  castRow,
  aggregateRows,
  computeDerived,
  applyChannelFilter,
  applyLastNMonths,
  buildEChartsOption,
} from '../lib/chartUtils';
import { evaluateFormula } from '../lib/sanitize';
import { getMonthIndices, formatMonthLabels, sliceSeries, computeGrowthSeries } from '../lib/yoyUtils';
import schemaCache from '../lib/schemaCache';

function suggestChartName(spec, metrics) {
  if (!spec) return '';
  const parts = [];

  // Metric names
  const metricNames = (spec.metricIds || [])
    .map(id => metrics.find(m => m.id === id)?.name)
    .filter(Boolean);
  if (metricNames.length > 0) {
    parts.push(metricNames.length <= 2 ? metricNames.join(' & ') : `${metricNames[0]} + ${metricNames.length - 1} more`);
  }

  // Time frame
  const dc = spec.dataConfig || {};
  if (dc.lastNMonths) {
    parts.push(`Last ${dc.lastNMonths} Months`);
  } else if (dc.timeBucket) {
    const bucketLabel = { monthly: 'Monthly', weekly: 'Weekly', daily: 'Daily', quarterly: 'Quarterly', yearly: 'Yearly' };
    parts.push(bucketLabel[dc.timeBucket] || dc.timeBucket);
  }

  // Dimensions / group by
  if (dc.channelFilter) {
    parts.push(`By ${dc.channelFilter}`);
  } else if (dc.groupBy) {
    parts.push(`By ${dc.groupBy}`);
  }

  return parts.join(' - ');
}

export default function ChatExplorer({ metrics, bqConnected, userEmail, userAvatar, modalMode, onChartSaved, editChartId: editChartIdProp }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser } = useUser();
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
  const [approvedDimensions, setApprovedDimensions] = useState(null); // null = not yet loaded; [] = loaded but empty
  const [currentTimeRange, setCurrentTimeRange] = useState(null);
  const [recentConversations, setRecentConversations] = useState([]);
  const [editingChartInfo, setEditingChartInfo] = useState(null);
  const { loadView } = useBqData();

  // Pre-load schemas (same pattern as Explorer)
  useEffect(() => {
    if (!bqConnected || !metrics.length || schemasLoaded) return;

    async function loadSchemas() {
      const viewMetrics = metrics.filter(m =>
        ['primitive', 'derived'].includes(m.metric_type) && m.view_name && m.status === 'live'
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

  // Load dashboards and approved dimensions
  useEffect(() => {
    fetchDashboards().then(setDashboards).catch(() => {});
    fetchAllApprovedDimensions().then(setApprovedDimensions).catch(() => {});
  }, []);

  // Load recent conversations
  useEffect(() => {
    if (userEmail) {
      loadConversations(userEmail).then(setRecentConversations).catch(() => {});
    }
  }, [userEmail]);

  // Build a chart from a spec (shared by editChart, time range change, and conversation restore)
  // Returns { chartOption } for regular charts, or { pivotData, pivotColumns } for pivot tables.
  const buildChartFromSpec = useCallback(async (spec, overrideLastNMonths) => {
    const { metricIds, echartsType, dataConfig, showLabels, colors } = spec;
    const channelFilter = dataConfig.channelFilter;
    const xField = dataConfig.xField;

    // Pivot table path: table + groupByDimension → dimension rows × metric columns
    if (echartsType === 'table' && dataConfig.groupByDimension) {
      const pivotResult = await fetchPivotData({ metricIds, metrics, dataConfig });
      if (!pivotResult.empty) return { pivotData: pivotResult.pivotData, pivotColumns: pivotResult.columns };
      return null;
    }

    // Year-over-Year: separate path (different return shape)
    if (echartsType === 'yoy') {
      const monthIndices = getMonthIndices(dataConfig.yoyMonths);
      const monthLabels = formatMonthLabels(monthIndices);
      const yoyMode = dataConfig.yoyMode || 'value';
      const rawDatasets = [];
      let valueFormat = null;
      for (let i = 0; i < metricIds.length; i++) {
        const metric = metrics.find(m => m.id === metricIds[i]);
        if (!metric?.view_name) continue;
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
              rawDatasets.push({ label: lbl, data: growth.data });
              valueFormat = 'percent';
            }
          } else {
            for (const year of yoyResult.years) {
              const lbl = metricIds.length === 1 ? year : `${metric.name} ${year}`;
              rawDatasets.push({ label: lbl, data: sliceSeries(yoyResult.seriesMap[year], monthIndices) });
            }
          }
        } catch { /* skip */ }
      }
      if (rawDatasets.length === 0) return null;
      return buildEChartsOption('yoy', monthLabels, rawDatasets, dataConfig, { showLabels, colors, valueFormat });
    }

    const chartData = await fetchChartDatasets({ metricIds, metrics, dataConfig, lastNMonthsOverride: overrideLastNMonths });
    if (!chartData || chartData.empty) return null;
    return { chartOption: buildEChartsOption(echartsType, chartData.labels, chartData.datasets, dataConfig, { showLabels, colors }) };
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
        const built = await buildChartFromSpec(spec);

        setLastSpec(spec);
        setCurrentTimeRange(dataConfig.lastNMonths || null);
        setEditingChartInfo({ id: chart.id, name: chart.name });
        setMessages([
          { role: 'assistant', content: `Editing "${chart.name}". You can modify this chart by describing changes.`, ...(built || {}) },
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
      const built = await buildChartFromSpec(lastSpec, months);
      if (built) {
        setMessages(prev => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].role === 'assistant' && (updated[i].chartOption || updated[i].pivotData)) {
              updated[i] = { ...updated[i], ...built };
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
        createdByUser: currentUser?.id,
        metricIds: lastSpec.metricIds,
        gwSpec: { ...lastSpec },
      });

      let targetDashboardId = dashboardId || addToDashboardId;
      if (newDashboardName) {
        const created = await createDashboard({ name: newDashboardName, createdBy: userEmail || 'anonymous', createdByUser: currentUser?.id });
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
      let result = await generateChartSpecWithHistory(updatedMessages, metrics, schemaCache, lastSpec, approvedDimensions);

      // If AI returned an invalid metric ID, retry with a correction message before giving up
      if (result.error) {
        let aiRetryMessages = [...updatedMessages];
        for (let attempt = 0; attempt < 2 && result.error; attempt++) {
          aiRetryMessages = [...aiRetryMessages, {
            role: 'user',
            content: `That returned an error: "${result.error}". Please choose a valid metric ID from the catalog provided — do not invent IDs that were not listed.`,
          }];
          const retried = await generateChartSpecWithHistory(aiRetryMessages, metrics, schemaCache, lastSpec, approvedDimensions);
          if (!retried.error) { result = retried; break; }
          result = retried;
        }
      }

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
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: errText,
          isError: true,
          queryDetails: [],
          aiSpec: result.metric_ids ? { metricIds: result.metric_ids, echartsType: result.echarts_type } : null,
        }]);
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
              if (!depMetric) continue;
              if (depMetric.view_name) {
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
              } else if (depMetric.chart_sql) {
                try {
                  const agg = await fetchChartData(depMetric, null, 'COUNT', 'month', channelFilter, null, null);
                  const now = new Date();
                  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                  const prevMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0')}`;
                  const curIdx = agg.labels.indexOf(curMonth);
                  const prevIdx = agg.labels.indexOf(prevMonth);
                  const current = curIdx >= 0 ? agg.data[curIdx] : 0;
                  const prior = prevIdx >= 0 ? agg.data[prevIdx] : 0;
                  depKpis[depId] = { current, prior, delta: current - prior, deltaPercent: prior !== 0 ? Math.round(((current - prior) / prior) * 1000) / 10 : 0 };
                  depDetails.push({ metricName: depMetric.name, metricId: depId, sql: depMetric.chart_sql, dateColumn: 'period', labels: ['current', 'prior'], data: [current, prior] });
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
          } else if (metric.chart_sql) {
            // chart_sql-only metric — execute the SQL and extract current/prior month values
            try {
              const agg = await fetchChartData(metric, null, yField, 'month', channelFilter, null, null);
              const now = new Date();
              const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
              const prevMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0')}`;
              const curIdx = agg.labels.indexOf(curMonth);
              const prevIdx = agg.labels.indexOf(prevMonth);
              const current = curIdx >= 0 ? agg.data[curIdx] : 0;
              const prior = prevIdx >= 0 ? agg.data[prevIdx] : 0;
              const delta = Math.round((current - prior) * 100) / 100;
              const deltaPercent = prior !== 0 ? Math.round((delta / prior) * 1000) / 10 : 0;
              kpiData.push({ metricName: label, value: current, delta, deltaPercent, isRate: false });
              collectedDetails.push({ metricName: label, metricId: metric.id, sql: metric.chart_sql, dateColumn: 'period', labels: ['current', 'prior'], data: [current, prior] });
            } catch (err) {
              kpiData.push({ metricName: label, value: 0, delta: 0, deltaPercent: 0, isRate: false, hasError: true });
              collectedDetails.push({ metricName: label, metricId: metric.id, sql: `ERROR: ${err.message}`, dateColumn: 'N/A', labels: [], data: [] });
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
            messages: allMessages.map(m => ({
              role: m.role,
              content: m.content,
              ...(m.aiSpec ? { aiSpec: m.aiSpec } : {}),
              ...(m.queryDetails ? { queryDetails: m.queryDetails.map(q => ({ metricName: q.metricName, metricId: q.metricId, sql: q.sql, dateColumn: q.dateColumn })) } : {}),
            })),
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
        const monthIndices = getMonthIndices(dataConfig.yoyMonths);
        const monthLabels = formatMonthLabels(monthIndices);
        const yoyMode = dataConfig.yoyMode || 'value';
        let valueFormat = null;
        for (let i = 0; i < result.metrics.length; i++) {
          const metric = result.metrics[i];
          if (!metric.view_name) continue;
          const yField = dataConfig.yFields[i] || dataConfig.yFields[0] || 'COUNT';
          const viewSchema = schemaCache[metric.view_name] || [];
          const dateCol = viewSchema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || xField;
          try {
            const yoyResult = await fetchYoYData(metric.view_name, dateCol, yField, channelFilter, dataConfig.yearFilter);
            if (yoyMode === 'growth_pct') {
              const growth = computeGrowthSeries(yoyResult.seriesMap, yoyResult.years, monthIndices);
              if (growth) {
                const lbl = result.metrics.length === 1
                  ? `${growth.latest} vs ${growth.prior}`
                  : `${metric.name} ${growth.latest} vs ${growth.prior}`;
                yoyDatasets.push({ label: lbl, data: growth.data });
                valueFormat = 'percent';
              }
            } else {
              for (const year of yoyResult.years) {
                const lbl = result.metrics.length === 1 ? year : `${metric.name} ${year}`;
                yoyDatasets.push({ label: lbl, data: sliceSeries(yoyResult.seriesMap[year], monthIndices) });
              }
            }
            yoyDetails.push({ metricName: metric.name, metricId: metric.id, sql: yoyResult.sql, dateColumn: dateCol, labels: monthLabels, data: [] });
          } catch { /* skip */ }
        }
        if (yoyDatasets.length === 0) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'No data loaded for year-over-year comparison.' }]);
          setLoading(false);
          return;
        }
        const chartOption = buildEChartsOption('yoy', monthLabels, yoyDatasets, dataConfig, {
          showLabels: result.showLabels,
          colors: result.colors,
          valueFormat,
        });
        const newSpec = { metricIds: result.metricIds, echartsType, dataConfig, showLabels: result.showLabels, colors: result.colors };
        setLastSpec(newSpec);
        setCurrentTimeRange(null);
        const assistantMsg = { role: 'assistant', content: result.explanation || '', chartOption, queryDetails: yoyDetails };
        const allMessages = [...updatedMessages, assistantMsg];
        setMessages(allMessages);
        try {
          const title = updatedMessages[0]?.content?.slice(0, 80) || 'Untitled';
          const saved = await saveConversation({ id: conversationId, userEmail: userEmail || 'anonymous', title, messages: allMessages.map(m => ({
              role: m.role,
              content: m.content,
              ...(m.aiSpec ? { aiSpec: m.aiSpec } : {}),
              ...(m.queryDetails ? { queryDetails: m.queryDetails.map(q => ({ metricName: q.metricName, metricId: q.metricId, sql: q.sql, dateColumn: q.dateColumn })) } : {}),
            })), currentChartSpec: newSpec });
          if (!conversationId && saved && saved.length > 0) setConversationId(saved[0].id);
          if (userEmail) loadConversations(userEmail).then(setRecentConversations).catch(() => {});
        } catch { /* non-critical */ }
        setLoading(false);
        return;
      }

      // Drill table: raw row-level query, no aggregation
      if (echartsType === 'drill_table') {
        const viewName = result.metrics[0]?.view_name;
        if (!viewName) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Drill table requires a metric with a view. Try a metric like New Net SaaS or Cancellations.' }]);
          setLoading(false);
          return;
        }
        try {
          const drillResult = await fetchDrillData(viewName, dataConfig.lastNMonths);
          const newSpec = { metricIds: result.metricIds, echartsType, dataConfig, showLabels: false, colors: null };
          setLastSpec(newSpec);
          const assistantMsg = {
            role: 'assistant',
            content: result.explanation || '',
            drillData: { rows: drillResult.rows, columns: drillResult.columns },
            queryDetails: [{ metricName: result.metrics[0].name, metricId: result.metrics[0].id, sql: drillResult.sql, dateColumn: 'N/A', labels: [], data: [] }],
          };
          const allMessages = [...updatedMessages, assistantMsg];
          setMessages(allMessages);
          try {
            const title = updatedMessages[0]?.content?.slice(0, 80) || 'Untitled';
            const saved = await saveConversation({ id: conversationId, userEmail: userEmail || 'anonymous', title, messages: allMessages.map(m => ({ role: m.role, content: m.content })), currentChartSpec: newSpec });
            if (!conversationId && saved?.length > 0) setConversationId(saved[0].id);
            if (userEmail) loadConversations(userEmail).then(setRecentConversations).catch(() => {});
          } catch { /* non-critical */ }
        } catch (e) {
          setMessages(prev => [...prev, { role: 'assistant', content: `Error loading drill data: ${e.message}` }]);
        }
        setLoading(false);
        return;
      }

      // Retry loop: if the query returns no data, feed the failure back to the AI and try again.
      // Pivot table path: table + groupByDimension → dimension rows × metric columns
      if (echartsType === 'table' && dataConfig.groupByDimension) {
        const pivotResult = await fetchPivotData({ metricIds: result.metricIds, metrics, dataConfig });
        const assistantMsg = {
          role: 'assistant',
          content: result.explanation || '',
          pivotData: pivotResult.pivotData,
          pivotColumns: pivotResult.columns,
          queryDetails: pivotResult.queryDetails,
          styleRules: dataConfig.styleRules || [],
        };
        const allMessages = [...updatedMessages, assistantMsg];
        setMessages(allMessages);
        setLoading(false);
        return;
      }

      const MAX_RETRIES = 2;
      let currentResult = result;
      let chartData = null;
      let retryMessages = [...updatedMessages];

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        chartData = await fetchChartDatasets({ metricIds: currentResult.metricIds, metrics, dataConfig: currentResult.dataConfig });
        if (chartData && !chartData.empty) break;

        if (attempt < MAX_RETRIES) {
          const failedDetails = chartData?.queryDetails || [];
          const failedSql = failedDetails.length > 0
            ? failedDetails.map(q => `Metric "${q.metricName}" (id:${q.metricId}): ${q.sql}`).join('\n')
            : `Metrics attempted: ${currentResult.metricIds.join(', ')}`;
          const correctionMessage = {
            role: 'user',
            content: `The previous chart returned no data. Here is what was attempted:\n${failedSql}\n\nPlease pick a different metric or adjust the configuration (e.g. use a different metric_id, correct group_by_dimension, or fix x_field).`,
          };
          retryMessages = [...retryMessages, correctionMessage];
          const corrected = await generateChartSpecWithHistory(retryMessages, metrics, schemaCache, currentResult, approvedDimensions);
          if (!corrected || corrected.error || corrected.type === 'text') break;
          currentResult = corrected;
        }
      }

      if (!chartData || chartData.empty) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'I wasn\'t able to load data for that request. Try rephrasing or ask about a different metric.' }]);
        setLoading(false);
        return;
      }

      // If a retry corrected the spec, update the variables derived from result
      if (currentResult !== result) {
        result.metricIds = currentResult.metricIds;
        result.metrics = currentResult.metrics;
        echartsType = currentResult.echartsType || echartsType;
        Object.assign(dataConfig, currentResult.dataConfig); // mutate in place (dataConfig = result.dataConfig, same ref)
        result.explanation = currentResult.explanation || result.explanation;
        result.showLabels = currentResult.showLabels;
        result.colors = currentResult.colors;
      }

      const { labels: finalLabels, datasets: finalDatasets, queryDetails: collectedDetails } = chartData;
      const newSpec = { metricIds: result.metricIds, echartsType, dataConfig, showLabels: result.showLabels, colors: result.colors };
      setLastSpec(newSpec);
      setCurrentTimeRange(dataConfig.lastNMonths != null ? dataConfig.lastNMonths : null);

      let assistantMsg;
      if (echartsType === 'table') {
        assistantMsg = {
          role: 'assistant',
          content: result.explanation || '',
          tableData: { labels: finalLabels, datasets: finalDatasets },
          queryDetails: collectedDetails,
          styleRules: dataConfig.styleRules || [],
        };
      } else {
        const chartOption = buildEChartsOption(echartsType, finalLabels, finalDatasets, dataConfig, { showLabels: result.showLabels, colors: result.colors });
        assistantMsg = {
          role: 'assistant',
          content: result.explanation || '',
          chartOption,
          queryDetails: collectedDetails,
          styleRules: dataConfig.styleRules || [],
          aiSpec: {
            metricIds: result.metricIds,
            echartsType,
            groupByDimension: dataConfig.groupByDimension,
            channelFilter: dataConfig.channelFilter,
            timeBucket: dataConfig.timeBucket,
            lastNMonths: dataConfig.lastNMonths,
            xField: dataConfig.xField,
            yFields: dataConfig.yFields,
            labels: dataConfig.labels,
          },
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
          messages: allMessages.map(m => ({
              role: m.role,
              content: m.content,
              ...(m.aiSpec ? { aiSpec: m.aiSpec } : {}),
              ...(m.queryDetails ? { queryDetails: m.queryDetails.map(q => ({ metricName: q.metricName, metricId: q.metricId, sql: q.sql, dateColumn: q.dateColumn })) } : {}),
            })),
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
        const built = await buildChartFromSpec(conv.current_chart_spec);
        if (built) {
          setMessages(prev => {
            const updated = [...prev];
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].role === 'assistant') {
                updated[i] = { ...updated[i], ...built };
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
      <div style={{ color: '#6b7280', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", padding: 40, textAlign: 'center' }}>
        Connect BigQuery to start chatting
      </div>
    );
  }

  if (!schemasLoaded) {
    return (
      <div style={{ color: '#6b7280', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", padding: 40, textAlign: 'center' }}>
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
        userEmail={userEmail}
      />
      {showSaveModal && (
        <SaveChartModal
          onSave={handleSaveConfirm}
          onClose={() => setShowSaveModal(false)}
          dashboards={dashboards}
          defaultName={editingChartInfo ? '' : suggestChartName(lastSpec, metrics)}
          editingChart={editingChartInfo}
          onUpdate={handleUpdateChart}
        />
      )}
    </>
  );
}
