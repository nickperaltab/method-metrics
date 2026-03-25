import React, { useState, useRef, useCallback } from 'react';
import { GraphicWalker } from '@kanaries/graphic-walker';
import MetricPicker from './MetricPicker';
import AiPrompt from './AiPrompt';
import { useBqData } from '../hooks/useBqData';
import { mapBqSchemaToGwFields } from '../lib/fieldMapper';
import { generateChartSpec } from '../lib/ai';

const styles = {
  layout: { display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, padding: 24, minHeight: 'calc(100vh - 52px)' },
  main: { display: 'flex', flexDirection: 'column', gap: 16 },
  status: { color: '#5a6370', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", padding: 20, textAlign: 'center' },
  gwContainer: { flex: 1, background: '#0c0f12', border: '1px solid #1a1e24', borderRadius: 8, overflow: 'hidden', minHeight: 500 },
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

export default function Explorer({ grouped, metrics, bqConnected }) {
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [gwData, setGwData] = useState(null);
  const [gwFields, setGwFields] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiExplanation, setAiExplanation] = useState(null);
  const storeRef = useRef(null);
  const { loading: dataLoading, error: dataError, loadView } = useBqData();

  const loadMetricData = useCallback(async (metric) => {
    if (!metric.view_name) return null;
    const result = await loadView(metric.view_name);
    if (!result) return null;
    schemaCache[metric.view_name] = result.schema;
    const fields = mapBqSchemaToGwFields(result.schema);
    const rows = result.rows.map(row => castRow(row, fields));
    setGwData(rows);
    setGwFields(fields);
    setSelectedMetric(metric);
    return { rows, fields };
  }, [loadView]);

  const handleSelectMetric = useCallback((metric) => {
    setAiError(null);
    setAiExplanation(null);
    loadMetricData(metric);
  }, [loadMetricData]);

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
      await loadMetricData(result.metric);
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  }, [metrics, loadMetricData]);

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
        {gwData && gwFields && !loading && (
          <div style={styles.gwContainer}>
            <GraphicWalker data={gwData} rawFields={gwFields} dark="dark" storeRef={storeRef} />
          </div>
        )}
      </div>
    </div>
  );
}
