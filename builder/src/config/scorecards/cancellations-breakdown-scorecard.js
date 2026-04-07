/**
 * Cancellations (Churn) Dashboard
 * Overview + dimension breakdowns, all driven from semantic layer (v_cancellations).
 * v_cancellations filters: excludes sentinel dates, conversion exceptions, Method Integration partner.
 */

export default {
  id: 'cancellations-breakdown',
  title: 'Cancellations',
  status: 'pending',
  group: 'funnel',
  views: {
    v_cancellations: { dateCol: 'CancellationDate' },
  },
  sections: [
    // ── Overview ────────────────────────────────────────────────
    {
      title: 'Overview',
      kpis: [
        { metricId: 59, label: 'Cancellations This Month', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
      ],
      charts: [
        {
          label: 'Monthly Cancellations',
          chartType: 'bar', valueFormat: 'number',
          lastNMonths: 6, showLabels: true,
          metrics: [{ id: 59, label: 'Cancellations', color: '#dc2626' }],
        },
      ],
    },

    // ── Year over Year ───────────────────────────────────────────
    {
      title: 'Year over Year',
      charts: [
        {
          label: 'Cancellations: This Year vs Last Year',
          chartType: 'bar', valueFormat: 'number',
          yoy: true,
          metrics: [{ id: 59, label: 'Cancellations' }],
        },
      ],
    },

    // ── Weekly ───────────────────────────────────────────────────
    {
      title: 'Weekly',
      charts: [
        {
          label: 'Cancellations by Week',
          chartType: 'bar', valueFormat: 'number',
          timeBucket: 'week', lastNMonths: 2, showLabels: true,
          metrics: [{ id: 59, label: 'Cancellations', color: '#dc2626' }],
        },
      ],
    },

    // ── Breakdowns (rendered as tabs) ───────────────────────────
    {
      title: 'By Country',
      group: 'breakdowns',
      charts: [
        {
          label: 'Cancellations by Country',
          chartType: 'bar', valueFormat: 'number', stacked: true,
          lastNMonths: 6, groupByDimension: 'SignupCountry',
          metrics: [{ id: 59, label: 'Cancellations' }],
        },
      ],
    },
    {
      title: 'By Vertical',
      group: 'breakdowns',
      charts: [
        {
          label: 'Cancellations by Vertical',
          chartType: 'bar', valueFormat: 'number', stacked: true,
          lastNMonths: 6, groupByDimension: 'Vertical',
          metrics: [{ id: 59, label: 'Cancellations' }],
        },
      ],
    },
    {
      title: 'By Sync Type',
      group: 'breakdowns',
      charts: [
        {
          label: 'Cancellations by Sync Type',
          chartType: 'bar', valueFormat: 'number', stacked: true,
          lastNMonths: 6, groupByDimension: 'SyncType',
          metrics: [{ id: 59, label: 'Cancellations' }],
        },
      ],
    },
    {
      title: 'By Channel',
      group: 'breakdowns',
      charts: [
        {
          label: 'Cancellations by Attribution Channel',
          chartType: 'bar', valueFormat: 'number', stacked: true,
          lastNMonths: 6, groupByDimension: 'AttributionChannel',
          metrics: [{ id: 59, label: 'Cancellations' }],
        },
      ],
    },

    // ── Recent Records ───────────────────────────────────────────
    {
      type: 'rawTable',
      title: 'Recent Cancellations',
      label: 'Most Recent Cancellation Records',
      metricId: 59,
      columns: ['CancellationDate', 'CompanyAccount', 'SignupCountry', 'Vertical', 'AttributionChannel'],
      limit: 100,
    },
  ],
};
