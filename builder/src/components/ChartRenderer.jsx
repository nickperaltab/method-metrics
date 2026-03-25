import React from 'react';
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  AreaChart, Area,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

const COLORS = ['#34d399', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#38bdf8', '#fb923c', '#e879f9', '#4ade80', '#f472b6'];

const THEME = {
  bg: '#0c0f12',
  grid: '#1a1e24',
  text: '#c8cdd3',
  textMuted: '#5a6370',
};

const axisStyle = {
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  fill: THEME.text,
};

const legendStyle = {
  color: '#c8cdd3',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatFieldLabel(fieldName) {
  if (!fieldName) return '';
  return fieldName.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** Parse a BQ date string ("2024-01-15" or "2024-01-15 00:00:00 UTC") into a Date */
function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  // Strip trailing " UTC" or similar timezone suffix
  const clean = s.replace(/\s+UTC$/i, '');
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d;
}

/** Truncate a date string to a bucket key */
function toBucketKey(val, bucket) {
  const effective = bucket || 'month';
  const d = parseDate(val);
  if (!d) {
    // Not a date — return raw value
    return String(val);
  }
  if (effective === 'day') {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
  if (effective === 'week') {
    // Monday of the week
    const day = d.getDay(); // 0=Sun
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const mm = String(monday.getMonth() + 1).padStart(2, '0');
    const dd = String(monday.getDate()).padStart(2, '0');
    return `${monday.getFullYear()}-${mm}-${dd}`;
  }
  // month
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}`;
}

/** Format a bucket key for display */
function formatDateLabel(val) {
  if (!val || typeof val !== 'string') return val;
  // YYYY-MM → "Jan '24"
  if (/^\d{4}-\d{2}$/.test(val)) {
    const [y, m] = val.split('-');
    return `${MONTH_NAMES[parseInt(m, 10) - 1]} '${y.slice(2)}`;
  }
  // YYYY-MM-DD → "Jan 15"
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [, m, d] = val.split('-');
    return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
  }
  return val;
}

/** Check if a value looks like a date */
function looksLikeDate(val) {
  return val && typeof val === 'string' && /^\d{4}-\d{2}/.test(val.trim());
}

/**
 * Aggregate rows into chart-ready data.
 * Returns { chartData: [...], seriesKeys: string[] }
 *   - seriesKeys is empty for single-series
 *   - seriesKeys has one entry per colorField value for multi-series
 */
function aggregateRows(rows, xField, yField, timeBucket, colorField) {
  const isCount = yField === 'COUNT';
  const isDate = rows.length > 0 && looksLikeDate(rows[0]?.[xField]);
  const bucket = isDate ? (timeBucket || 'month') : null;

  // Track totals per colorField value (for top-10 limiting)
  const colorTotals = {};
  // Main accumulator: { bucketKey: { _x: bucketKey, [series]: value } }
  const acc = {};

  for (const row of rows) {
    const rawX = row[xField];
    const key = bucket ? toBucketKey(rawX, bucket) : String(rawX ?? '');
    const seriesKey = colorField ? String(row[colorField] ?? '(empty)') : '_value';
    const numVal = isCount ? 1 : Number(row[yField]) || 0;

    if (!acc[key]) acc[key] = { _x: key };
    acc[key][seriesKey] = (acc[key][seriesKey] || 0) + numVal;

    if (colorField) {
      colorTotals[seriesKey] = (colorTotals[seriesKey] || 0) + numVal;
    }
  }

  let seriesKeys = [];
  if (colorField) {
    // Limit to top 10 by total value
    seriesKeys = Object.entries(colorTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k]) => k);
  }

  // Build sorted array
  let chartData = Object.values(acc).sort((a, b) => (a._x > b._x ? 1 : a._x < b._x ? -1 : 0));

  // Replace _x with xField key and clean up
  chartData = chartData.map(item => {
    const out = { [xField]: item._x };
    if (colorField) {
      for (const sk of seriesKeys) {
        out[sk] = item[sk] || 0;
      }
    } else {
      out[isCount ? 'count' : yField] = item._value || 0;
    }
    return out;
  });

  return { chartData, seriesKeys };
}

/**
 * Aggregate multiple datasets independently then merge by x-axis key.
 */
