import React from 'react';
import KpiTile from './KpiTile';
import { resolveKpiValue, computeDelta, resolveFilteredKpiSeries } from './utils';
import { evaluateFormula } from '../../lib/sanitize';
import { color } from '../../styles/tokens';

export default function KpiColumn({ kpis, dataMap, onMetricClick }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 200 }}>
      {kpis.map((kpi, kpiIndex) => {
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
          // Opt-in only: without `deltaWindow` the comparison is exactly what
          // it has always been. With `deltaWindow: 'same-period'` the KPI is
          // compared against the same slice of the prior month, using the
          // baseline the loader precomputed (see lib/sameWindow.js).
          const sameWindow = kpi.deltaWindow === 'same-period'
            ? dataMap.get(`${kpi.metricId}:samewindow`) || null
            : null;
          const delta = computeDelta(series, { window: kpi.deltaWindow, sameWindow });
          if (delta) {
            deltaPercent = delta.deltaPercent;
            if (delta.basis === 'same-period') {
              deltaInfo = {
                current: sameWindow.current,
                prior: sameWindow.prior,
                format: kpi.format,
                window: 'same-period',
              };
            } else {
              const cur = resolveKpiValue(series, 'current_month');
              const prior = resolveKpiValue(series, 'prior_month');
              if (cur != null && prior != null) {
                deltaInfo = { current: cur, prior, format: kpi.format };
              }
            }
          }
        }

        // A hairline between adjacent tiles, so a group of KPIs reads as one
        // instrument rather than N floating numbers. These tiles stack
        // vertically inside the section's 220px column, so the rule sits on
        // top of each tile after the first.
        return (
          <div
            key={`${kpi.metricId}-${kpi.label}`}
            style={kpiIndex === 0 ? undefined : { borderTop: `1px solid ${color.borderSubtle}` }}
          >
            <KpiTile
              label={kpi.label}
              value={value}
              format={kpi.format}
              deltaPercent={deltaPercent}
              noData={noData}
              onClick={() => onMetricClick?.(kpi.metricId, value, kpi.format, null, deltaInfo)}
            />
          </div>
        );
      })}
    </div>
  );
}
