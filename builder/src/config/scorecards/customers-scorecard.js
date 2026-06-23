/**
 * Customers Scorecard
 * Semantic layer — Active, New, Churned customers from int_customers.
 * Dimensions: AttributionChannel, SignupCountry, Vertical, SyncType, HasDEP.
 */

export default {
  id: 'customers',
  title: 'Accounts',
  group: 'customer',
  status: 'pending',
  views: {
    v_accounts: { dateCol: 'Month' },
  },
  sections: [
    // ── Overview ────────────────────────────────────────────────
    {
      title: 'Overview',
      kpis: [
        { metricId: 370, label: 'Customers', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 371, label: 'New Customers', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 372, label: 'Churned Customers', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
      ],
      charts: [
        {
          label: 'Customers by Month',
          chartType: 'line', valueFormat: 'number',
          showLabels: true,
          metrics: [{ id: 370, label: 'Customers', color: '#2563eb' }],
        },
        {
          label: 'New vs Churned by Month',
          chartType: 'bar', valueFormat: 'number',
          showLabels: true,
          metrics: [
            { id: 371, label: 'New Customers', color: '#22c55e' },
            { id: 372, label: 'Churned Customers', color: '#ef4444' },
          ],
        },
      ],
    },

    // ── Year over Year ──────────────────────────────────────────
    {
      title: 'Year over Year',
      charts: [
        {
          label: 'Customers: This Year vs Last Year',
          chartType: 'bar', valueFormat: 'number',
          yoy: true,
          metrics: [{ id: 370, label: 'Customers' }],
        },
      ],
    },

    // ── Breakdowns ──────────────────────────────────────────────
    {
      title: 'By Product (DEP)',
      group: 'breakdowns',
      charts: [
        {
          label: 'Customers by DEP Status',
          chartType: 'bar', valueFormat: 'number',
          groupByDimension: 'HasDEP',
          metrics: [{ id: 370, label: 'Customers' }],
        },
      ],
    },
    {
      title: 'By Channel',
      group: 'breakdowns',
      charts: [
        {
          label: 'Customers by Channel',
          chartType: 'bar', valueFormat: 'number',
          groupByDimension: 'AttributionChannel',
          metrics: [{ id: 370, label: 'Customers' }],
        },
      ],
    },
    {
      title: 'By Vertical',
      group: 'breakdowns',
      charts: [
        {
          label: 'Customers by Vertical',
          chartType: 'bar', valueFormat: 'number',
          groupByDimension: 'Vertical',
          metrics: [{ id: 370, label: 'Customers' }],
        },
      ],
    },
    {
      title: 'By Country',
      group: 'breakdowns',
      charts: [
        {
          label: 'Customers by Country',
          chartType: 'bar', valueFormat: 'number',
          groupByDimension: 'SignupCountry',
          metrics: [{ id: 370, label: 'Customers' }],
        },
      ],
    },
    {
      title: 'By Sync Type',
      group: 'breakdowns',
      charts: [
        {
          label: 'Customers by Sync Type',
          chartType: 'bar', valueFormat: 'number',
          groupByDimension: 'SyncType',
          metrics: [{ id: 370, label: 'Customers' }],
        },
      ],
    },

    // ── Cohort survival ─────────────────────────────────────────
    {
      title: 'Cohort Survival by First-Pay Vintage',
      component: 'cohortSurvival',
    },
  ],
};
