import React, { useState, useEffect, useCallback } from 'react';
import AiPrompt from './AiPrompt';
import ChartRenderer from './ChartRenderer';
import { useBqData } from '../hooks/useBqData';
import { mapBqSchemaToGwFields } from '../lib/fieldMapper';
import { generateChartSpec } from '../lib/ai';
import { saveChart } from '../lib/supabase';
import { queryBq } from '../lib/bigquery';

const styles = {
  layout: { padding: 24, maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 'calc(100vh - 52px)' },
  status: { color: '#5a6370', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", padding: 40, textAlign: 'center' },
  chartContainer: { flex: 1, background: '#0c0f12', border: '1px solid #1a1e24', borderRadius: 8, overflow: 'hidden', minHeight: 500 },
  schemasStatus: { color: '#5a6370', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' },
};

const schemaCache = {};

function castRow(row, fields) {
  const out = {};
  for (const f of fields) {
    const val = row[f.fid];
    out[f.fid] = f.semanticType === 'quantitative' && val != null ? Number(val) : val;
  }
  return out;
}

// Auto-detect best x/y fields from actual data columns
function autoDetectSpec(fields) {
  const temporal = fields.find(f => f.semanticType === 'temporal');
  const quantitative = fields.find(f => f.semanticType === 'quantitative');
  const nominal = fields.find(f => f.semanticType === 'nominal');
  return {
    chartType: temporal ? 'line' : 'bar',
    xField: (temporal || nominal)?.fid || fields[0]?.fid,
    yField: quantitative?.fid || 'COUNT',
    colorField: null,
  };
}

// Validate AI field names against actual columns, fallback to auto-detect
function validateSpec(spec, fields) {
  const colNames = new Set(fields.map(f => f.fid));
  colNames.add('COUNT');
  const xValid = colNames.has(spec.xField);
  const yValid = colNames.has(spec.yField);
  if (xValid && yValid) return spec;
  // Fallback
  const auto = autoDetectSpec(fields);
  return {
    chartType: spec.chartType || auto.chartType,
    xField: xValid ? spec.xField : auto.xField,
    yField: yValid ? spec.yField : auto.yField,
    colorField: spec.colorField && colNames.has(spec.colorField) ? spec.colorField : null,
  };
}

export default function Explorer({ metrics, bqConnected, userEmail }) {
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [chartFields, setChartFields] = useState(null);
  const [chartSpec, setChartSpec] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiExplanation, setAiExplanation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [schemasLoaded, setSchemasLoaded] = useState(false);
  const { loading: dataLoading, error: dataError, loadView } = useBqData();

  // Pre-load schemas for all primitive/foundational metrics on BQ connect
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
    setChartData(rows);
    setChartFields(fields);
    setSelectedMetric(metric);
    return { rows, fields };
  }, [loadView]);

  const handleAiPrompt = useCallback(async (prompt) => {
    setAiLoading(true);
    setAiError(null);
    setAiExplanation(null);
    try {
      const result = await generateChartSpec(prompt, metrics, schemaCache);
      if (result.error) {
        setAiError(result.suggestion ? `${result.error}. ${result.suggestion}` : result.error);
        return;
      }
      setAiExplanation(result.explanation);
      const loaded = await loadMetricData(result.metric);
      if (loaded) {
        const aiSpec = {
          chartType: result.chartType || 'bar',
          xField: result.xField,
          yField: result.yField,
          colorField: result.colorField || null,
        };
        setChartSpec(validateSpec(aiSpec, loaded.fields));
      }
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  }, [metrics, loadMetricData]);

  const handleSave = useCallback(async () => {
    if (!selectedMetric || !chartSpec) return;
    const name = window.prompt('Name this chart:');
    if (!name) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      await saveChart({
        name,
        createdBy: userEmail || 'anonymous',
        metricIds: [selectedMetric.id],
        gwSpec: { ...chartSpec },
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setAiError(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [selectedMetric, chartSpec, userEmail]);

  const loading = dataLoading || aiLoading;

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
      {chartData && chartSpec && !loading && (
        <>
          <div style={styles.chartContainer}>
            <ChartRenderer
              data={chartData}
              xField={chartSpec.xField}
              yField={chartSpec.yField}
              colorField={chartSpec.colorField}
              chartType={chartSpec.chartType}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
            {saveSuccess && <span style={{ color: '#34d399', fontSize: 12 }}>Saved!</span>}
            <button onClick={handleSave} disabled={saving} style={{
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
    </div>
  );
}
