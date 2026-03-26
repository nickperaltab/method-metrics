import React, { useState, useEffect, useCallback } from 'react';
import ChatInterface from './ChatInterface';
import { useBqData } from '../hooks/useBqData';
import { mapBqSchemaToGwFields } from '../lib/fieldMapper';
import { generateChartSpecWithHistory } from '../lib/ai';
import { saveConversation } from '../lib/supabase';
import { queryBq, fetchAggregatedData, fetchViewData } from '../lib/bigquery';
import {
  castRow,
  aggregateRows,
  computeDerived,
  applyChannelFilter,
  applyLastNMonths,
  buildEChartsOption,
} from '../lib/chartUtils';
import schemaCache from '../lib/schemaCache';

export default function ChatExplorer({ metrics, bqConnected, userEmail }) {
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastSpec, setLastSpec] = useState(null);
  const [schemasLoaded, setSchemasLoaded] = useState(false);
  const { loadView } = useBqData();

  // Pre-load schemas (same pattern as Explorer)
  useEffect(() => {
    if (!bqConnected || !metrics.length || schemasLoaded) return;

    async function loadSchemas() {
      const viewMetrics = metrics.filter(m =>
        ['primitive', 'foundational'].includes(m.metric_type) && m.view_name
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

      if (result.error) {
        const errText = result.suggestion ? `${result.error}. ${result.suggestion}` : result.error;
        setMessages(prev => [...prev, { role: 'assistant', content: errText }]);
        setLoading(false);
        return;
      }

      const { dataConfig, echartsType } = result;
      const channelFilter = dataConfig.channelFilter;
      const xField = dataConfig.xField;
      const timeBucket = dataConfig.timeBucket;

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
          } catch (err) {
            // Always log the error for debugging
            collectedDetails.push({
              metricName: label,
              metricId: metric.id,
              sql: `ERROR: ${err.message || 'Query failed'}`,
              dateColumn: dateCol,
              labels: [],
              data: [],
            });
            // Try client-side fallback
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

      const chartOption = buildEChartsOption(echartsType, finalLabels, finalDatasets, dataConfig);

      const newSpec = { metricIds: result.metricIds, echartsType, dataConfig };
      setLastSpec(newSpec);

      const assistantMsg = {
        role: 'assistant',
        content: result.explanation || '',
        chartOption,
        queryDetails: collectedDetails,
      };
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
  }, []);

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
    <ChatInterface
      messages={messages}
      onSend={handleSend}
      loading={loading}
      onNewThread={handleNewThread}
    />
  );
}
