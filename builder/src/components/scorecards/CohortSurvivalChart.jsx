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
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
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
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 10, maxWidth: 760, lineHeight: 1.5 }}>
        <b>What this is.</b> Each line is one first-pay vintage: all customers whose first paying
        month fell in that calendar year, tracked by customer age (not the calendar). A vintage's
        curve stops where its youngest members run out of observed months (right-censoring), so
        newer vintages are shorter. At later months, each vintage's curve covers only the customers
        old enough to have reached that month.
        <br />
        <b>Two measures.</b> <i>GRR</i> is dollar-weighted: the share of the vintage's starting
        MRR still retained (expansion capped, churned held at $0). <i>Logo survival</i> is
        count-weighted: the share of customers still paying. They diverge when churned customers
        are larger or smaller than average. "Still paying" describes only the logo line.
        Customer grain (one row per <code>EntityRecordID</code>; a customer may own multiple
        <code>CompanyAccount</code>s). Source: <code>revenue.int_customer_survival</code> (dbt),
        parity-verified against the §18 baseline.
      </div>
    </div>
  );
}
