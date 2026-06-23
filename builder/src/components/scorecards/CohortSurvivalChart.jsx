import { useState, useEffect } from 'react';
import EChart, { ChartErrorBoundary } from '../EChart';
import { queryBq } from '../../lib/bigquery';
import { buildCohortSurvivalSql, toSurvivalSeries } from '../../lib/cohortSurvivalSql';

const MEASURES = [
  { key: 'grr', label: 'GRR (dollar-weighted)' },
  { key: 'logo', label: 'Logo survival (% still paying)' },
];

export default function CohortSurvivalChart() {
  const [rows, setRows] = useState(null);
  const [measure, setMeasure] = useState('grr');
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    queryBq(buildCohortSurvivalSql())
      .then((res) => { if (alive) setRows(res?.rows ?? []); })
      .catch((e) => { if (alive) setError(e.message || String(e)); });
    return () => { alive = false; };
  }, []);

  if (error) return <div style={{ color: '#b91c1c', padding: 16 }}>Failed to load survival data: {error}</div>;
  if (!rows) return <div style={{ color: '#6b7280', padding: 16 }}>Loading cohort survival...</div>;

  const { ks, vintages, series } = toSurvivalSeries(rows, measure);
  // Auto-fit the y-axis to the data (padded to the nearest 5%) so the spread
  // between cohorts is readable instead of squashed into a 0–100% range.
  const plotted = vintages.flatMap((v) => series[v]).filter((x) => x != null);
  const yMin = plotted.length ? Math.max(0, Math.floor(Math.min(...plotted) / 5) * 5) : 0;
  const yMax = plotted.length ? Math.min(100, Math.ceil(Math.max(...plotted) / 5) * 5) : 100;
  const option = {
    grid: { left: 46, right: 18, top: 30, bottom: 42 },
    legend: { top: 0 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: ks.map((k) => 'm' + k),
      name: 'months into customer life',
      nameLocation: 'middle',
      nameGap: 26,
    },
    yAxis: { type: 'value', min: yMin, max: yMax, axisLabel: { formatter: '{value}%' } },
    series: vintages.map((v) => ({
      name: v + ' cohort',
      type: 'line',
      data: series[v],
      connectNulls: false,
      symbolSize: 6,
      lineStyle: {
        width: v >= '2025' ? 3.5 : 1.8,
        type: v >= '2025' ? 'solid' : 'dashed',
      },
    })),
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {MEASURES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMeasure(m.key)}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
              border: '1px solid #d1d5db',
              background: measure === m.key ? '#059669' : '#fff',
              color: measure === m.key ? '#fff' : '#374151',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div style={{ height: 360 }}>
        <ChartErrorBoundary>
          <EChart option={option} />
        </ChartErrorBoundary>
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 10, lineHeight: 1.6 }}>
        Each line is a first-pay vintage: customers grouped by the year they first paid, tracked by
        customer age. Newer vintages are shorter, stopping where their youngest members run out of
        observed months.
        <br />
        <b>GRR</b> = share of starting MRR retained (dollar-weighted). <b>Logo survival</b> = share
        of customers still paying (count-weighted). Click the ⓘ by the title for the full definition and SQL.
      </div>
    </div>
  );
}