function aggregateMultiDatasets(datasets, xField, yField, timeBucket) {
  const mergedMap = {}; // xKey → { [xField]: key, [label1]: val, [label2]: val }
  const seriesKeys = [];

  for (const ds of datasets) {
    const { label, data: rows } = ds;
    if (!rows || rows.length === 0) continue;
    seriesKeys.push(label);

    const { chartData } = aggregateRows(rows, xField, yField, timeBucket, null);
    const valueKey = yField === 'COUNT' ? 'count' : yField;

    for (const item of chartData) {
      const xVal = item[xField];
      if (!mergedMap[xVal]) mergedMap[xVal] = { [xField]: xVal };
      mergedMap[xVal][label] = item[valueKey] || 0;
    }
  }

  const chartData = Object.values(mergedMap).sort((a, b) => (a[xField] > b[xField] ? 1 : a[xField] < b[xField] ? -1 : 0));
  return { chartData, seriesKeys };
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: '#111518',
      border: '1px solid #1a1e24',
      borderRadius: 6,
      padding: '8px 12px',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12,
      color: THEME.text,
    }}>
      <div style={{ color: THEME.textMuted, marginBottom: 4 }}>{label}</div>
      {payload.map((entry, i) => (
        <div key={i} style={{ color: entry.color || COLORS[0] }}>
          {formatFieldLabel(entry.name)}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
        </div>
      ))}
    </div>
  );
}

