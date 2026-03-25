import React, { useState, useCallback } from 'react';
import MetricPicker from './MetricPicker';
import AiPrompt from './AiPrompt';
import ChartRenderer from './ChartRenderer';
import { useBqData } from '../hooks/useBqData';
import { mapBqSchemaToGwFields } from '../lib/fieldMapper';
import { generateChartSpec } from '../lib/ai';
import { saveChart } from '../lib/supabase';

const styles = {
  layout: { display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, padding: 24, minHeight: 'calc(100vh - 52px)' },
  main: { display: 'flex', flexDirection: 'column', gap: 16 },
  status: { color: '#5a6370', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", padding: 20, textAlign: 'center' },
  chartContainer: { flex: 1, background: '#0c0f12', border: '1px solid #1a1e24', borderRadius: 8, overflow: 'hidden', minHeight: 500 },
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

export default function Explorer({ grouped, metrics, bqConnected, userEmail }) {
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [chartFields, setChartFields] = useState(null);
  const [chartSpec, setChartSpec] = useState(null); // { chartType, xField, yField, colorField }
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiExplanation, setAiExplanation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const { loading: dataLoading, error: dataError, loadView } = useBqData();

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

  const deriveDefaultSpec = useCallback((fields) => {
    const temporal = fields.find(f => f.semanticType === 'temporal');
    const nominal = fields.find(f => f.semanticType === 'nominal');
    const quantitative = fields.find(f => f.semanticType === 'quantitative');
    const xField = (temporal || nominal)?.fid || fields[0]?.fid;
    const yField = quantitative?.fid || fields[1]?.fid || fields[0]?.fid;
    return { chartType: 'bar', xField, yField, colorField: null };
  }, []);

  const handleSelectMetric = useCallback(async (metric) => {
    setAiError(null);
    setAiExplanation(null);
    setChartSpec(null);
    const result = await loadMetricData(metric);
    if (result) {
      setChartSpec(deriveDefaultSpec(result.fields));
    }
  }, [loadMetricData, deriveDefaultSpec]);

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
        setChartSpec({
          chartType: result.chart_type || result.chartType || 'bar',
          xField: result.x_field || result.xField,
          yField: result.y_field || result.yField,
          colorField: result.color_field || result.colorField || null,
        });
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
      <MetricPicker grouped={grouped} selectedMetricId={selectedMetric?.id} onSelect={handleSelectMetric} />
      <div style={styles.main}>
        {bqConnected && (
          <AiPrompt onResult={handleAiPrompt} loading={aiLoading} error={aiError} explanation={aiExplanation} />
        )}
        {!bqConnected && <div style={styles.status}>Connect BigQuery to start exploring</div>}
        {bqConnected && !selectedMetric && !loading && (
          <div style={styles.status}>Describe a chart above, or select a metric from the sidebar</div>
        )}
        {loading && <div style={styles.status}>Loading...</div>}
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
    </div>
  );
}
