/**
 * Trials Dashboard
 * Overview + dimension breakdowns, all driven from semantic layer (v_trials).
 *
 * Note: AttributionChannel is NOT a direct column in v_trials (it's derived from
 * individual Att_* flag columns). That breakdown requires a BQ view update (Justin).
 */

export default {
  id: 'trials-breakdown',
  title: 'Trials',
  status: 'pending',
  views: {
    v_trials: { dateCol: 'SignupDate' },
  },
  sections: [
    // ── Overview ────────────────────────────────────────────────
    {
      title: 'Overview',
      kpis: [
        { metricId: 54, label: 'Trials This Month', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
      ],
      charts: [
        {
          label: 'Monthly Trials',
          chartType: 'bar', valueFormat: 'number',
          lastNMonths: 6, showLabels: true,
          metrics: [{ id: 54, label: 'Trials', color: '#2563eb' }],
        },
      ],
    },

    // ── Breakdowns ──────────────────────────────────────────────
    {
      title: 'By Country',
      charts: [
        {
          label: 'Trials by Country',
          chartType: 'bar',
          valueFormat: 'number',
          stacked: true,
          lastNMonths: 6,
          groupByDimension: 'SignupCountry',
          metrics: [{ id: 54, label: 'Trials' }],
        },
      ],
    },
    {
      title: 'By Vertical',
      charts: [
        {
          label: 'Trials by Vertical',
          chartType: 'bar',
          valueFormat: 'number',
          stacked: true,
          lastNMonths: 6,
          groupByDimension: 'Vertical',
          metrics: [{ id: 54, label: 'Trials' }],
        },
      ],
    },
    {
      title: 'By Sync Type',
      charts: [
        {
          label: 'Trials by Sync Type',
          chartType: 'bar',
          valueFormat: 'number',
          stacked: true,
          lastNMonths: 6,
          groupByDimension: 'SyncType',
          metrics: [{ id: 54, label: 'Trials' }],
        },
      ],
    },
  ],
};