export default function ChartRenderer({ data, datasets, xField, yField, colorField, chartType, lastNMonths, timeBucket }) {
  // Determine if we have any data to work with
  const hasDatasets = datasets && datasets.length > 0;
  const hasData = data && data.length > 0;

  if (!hasDatasets && !hasData) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: THEME.textMuted,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
      }}>
        No data to display
      </div>
    );
  }

  if (!xField || !yField) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: THEME.textMuted,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
      }}>
        Select a metric to visualize
      </div>
    );
  }

  // --- Aggregate ---
  let chartData, seriesKeys;
  const isCount = yField === 'COUNT';
  const effectiveYField = isCount ? 'count' : yField;

  if (hasDatasets) {
    ({ chartData, seriesKeys } = aggregateMultiDatasets(datasets, xField, yField, timeBucket));
  } else if (colorField) {
    ({ chartData, seriesKeys } = aggregateRows(data, xField, yField, timeBucket, colorField));
  } else {
    ({ chartData, seriesKeys } = aggregateRows(data, xField, yField, timeBucket, null));
  }

  const multiSeries = seriesKeys.length > 0;

  // --- Apply lastNMonths ---
  if (lastNMonths && chartData.length > lastNMonths) {
    chartData = chartData.slice(-lastNMonths);
  }

  // --- Detect date axis ---
  const isDateAxis = chartData.length > 0 && /^\d{4}-\d{2}/.test(String(chartData[0]?.[xField] || ''));

  // --- Tick thinning ---
  const tickInterval = chartData.length > 24 ? 2 : chartData.length > 12 ? 1 : 0;

  // --- Chart type ---
  const type = (chartType || 'bar').toLowerCase();
  const isHorizontal = type === 'horizontal_bar';

  // --- Axis labels ---
  const yLabel = multiSeries ? '' : (isCount ? 'Count' : formatFieldLabel(yField));

  // --- Axis props ---
  const categoryAxisProps = {
    dataKey: xField,
    tick: axisStyle,
    axisLine: { stroke: THEME.grid },
    tickLine: { stroke: THEME.grid },
    tickFormatter: isDateAxis ? formatDateLabel : undefined,
    interval: tickInterval,
    angle: !isHorizontal && chartData.length > 12 ? -45 : 0,
    textAnchor: !isHorizontal && chartData.length > 12 ? 'end' : 'middle',
    ...(isHorizontal ? { width: 120 } : { height: 60 }),
    type: 'category',
  };

  const valueAxisProps = {
    tick: axisStyle,
    axisLine: { stroke: THEME.grid },
    tickLine: { stroke: THEME.grid },
    tickFormatter: (v) => typeof v === 'number' ? v.toLocaleString() : v,
    ...(yLabel ? { label: { value: yLabel, angle: -90, position: 'insideLeft', offset: 12, style: { ...axisStyle, fill: THEME.textMuted } } } : {}),
    ...(isHorizontal ? {} : { width: 72 }),
    type: 'number',
  };

  const gridProps = {
    strokeDasharray: '3 3',
    stroke: THEME.grid,
  };

  const commonProps = {
    data: chartData,
    margin: { top: 8, right: 24, left: 8, bottom: 24 },
    ...(isHorizontal ? { layout: 'vertical' } : {}),
  };

  const legendEl = multiSeries ? <Legend wrapperStyle={legendStyle} /> : null;

  // --- Render series elements ---
  function renderSeriesElements(ChartComponent, ElementComponent, extraProps = {}) {
    if (multiSeries) {
      return seriesKeys.map((sk, i) => (
        <ElementComponent key={sk} dataKey={sk} {...extraProps} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} />
      ));
    }
    return (
      <ElementComponent dataKey={effectiveYField} {...extraProps} stroke={COLORS[0]} fill={COLORS[0]} />
    );
  }

  const renderChart = () => {
    if (isHorizontal) {
      return (
        <BarChart {...commonProps}>
          <CartesianGrid {...gridProps} />
          <XAxis {...valueAxisProps} />
          <YAxis {...categoryAxisProps} dataKey={xField} type="category" />
          <Tooltip content={<CustomTooltip />} />
          {legendEl}
          {multiSeries
            ? seriesKeys.map((sk, i) => (
                <Bar key={sk} dataKey={sk} fill={COLORS[i % COLORS.length]} radius={[0, 3, 3, 0]} />
              ))
            : <Bar dataKey={effectiveYField} fill={COLORS[0]} radius={[0, 3, 3, 0]} />
          }
        </BarChart>
      );
    }

    if (type === 'line') {
      return (
        <LineChart {...commonProps}>
          <CartesianGrid {...gridProps} />
          <XAxis {...categoryAxisProps} />
          <YAxis {...valueAxisProps} />
          <Tooltip content={<CustomTooltip />} />
          {legendEl}
          {multiSeries
            ? seriesKeys.map((sk, i) => (
                <Line key={sk} type="monotone" dataKey={sk} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />
              ))
            : <Line type="monotone" dataKey={effectiveYField} stroke={COLORS[0]} dot={false} strokeWidth={2} />
          }
        </LineChart>
      );
    }

    if (type === 'area') {
      return (
        <AreaChart {...commonProps}>
          <CartesianGrid {...gridProps} />
          <XAxis {...categoryAxisProps} />
          <YAxis {...valueAxisProps} />
          <Tooltip content={<CustomTooltip />} />
          {legendEl}
          {multiSeries
            ? seriesKeys.map((sk, i) => (
                <Area key={sk} type="monotone" dataKey={sk} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.15} strokeWidth={2} />
              ))
            : <Area type="monotone" dataKey={effectiveYField} stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.15} strokeWidth={2} />
          }
        </AreaChart>
      );
    }

    if (type === 'scatter') {
      return (
        <ScatterChart {...commonProps}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey={xField} type="number" name={formatFieldLabel(xField)} tick={axisStyle} axisLine={{ stroke: THEME.grid }} tickLine={{ stroke: THEME.grid }} />
          <YAxis dataKey={effectiveYField} type="number" name={isCount ? 'Count' : formatFieldLabel(yField)} tick={axisStyle} axisLine={{ stroke: THEME.grid }} tickLine={{ stroke: THEME.grid }} width={72} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
          {legendEl}
          <Scatter data={chartData} fill={COLORS[0]} />
        </ScatterChart>
      );
    }

    // default: bar (grouped if multi-series)
    return (
      <BarChart {...commonProps}>
        <CartesianGrid {...gridProps} />
        <XAxis {...categoryAxisProps} />
        <YAxis {...valueAxisProps} />
        <Tooltip content={<CustomTooltip />} />
        {legendEl}
        {multiSeries
          ? seriesKeys.map((sk, i) => (
              <Bar key={sk} dataKey={sk} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} />
            ))
          : <Bar dataKey={effectiveYField} fill={COLORS[0]} radius={[3, 3, 0, 0]} />
        }
      </BarChart>
    );
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      {renderChart()}
    </ResponsiveContainer>
  );
}
