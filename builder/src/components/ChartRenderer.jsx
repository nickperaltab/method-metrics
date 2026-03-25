import React from 'react';
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  AreaChart, Area,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

const COLORS = ['#34d399', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#38bdf8', '#fb923c', '#e879f9'];

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

function formatFieldLabel(fieldName) {
  if (!fieldName) return '';
  return fieldName.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
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

export default function ChartRenderer({ data, xField, yField, colorField, chartType }) {
  if (!data || data.length === 0) {
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

  // Aggregate data if needed
  let chartData;
  let effectiveYField = yField;

  if (yField === 'COUNT' || yField === xField) {
    // No numeric column — count rows grouped by xField
    effectiveYField = 'count';
    const counts = {};
    for (const row of data) {
      let key = row[xField];
      // Truncate dates to month (YYYY-MM) for time grouping
      if (key && typeof key === 'string' && /^\d{4}-\d{2}/.test(key)) {
        key = key.substring(0, 7);
      }
      counts[key] = (counts[key] || 0) + 1;
    }
    chartData = Object.entries(counts)
      .map(([key, count]) => ({ [xField]: key, count }))
      .sort((a, b) => (a[xField] > b[xField] ? 1 : -1));
  } else {
    // Has a real numeric y column — cast and use directly
    chartData = data.map(row => ({
      ...row,
      [yField]: row[yField] != null ? Number(row[yField]) : null,
    }));
    // If data looks like raw rows with dates, aggregate by truncated date
    if (chartData.length > 100 && data[0]?.[xField] && /^\d{4}-\d{2}/.test(String(data[0][xField]))) {
      const agg = {};
      for (const row of chartData) {
        const key = String(row[xField]).substring(0, 7);
        if (!agg[key]) agg[key] = { [xField]: key, [yField]: 0 };
        agg[key][yField] += row[yField] || 0;
      }
      chartData = Object.values(agg).sort((a, b) => (a[xField] > b[xField] ? 1 : -1));
    }
  }

  const color = COLORS[0];
  const xLabel = formatFieldLabel(xField);
  const yLabel = effectiveYField === 'count' ? 'Count' : formatFieldLabel(yField);

  // Format YYYY-MM dates to "Jan '24" style
  const isDateAxis = chartData.length > 0 && /^\d{4}-\d{2}/.test(String(chartData[0]?.[xField] || ''));
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function formatDateLabel(val) {
    if (!val || typeof val !== 'string') return val;
    const parts = val.split('-');
    if (parts.length >= 2) {
      const monthIdx = parseInt(parts[1], 10) - 1;
      const year = parts[0].slice(2);
      return `${MONTH_NAMES[monthIdx] || parts[1]} '${year}`;
    }
    return val;
  }

  const commonProps = {
    data: chartData,
    margin: { top: 8, right: 24, left: 8, bottom: 24 },
  };

  // Show every Nth label to avoid overlap
  const tickInterval = chartData.length > 24 ? 2 : chartData.length > 12 ? 1 : 0;

  const xAxisProps = {
    dataKey: xField,
    tick: axisStyle,
    axisLine: { stroke: THEME.grid },
    tickLine: { stroke: THEME.grid },
    tickFormatter: isDateAxis ? formatDateLabel : undefined,
    interval: tickInterval,
    angle: chartData.length > 12 ? -45 : 0,
    textAnchor: chartData.length > 12 ? 'end' : 'middle',
    height: 60,
  };

  const yAxisProps = {
    tick: axisStyle,
    axisLine: { stroke: THEME.grid },
    tickLine: { stroke: THEME.grid },
    tickFormatter: (v) => typeof v === 'number' ? v.toLocaleString() : v,
    label: { value: yLabel, angle: -90, position: 'insideLeft', offset: 12, style: { ...axisStyle, fill: THEME.textMuted } },
    width: 72,
  };

  const gridProps = {
    strokeDasharray: '3 3',
    stroke: THEME.grid,
  };

  const type = (chartType || 'bar').toLowerCase();

  const renderChart = () => {
    if (type === 'line') {
      return (
        <LineChart {...commonProps}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip content={<CustomTooltip />} />
          <Line type="monotone" dataKey={effectiveYField} stroke={color} dot={false} strokeWidth={2} />
        </LineChart>
      );
    }

    if (type === 'area') {
      return (
        <AreaChart {...commonProps}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey={effectiveYField} stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      );
    }

    if (type === 'scatter') {
      return (
        <ScatterChart {...commonProps}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey={xField} type="number" name={xLabel} tick={axisStyle} axisLine={{ stroke: THEME.grid }} tickLine={{ stroke: THEME.grid }} />
          <YAxis dataKey={effectiveYField} type="number" name={yLabel} tick={axisStyle} axisLine={{ stroke: THEME.grid }} tickLine={{ stroke: THEME.grid }} width={72} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
          <Scatter data={chartData} fill={color} />
        </ScatterChart>
      );
    }

    // default: bar
    return (
      <BarChart {...commonProps}>
        <CartesianGrid {...gridProps} />
        <XAxis {...xAxisProps} />
        <YAxis {...yAxisProps} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey={effectiveYField} fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    );
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      {renderChart()}
    </ResponsiveContainer>
  );
}
