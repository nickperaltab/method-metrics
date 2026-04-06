import React, { useMemo } from 'react';
import EChart from '../EChart';
import { resolveKpiValue } from './utils';

/**
 * Filter a time-series to only include the last N months from today.
 */
function filterLastNMonths(timeSeries, lastNMonths) {
  if (!timeSeries || !lastNMonths) return timeSeries;
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - lastNMonths, 1);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;

  const filtered = { labels: [], data: [] };
  for (let i = 0; i < timeSeries.labels.length; i++) {
    // Compare as string — works for both YYYY-MM and YYYY-MM-DD
    if (timeSeries.labels[i] >= cutoffStr) {
      filtered.labels.push(timeSeries.labels[i]);
      filtered.data.push(timeSeries.data[i]);
    }
  }
  return filtered.labels.length > 0 ? filtered : null;
}

/**
 * Align multiple time-series to a common set of labels.
 */
function alignSeries(metricsData) {
  const allLabels = new Set();
  for (const { data } of metricsData) {
    if (data) data.labels.forEach(l => allLabels.add(l));
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

export default function Chart({ config, dataMap }) {
  const option = useMemo(() => {
    // Collect and filter data for each metric
    const metricsData = config.metrics
      .filter(m => m.renderAs !== 'referenceLine')
      .map(m => ({
        id: m.id,
        data: filterLastNMonths(dataMap.get(m.id), config.lastNMonths),
      }));

    const hasAny = metricsData.some(d => d.data != null);
    if (!hasAny) return null;

    const { labels, aligned } = alignSeries(metricsData);
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
        series.push({
          name: m.label,
          type: config.chartType,
          data: values,
          itemStyle: m.color ? { color: m.color } : undefined,
          label: config.showLabels ? {
            show: true,
            position: 'top',
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            formatter: (params) => {
              if (params.value == null) return '';
              // Display as percentage: 0.176 → "18%"
              return `${(params.value * 100).toFixed(0)}%`;
            },
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
              html += `<div>${p.marker} ${p.seriesName}: ${(p.value * 100).toFixed(2)}%</div>`;
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
      grid: { left: 50, right: 20, top: 40, bottom: 30 },
      xAxis: {
        type: 'category',
        data: displayLabels,
        axisLabel: { fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 10,
          // Show raw decimal values like Looker: 0, 0.05, 0.10, 0.15...
          formatter: (v) => v,
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
