import React, { useMemo, useRef, useImperativeHandle, Component } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts/core';
import { LineChart, BarChart, PieChart, FunnelChart, ScatterChart, SankeyChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DatasetComponent, TitleComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { color, chartPalette, font } from '../styles/tokens';

echarts.use([LineChart, BarChart, PieChart, FunnelChart, ScatterChart, SankeyChart, GridComponent, TooltipComponent, LegendComponent, DatasetComponent, TitleComponent, MarkLineComponent, CanvasRenderer]);

// Error boundary prevents a single broken chart from crashing the entire page
export class ChartErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { console.error('Chart render error:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: color.inkMuted, fontSize: 13, fontFamily: font.sans }}>
          Chart failed to render. Try editing the chart or refreshing.
        </div>
      );
    }
    return this.props.children;
  }
}

const axisLabel = { color: color.inkMuted, fontFamily: font.sans, fontSize: 12 };

const METHOD_THEME = {
  color: chartPalette,
  backgroundColor: 'transparent',
  textStyle: { color: color.inkSecondary, fontFamily: font.sans },
  title: { textStyle: { color: color.ink }, subtextStyle: { color: color.inkMuted } },
  legend: { textStyle: { color: color.inkSecondary } },
  tooltip: {
    backgroundColor: color.surface,
    borderColor: color.border,
    textStyle: { color: color.ink, fontFamily: font.sans, fontSize: 12 },
  },
  // Category axis keeps its baseline and loses its ticks and gridlines: a
  // vertical gridline on a time axis encodes nothing.
  categoryAxis: {
    axisLine: { lineStyle: { color: color.border } },
    axisTick: { show: false },
    axisLabel,
    splitLine: { show: false },
  },
  // Value axis is the opposite: no line, no ticks, solid horizontal gridlines.
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel,
    splitLine: { lineStyle: { color: color.borderSubtle, type: 'solid' } },
  },
};

echarts.registerTheme('method', METHOD_THEME);

const EChart = React.forwardRef(function EChart({ option, style, onEvents }, ref) {
  const echartsRef = useRef(null);

  useImperativeHandle(ref, () => ({
    getEchartsInstance() {
      return echartsRef.current?.getEchartsInstance() ?? null;
    },
  }));

  const mergedStyle = useMemo(() => ({
    height: '100%',
    width: '100%',
    ...style,
  }), [style]);

  if (!option) return null;

  return (
    <ChartErrorBoundary>
      <ReactECharts
        ref={echartsRef}
        option={option}
        theme="method"
        style={mergedStyle}
        opts={{ renderer: 'canvas' }}
        notMerge={true}
        onEvents={onEvents}
      />
    </ChartErrorBoundary>
  );
});

export default EChart;
