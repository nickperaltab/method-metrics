/**
 * DEP Revenue Scorecard
 * Semantic layer — New DEP + Total DEP with dimension breakdowns.
 * Pattern matches Trials/Syncs/Conversions scorecards.
 */

export default {
  id: 'dep-revenue',
  title: 'DEP Revenue',
  group: 'revenue',
  status: 'pending',
  views: {
    v_new_dep_revenue: { dateCol: 'TxnDate' },
    v_total_dep_revenue: { dateCol: 'TxnDate' },
  },
  sections: [
    // ── New DEP Revenue Overview ────────────────────────────────
    {
      title: 'New DEP Revenue',
      kpis: [
        { metricId: 329, label: 'New DEP Revenue This Month', format: 'currency',
          valueSelector: 'current_or_latest', showDelta: true },
      ],
      charts: [
        {
          label: 'Monthly New DEP Revenue',
          chartType: 'bar', valueFormat: 'currency',
          showLabels: true,
          metrics: [{ id: 329, label: 'New DEP Revenue', color: '#2563eb' }],
        },
      ],
    },

    // ── Total DEP Revenue Overview ──────────────────────────────
    {
      title: 'Total DEP Revenue',
      kpis: [
        { metricId: 333, label: 'Total DEP Revenue This Month', format: 'currency',
          valueSelector: 'current_or_latest', showDelta: true },
      ],
      charts: [
        {
          label: 'Monthly Total DEP Revenue',
          chartType: 'bar', valueFormat: 'currency',
          showLabels: true,
          metrics: [{ id: 333, label: 'Total DEP Revenue', color: '#7c3aed' }],
        },
      ],
    },

    // ── Year over Year ──────────────────────────────────────────
    {
      title: 'Year over Year',
      charts: [
        {
          label: 'New DEP Revenue: This Year vs Last Year',
          chartType: 'bar', valueFormat: 'currency',
          yoy: true,
          metrics: [{ id: 329, label: 'New DEP Revenue' }],
        },
        {
          label: 'Total DEP Revenue: This Year vs Last Year',
          chartType: 'bar', valueFormat: 'currency',
          yoy: true,
          metrics: [{ id: 333, label: 'Total DEP Revenue' }],
        },
      ],
    },

    // ── Weekly ──────────────────────────────────────────────────
    {
      title: 'Weekly',
      charts: [
        {
          label: 'New DEP Revenue by Week',
          chartType: 'bar', valueFormat: 'currency',
          timeBucket: 'week', lastNMonths: 2, showLabels: true,
          metrics: [{ id: 329, label: 'New DEP Revenue', color: '#2563eb' }],
        },
        {
          label: 'Total DEP Revenue by Week',
          chartType: 'bar', valueFormat: 'currency',
          timeBucket: 'week', lastNMonths: 2, showLabels: true,
          metrics: [{ id: 333, label: 'Total DEP Revenue', color: '#7c3aed' }],
        },
      ],
    },

    // ── Breakdowns (rendered as tabs) ───────────────────────────
    {
      title: 'By Channel',
      group: 'breakdowns',
      charts: [
        {
          label: 'New DEP Revenue by Channel',
          chartType: 'bar', valueFormat: 'currency',
          groupByDimension: 'AttributionChannel',
          metrics: [{ id: 329, label: 'New DEP Revenue' }],
        },
      ],
    },
    {
      title: 'By Vertical',
      group: 'breakdowns',
      charts: [
        {
          label: 'New DEP Revenue by Vertical',
          chartType: 'bar', valueFormat: 'currency',
          groupByDimension: 'Vertical',
          metrics: [{ id: 329, label: 'New DEP Revenue' }],
        },
      ],
    },
    {
      title: 'By Country',
      group: 'breakdowns',
      charts: [
        {
          label: 'New DEP Revenue by Country',
          chartType: 'bar', valueFormat: 'currency',
          groupByDimension: 'SignupCountry',
          metrics: [{ id: 329, label: 'New DEP Revenue' }],
        },
      ],
    },
    {
      title: 'By Sync Type',
      group: 'breakdowns',
      charts: [
        {
          label: 'New DEP Revenue by Sync Type',
          chartType: 'bar', valueFormat: 'currency',
          groupByDimension: 'SyncType',
          metrics: [{ id: 329, label: 'New DEP Revenue' }],
        },
      ],
    },

  ],
};
