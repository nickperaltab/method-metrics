import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
// Importing EChart registers the shared 'method' ECharts theme as a module
// side-effect, so we can render ReactECharts directly with theme="method"
// while still wiring an onEvents click handler (EChart's wrapper doesn't
// forward click events).
import './../EChart';
import { computeDelta } from '../../lib/netSaasTransform';

// Method theme palette (mirrors EChart): green = positive, red = negative,
// grey = neutral totals.
const COLOR_POSITIVE = '#059669';
const COLOR_NEGATIVE = '#dc2626';
const COLOR_TOTAL = '#9ca3af';
const COLOR_BASE = 'transparent';

const DELTA_KEYS = new Set(['new', 'expansion', 'downgrade', 'churn']);

// Compact currency formatter, e.g. $1.2M / $120K / -$45K / $0.
function formatUsd(v) {
  if (v == null || isNaN(v)) return '';
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/**
 * L1 Net SaaS waterfall (bridge) chart.
 *
 * @param {object} props
 * @param {Array<{key,label,type,value}>} props.bars - output of normalizeBridge
 *   (signs already applied: downgrade/churn are negative). type is 'total' for
 *   start/end, 'delta' for new/expansion/downgrade/churn.
 * @param {Array<{key,label,type,value}>|null} props.prior - prior period bars
 *   (same shape) or null.
 * @param {boolean} props.showDelta - render period-over-period delta chips.
 * @param {(key:string)=>void} props.onBarClick - called with bar key when a
 *   delta bar is clicked (start/end ignored).
 */
export default function NetSaasBridge({ bars, prior, showDelta, onBarClick }) {
  const option = useMemo(() => {
    if (!bars || bars.length === 0) return null;

    const categories = bars.map((b) => b.label);

    // Build the transparent base + visible magnitude per category.
    // Running cumulative tracks the height the next floating bar starts from.
    const baseData = [];
    const valueData = [];
    const colors = [];
    let cumulative = 0;

    for (const bar of bars) {
      if (bar.type === 'total') {
        // Totals are drawn from 0 to their absolute value.
        baseData.push(0);
        valueData.push(Math.abs(bar.value));
        colors.push(COLOR_TOTAL);
        cumulative = bar.value;
      } else {
        // Delta bar: positive steps up from cumulative_before, negative steps
        // down to cumulative_after with magnitude |value|.
        const magnitude = Math.abs(bar.value);
        if (bar.value >= 0) {
          baseData.push(cumulative);
          colors.push(COLOR_POSITIVE);
          cumulative += bar.value;
        } else {
          cumulative += bar.value; // value is negative -> lowers cumulative
          baseData.push(cumulative);
          colors.push(COLOR_NEGATIVE);
        }
        valueData.push(magnitude);
      }
    }

    // Lookup prior values by key for delta chips.
    const priorByKey = {};
    if (prior) {
      for (const p of prior) priorByKey[p.key] = p.value;
    }

    // Per-category label (delta chip) rendered above the visible bar.
    const showChips = showDelta && !!prior;
    const labelFormatter = (params) => {
      const bar = bars[params.dataIndex];
      if (!showChips || !bar || bar.type !== 'delta') return '';
      if (!(bar.key in priorByKey)) return '';
      const { pct, direction } = computeDelta(bar.value, priorByKey[bar.key]);
      if (direction === 'flat') return '';
      const arrow = direction === 'up' ? '▲' : '▼'; // ▲ / ▼
      if (pct == null) return arrow; // prior was 0
      return `${arrow} ${Math.abs(pct * 100).toFixed(0)}%`;
    };
    const labelColor = (params) => {
      const bar = bars[params.dataIndex];
      if (!bar) return COLOR_TOTAL;
      const priorVal = priorByKey[bar.key] ?? 0;
      return bar.value >= priorVal ? COLOR_POSITIVE : COLOR_NEGATIVE;
    };

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          // params includes both base + value series; surface the value one.
          const idx = params[0]?.dataIndex;
          const bar = bars[idx];
          if (!bar) return '';
          return `<div style="font-weight:600;margin-bottom:4px">${bar.label}</div>` +
            `<div>${formatUsd(bar.value)}</div>`;
        },
      },
      grid: { left: 64, right: 20, top: 30, bottom: 30 },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: { fontSize: 10, interval: 0 },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 10,
          formatter: (v) => formatUsd(v),
        },
      },
      series: [
        {
          // Transparent placeholder carrying the running total.
          name: 'base',
          type: 'bar',
          stack: 'bridge',
          silent: true,
          itemStyle: { color: COLOR_BASE, borderColor: COLOR_BASE },
          emphasis: { itemStyle: { color: COLOR_BASE } },
          data: baseData,
          tooltip: { show: false },
        },
        {
          // Visible magnitude.
          name: 'value',
          type: 'bar',
          stack: 'bridge',
          data: valueData.map((v, i) => ({
            value: v,
            itemStyle: { color: colors[i] },
          })),
          label: {
            show: showChips,
            position: 'top',
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            formatter: labelFormatter,
            color: labelColor,
          },
        },
      ],
    };
  }, [bars, prior, showDelta]);

  const onEvents = useMemo(() => ({
    click: (params) => {
      if (!onBarClick) return;
      const bar = bars?.[params.dataIndex];
      if (bar && DELTA_KEYS.has(bar.key)) onBarClick(bar.key);
    },
  }), [bars, onBarClick]);

  if (!option) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', minHeight: 200, color: '#9ca3af', fontSize: 13,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        No data for this month
      </div>
    );
  }

  return (
    <ReactECharts
      option={option}
      theme="method"
      style={{ height: 320, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge={true}
      onEvents={onEvents}
    />
  );
}
