/**
 * Conversions Dashboard
 * Overview + dimension breakdowns, all driven from semantic layer (v_conversions).
 */

export default {
  id: 'conversions-breakdown',
  title: 'Conversions',
  status: 'approved',
  views: {
    v_conversions: { dateCol: 'FirstSaaSInvoiceTxnDate' },
  },
  sections: [
    // ── Overview ────────────────────────────────────────────────
    {
      title: 'Overview',
      kpis: [
        { metricId: 56, label: 'Conversions This Month', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
      ],
      charts: [
        {
          label: 'Monthly Conversions',
          chartType: 'bar', valueFormat: 'number',
          lastNMonths: 6, showLabels: true,
          metrics: [{ id: 56, label: 'Conversions', color: '#0891b2' }],
        },
      ],
    },

    // ── Year over Year ───────────────────────────────────────────
    {
      title: 'Year over Year',
      charts: [
        {
          label: 'Conversions: This Year vs Last Year',
          chartType: 'bar', valueFormat: 'number',
          yoy: true,
          metrics: [{ id: 56, label: 'Conversions' }],
        },
      ],
    },

    // ── Weekly ───────────────────────────────────────────────────
    {
      title: 'Weekly',
      charts: [
        {
          label: 'Conversions by Week',
          chartType: 'bar', valueFormat: 'number',
          timeBucket: 'week', lastNMonths: 2, showLabels: true,
          metrics: [{ id: 56, label: 'Conversions', color: '#0891b2' }],
        },
      ],
    },

    // ── Breakdowns (rendered as tabs) ───────────────────────────
    {
      title: 'By Country',
      group: 'breakdowns',
      charts: [
        {
          label: 'Conversions by Country',
          chartType: 'bar', valueFormat: 'number', stacked: true,
          lastNMonths: 6, groupByDimension: 'SignupCountry',
          metrics: [{ id: 56, label: 'Conversions' }],
        },
      ],
    },
    {
      title: 'By Vertical',
      group: 'breakdowns',
      charts: [
        {
          label: 'Conversions by Vertical',
          chartType: 'bar', valueFormat: 'number', stacked: true,
          lastNMonths: 6, groupByDimension: 'Vertical',
          metrics: [{ id: 56, label: 'Conversions' }],
        },
      ],
    },
    {
      title: 'By Sync Type',
      group: 'breakdowns',
      charts: [
        {
          label: 'Conversions by Sync Type',
          chartType: 'bar', valueFormat: 'number', stacked: true,
          lastNMonths: 6, groupByDimension: 'SyncType',
          metrics: [{ id: 56, label: 'Conversions' }],
        },
      ],
    },
    {
      title: 'By Channel',
      group: 'breakdowns',
      charts: [
        {
          label: 'Conversions by Attribution Channel',
          chartType: 'bar', valueFormat: 'number', stacked: true,
          lastNMonths: 6, groupByDimension: 'AttributionChannel',
          metrics: [{ id: 56, label: 'Conversions' }],
        },
      ],
    },

    // ── Recent Records ───────────────────────────────────────────
    {
      type: 'rawTable',
      title: 'Recent Conversions',
      label: 'Most Recent Conversion Records',
      metricId: 56,
      columns: ['FirstSaaSInvoiceTxnDate', 'CompanyAccount', 'SignupCountry', 'Vertical', 'AttributionChannel'],
      limit: 100,
    },
  ],
};
