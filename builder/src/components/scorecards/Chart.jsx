import React, { useMemo } from 'react';
import EChart from '../EChart';
import { resolveKpiValue } from './utils';

/**
 * Filter a time-series to a window: last N months up to current month.
 * Removes both old data and future forecast months.
 */
function filterToWindow(timeSeries, lastNMonths) {
  if (!timeSeries || !lastNMonths) return timeSeries;
  const now = new Date();
  const cutoffStart = new Date(now.getFullYear(), now.getMonth() - lastNMonths, 1);
  const startStr = `${cutoffStart.getFullYear()}-${String(cutoffStart.getMonth() + 1).padStart(2, '0')}`;
  const endStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const endStrDay = `${endStr}-31`;

  const filtered = { labels: [], data: [] };
  for (let i = 0; i < timeSeries.labels.length; i++) {
    const l = timeSeries.labels[i];
    const upperBound = l.length === 7 ? endStr : endStrDay;
    if (l >= startStr && l <= upperBound) {
      filtered.labels.push(l);
      filtered.data.push(timeSeries.data[i]);
    }
  }
  return filtered.labels.length > 0 ? filtered : null;
}

function getCurrentPeriodLabels() {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  // Current week (Monday)
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  const week = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { month, week };
}

function alignSeries(metricsData, ensureCurrentPeriod = false) {
  const allLabels = new Set();
  for (const { data } of metricsData) {
    if (data) data.labels.forEach(l => allLabels.add(l));
  }
  // Ensure current period is always present (shows 0 instead of missing)
  if (ensureCurrentPeriod && allLabels.size > 0) {
    const { month, week } = getCurrentPeriodLabels();
    const sample = [...allLabels][0];
    const currentLabel = sample.length === 7 ? month : week;
    allLabels.add(currentLabel);
  }
  const labels = [...allLabels].sort();

  const aligned = new Map();
  for (const { id, data } of metricsData) {
    if (!data) {
      aligned.set(id, labels.map(() => null));
      continue;
    }
    const lookup = {};
    data.labels.forEach((l, i) => { lookup[l] = data.data[i]; });
    aligned.set(id, labels.map(l => lookup[l] ?? null));
  }

  return { labels, aligned };
}

function formatLabel(l) {
  if (l.length === 7) {
    const [y, m] = l.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
  }
  if (l.length === 10) {
    const d = new Date(l + 'T00:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  }
  return l;
}

/**
 * Format a chart value for labels/tooltips/axis based on valueFormat.
 */
function fmtValue(v, valueFormat, opts = {}) {
  if (v == null) return '';
  const { short, axis } = opts;
  switch (valueFormat) {
    case 'decimal_rate':
      // raw decimal → percentage display
      return axis ? v : `${(v * 100).toFixed(short ? 0 : 2)}%`;
    case 'percent':
      // Value is already a percentage number (e.g. 95.5 meaning 95.5%)
      return axis ? `${v.toFixed(0)}%` : `${v.toFixed(short ? 0 : 2)}%`;
    case 'currency':
      if (axis) {
        if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(0)}K`;
        return `$${v.toFixed(0)}`;
      }
      return short
        ? `$${Number(v.toFixed(0)).toLocaleString()}`
        : `$${Number(v.toFixed(2)).toLocaleString()}`;
    case 'number':
      return axis ? v.toLocaleString() : Number(v.toFixed(0)).toLocaleString();
    default:
      return short ? v.toLocaleString() : String(v);
  }
}

export default function Chart({ config, dataMap }) {
  const option = useMemo(() => {
    const vf = config.valueFormat || 'number';

    // For weekly charts, look up data keyed as "id:week" for view-based metrics
    const getMetricData = (id) => {
      if (config.timeBucket === 'week' && typeof id === 'number') {
        return dataMap.get(`${id}:week`) || dataMap.get(id);
      }
      return dataMap.get(id);
    };

    const metricsData = config.metrics
      .filter(m => m.renderAs !== 'referenceLine')
      .map(m => ({
        id: m.id,
        data: filterToWindow(getMetricData(m.id), config.lastNMonths),
      }));

    const hasAny = metricsData.some(d => d.data != null);
    if (!hasAny) return null;

    const { labels, aligned } = alignSeries(metricsData, true);
    const displayLabels = labels.map(formatLabel);

    const series = [];
    for (const m of config.metrics) {
      if (m.renderAs === 'referenceLine') {
        const refData = dataMap.get(m.id);
        const refValue = resolveKpiValue(refData, 'current_month')
          ?? resolveKpiValue(refData, 'latest');

        if (refValue != null) {
          series.push({
            name: m.label,
            type: 'line',
            data: labels.map(() => refValue),
            lineStyle: { type: 'dashed', width: 2 },
            symbol: 'none',
            itemStyle: { color: m.color },
          });
        }
      } else {
        const values = aligned.get(m.id);
        const seriesType = m.chartType || config.chartType;
        const isLine = seriesType === 'line' && config.chartType === 'bar';
        series.push({
          name: m.label,
          type: seriesType,
          data: values,
          itemStyle: m.color ? { color: m.color } : undefined,
          ...(config.stacked ? { stack: 'total' } : {}),
          ...(isLine ? { lineStyle: { width: 2 }, symbol: 'circle', symbolSize: 4 } : {}),
          label: config.showLabels && !isLine ? {
            show: true,
            position: 'top',
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            formatter: (params) => fmtValue(params.value, vf, { short: true }),
          } : undefined,
        });
      }
    }

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params) => {
          let html = `<div style="font-weight:600;margin-bottom:4px">${params[0]?.axisValueLabel || ''}</div>`;
          for (const p of params) {
            if (p.value != null) {
              html += `<div>${p.marker} ${p.seriesName}: ${fmtValue(p.value, vf)}</div>`;
            }
          }
          return html;
        },
      },
      legend: {
        show: config.metrics.length > 1,
        top: 0,
        textStyle: { fontSize: 11 },
      },
      grid: { left: 60, right: 20, top: 40, bottom: 30 },
      xAxis: {
        type: 'category',
        data: displayLabels,
        axisLabel: { fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 10,
          formatter: (v) => fmtValue(v, vf, { axis: true }),
        },
      },
      series,
    };
  }, [config, dataMap]);

  if (!option) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', minHeight: 300, color: '#9ca3af', fontSize: 13,
      }}>
        No data available
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {config.label}
      </div>
      <div style={{ flex: 1, minHeight: 300 }}>
        <EChart option={option} style={{ height: '100%' }} />
      </div>
    </div>
  );
}
