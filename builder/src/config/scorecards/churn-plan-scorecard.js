/**
 * Churn Plan Dashboard
 * Actual vs Budget vs Forecast vs Trajectory, plus Churn Rate % variants.
 * Primitives: 59 (Churn), 280 (Budgeted), 274 (Forecasted), 297 (Trajectory)
 * Rates: 343 (Budgeted Rate %), 342 (Forecasted Rate %), 345 (Rate Trajectory)
 */

export default {
  id: 'churn-plan',
  title: 'Churn',
  status: 'pending',
  group: 'plan',
  sections: [
    // ── Overview ────────────────────────────────────────────────
    {
      title: 'Overview',
      kpis: [
        { metricId: 59,  label: 'Actual Churn',    format: 'number', valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 280, label: 'Budget',           format: 'number', valueSelector: 'current_or_latest' },
        { metricId: 274, label: 'Forecast',         format: 'number', valueSelector: 'current_or_latest' },
        { metricId: 297, label: 'Trajectory',       format: 'number', valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Churn: Actual vs Budget vs Forecast',
          chartType: 'bar', valueFormat: 'number', dateFrom: '2026-01',
          metrics: [
            { id: 59,  label: 'Actual',   color: '#dc2626' },
            { id: 280, label: 'Budget',   color: '#a3c771' },
            { id: 274, label: 'Forecast', color: '#e84393' },
          ],
        },
      ],
    },

    // ── Churn Rate % ─────────────────────────────────────────────
    {
      title: 'Churn Rate %',
      kpis: [
        { metricId: 343, label: 'Budgeted Churn Rate',    format: 'percent', valueSelector: 'current_or_latest' },
        { metricId: 342, label: 'Forecasted Churn Rate',  format: 'percent', valueSelector: 'current_or_latest' },
        { metricId: 345, label: 'Churn Rate Trajectory',  format: 'percent', valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Churn Rate %: Budget vs Forecast vs Trajectory',
          chartType: 'line', valueFormat: 'percent', dateFrom: '2026-01',
          metrics: [
            { id: 343, label: 'Budget',     color: '#a3c771' },
            { id: 342, label: 'Forecast',   color: '#e84393' },
            { id: 345, label: 'Trajectory', color: '#f59e0b' },
          ],
        },
      ],
    },

    // ── Year over Year ───────────────────────────────────────────
    {
      title: 'Year over Year',
      charts: [
        {
          label: 'Churn: This Year vs Last Year',
          chartType: 'bar', valueFormat: 'number',
          yoy: true,
          metrics: [{ id: 59, label: 'Churn' }],
        },
      ],
    },
  ],
};
