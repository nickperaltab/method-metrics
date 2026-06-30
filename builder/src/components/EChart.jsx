import React, { useMemo, Component } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts/core';
import { LineChart, BarChart, PieChart, FunnelChart, ScatterChart, SankeyChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DatasetComponent, TitleComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, BarChart, PieChart, FunnelChart, ScatterChart, SankeyChart, GridComponent, TooltipComponent, LegendComponent, DatasetComponent, TitleComponent, MarkLineComponent, CanvasRenderer]);

// Error boundary prevents a single broken chart from crashing the entire page
export class ChartErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { console.error('Chart render error:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
          Chart failed to render. Try editing the chart or refreshing.
        </div>
      );
    }
    return this.props.children;
  }
}

const METHOD_THEME = {
  color: ['#059669', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed', '#0284c7', '#ea580c', '#c026d3', '#16a34a', '#db2777'],
  backgroundColor: 'transparent',
  textStyle: { color: '#374151', fontFamily: "'DM Sans', sans-serif" },
  title: { textStyle: { color: '#1a1a1a' }, subtextStyle: { color: '#6b7280' } },
  legend: { textStyle: { color: '#374151' } },
  tooltip: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e5e9',
    textStyle: { color: '#374151', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#e2e5e9' } },
    axisTick: { lineStyle: { color: '#e2e5e9' } },
    axisLabel: { color: '#6b7280', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
    splitLine: { lineStyle: { color: '#f1f3f5', type: 'dashed' } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: '#e2e5e9' } },
    axisTick: { lineStyle: { color: '#e2e5e9' } },
    axisLabel: { color: '#6b7280', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
    splitLine: { lineStyle: { color: '#f1f3f5', type: 'dashed' } },
  },
};

echarts.registerTheme('method', METHOD_THEME);

export default function EChart({ option, style, onEvents }) {
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
        onEvents={onEvents}
      />
    </ChartErrorBoundary>
  );
}
