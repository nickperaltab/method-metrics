import { evaluateFormula } from './sanitize.js';
import { color, chartPalette, font, chart } from '../styles/tokens.js';

/**
 * Categorical series palette. Re-exported from the token file so the chart
 * layer and the ECharts theme cannot drift apart. The previous palette had two
 * measured defects: #db2777 against #16a34a sat at ΔE 6.1 under deutan
 * simulation, and #f59e0b measured 2.09:1 against the surface.
 */
export const COLORS = chartPalette;

export const ATT_COL_MAP = {
  SEO: 'Att_SEO', PPC: 'Att_Pay_Per_Click', OPN: 'Att_OPN_Other_Peoples_Networks',
  Social: 'Att_Social', Email: 'Att_Email', Referral: 'Att_Referral_Link',
  Direct: 'Att_Direct', Partners: 'Att_Partners', Content: 'Att_Content',
  Remarketing: 'Att_Remarketing', Other: 'Att_Other', None: 'Att_None',
};

export const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function castRow(row, fields) {
  const out = {};
  for (const f of fields) {
    const val = row[f.fid];
    out[f.fid] = f.semanticType === 'quantitative' && val != null ? Number(val) : val;
  }
  return out;
}

export function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  const clean = s.replace(/\s+UTC$/i, '');
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d;
}

