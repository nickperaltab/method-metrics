/**
 * Trials Plan Dashboard
 * Actual vs Budget vs Forecast vs Trajectory.
 * Primitives: 54 (Trials), 353 (Budget), 285 (Forecast), 294 (Trajectory)
 * Derived: 355 (Budget gap), 354 (Forecast gap), 350 (Forecast Attainment %)
 */

export default {
  id: 'trials-plan',
  title: 'Trials',
  status: 'pending',
  group: 'plan',
  sections: [
    // ── Overview ────────────────────────────────────────────────
    {
      title: 'Overview',
      kpis: [
        { metricId: 54,  label: 'Actual Trials',     format: 'number', valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 353, label: 'Budget',             format: 'number', valueSelector: 'current_or_latest' },
        { metricId: 285, label: 'Forecast',           format: 'number', valueSelector: 'current_or_latest' },
        { metricId: 294, label: 'Trajectory',         format: 'number', valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Trials: Actual vs Budget vs Forecast vs Trajectory',
          chartType: 'bar', valueFormat: 'number', lastNMonths: 12,
          metrics: [
            { id: 54,  label: 'Actual',     color: '#2563eb' },
            { id: 353, label: 'Budget',     color: '#a3c771', chartType: 'line' },
            { id: 285, label: 'Forecast',   color: '#e84393', chartType: 'line' },
            { id: 294, label: 'Trajectory', color: '#f59e0b', chartType: 'line' },
          ],
        },
      ],
    },

    // ── Attainment ───────────────────────────────────────────────
    {
      title: 'Attainment',
      kpis: [
        { metricId: 355, label: 'vs Budget (gap)',    format: 'number', valueSelector: 'current_or_latest' },
        { metricId: 354, label: 'vs Forecast (gap)',  format: 'number', valueSelector: 'current_or_latest' },
        { metricId: 350, label: 'Forecast Attainment', format: 'percent', valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Budget vs Forecast Gap Over Time',
          chartType: 'bar', valueFormat: 'number', lastNMonths: 12,
          metrics: [
            { id: 355, label: 'vs Budget',   color: '#a3c771' },
            { id: 354, label: 'vs Forecast', color: '#e84393' },
          ],
        },
      ],
    },

    // ── Year over Year ───────────────────────────────────────────
    {
      title: 'Year over Year',
      charts: [
        {
          label: 'Trials: This Year vs Last Year',
          chartType: 'bar', valueFormat: 'number',
          yoy: true,
          metrics: [{ id: 54, label: 'Trials' }],
        },
      ],
    },
  ],
};
