// builder/src/components/scorecards/IntakeQualityTrend.jsx
// "Are we attracting better customers?" — quarterly trial-quality trend.
// Three % series on the left axis (% trials $1M+, % trials $5M+, % converts
// $5M+) plus avg MRR at convert on a right value axis. Rows come from
// fetchIntakeQuality; each carries convert_mature. Trials-side lines are always
// mature; convert-side points on immature quarters (converts still arriving
// within ~12 months of signup) are drawn at reduced opacity and flagged in the
// tooltip. Uses the shared EChart wrapper like GrrTrendChart.
import { useMemo } from 'react';
import EChart from '../EChart';

const fontSans = "'DM Sans', sans-serif";

function quarterLabel(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
}

export default function IntakeQualityTrend({ rows }) {
  const option = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const labels = rows.map((r) => quarterLabel(r.quarter));

    // Convert-side points are dimmed on immature quarters via per-point itemStyle.
    const convertPoint = (val, mature) =>
      val == null ? null : { value: Number(val.toFixed(1)), itemStyle: mature ? undefined : { opacity: 0.35 } };

    const pctSeries = (name, key) => ({
      name,
      type: 'line',
      yAxisIndex: 0,
      connectNulls: true,
      symbolSize: 5,
      data: rows.map((r) => (r[key] == null ? null : Number(r[key].toFixed(1)))),
    });

    return {
      grid: { left: 48, right: 56, top: 56, bottom: 28 },
      legend: { top: 0 },
      tooltip: {
        trigger: 'axis',
        formatter: (params) => {
          if (!params || !params.length) return '';
          const i = params[0].dataIndex;
          const r = rows[i];
          const head = `<div style="font-weight:600;margin-bottom:4px">${labels[i]}`
            + (r.convert_mature ? '' : ' <span style="color:#9ca3af">· converts maturing</span>')
            + `</div>`;
          const lines = params
            .filter((p) => p.value != null)
            .map((p) => {
              const v = typeof p.value === 'object' ? p.value.value : p.value;
              const suffix = p.seriesName === 'Avg MRR at convert' ? `$${Number(v).toLocaleString()}` : `${v}%`;
              return `${p.marker}${p.seriesName}: <b>${suffix}</b>`;
            });
          return head + lines.join('<br/>');
        },
      },
      xAxis: { type: 'category', data: labels },
      yAxis: [
        { type: 'value', scale: true, axisLabel: { formatter: '{value}%' } },
        { type: 'value', scale: true, position: 'right', axisLabel: { formatter: '${value}' }, splitLine: { show: false } },
      ],
      series: [
        pctSeries('% trials $1M+', 'pct_trials_1m'),
        pctSeries('% trials $5M+', 'pct_trials_5m'),
        {
          name: '% converts $5M+',
          type: 'line',
          yAxisIndex: 0,
          connectNulls: true,
          symbolSize: 6,
          lineStyle: { type: 'dashed' },
          data: rows.map((r) => convertPoint(r.pct_converts_5m, r.convert_mature)),
        },
        {
          name: 'Avg MRR at convert',
          type: 'line',
          yAxisIndex: 1,
          connectNulls: true,
          symbolSize: 6,
          lineStyle: { type: 'dotted' },
          data: rows.map((r) => (r.avg_mrr_at_convert
            ? { value: r.avg_mrr_at_convert, itemStyle: r.convert_mature ? undefined : { opacity: 0.35 } }
            : null)),
        },
      ],
    };
  }, [rows]);

  if (!option) {
    return <p style={{ color: '#6b7280', fontSize: 13, padding: 16, fontFamily: fontSans }}>No quality trend for this window.</p>;
  }
  return (
    <div style={{ height: 360, margin: '8px 0 16px' }}>
      <EChart option={option} />
      <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0', fontFamily: fontSans }}>
        Dashed/faded convert-side points are on quarters still maturing (converts arrive up to ~12 months after signup).
      </p>
    </div>
  );
}
