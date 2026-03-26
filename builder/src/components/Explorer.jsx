import React, { useState, useEffect, useCallback } from 'react';
import AiPrompt from './AiPrompt';
import EChart from './EChart';
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

const COLORS = ['#34d399', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#38bdf8', '#fb923c', '#e879f9', '#4ade80', '#f472b6'];

const ATT_COL_MAP = {
  SEO: 'Att_SEO', PPC: 'Att_Pay_Per_Click', OPN: 'Att_OPN_Other_Peoples_Networks',
  Social: 'Att_Social', Email: 'Att_Email', Referral: 'Att_Referral_Link',
  Direct: 'Att_Direct', Partners: 'Att_Partners', Content: 'Att_Content',
  Remarketing: 'Att_Remarketing', Other: 'Att_Other', None: 'Att_None',
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function castRow(row, fields) {
  const out = {};
  for (const f of fields) {
    const val = row[f.fid];
    out[f.fid] = f.semanticType === 'quantitative' && val != null ? Number(val) : val;
  }
  return out;
}

function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  const clean = s.replace(/\s+UTC$/i, '');
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d;
}

function toBucketKey(val, bucket) {
  const effective = bucket || 'month';
  const d = parseDate(val);
  if (!d) return String(val);
  if (effective === 'day') {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
  if (effective === 'week') {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const mm = String(monday.getMonth() + 1).padStart(2, '0');
    const dd = String(monday.getDate()).padStart(2, '0');
    return `${monday.getFullYear()}-${mm}-${dd}`;
  }
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}`;
}

function formatDateLabel(val) {
  if (!val || typeof val !== 'string') return val;
  if (/^\d{4}-\d{2}$/.test(val)) {
    const [y, m] = val.split('-');
    return `${MONTH_NAMES[parseInt(m, 10) - 1]} '${y.slice(2)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [, m, d] = val.split('-');
    return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
  }
  return val;
}

function looksLikeDate(val) {
  return val && typeof val === 'string' && /^\d{4}-\d{2}/.test(val.trim());
}

function aggregateRows(rows, xField, yField, timeBucket) {
  const isCount = yField === 'COUNT';
  const isDate = rows.length > 0 && looksLikeDate(rows[0]?.[xField]);
  const bucket = isDate ? (timeBucket || 'month') : null;
  const acc = {};

  for (const row of rows) {
    const rawX = row[xField];
    const key = bucket ? toBucketKey(rawX, bucket) : String(rawX ?? '');
    const numVal = isCount ? 1 : Number(row[yField]) || 0;
    acc[key] = (acc[key] || 0) + numVal;
  }

  const sorted = Object.entries(acc).sort((a, b) => (a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0));
  return {
    labels: sorted.map(([k]) => k),
    data: sorted.map(([, v]) => v),
  };
}

function computeDerived(derived, depResults, xField, timeBucket) {
  const bucket = timeBucket || 'month';

  const depAggregated = {};
  for (const depId of derived.depends_on) {
    const rows = depResults[depId] || [];
    const counts = {};
    for (const row of rows) {
      let key = row[xField];
      if (key && typeof key === 'string') {
        if (bucket === 'month' && /^\d{4}-\d{2}/.test(key)) {
          key = key.substring(0, 7);
        } else if (bucket === 'day') {
          key = key.substring(0, 10);
        }
      }
      counts[key] = (counts[key] || 0) + 1;
    }
    depAggregated[depId] = counts;
  }

  const allLabels = new Set();
  for (const counts of Object.values(depAggregated)) {
    Object.keys(counts).forEach(k => allLabels.add(k));
  }
  const sortedLabels = [...allLabels].sort();

  const computed = [];
  for (const label of sortedLabels) {
    let formula = derived.formula;
    for (const depId of derived.depends_on) {
      const val = depAggregated[depId]?.[label] || 0;
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
    computed.push({ [xField]: label, value: Math.round(value * 100) / 100 });
  }
  return computed;
}

function applyChannelFilter(rows, channelFilter) {
  if (!channelFilter) return rows;
  const col = ATT_COL_MAP[channelFilter];
  if (!col) return rows;
  if (rows.length === 0 || !(col in rows[0])) return rows;
  return rows.filter(r => Number(r[col]) > 0);
}

function applyLastNMonths(labels, datasets, lastNMonths, timeBucket) {
  if (!lastNMonths) return { labels, datasets };
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - lastNMonths, 1);
  const bucket = timeBucket || 'month';
  let cutoffKey;
  if (bucket === 'month') {
    cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;
  } else {
    cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  }
  const indices = [];
  const filteredLabels = [];
  labels.forEach((l, i) => {
    if (String(l) >= cutoffKey) {
      indices.push(i);
      filteredLabels.push(l);
    }
  });
  const filteredDatasets = datasets.map(ds => ({
    ...ds,
    data: indices.map(i => ds.data[i]),
  }));
  return { labels: filteredLabels, datasets: filteredDatasets };
}

