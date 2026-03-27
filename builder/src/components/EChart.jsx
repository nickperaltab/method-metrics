import React, { useMemo, Component } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts/core';
import { LineChart, BarChart, PieChart, FunnelChart, ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DatasetComponent, TitleComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, BarChart, PieChart, FunnelChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, DatasetComponent, TitleComponent, CanvasRenderer]);

// Error boundary prevents a single broken chart from crashing the entire page
class ChartErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { console.error('Chart render error:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#5a6370', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
          Chart failed to render. Try editing the chart or refreshing.
        </div>
      );
    }
    return this.props.children;
  }
}

const METHOD_THEME = {
  color: ['#34d399', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#38bdf8', '#fb923c', '#e879f9', '#4ade80', '#f472b6'],
  backgroundColor: 'transparent',
  textStyle: { color: '#c8cdd3', fontFamily: "'DM Sans', sans-serif" },
  title: { textStyle: { color: '#edf0f3' }, subtextStyle: { color: '#5a6370' } },
  legend: { textStyle: { color: '#c8cdd3' } },
  tooltip: {
    backgroundColor: '#111518',
    borderColor: '#1a1e24',
    textStyle: { color: '#c8cdd3', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#1a1e24' } },
    axisTick: { lineStyle: { color: '#1a1e24' } },
    axisLabel: { color: '#5a6370', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
    splitLine: { lineStyle: { color: '#1a1e24', type: 'dashed' } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: '#1a1e24' } },
    axisTick: { lineStyle: { color: '#1a1e24' } },
    axisLabel: { color: '#5a6370', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
    splitLine: { lineStyle: { color: '#1a1e24', type: 'dashed' } },
  },
};

echarts.registerTheme('method', METHOD_THEME);

export default function EChart({ option, style }) {
  const mergedStyle = useMemo(() => ({
    height: '100%',
    width: '100%',
    ...style,
  }), [style]);

  if (!option) return null;

  return (
    <ChartErrorBoundary>
      <ReactECharts
        option={option}
        theme="method"
        style={mergedStyle}
        opts={{ renderer: 'canvas' }}
        notMerge={true}
      />
    </ChartErrorBoundary>
  );
}
