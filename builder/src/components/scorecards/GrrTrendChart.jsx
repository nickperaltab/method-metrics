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

export default function GrrTrendChart({ rows }) {
  const option = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const months = [...new Set(rows.map((r) => String(r.month)))].sort();
    const segments = [...new Set(rows.map((r) => r.segment))];
    const byKey = new Map(rows.map((r) => [`${r.segment}|${r.month}`, r.grr]));
    const series = segments.map((s) => ({
      name: s,
      type: 'line',
      connectNulls: true,
      symbolSize: 5,
      data: months.map((m) => {
        const v = byKey.get(`${s}|${m}`);
        return v == null ? null : Number((v * 100).toFixed(2));
      }),
    }));
    return {
      grid: { left: 48, right: 16, top: 56, bottom: 28 },
      legend: { top: 0, selected: Object.fromEntries(DESELECTED.map((s) => [s, false])) },
      tooltip: { trigger: 'axis', valueFormatter: (v) => (v == null ? '—' : `${v}%`) },
      xAxis: { type: 'category', data: months.map((m) => m.slice(0, 7)) },
      yAxis: { type: 'value', scale: true, axisLabel: { formatter: '{value}%' } },
      series,
    };
  }, [rows]);

  if (!option) {
    return <p style={{ color: '#6b7280', fontSize: 13, padding: 16, fontFamily: fontSans }}>No trend data for this window.</p>;
  }
  return (
    <div style={{ height: 380, margin: '8px 0 16px' }}>
      <EChart option={option} />
    </div>
  );
}
