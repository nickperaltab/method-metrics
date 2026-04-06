import React from 'react';
import KpiTile from './KpiTile';
import { resolveKpiValue, computeDelta } from './utils';
import { evaluateFormula } from '../../lib/sanitize';

export default function KpiColumn({ kpis, dataMap }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 200 }}>
      {kpis.map((kpi) => {
        let value;
        let series = dataMap.get(kpi.metricId);

        if (kpi.formulaOverride) {
          // Compute from override formula using dep values from dataMap
          const depValues = {};
          for (const depId of kpi.depsOverride || []) {
            const depSeries = dataMap.get(depId);
            depValues[depId] = resolveKpiValue(depSeries, kpi.valueSelector || 'current_month') || 0;
          }
          value = Math.round(evaluateFormula(kpi.formulaOverride, depValues) * 100) / 100;
        } else {
          value = resolveKpiValue(series, kpi.valueSelector || 'current_month');
        }

        const noData = value == null;
        if (noData) console.warn(`[KPI] ${kpi.label} (${kpi.metricId}): No data. series=`, series, `selector=${kpi.valueSelector}`);

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
