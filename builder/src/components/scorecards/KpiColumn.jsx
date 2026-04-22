import React from 'react';
import KpiTile from './KpiTile';
import { resolveKpiValue, computeDelta, resolveFilteredKpiSeries } from './utils';
import { evaluateFormula } from '../../lib/sanitize';

export default function KpiColumn({ kpis, dataMap, onMetricClick }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 200 }}>
      {kpis.map((kpi) => {
        let value;
        let series;

        if (kpi.dimensionFilter) {
          const dim = Object.keys(kpi.dimensionFilter)[0];
          const grouped = dataMap.get(`${kpi.metricId}:grouped:${dim}`);
          series = resolveFilteredKpiSeries(grouped, kpi.dimensionFilter);
        } else {
          series = dataMap.get(kpi.metricId);
        }

        if (kpi.formulaOverride) {
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
        if (noData) console.warn(`[KPI] ${kpi.label} (${kpi.metricId}): No data. series=`, series, `selector=${kpi.valueSelector}`, `dimensionFilter=`, kpi.dimensionFilter);

        let deltaPercent = null;
        let deltaInfo = null;
        if (kpi.showDelta && series) {
          const delta = computeDelta(series);
          if (delta) {
            deltaPercent = delta.deltaPercent;
            const cur = resolveKpiValue(series, 'current_month');
            const prior = resolveKpiValue(series, 'prior_month');
            if (cur != null && prior != null) {
              deltaInfo = { current: cur, prior, format: kpi.format };
            }
          }
        }

        return (
          <KpiTile
            key={`${kpi.metricId}-${kpi.label}`}
            label={kpi.label}
            value={value}
            format={kpi.format}
            deltaPercent={deltaPercent}
            noData={noData}
            onClick={() => onMetricClick?.(kpi.metricId, value, kpi.format, null, deltaInfo)}
          />
        );
      })}
    </div>
  );
}
