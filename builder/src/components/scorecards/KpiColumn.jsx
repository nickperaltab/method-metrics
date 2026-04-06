import React from 'react';
import KpiTile from './KpiTile';
import { resolveKpiValue, computeDelta } from './utils';
import { evaluateFormula } from '../../lib/sanitize';

export default function KpiColumn({ kpis, dataMap }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 200 }}>
      {kpis.map((kpi) => {
        const series = dataMap.get(kpi.metricId);
        const value = resolveKpiValue(series, kpi.valueSelector || 'current_month');
        const noData = value == null;

        let deltaPercent = null;
        if (kpi.showDelta && series) {
          const delta = computeDelta(series);
          if (delta) deltaPercent = delta.deltaPercent;
        }

        return (
          <KpiTile
            key={kpi.metricId}
            label={kpi.label}
            value={value}
            format={kpi.format}
            deltaPercent={deltaPercent}
            noData={noData}
          />
        );
      })}
    </div>
  );
}