/** Build a full ECharts option from chart type + aggregated data */
function buildEChartsOption(echartsType, labels, datasets, dataConfig) {
  const displayLabels = labels.map(formatDateLabel);
  const isDateAxis = labels.length > 0 && /^\d{4}-\d{2}/.test(String(labels[0]));
  const showLegend = datasets.length > 1;

  const baseTooltip = {
    trigger: 'axis',
    backgroundColor: '#111518',
    borderColor: '#1a1e24',
    textStyle: { color: '#c8cdd3', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 },
  };

  const baseGrid = { left: 60, right: 24, top: showLegend ? 40 : 16, bottom: 60, containLabel: false };

  const baseLegend = showLegend ? {
    show: true,
    textStyle: { color: '#c8cdd3' },
    top: 0,
  } : { show: false };

  const categoryAxis = {
    type: 'category',
    data: displayLabels,
    axisLine: { lineStyle: { color: '#1a1e24' } },
    axisTick: { lineStyle: { color: '#1a1e24' } },
    axisLabel: {
      color: '#5a6370',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11,
      rotate: displayLabels.length > 12 ? 45 : 0,
    },
  };

  const valueAxis = {
    type: 'value',
    axisLine: { lineStyle: { color: '#1a1e24' } },
    axisTick: { lineStyle: { color: '#1a1e24' } },
    axisLabel: {
      color: '#5a6370',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11,
      formatter: (v) => typeof v === 'number' && v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v,
    },
    splitLine: { lineStyle: { color: '#1a1e24', type: 'dashed' } },
  };

  // --- Line ---
  if (echartsType === 'line') {
    return {
      tooltip: baseTooltip,
      legend: baseLegend,
      grid: baseGrid,
      xAxis: categoryAxis,
      yAxis: valueAxis,
      series: datasets.map((ds, i) => ({
        name: ds.label,
        type: 'line',
        data: ds.data,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2 },
        itemStyle: { color: COLORS[i % COLORS.length] },
      })),
    };
  }

  // --- Area ---
  if (echartsType === 'area') {
    return {
      tooltip: baseTooltip,
      legend: baseLegend,
      grid: baseGrid,
      xAxis: categoryAxis,
      yAxis: valueAxis,
      series: datasets.map((ds, i) => ({
        name: ds.label,
        type: 'line',
        data: ds.data,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.15 },
        itemStyle: { color: COLORS[i % COLORS.length] },
      })),
    };
  }

  // --- Bar ---
  if (echartsType === 'bar') {
    return {
      tooltip: baseTooltip,
      legend: baseLegend,
      grid: baseGrid,
      xAxis: categoryAxis,
      yAxis: valueAxis,
      series: datasets.map((ds, i) => ({
        name: ds.label,
        type: 'bar',
        data: ds.data,
        itemStyle: { color: COLORS[i % COLORS.length], borderRadius: [3, 3, 0, 0] },
      })),
    };
  }

  // --- Stacked Bar ---
  if (echartsType === 'stacked_bar') {
    return {
      tooltip: baseTooltip,
      legend: baseLegend,
      grid: baseGrid,
      xAxis: categoryAxis,
      yAxis: valueAxis,
      series: datasets.map((ds, i) => ({
        name: ds.label,
        type: 'bar',
        stack: 'total',
        data: ds.data,
        itemStyle: { color: COLORS[i % COLORS.length] },
      })),
    };
  }

  // --- Horizontal Bar ---
  if (echartsType === 'horizontal_bar') {
    return {
      tooltip: baseTooltip,
      legend: baseLegend,
      grid: { ...baseGrid, left: 120 },
      xAxis: valueAxis,
      yAxis: { ...categoryAxis, inverse: true },
      series: datasets.map((ds, i) => ({
        name: ds.label,
        type: 'bar',
        data: ds.data,
        itemStyle: { color: COLORS[i % COLORS.length], borderRadius: [0, 3, 3, 0] },
      })),
    };
  }

  // --- Pie ---
  if (echartsType === 'pie') {
    const pieData = labels.map((l, i) => ({
      name: formatDateLabel(l),
      value: datasets[0]?.data[i] || 0,
    }));
    return {
      tooltip: { ...baseTooltip, trigger: 'item' },
      legend: { ...baseLegend, show: true, type: 'scroll', bottom: 0 },
      series: [{
        type: 'pie',
        radius: ['35%', '65%'],
        center: ['50%', '45%'],
        data: pieData,
        label: { color: '#c8cdd3', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
      }],
    };
  }

  // --- Funnel ---
  if (echartsType === 'funnel') {
    const funnelData = datasets.map((ds, i) => ({
      name: ds.label,
      value: ds.data.reduce((a, b) => a + b, 0),
    }));
    return {
      tooltip: { ...baseTooltip, trigger: 'item' },
      legend: { ...baseLegend, show: true },
      series: [{
        type: 'funnel',
        left: '10%',
        top: 40,
        bottom: 20,
        width: '80%',
        sort: 'descending',
        gap: 2,
        label: { show: true, position: 'inside', color: '#fff', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 },
        data: funnelData,
      }],
    };
  }

  // --- Combo (bar + line) ---
  if (echartsType === 'combo') {
    return {
      tooltip: baseTooltip,
      legend: baseLegend,
      grid: baseGrid,
      xAxis: categoryAxis,
      yAxis: [valueAxis, { ...valueAxis, splitLine: { show: false } }],
      series: datasets.map((ds, i) => {
        const isLast = i === datasets.length - 1 && datasets.length > 1;
        return {
          name: ds.label,
          type: isLast ? 'line' : 'bar',
          yAxisIndex: isLast ? 1 : 0,
          data: ds.data,
          smooth: isLast,
          symbol: isLast ? 'none' : undefined,
          lineStyle: isLast ? { width: 2 } : undefined,
          itemStyle: { color: COLORS[i % COLORS.length], ...(isLast ? {} : { borderRadius: [3, 3, 0, 0] }) },
        };
      }),
    };
  }

  // --- Heatmap ---
  if (echartsType === 'heatmap') {
    // For heatmap, use first dataset only; labels on x, dataset labels on y
    const yLabels = datasets.map(ds => ds.label);
    const heatData = [];
    datasets.forEach((ds, yi) => {
      ds.data.forEach((val, xi) => {
        heatData.push([xi, yi, val || 0]);
      });
    });
    const maxVal = Math.max(...heatData.map(d => d[2]), 1);
    return {
      tooltip: { ...baseTooltip, trigger: 'item', formatter: (p) => `${displayLabels[p.data[0]]} / ${yLabels[p.data[1]]}: ${p.data[2]}` },
      grid: { ...baseGrid, left: 120 },
      xAxis: categoryAxis,
      yAxis: { type: 'category', data: yLabels, axisLine: { lineStyle: { color: '#1a1e24' } }, axisLabel: { color: '#5a6370', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 } },
      visualMap: { min: 0, max: maxVal, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: ['#0c0f12', '#34d399'] }, textStyle: { color: '#5a6370' } },
      series: [{ type: 'heatmap', data: heatData, label: { show: false }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } } }],
    };
  }

  // Fallback: bar
  return {
    tooltip: baseTooltip,
    legend: baseLegend,
    grid: baseGrid,
    xAxis: categoryAxis,
    yAxis: valueAxis,
    series: datasets.map((ds, i) => ({
      name: ds.label,
      type: 'bar',
      data: ds.data,
      itemStyle: { color: COLORS[i % COLORS.length], borderRadius: [3, 3, 0, 0] },
    })),
  };
}

