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
      return axis ? Math.round(v).toLocaleString() : Number(v.toFixed(0)).toLocaleString();
    default:
      return short ? v.toLocaleString() : String(v);
  }
}

function ChartInspectMenu({ metrics, customMetrics = [], valueFormat, onMetricClick }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const allItems = [
    ...metrics.map(m => ({ id: m.id, label: m.label, isCustom: false })),
    ...customMetrics.map(m => ({ id: m.id, label: m.label, isCustom: true, sql: m.customSql })),
  ];

  React.useEffect(() => {
    if (!open) return;
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (allItems.length === 1 && !allItems[0].isCustom) {
    return (
      <span
        onClick={() => onMetricClick(allItems[0].id, null, valueFormat)}
        style={{ fontSize: 14, color: '#9ca3af', cursor: 'pointer', transition: 'color 100ms' }}
        onMouseEnter={e => { e.target.style.color = '#2563eb'; }}
        onMouseLeave={e => { e.target.style.color = '#9ca3af'; }}
      >
        ⓘ
      </span>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <span
        onClick={() => setOpen(!open)}
        style={{ fontSize: 14, color: open ? '#2563eb' : '#9ca3af', cursor: 'pointer', transition: 'color 100ms' }}
        onMouseEnter={e => { e.target.style.color = '#2563eb'; }}
        onMouseLeave={e => { if (!open) e.target.style.color = '#9ca3af'; }}
      >
        ⓘ
      </span>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          background: '#fff', border: '1px solid #e2e5e9', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 200, padding: '4px 0',
        }}>
          {allItems.map(item => (
            <div
              key={item.id}
              onClick={() => {
                if (item.isCustom) {
                  // Pass custom SQL info via a special convention
                  onMetricClick(`custom:${item.id}`, null, valueFormat, { label: item.label, sql: item.sql });
                } else {
                  onMetricClick(item.id, null, valueFormat);
                }
                setOpen(false);
              }}
              style={{
                padding: '6px 12px', fontSize: 12, color: '#374151', cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f0f4ff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              {item.label}
              {item.isCustom && (
                <span style={{ fontSize: 9, color: '#9ca3af', fontFamily: "'JetBrains Mono', monospace" }}>SQL</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Chart({ config, dataMap, onMetricClick, filterLastNMonths }) {
  const option = useMemo(() => {
    const vf = config.valueFormat || 'number';
    // Date filter: override config.lastNMonths when user selects a preset
    const effectiveLastNMonths = filterLastNMonths ?? config.lastNMonths;

    // YoY chart — current year vs prior year, grouped bars by month
    if (config.yoy) {
      const metric = config.metrics?.[0];
      if (!metric) return null;
      const yoyData = dataMap.get(`${metric.id}:yoy`);
      if (!yoyData?.labels?.length) return null;

      // Group data by year → month
      const byYear = {};
      yoyData.labels.forEach((label, i) => {
        const year = parseInt(label.slice(0, 4), 10);
        const month = label.slice(5, 7);
        if (!byYear[year]) byYear[year] = {};
        byYear[year][month] = yoyData.data[i];
      });

      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      // All months that appear across any year
      const allMonths = new Set(yoyData.labels.map(l => l.slice(5, 7)));
      const months = [...allMonths].sort();
      const displayMonths = months.map(m => monthNames[parseInt(m, 10) - 1]);

      // Show all years in ascending order, color from light → dark blue
      const years = Object.keys(byYear).map(Number).sort();
      const yearColors = ['#bfdbfe', '#93c5fd', '#60a5fa', '#2563eb'];
      const series = years.map((year, i) => ({
        name: String(year),
        type: 'bar',
        data: months.map(m => byYear[year]?.[m] ?? null),
        itemStyle: { color: yearColors[Math.max(0, yearColors.length - years.length + i)] },
      }));

      if (!series.length) return null;

      return {
        tooltip: {
          trigger: 'axis',
          formatter: (params) => {
            let html = `<div style="font-weight:600;margin-bottom:4px">${params[0]?.axisValueLabel || ''}</div>`;
            for (const p of params) {
              if (p.value != null) html += `<div>${p.marker} ${p.seriesName}: ${fmtValue(p.value, vf)}</div>`;
            }
            return html;
          },
        },
        legend: { show: true, top: 0, textStyle: { fontSize: 11 } },
        grid: { left: 60, right: 20, top: 40, bottom: 30 },
        xAxis: { type: 'category', data: displayMonths, axisLabel: { fontSize: 10 } },
        yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: (v) => fmtValue(v, vf, { axis: true }) } },
        series,
      };
    }

    // Grouped dimension chart — multi-series, one series per dimension value
    if (config.groupByDimension) {
      const metric = config.metrics?.[0];
      if (!metric) return null;
      const rawGrouped = dataMap.get(`${metric.id}:grouped:${config.groupByDimension}`);
      if (!rawGrouped?.seriesMap || Object.keys(rawGrouped.seriesMap).length === 0) return null;

      // Apply date filter to grouped data
      let grouped = rawGrouped;
      if (effectiveLastNMonths) {
        const now = new Date();
        const cutoff = new Date(now.getFullYear(), now.getMonth() - effectiveLastNMonths, 1);
        const startStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;
        const endStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const keepIdx = rawGrouped.labels.map((l, i) => (l >= startStr && l <= endStr ? i : -1)).filter(i => i >= 0);
        if (keepIdx.length > 0) {
          const filteredSeriesMap = {};
          for (const [dim, vals] of Object.entries(rawGrouped.seriesMap)) {
            filteredSeriesMap[dim] = keepIdx.map(i => vals[i]);
          }
          grouped = { labels: keepIdx.map(i => rawGrouped.labels[i]), seriesMap: filteredSeriesMap };
        }
      }

      const PALETTE = ['#2563eb','#059669','#f59e0b','#e84393','#8b5cf6','#0891b2','#dc2626','#65a30d','#7c3aed','#0284c7','#b45309','#0f766e'];
      // Sort dimension values by total volume descending
      const dimValues = Object.keys(grouped.seriesMap).sort((a, b) => {
        const aTotal = grouped.seriesMap[a].reduce((s, v) => s + (v || 0), 0);
        const bTotal = grouped.seriesMap[b].reduce((s, v) => s + (v || 0), 0);
        return bTotal - aTotal;
      });
      const displayLabels = grouped.labels.map(formatLabel);

      const groupedSeries = dimValues.map((dim, i) => ({
        name: dim,
        type: config.chartType || 'bar',
        data: grouped.seriesMap[dim],
        itemStyle: { color: PALETTE[i % PALETTE.length] },
        ...(config.stacked ? { stack: 'total' } : {}),
      }));

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
        legend: { show: true, top: 0, type: 'scroll', textStyle: { fontSize: 11 } },
        grid: { left: 60, right: 20, top: 40, bottom: 30 },
        xAxis: { type: 'category', data: displayLabels, axisLabel: { fontSize: 10 } },
        yAxis: {
          type: 'value',
          axisLabel: { fontSize: 10, formatter: (v) => fmtValue(v, vf, { axis: true }) },
        },
        series: groupedSeries,
      };
    }

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
        data: filterToWindow(getMetricData(m.id), effectiveLastNMonths),
      }));

    const hasAny = metricsData.some(d => d.data != null);
    if (!hasAny) return null;

    const { labels, aligned } = alignSeries(metricsData, true);
    const displayLabels = labels.map(formatLabel);

    // For stackRemainder: second series becomes (its value - first series value)
    if (config.stackRemainder && config.metrics.length >= 2) {
      const firstId = config.metrics.filter(m => m.renderAs !== 'referenceLine')[0]?.id;
      const secondId = config.metrics.filter(m => m.renderAs !== 'referenceLine')[1]?.id;
      if (firstId && secondId) {
        const firstVals = aligned.get(firstId);
        const secondVals = aligned.get(secondId);
        if (firstVals && secondVals) {
          aligned.set(secondId, secondVals.map((v, i) => {
            if (v == null || firstVals[i] == null) return null;
            return Math.max(0, v - firstVals[i]);
          }));
        }
      }
    }

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
  }, [config, dataMap, filterLastNMonths]);

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

  const numericMetrics = config.metrics.filter(m => typeof m.id === 'number');
  const customMetrics = config.metrics.filter(m => typeof m.id === 'string' && m.customSql);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8,
        fontFamily: "'DM Sans', sans-serif",
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {config.label}
        {onMetricClick && (numericMetrics.length > 0 || customMetrics.length > 0) && (
          <ChartInspectMenu
            metrics={numericMetrics}
            customMetrics={customMetrics}
            valueFormat={config.valueFormat}
            onMetricClick={onMetricClick}
          />
        )}
      </div>
      <div style={{ flex: 1, minHeight: 300 }}>
        <EChart option={option} style={{ height: '100%' }} />
      </div>
    </div>
  );
}
