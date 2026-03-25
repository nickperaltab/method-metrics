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

  // Cast numeric y values
  const chartData = data.map(row => ({
    ...row,
    [yField]: row[yField] != null ? Number(row[yField]) : null,
  }));

  const color = COLORS[0];
  const xLabel = formatFieldLabel(xField);
  const yLabel = formatFieldLabel(yField);

  const commonProps = {
    data: chartData,
    margin: { top: 8, right: 24, left: 8, bottom: 8 },
  };

  const xAxisProps = {
    dataKey: xField,
    tick: axisStyle,
    axisLine: { stroke: THEME.grid },
    tickLine: { stroke: THEME.grid },
    label: { value: xLabel, position: 'insideBottom', offset: -4, style: { ...axisStyle, fill: THEME.textMuted } },
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
          <Line type="monotone" dataKey={yField} stroke={color} dot={false} strokeWidth={2} />
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
          <Area type="monotone" dataKey={yField} stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      );
    }

    if (type === 'scatter') {
      return (
        <ScatterChart {...commonProps}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey={xField} type="number" name={xLabel} tick={axisStyle} axisLine={{ stroke: THEME.grid }} tickLine={{ stroke: THEME.grid }} />
          <YAxis dataKey={yField} type="number" name={yLabel} tick={axisStyle} axisLine={{ stroke: THEME.grid }} tickLine={{ stroke: THEME.grid }} width={72} />
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
        <Bar dataKey={yField} fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    );
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      {renderChart()}
    </ResponsiveContainer>
  );
}
