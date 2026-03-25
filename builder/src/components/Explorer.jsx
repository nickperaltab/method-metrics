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
  chartContainer: { background: '#0c0f12', border: '1px solid #1a1e24', borderRadius: 8, overflow: 'hidden', height: 500 },
  schemasStatus: { color: '#5a6370', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' },
};

const schemaCache = {};

const ATT_COL_MAP = {
  SEO: 'Att_SEO', PPC: 'Att_Pay_Per_Click', OPN: 'Att_OPN_Other_Peoples_Networks',
  Social: 'Att_Social', Email: 'Att_Email', Referral: 'Att_Referral_Link',
  Direct: 'Att_Direct', Partners: 'Att_Partners', Content: 'Att_Content',
  Remarketing: 'Att_Remarketing', Other: 'Att_Other', None: 'Att_None',
};

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
    ...spec,
    chartType: spec.chartType || auto.chartType,
    xField: xValid ? spec.xField : auto.xField,
    yField: yValid ? spec.yField : auto.yField,
    colorField: spec.colorField && colNames.has(spec.colorField) ? spec.colorField : null,
  };
}

function safeDivide(a, b) {
  return b === 0 ? 0 : a / b;
}

function computeDerived(derived, depResults, xField, timeBucket) {
  // depResults: { [metricId]: rows[] }
  // Get time labels from first dependency
  const firstDepId = derived.depends_on[0];
  const firstRows = depResults[firstDepId] || [];
  const labels = [...new Set(firstRows.map(r => r[xField]))];

  const computed = [];
  for (const label of labels) {
    let formula = derived.formula;
    for (const depId of derived.depends_on) {
      const depRows = depResults[depId] || [];
      const matching = depRows.filter(r => r[xField] === label);
      const val = matching.length;
      formula = formula.replace(new RegExp(`\\{${depId}\\}`, 'g'), String(val));
    }
    // Replace SAFE_DIVIDE function
    formula = formula.replace(/SAFE_DIVIDE\(([^,]+),([^)]+)\)/g, (_, a, b) => {
      const numA = Number(a) || 0;
      const numB = Number(b) || 0;
      return String(safeDivide(numA, numB));
    });
    let value;
    try { value = Function('"use strict"; return (' + formula + ')')(); } catch { value = 0; }
    computed.push({ [xField]: label, value: Number(value) || 0 });
  }
  return computed;
}

function applyChannelFilter(rows, channelFilter) {
  if (!channelFilter) return rows;
  const col = ATT_COL_MAP[channelFilter];
  if (!col) return rows;
  // Only filter if the column exists in the data
  if (rows.length === 0 || !(col in rows[0])) return rows;
  return rows.filter(r => Number(r[col]) > 0);
}

export default function Explorer({ metrics, bqConnected, userEmail }) {
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [chartDatasets, setChartDatasets] = useState(null);
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
    return { rows, fields };
  }, [loadView]);

  const handleAiPrompt = useCallback(async (prompt) => {
    setAiLoading(true);
    setAiError(null);
    setAiExplanation(null);
    setChartDatasets(null);
    setChartData(null);
    try {
      const result = await generateChartSpec(prompt, metrics, schemaCache);
      if (result.error) {
        setAiError(result.suggestion ? `${result.error}. ${result.suggestion}` : result.error);
        return;
      }
      setAiExplanation(result.explanation);

      const isMultiMetric = result.metrics && result.metrics.length > 1;
      const channelFilter = result.channelFilter || null;

      if (isMultiMetric) {
        // Multi-metric: load data for each metric
        const datasets = [];
        let firstFields = null;

        for (const m of result.metrics) {
          // Check if this is a derived metric (has formula, no view_name)
          if (m.metric.formula && m.metric.depends_on && !m.metric.view_name) {
            const depResults = {};
            for (const depId of m.metric.depends_on) {
              const depMetric = metrics.find(dm => dm.id === depId);
              if (depMetric) {
                const depData = await loadMetricData(depMetric);
                if (depData) depResults[depId] = applyChannelFilter(depData.rows, channelFilter);
              }
            }
            const computed = computeDerived(m.metric, depResults, result.xField, result.timeBucket);
            datasets.push({ label: m.label || m.metric.name, data: computed });
          } else {
            const loaded = await loadMetricData(m.metric);
            if (loaded) {
              const filteredRows = applyChannelFilter(loaded.rows, channelFilter);
              datasets.push({ label: m.label || m.metric.name, data: filteredRows });
              if (!firstFields) firstFields = loaded.fields;
            }
          }
        }

        setChartDatasets(datasets);
        if (firstFields) setChartFields(firstFields);
        setSelectedMetric(result.metrics[0].metric);

        const aiSpec = {
          chartType: result.chartType || 'bar',
          xField: result.xField,
          yField: result.metrics[0].yField || 'COUNT',
          colorField: result.colorField || null,
          lastNMonths: result.lastNMonths || null,
          timeBucket: result.timeBucket || 'month',
        };
        if (firstFields) {
          setChartSpec(validateSpec(aiSpec, firstFields));
        } else {
          setChartSpec(aiSpec);
        }
      } else {
        // Single metric
        const m = result.metrics ? result.metrics[0] : { metric: result.metric, yField: result.yField, label: null };

        // Check if derived
        if (m.metric.formula && m.metric.depends_on && !m.metric.view_name) {
          const depResults = {};
          for (const depId of m.metric.depends_on) {
            const depMetric = metrics.find(dm => dm.id === depId);
            if (depMetric) {
              const depData = await loadMetricData(depMetric);
              if (depData) depResults[depId] = applyChannelFilter(depData.rows, channelFilter);
            }
          }
          const computed = computeDerived(m.metric, depResults, result.xField, result.timeBucket);
          setChartData(computed);
          setSelectedMetric(m.metric);
          setChartSpec({
            chartType: result.chartType || 'line',
            xField: result.xField,
            yField: 'value',
            colorField: null,
            lastNMonths: result.lastNMonths || null,
            timeBucket: result.timeBucket || 'month',
          });
        } else {
          const loaded = await loadMetricData(m.metric);
          if (loaded) {
            const filteredRows = applyChannelFilter(loaded.rows, channelFilter);
            setChartData(filteredRows);
            setChartFields(loaded.fields);
            setSelectedMetric(m.metric);
            const aiSpec = {
              chartType: result.chartType || 'bar',
              xField: result.xField,
              yField: m.yField || result.yField,
              colorField: result.colorField || null,
              lastNMonths: result.lastNMonths || null,
              timeBucket: result.timeBucket || 'month',
            };
            setChartSpec(validateSpec(aiSpec, loaded.fields));
          }
        }
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
  const hasChart = (chartData || chartDatasets) && chartSpec && !loading;

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
            <ChartRenderer
              data={chartData}
              datasets={chartDatasets}
              xField={chartSpec.xField}
              yField={chartSpec.yField}
              colorField={chartSpec.colorField}
              chartType={chartSpec.chartType}
              lastNMonths={chartSpec.lastNMonths}
              timeBucket={chartSpec.timeBucket}
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
