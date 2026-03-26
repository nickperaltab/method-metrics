export const COLORS = ['#34d399', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#38bdf8', '#fb923c', '#e879f9', '#4ade80', '#f472b6'];

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

export function applyChannelFilter(rows, channelFilter) {
  if (!channelFilter) return rows;
  const col = ATT_COL_MAP[channelFilter];
  if (!col) return rows;
  if (rows.length === 0 || !(col in rows[0])) return rows;
  return rows.filter(r => Number(r[col]) > 0);
}

export function applyLastNMonths(labels, datasets, lastNMonths, timeBucket) {
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
export function buildEChartsOption(echartsType, labels, datasets, dataConfig, { showLabels = false } = {}) {
  const displayLabels = formatDateLabels(labels);
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

  const labelStyle = { color: '#c8cdd3', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" };

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
        data: ds.data.map((v, idx) => showLabels && idx === ds.data.length - 1
          ? { value: v, label: { show: true, ...labelStyle, position: 'top' } }
          : v
        ),
        smooth: true,
        symbol: showLabels ? 'circle' : 'none',
        showSymbol: showLabels ? false : false,
        symbolSize: showLabels ? 4 : 0,
        lineStyle: { width: 2 },
        itemStyle: { color: COLORS[i % COLORS.length] },
        label: { show: false },
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
        data: ds.data.map((v, idx) => showLabels && idx === ds.data.length - 1
          ? { value: v, label: { show: true, ...labelStyle, position: 'top' } }
          : v
        ),
        smooth: true,
        symbol: showLabels ? 'circle' : 'none',
        showSymbol: showLabels ? false : false,
        symbolSize: showLabels ? 4 : 0,
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.15 },
        itemStyle: { color: COLORS[i % COLORS.length] },
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
      series: datasets.map((ds, i) => ({
        name: ds.label,
        type: 'bar',
        data: ds.data,
        itemStyle: { color: COLORS[i % COLORS.length], borderRadius: [3, 3, 0, 0] },
        ...(showLabels ? { label: { show: true, position: 'top', ...labelStyle } } : {}),
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
        ...(showLabels ? { label: { show: true, ...labelStyle } } : {}),
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
        ...(showLabels ? { label: { show: true, position: 'right', ...labelStyle } } : {}),
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
          ...(showLabels && !isLast ? { label: { show: true, position: 'top', ...labelStyle } } : {}),
          ...(showLabels && isLast ? {
            data: ds.data.map((v, idx) => idx === ds.data.length - 1
              ? { value: v, label: { show: true, ...labelStyle, position: 'top' } }
              : v
            ),
            label: { show: false },
          } : {}),
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
      ...(showLabels ? { label: { show: true, position: 'top', ...labelStyle } } : {}),
    })),
  };
}
