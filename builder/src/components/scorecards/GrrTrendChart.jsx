// builder/src/components/scorecards/GrrTrendChart.jsx
// Trailing-12-month annual GRR trend, one line per L1 industry. Rows come from
// fetchGrrTrend ({ month, segment, grr }). Legend toggles lines; Unclassified
// and UNCLASSIFIABLE start deselected — their low GRR (unlabeled accounts skew
// toward already-churned customers) would squash the y-axis range the real
// industries move in.
import { useMemo } from 'react';
import EChart from '../EChart';

const fontSans = "'DM Sans', sans-serif";
const DESELECTED = ['Unclassified', 'UNCLASSIFIABLE'];

function formatUsd(v) {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${Math.round(abs)}`;
}

// onPointClick(segment, month) — fired when a line point is clicked, so the
// parent can load the accounts behind that segment+month.
export default function GrrTrendChart({ rows, onPointClick }) {
  // Lifted out of the option memo so the click handler can map dataIndex → month.
  const months = useMemo(
    () => (rows ? [...new Set(rows.map((r) => String(r.month)))].sort() : []),
    [rows],
  );

  const option = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const segments = [...new Set(rows.map((r) => r.segment))];
    const grrByKey = new Map(rows.map((r) => [`${r.segment}|${r.month}`, r.grr]));
    const baseByKey = new Map(rows.map((r) => [`${r.segment}|${r.month}`, r.start_mrr]));
    const custByKey = new Map(rows.map((r) => [`${r.segment}|${r.month}`, r.customers]));
    const series = segments.map((s) => ({
      name: s,
      type: 'line',
      connectNulls: true,
      symbolSize: 5,
      data: months.map((m) => {
        const v = grrByKey.get(`${s}|${m}`);
        return v == null ? null : Number((v * 100).toFixed(2));
      }),
    }));
    return {
      grid: { left: 48, right: 16, top: 56, bottom: 28 },
      legend: { top: 0, selected: Object.fromEntries(DESELECTED.map((s) => [s, false])) },
      tooltip: {
        trigger: 'axis',
        // Each line carries its base $ and account count, so a high GRR on a
        // tiny book reads as tiny — the magnitude the bare rate hides.
        formatter: (params) => {
          if (!params || !params.length) return '';
          const m = months[params[0].dataIndex];
          const head = `<div style="font-weight:600;margin-bottom:4px">${m.slice(0, 7)}</div>`;
          const lines = params
            .filter((p) => p.value != null)
            .map((p) => {
              const base = baseByKey.get(`${p.seriesName}|${m}`);
              const cust = custByKey.get(`${p.seriesName}|${m}`);
              return `${p.marker}${p.seriesName}: <b>${p.value}%</b>`
                + `<span style="color:#9ca3af"> · ${formatUsd(base)} base · ${Number(cust || 0).toLocaleString()} cust</span>`;
            });
          return head + lines.join('<br/>');
        },
      },
      xAxis: { type: 'category', data: months.map((m) => m.slice(0, 7)) },
      yAxis: { type: 'value', scale: true, axisLabel: { formatter: '{value}%' } },
      series,
    };
  }, [rows, months]);

  const onEvents = useMemo(() => ({
    click: (p) => {
      if (p?.componentType !== 'series' || !onPointClick) return;
      const m = months[p.dataIndex];
      if (m) onPointClick(p.seriesName, m);
    },
  }), [months, onPointClick]);

  if (!option) {
    return <p style={{ color: '#6b7280', fontSize: 13, padding: 16, fontFamily: fontSans }}>No trend data for this window.</p>;
  }
  return (
    <div style={{ height: 380, margin: '8px 0 16px' }}>
      <EChart option={option} onEvents={onEvents} />
    </div>
  );
}
