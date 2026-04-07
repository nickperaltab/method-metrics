/**
 * Trials Dashboard
 * Overview + dimension breakdowns, all driven from semantic layer (v_trials).
 *
 * Note: RevenueBucket breakdown requires BQ view update (AnnualSales not in v_trials yet).
 */

export default {
  id: 'trials-breakdown',
  title: 'Trials',
  status: 'approved',
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

    // ── Sync Rate ────────────────────────────────────────────────
    {
      title: 'Sync Rate',
      kpis: [
        { metricId: 300, label: 'Sync Rate This Month', format: 'percent',
          valueSelector: 'current_or_latest', showDelta: true },
      ],
      charts: [
        {
          label: 'Sync Rate Over Time',
          chartType: 'line', valueFormat: 'percent',
          lastNMonths: 12,
          metrics: [{ id: 300, label: 'Sync Rate', color: '#7c3aed' }],
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

    // ── Weekly ───────────────────────────────────────────────────
    {
      title: 'Weekly',
      charts: [
        {
          label: 'Trials by Week',
          chartType: 'bar', valueFormat: 'number',
          timeBucket: 'week', lastNMonths: 2, showLabels: true,
          metrics: [{ id: 54, label: 'Trials', color: '#2563eb' }],
        },
      ],
    },

    // ── Breakdowns (rendered as tabs) ───────────────────────────
    {
      title: 'By Country',
      group: 'breakdowns',
      charts: [
        {
          label: 'Trials by Country',
          chartType: 'bar', valueFormat: 'number', stacked: true,
          lastNMonths: 6, groupByDimension: 'SignupCountry',
          metrics: [{ id: 54, label: 'Trials' }],
        },
      ],
    },
    {
      title: 'By Vertical',
      group: 'breakdowns',
      charts: [
        {
          label: 'Trials by Vertical',
          chartType: 'bar', valueFormat: 'number', stacked: true,
          lastNMonths: 6, groupByDimension: 'Vertical',
          metrics: [{ id: 54, label: 'Trials' }],
        },
      ],
    },
    {
      title: 'By Sync Type',
      group: 'breakdowns',
      charts: [
        {
          label: 'Trials by Sync Type',
          chartType: 'bar', valueFormat: 'number', stacked: true,
          lastNMonths: 6, groupByDimension: 'SyncType',
          metrics: [{ id: 54, label: 'Trials' }],
        },
      ],
    },
    {
      title: 'By Channel',
      group: 'breakdowns',
      charts: [
        {
          label: 'Trials by Attribution Channel',
          chartType: 'bar', valueFormat: 'number', stacked: true,
          lastNMonths: 6, groupByDimension: 'AttributionChannel',
          metrics: [{ id: 54, label: 'Trials' }],
        },
      ],
    },

    // ── Recent Records ───────────────────────────────────────────
    {
      type: 'rawTable',
      title: 'Recent Trials',
      label: 'Most Recent Trial Accounts',
      metricId: 54,
      columns: ['SignupDate', 'CompanyAccount', 'SignupCountry', 'Vertical', 'AttributionChannel'],
      limit: 100,
    },
  ],
};