export function toBucketKey(val, bucket) {
  const effective = bucket || 'month';
  const d = parseDate(val);
  if (!d) return String(val);
  if (effective === 'day') {
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${d.getUTCFullYear()}-${mm}-${dd}`;
  }
  if (effective === 'week') {
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setUTCDate(diff);
    const mm = String(monday.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(monday.getUTCDate()).padStart(2, '0');
    return `${monday.getUTCFullYear()}-${mm}-${dd}`;
  }
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}`;
}

/**
 * Format date labels for chart axes.
 * Monthly: "Jan" (or "Jan 2026" on January / year change)
 * Daily/Weekly: "Jan 15" (or "Jan 15, 2026" on year change)
 *
 * Call formatDateLabels(allLabels) for context-aware formatting (knows when to show year).
 * Call formatDateLabel(val) for standalone single-value formatting.
 */
export function formatDateLabel(val) {
  if (!val || typeof val !== 'string') return val;
  if (/^\d{4}-\d{2}$/.test(val)) {
    const [y, m] = val.split('-');
    const monthIdx = parseInt(m, 10) - 1;
    // Always include year for standalone calls
    return `${MONTH_NAMES[monthIdx]} ${y}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-');
    return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
  }
  return val;
}

/**
 * Format an array of date labels with context-aware year display.
 * For monthly: shows "Jan", "Feb", ... and adds year on January or when year changes.
 * For daily: shows "Jan 15", "Jan 16", ... and adds year on Jan 1 or year change.
 */
export function formatDateLabels(labels) {
  if (!labels || labels.length === 0) return labels;

  // Detect if these are monthly (YYYY-MM) or daily (YYYY-MM-DD)
  const isMonthly = /^\d{4}-\d{2}$/.test(labels[0]);
  const isDaily = /^\d{4}-\d{2}-\d{2}$/.test(labels[0]);
  if (!isMonthly && !isDaily) return labels.map(formatDateLabel);

  // Check if data spans multiple years
  const years = new Set(labels.map(l => l.substring(0, 4)));
  const multiYear = years.size > 1;

  return labels.map((val, i) => {
    if (isMonthly) {
      const [y, m] = val.split('-');
      const monthIdx = parseInt(m, 10) - 1;
      const monthName = MONTH_NAMES[monthIdx];
      // Show year on: first label, January, or year change
      const prevYear = i > 0 ? labels[i - 1].substring(0, 4) : null;
      const yearChanged = prevYear && prevYear !== y;
      if (i === 0 || monthIdx === 0 || yearChanged) {
        return `${monthName} ${y}`;
      }
      return monthName;
    }
    if (isDaily) {
      const [y, m, d] = val.split('-');
      const monthName = MONTH_NAMES[parseInt(m, 10) - 1];
      const dayNum = parseInt(d, 10);
      const prevYear = i > 0 ? labels[i - 1].substring(0, 4) : null;
      const yearChanged = prevYear && prevYear !== y;
      if (i === 0 || yearChanged || (dayNum === 1 && parseInt(m, 10) === 1)) {
        return `${monthName} ${dayNum}, ${y}`;
      }
      return `${monthName} ${dayNum}`;
    }
    return val;
  });
}

export function looksLikeDate(val) {
  return val && typeof val === 'string' && /^\d{4}-\d{2}/.test(val.trim());
}

export function aggregateRows(rows, xField, yField, timeBucket) {
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

export function computeDerived(derived, depResults, xField, timeBucket) {
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
    const depValues = {};
    for (const depId of derived.depends_on) {
      depValues[depId] = depAggregated[depId]?.[label] || 0;
    }
    const value = Math.round(evaluateFormula(derived.formula, depValues) * 100) / 100;
    computed.push({ [xField]: label, value });
  }
  return computed;
}

export function applyChannelFilter(rows, channelFilter) {
  if (!channelFilter) return rows;
  const col = ATT_COL_MAP[channelFilter];
  if (!col) return rows;
  if (rows.length === 0 || !(col in rows[0])) return rows;
  return rows.filter(r => Number(r[col]) > 0);
}

export function applyLastNMonths(labels, datasets, lastNMonths, timeBucket) {
  if (lastNMonths == null || lastNMonths < 0) return { labels, datasets };
  const now = new Date();
  const cutoff = lastNMonths === 0
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : new Date(now.getFullYear(), now.getMonth() - lastNMonths, 1);
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

function evaluateRule(targetVal, comparison, operator) {
  const a = Number(targetVal);
  const b = Number(comparison);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  switch (operator) {
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    case '==': return a === b;
    case '!=': return a !== b;
    default: return false;
  }
}

export function applyStyleRulesToDatasets(datasets, styleRules) {
  if (!Array.isArray(styleRules) || styleRules.length === 0) return datasets;
  const labelToIndex = new Map();
  datasets.forEach((ds, idx) => { labelToIndex.set(ds.label, idx); });
  const clones = datasets.map(ds => ({ ...ds, pointStyles: new Array(ds.data.length) }));
  const rulesByIdx = {};
  for (const rule of styleRules) {
    const targetName = rule.target || rule.target_series;
    if (!targetName) continue;
    const idx = labelToIndex.get(targetName);
    if (idx == null) continue;
    if (!rulesByIdx[idx]) rulesByIdx[idx] = [];
    rulesByIdx[idx].push(rule);
  }
  for (const [idxKey, rules] of Object.entries(rulesByIdx)) {
    const idx = Number(idxKey);
    const ds = clones[idx];
    if (!ds) continue;
    for (const rule of rules) {
      const compareIdx = rule.compareTo ? labelToIndex.get(rule.compareTo) : null;
      const compareData = compareIdx != null ? datasets[compareIdx]?.data : null;
      const threshold = rule.threshold != null ? Number(rule.threshold) : null;
      const operator = rule.operator || '<';
      // Local name avoids shadowing the imported `color` token object.
      const ruleColor = rule.color || color.negative;
      for (let i = 0; i < ds.data.length; i++) {
        const comparison = compareData ? compareData[i] : threshold;
        if (comparison == null) continue;
        if (evaluateRule(ds.data[i], comparison, operator)) {
          ds.pointStyles[i] = { color: ruleColor };
        }
      }
    }
  }
  return clones;
}

function deriveAxisLabels(labels, datasets, dataConfig, valueFormat) {
  // X: derive from label format or dataConfig hints
  let xLabel = dataConfig?.xAxisLabel;
  if (!xLabel) {
    const first = String(labels?.[0] || '');
    if (/^\d{4}-\d{2}$/.test(first)) xLabel = 'Month';
    else if (/^\d{4}-\d{2}-\d{2}$/.test(first)) {
      xLabel = dataConfig?.timeBucket === 'week' ? 'Week' : (dataConfig?.timeBucket === 'day' ? 'Day' : 'Date');
    } else if (/^\d{4}-Q\d$/.test(first)) xLabel = 'Quarter';
    else if (/^\d{4}$/.test(first)) xLabel = 'Year';
  }

  // Y: pick from config → valueFormat → single-dataset label
  let yLabel = dataConfig?.yAxisLabel;
  if (!yLabel) {
    if (valueFormat === 'percent') yLabel = 'Percent';
    else if (valueFormat === 'currency') yLabel = 'Amount';
    else if (datasets?.length === 1) yLabel = datasets[0]?.label || '';
  }
  return { xLabel: xLabel || '', yLabel: yLabel || '' };
}

const axisNameStyle = {
  color: color.inkMuted,
  fontFamily: font.sans,
  fontSize: 12,
  fontWeight: 400,
};

/** 12px sans in inkMuted. Axis labels are read, so never inkFaint. */
const axisLabelStyle = {
  color: color.inkMuted,
  fontFamily: font.sans,
  fontSize: 12,
};

/**
 * Horizontal gridlines only, solid. A vertical gridline on a time axis encodes
 * nothing, and a dashed grid competes with the data for attention.
 */
const gridLine = { lineStyle: { color: color.borderSubtle, type: 'solid' } };

/** Build a full ECharts option from chart type + aggregated data */
export function buildEChartsOption(echartsType, labels, datasets, dataConfig, { showLabels = false, colors: customColors = null, valueFormat = null } = {}) {
  const processedDatasets = applyStyleRulesToDatasets(datasets, dataConfig?.styleRules);
  const palette = customColors && customColors.length > 0 ? customColors : COLORS;
  const displayLabels = formatDateLabels(labels);
  const isDateAxis = labels.length > 0 && /^\d{4}-\d{2}/.test(String(labels[0]));
  const showLegend = processedDatasets.length > 1;
  const { xLabel, yLabel } = deriveAxisLabels(labels, processedDatasets, dataConfig, valueFormat);

  const baseTooltip = {
    trigger: 'axis',
    backgroundColor: color.surface,
    borderColor: color.border,
    textStyle: { color: color.ink, fontFamily: font.sans, fontSize: 12 },
  };

  const baseGrid = {
    left: yLabel ? 72 : 60,
    right: 24,
    top: showLegend ? 40 : 16,
    bottom: xLabel ? 70 : 60,
    containLabel: false,
  };

  const baseLegend = showLegend ? {
    show: true,
    type: 'scroll',
    textStyle: { color: color.inkSecondary },
    top: 0,
  } : { show: false };

  const categoryAxis = {
    type: 'category',
    data: displayLabels,
    name: xLabel,
    nameLocation: 'middle',
    nameGap: 34,
    nameTextStyle: axisNameStyle,
    // The x baseline stays; ticks go — they duplicate the label positions.
    axisLine: { lineStyle: { color: color.border } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: {
      ...axisLabelStyle,
      rotate: displayLabels.length > 12 ? 45 : 0,
    },
  };

  const valueAxis = {
    type: 'value',
    name: yLabel,
    nameLocation: 'middle',
    nameGap: 50,
    nameTextStyle: axisNameStyle,
    // No y-axis line: the horizontal gridlines already carry the scale.
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      ...axisLabelStyle,
      formatter: (v) => {
        if (typeof v !== 'number') return v;
        if (valueFormat === 'percent') return `${v}%`;
        if (v >= 1000 || v <= -1000) return (v / 1000).toFixed(1) + 'k';
        return v;
      },
    },
    splitLine: gridLine,
  };

  const labelStyle = { color: color.inkSecondary, fontSize: 12, fontFamily: font.sans };

  // 2px line, round cap and join. Markers are 4px radius (ECharts symbolSize is
  // a diameter) and 5px on the final point, each with a 2px surface-coloured
  // ring so a marker sitting on a gridline still reads as a marker.
  const lineStyleBase = { width: chart.lineWidth, cap: 'round', join: 'round' };
  const markerRing = { borderColor: color.surface, borderWidth: chart.symbolRingWidth };
  const lastPointMarker = {
    symbolSize: chart.symbolSizeLast,
    itemStyle: { ...markerRing },
  };
  const wrapValue = (ds, idx, value, extra = null) => {
    const style = ds.pointStyles?.[idx];
    if (!style && !extra) return value;
    const obj = { value };
    if (style) {
      obj.itemStyle = { ...(obj.itemStyle || {}), ...style };
    }
    if (extra) Object.assign(obj, extra);
    return obj;
  };
  const dsList = processedDatasets;

  // --- Line ---
  if (echartsType === 'line') {
    return {
      tooltip: baseTooltip,
      legend: baseLegend,
      grid: baseGrid,
      xAxis: categoryAxis,
      yAxis: valueAxis,
      series: dsList.map((ds, i) => {
        const seriesItem = {
          name: ds.label,
          type: 'line',
          data: ds.data.map((v, idx) => {
            const extra = showLabels && idx === ds.data.length - 1
              ? { label: { show: true, ...labelStyle, position: 'top' }, ...lastPointMarker }
              : null;
            return wrapValue(ds, idx, v, extra);
          }),
          smooth: true,
          symbol: showLabels ? 'circle' : 'none',
          showSymbol: showLabels,
          symbolSize: showLabels ? chart.symbolSize : 0,
          lineStyle: lineStyleBase,
          itemStyle: { color: palette[i % palette.length], ...(showLabels ? markerRing : {}) },
          label: { show: false },
        };
        if (dataConfig?.targetLine && i === 0) {
          seriesItem.markLine = {
            silent: true,
            data: [{ yAxis: dataConfig.targetLine.value }],
            lineStyle: { color: dataConfig.targetLine.color || color.inkMuted, type: 'dashed', width: 2 },
            label: { formatter: dataConfig.targetLine.label || '' },
          };
        }
        return seriesItem;
      }),
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
      series: dsList.map((ds, i) => ({
        name: ds.label,
        type: 'line',
        data: ds.data.map((v, idx) => {
          const extra = showLabels && idx === ds.data.length - 1
            ? { label: { show: true, ...labelStyle, position: 'top' }, ...lastPointMarker }
            : null;
          return wrapValue(ds, idx, v, extra);
        }),
        smooth: true,
        symbol: showLabels ? 'circle' : 'none',
        showSymbol: showLabels,
        symbolSize: showLabels ? chart.symbolSize : 0,
        lineStyle: lineStyleBase,
        areaStyle: { opacity: 0.15 },
        itemStyle: { color: palette[i % palette.length], ...(showLabels ? markerRing : {}) },
        label: { show: false },
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
      series: dsList.map((ds, i) => {
        const hasPointStyles = ds.pointStyles?.some(Boolean);
        const seriesItem = {
          name: ds.label,
          type: 'bar',
          data: ds.data.map((v, idx) => wrapValue(ds, idx, v)),
          barGap: chart.barGap,
          itemStyle: hasPointStyles
            ? { borderRadius: chart.barRadius }
            : { color: palette[i % palette.length], borderRadius: chart.barRadius },
          ...(showLabels ? { label: { show: true, position: 'top', ...labelStyle } } : {}),
        };
        if (dataConfig?.targetLine && i === 0) {
          seriesItem.markLine = {
            silent: true,
            data: [{ yAxis: dataConfig.targetLine.value }],
            lineStyle: { color: dataConfig.targetLine.color || color.inkMuted, type: 'dashed', width: 2 },
            label: { formatter: dataConfig.targetLine.label || '' },
          };
        }
        return seriesItem;
      }),
    };
  }

  // --- Stacked Bar ---
  if (echartsType === 'stacked_bar') {
    const isHorizontal = dataConfig?.orientation === 'horizontal';
    return {
      tooltip: baseTooltip,
      legend: baseLegend,
      grid: isHorizontal ? { ...baseGrid, left: 120 } : baseGrid,
      xAxis: isHorizontal ? valueAxis : categoryAxis,
      yAxis: isHorizontal ? { ...categoryAxis, inverse: true } : valueAxis,
      series: dsList.map((ds, i) => ({
        name: ds.label,
        type: 'bar',
        stack: 'total',
        data: ds.data.map((v, idx) => wrapValue(ds, idx, Math.max(0, v))),
        itemStyle: { color: palette[i % palette.length] },
        ...(showLabels ? { label: { show: true, ...labelStyle } } : {}),
      })),
    };
  }

  // --- Horizontal Bar ---
  if (echartsType === 'horizontal_bar') {
    // When multiple datasets (dimension breakdown), aggregate into one ranked bar per dimension value.
    const isGrouped = dsList.length > 1;
    const hBarYLabels = isGrouped
      ? dsList.map(ds => ds.label)
      : displayLabels;
    const hBarSeries = isGrouped
      ? [{
          type: 'bar',
          data: dsList
            .map((ds, i) => ({ value: ds.data.reduce((s, v) => s + (v || 0), 0), itemStyle: { color: palette[i % palette.length], borderRadius: chart.barRadiusH } }))
            .sort((a, b) => a.value - b.value),
          ...(showLabels ? { label: { show: true, position: 'right', ...labelStyle } } : {}),
        }]
      : dsList.map((ds, i) => ({
          name: ds.label,
          type: 'bar',
          data: ds.data.map((v, idx) => wrapValue(ds, idx, v)),
          itemStyle: { color: palette[i % palette.length], borderRadius: chart.barRadiusH },
          ...(showLabels ? { label: { show: true, position: 'right', ...labelStyle } } : {}),
        }));
    // Sort y-labels to match sorted bars when grouped
    const hBarYSorted = isGrouped
      ? dsList
          .map((ds, i) => ({ label: ds.label, total: ds.data.reduce((s, v) => s + (v || 0), 0) }))
          .sort((a, b) => a.total - b.total)
          .map(d => d.label)
      : hBarYLabels;
    return {
      tooltip: baseTooltip,
      legend: isGrouped ? { show: false } : baseLegend,
      grid: { ...baseGrid, left: 140 },
      xAxis: valueAxis,
      yAxis: { ...categoryAxis, data: hBarYSorted, inverse: false },
      series: hBarSeries,
    };
  }

  // --- Pie ---
  if (echartsType === 'pie') {
    // When multiple datasets are present (dimension breakdown), sum each series into one slice.
    // When single dataset, use labels as slice names (time-bucketed or category data).
    const pieData = dsList.length > 1
      ? dsList.map(ds => ({
          name: ds.label,
          value: ds.data.reduce((sum, v) => sum + (v || 0), 0),
        }))
      : labels.map((l, i) => ({
          name: formatDateLabel(l),
          value: dsList[0]?.data[i] || 0,
        }));
    return {
      tooltip: { ...baseTooltip, trigger: 'item' },
      legend: { ...baseLegend, show: true, type: 'scroll', bottom: 0 },
      series: [{
        type: 'pie',
        radius: ['35%', '65%'],
        center: ['50%', '45%'],
        data: pieData,
        label: { color: color.inkSecondary, fontFamily: font.sans, fontSize: 12 },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
      }],
    };
  }

  // --- Funnel ---
  if (echartsType === 'funnel') {
    const funnelData = dsList.map((ds, i) => ({
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
        label: { show: true, position: 'inside', color: color.surface, fontFamily: font.sans, fontSize: 12 },
        data: funnelData,
      }],
    };
  }

  // --- Variance (actual bars + target dashed line, conditional coloring) ---
  if (echartsType === 'variance') {
    const actualDs = dsList[0];
    const targetDs = dsList[1];
    const targetData = targetDs?.data || [];
    const series = [
      {
        name: actualDs.label,
        type: 'bar',
        data: actualDs.data.map((v, idx) => {
          // Apply style_rules first if they exist, otherwise default red/green logic
          const style = actualDs.pointStyles?.[idx];
          if (style) return { value: v, itemStyle: { ...style, borderRadius: chart.barRadius } };
          const below = targetData[idx] != null && v < targetData[idx];
          return {
            value: v,
            itemStyle: {
              color: below ? color.negative : color.accent,
              borderRadius: chart.barRadius,
            },
          };
        }),
        ...(showLabels ? { label: { show: true, position: 'top', ...labelStyle } } : {}),
      },
    ];
    if (targetDs) {
      series.push({
        name: targetDs.label,
        type: 'line',
        data: targetData,
        lineStyle: { type: 'dashed', width: 2 },
        itemStyle: { color: palette[1], ...markerRing },
        symbol: 'circle',
        symbolSize: 6,
      });
    }
    return {
      tooltip: baseTooltip,
      legend: baseLegend,
      grid: baseGrid,
      xAxis: categoryAxis,
      yAxis: valueAxis,
      series,
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
      series: dsList.map((ds, i) => {
        const isLast = i === dsList.length - 1 && dsList.length > 1;
        const baseData = ds.data.map((v, idx) => wrapValue(ds, idx, v));
        const lineData = ds.data.map((v, idx) => {
          const extra = showLabels && idx === ds.data.length - 1
            ? { label: { show: true, ...labelStyle, position: 'top' } }
            : null;
          return wrapValue(ds, idx, v, extra);
        });
        return {
          name: ds.label,
          type: isLast ? 'line' : 'bar',
          yAxisIndex: isLast ? 1 : 0,
          data: isLast ? lineData : baseData,
          smooth: isLast,
          symbol: isLast ? 'none' : undefined,
          lineStyle: isLast ? { width: 2 } : undefined,
          itemStyle: { color: palette[i % palette.length], ...(isLast ? {} : { borderRadius: chart.barRadius }) },
          ...(showLabels && !isLast ? { label: { show: true, position: 'top', ...labelStyle } } : {}),
        };
      }),
    };
  }

  // --- Year-over-Year (grouped bar, months on X, one series per year) ---
  if (echartsType === 'yoy') {
    const yoyMonthAxis = {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: color.border } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: axisLabelStyle,
    };
    return {
      tooltip: baseTooltip,
      legend: { show: true, textStyle: { color: color.inkSecondary }, top: 0 },
      grid: baseGrid,
      xAxis: yoyMonthAxis,
      yAxis: valueAxis,
      series: dsList.map((ds, i) => ({
        name: ds.label,
        type: 'bar',
        data: ds.data.map((v, idx) => wrapValue(ds, idx, v)),
        itemStyle: { color: palette[i % palette.length], borderRadius: chart.barRadius },
        ...(showLabels ? { label: { show: true, position: 'top', ...labelStyle } } : {}),
      })),
    };
  }

  // --- Heatmap ---
  if (echartsType === 'heatmap') {
    // For heatmap, use first dataset only; labels on x, dataset labels on y
    const yLabels = dsList.map(ds => ds.label);
    const heatData = [];
    dsList.forEach((ds, yi) => {
      ds.data.forEach((val, xi) => {
        heatData.push([xi, yi, val || 0]);
      });
    });
    const maxVal = Math.max(...heatData.map(d => d[2]), 1);
    return {
      tooltip: { ...baseTooltip, trigger: 'item', formatter: (p) => `${displayLabels[p.data[0]]} / ${yLabels[p.data[1]]}: ${p.data[2]}` },
      grid: { ...baseGrid, left: 120 },
      xAxis: categoryAxis,
      yAxis: { type: 'category', data: yLabels, axisLine: { lineStyle: { color: color.border } }, axisTick: { show: false }, axisLabel: axisLabelStyle },
      visualMap: { min: 0, max: maxVal, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: [color.surfaceAlt, color.accent] }, textStyle: { color: color.inkMuted } },
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
    series: dsList.map((ds, i) => ({
      name: ds.label,
      type: 'bar',
      data: ds.data.map((v, idx) => wrapValue(ds, idx, v)),
      itemStyle: { color: palette[i % palette.length], borderRadius: chart.barRadius },
      ...(showLabels ? { label: { show: true, position: 'top', ...labelStyle } } : {}),
    })),
  };
}
