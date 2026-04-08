/**
 * Syncs Plan Dashboard
 * Actual vs Budget vs Forecast vs Trajectory, plus Sync Rate variants.
 * Primitives: 55 (Syncs), 358 (Budget), 286 (Forecast), 295 (Trajectory)
 * Rates: 300 (Sync Rate), 362 (Budgeted), 361 (Forecasted), 363 (Rate vs Forecast)
 * Derived: 360 (Budget gap), 359 (Forecast gap), 352 (Forecast Attainment %)
 */

export default {
  id: 'syncs-plan',
  title: 'Syncs',
  status: 'pending',
  group: 'plan',
  sections: [
    // ── Overview ────────────────────────────────────────────────
    {
      title: 'Overview',
      kpis: [
        { metricId: 55,  label: 'Actual Syncs', format: 'number', valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 358, label: 'Budget',        format: 'number', valueSelector: 'current_or_latest' },
        { metricId: 286, label: 'Forecast',      format: 'number', valueSelector: 'current_or_latest' },
        { metricId: 295, label: 'Trajectory',    format: 'number', valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Syncs: Actual vs Budget vs Forecast vs Trajectory',
          chartType: 'bar', valueFormat: 'number', lastNMonths: 12,
          metrics: [
            { id: 55,  label: 'Actual',     color: '#059669' },
            { id: 358, label: 'Budget',     color: '#a3c771', chartType: 'line' },
            { id: 286, label: 'Forecast',   color: '#e84393', chartType: 'line' },
            { id: 295, label: 'Trajectory', color: '#f59e0b', chartType: 'line' },
          ],
        },
      ],
    },

    // ── Sync Rate ────────────────────────────────────────────────
    {
      title: 'Sync Rate',
      kpis: [
        { metricId: 300, label: 'Actual Sync Rate',    format: 'percent', valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 362, label: 'Budgeted Sync Rate',  format: 'percent', valueSelector: 'current_or_latest' },
        { metricId: 361, label: 'Forecasted Sync Rate',format: 'percent', valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Sync Rate: Actual vs Budget vs Forecast',
          chartType: 'line', valueFormat: 'percent', lastNMonths: 12,
          metrics: [
            { id: 300, label: 'Actual',    color: '#7c3aed' },
            { id: 362, label: 'Budget',    color: '#a3c771' },
            { id: 361, label: 'Forecast',  color: '#e84393' },
          ],
        },
      ],
    },

    // ── Attainment ───────────────────────────────────────────────
    {
      title: 'Attainment',
      kpis: [
        { metricId: 360, label: 'vs Budget (gap)',      format: 'number',  valueSelector: 'current_or_latest' },
        { metricId: 359, label: 'vs Forecast (gap)',    format: 'number',  valueSelector: 'current_or_latest' },
        { metricId: 352, label: 'Forecast Attainment',  format: 'percent', valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Budget vs Forecast Gap Over Time',
          chartType: 'bar', valueFormat: 'number', lastNMonths: 12,
          metrics: [
            { id: 360, label: 'vs Budget',   color: '#a3c771' },
            { id: 359, label: 'vs Forecast', color: '#e84393' },
          ],
        },
      ],
    },

    // ── Year over Year ───────────────────────────────────────────
    {
      title: 'Year over Year',
      charts: [
        {
          label: 'Syncs: This Year vs Last Year',
          chartType: 'bar', valueFormat: 'number',
          yoy: true,
          metrics: [{ id: 55, label: 'Syncs' }],
        },
      ],
    },
  ],
};
