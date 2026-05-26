/**
 * Syncs Dashboard
 * Overview + dimension breakdowns, all driven from semantic layer (int_syncs).
 */

export default {
  id: 'syncs-breakdown',
  title: 'Syncs',
  status: 'approved',
  group: 'funnel',
  views: {
    int_syncs: { dateCol: 'SyncDate' },
  },
  sections: [
    // ── Overview ────────────────────────────────────────────────
    {
      title: 'Overview',
      kpis: [
        { metricId: 55, label: 'Syncs This Month', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
      ],
      charts: [
        {
          label: 'Monthly Syncs',
          chartType: 'bar', valueFormat: 'number',
          showLabels: true,
          metrics: [{ id: 55, label: 'Syncs', color: '#059669' }],
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

    // ── Weekly ───────────────────────────────────────────────────
    {
      title: 'Weekly',
      charts: [
        {
          label: 'Syncs by Week',
          chartType: 'bar', valueFormat: 'number',
          timeBucket: 'week', lastNMonths: 2, showLabels: true,
          metrics: [{ id: 55, label: 'Syncs', color: '#059669' }],
        },
      ],
    },

    // ── Breakdowns (rendered as tabs) ───────────────────────────
    {
      title: 'By Country',
      group: 'breakdowns',
      charts: [
        {
          label: 'Syncs by Country',
          chartType: 'bar', valueFormat: 'number', stacked: true,
          groupByDimension: 'SignupCountry',
          metrics: [{ id: 55, label: 'Syncs' }],
        },
      ],
    },
    {
      title: 'By Vertical',
      group: 'breakdowns',
      charts: [
        {
          label: 'Syncs by Vertical',
          chartType: 'bar', valueFormat: 'number', stacked: true,
          groupByDimension: 'Vertical',
          metrics: [{ id: 55, label: 'Syncs' }],
        },
      ],
    },
    {
      title: 'By Sync Type',
      group: 'breakdowns',
      charts: [
        {
          label: 'Syncs by Sync Type',
          chartType: 'bar', valueFormat: 'number', stacked: true,
          groupByDimension: 'SyncType',
          metrics: [{ id: 55, label: 'Syncs' }],
        },
      ],
    },
    {
      title: 'By Channel',
      group: 'breakdowns',
      charts: [
        {
          label: 'Syncs by Attribution Channel',
          chartType: 'bar', valueFormat: 'number', stacked: true,
          groupByDimension: 'AttributionChannel',
          metrics: [{ id: 55, label: 'Syncs' }],
        },
      ],
    },

    // ── Recent Records ───────────────────────────────────────────
    {
      type: 'rawTable',
      title: 'Recent Syncs',
      label: 'Most Recent Sync Records',
      metricId: 55,
      columns: ['SyncDate', 'CompanyAccount', 'SignupCountry', 'Vertical', 'AttributionChannel', 'SyncType'],
      limit: 100,
    },
  ],
};
