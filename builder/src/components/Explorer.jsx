import React, { useState, useRef, useCallback } from 'react';
import { GraphicWalker } from '@kanaries/graphic-walker';
import MetricPicker from './MetricPicker';
import { useBqData } from '../hooks/useBqData';
import { mapBqSchemaToGwFields } from '../lib/fieldMapper';

const styles = {
  layout: {
    display: 'grid',
    gridTemplateColumns: '260px 1fr',
    gap: 20,
    padding: 24,
    minHeight: 'calc(100vh - 52px)',
  },
  main: { display: 'flex', flexDirection: 'column', gap: 16 },
  status: {
    color: '#5a6370',
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    padding: 20,
    textAlign: 'center',
  },
  error: { color: '#f87171', fontSize: 12, padding: '8px 12px' },
  gwContainer: {
    flex: 1,
    background: '#0c0f12',
    border: '1px solid #1a1e24',
    borderRadius: 8,
    overflow: 'hidden',
    minHeight: 500,
  },
};

export default function Explorer({ grouped, bqConnected }) {
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [gwData, setGwData] = useState(null);
  const [gwFields, setGwFields] = useState(null);
  const storeRef = useRef(null);
  const { loading, error, loadView } = useBqData();

  const handleSelectMetric = useCallback(async (metric) => {
    setSelectedMetric(metric);
    if (!metric.view_name) return;

    const result = await loadView(metric.view_name);
    if (!result) return;

    const fields = mapBqSchemaToGwFields(result.schema);
    // Cast numeric strings from BQ to actual numbers for GW
    const rows = result.rows.map(row => {
      const out = {};
      for (const f of fields) {
        const val = row[f.fid];
        if (f.semanticType === 'quantitative') {
          out[f.fid] = val != null ? Number(val) : null;
        } else {
          out[f.fid] = val;
        }
      }
      return out;
    });

    setGwData(rows);
    setGwFields(fields);
  }, [loadView]);

  return (
    <div style={styles.layout}>
      <MetricPicker
        grouped={grouped}
        selectedMetricId={selectedMetric?.id}
        onSelect={handleSelectMetric}
      />
      <div style={styles.main}>
        {error && <div style={styles.error}>{error}</div>}

        {!bqConnected && (
          <div style={styles.status}>Connect BigQuery to start exploring</div>
        )}

        {bqConnected && !selectedMetric && (
          <div style={styles.status}>Select a metric from the sidebar</div>
        )}

        {loading && <div style={styles.status}>Loading data...</div>}

        {gwData && gwFields && (
          <div style={styles.gwContainer}>
            <GraphicWalker
              data={gwData}
              rawFields={gwFields}
              dark="dark"
              storeRef={storeRef}
            />
          </div>
        )}
      </div>
    </div>
  );
}