export default function Explorer({ metrics, bqConnected, userEmail }) {
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [chartOption, setChartOption] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiExplanation, setAiExplanation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [schemasLoaded, setSchemasLoaded] = useState(false);
  const [lastSpec, setLastSpec] = useState(null);
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
    setChartOption(null);
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

      for (let i = 0; i < result.metrics.length; i++) {
        const metric = result.metrics[i];
        const yField = dataConfig.yFields[i] || dataConfig.yFields[0] || 'COUNT';
        const label = dataConfig.labels[i] || metric.name;

        if (metric.formula && metric.depends_on && !metric.view_name) {
          // Derived metric
          const depResults = {};
          for (const depId of metric.depends_on) {
            const depMetric = metrics.find(dm => dm.id === depId);
            if (depMetric) {
              const depData = await loadMetricData(depMetric);
              if (depData) depResults[depId] = applyChannelFilter(depData.rows, channelFilter);
            }
          }
          const computed = computeDerived(metric, depResults, xField, timeBucket);
          // computed is [{xField: label, value: num}, ...]
          const agg = {
            labels: computed.map(r => r[xField]),
            data: computed.map(r => r.value),
          };
          rawDatasets.push({ label, ...agg });
        } else {
          const loaded = await loadMetricData(metric);
          if (loaded) {
            const filteredRows = applyChannelFilter(loaded.rows, channelFilter);
            const agg = aggregateRows(filteredRows, xField, yField, timeBucket);
            rawDatasets.push({ label, ...agg });
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

      // Apply lastNMonths filter
      const { labels: finalLabels, datasets: finalDatasets } = applyLastNMonths(
        allLabels, alignedDatasets, dataConfig.lastNMonths, timeBucket
      );

      // Build ECharts option
      const option = buildEChartsOption(echartsType, finalLabels, finalDatasets, dataConfig);
      setChartOption(option);
      setSelectedMetric(result.metrics[0]);
      setLastSpec({ metricIds: result.metricIds, echartsType, dataConfig });
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  }, [metrics, loadMetricData]);

  const handleSave = useCallback(async () => {
    if (!selectedMetric || !lastSpec) return;
    const name = window.prompt('Name this chart:');
    if (!name) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      await saveChart({
        name,
        createdBy: userEmail || 'anonymous',
        metricIds: lastSpec.metricIds,
        gwSpec: { ...lastSpec },
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setAiError(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [selectedMetric, lastSpec, userEmail]);

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
