/**
 * Customer Segments Scorecard
 * Entity-level (not account-level) segmentation by license tier × DEP status.
 *
 * Customer = EntityRecordID (groups franchise/multi-account companies as 1).
 * User count = SUM(UserPaidCount) across all accounts (historical, changes monthly).
 * DEP = any account in entity had a DEP transaction that month.
 * Segments are mutually exclusive: Team AI Plus > 4+ no DEP > 2-3 no DEP > Solo no DEP.
 */

export default {
  id: 'customer-segments',
  title: 'Customer Segments',
  group: 'customer',
  status: 'pending',
  views: {
    v_customer_segments: { dateCol: 'Month' },
  },
  sections: [
    // ── Overview ────────────────────────────────────────────────
    {
      title: 'Overview',
      kpis: [
        { metricId: 373, label: 'Total Customers', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 374, label: 'Solo no DEP', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 375, label: 'Small Team no DEP', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 376, label: 'Team no DEP', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 377, label: 'Team AI Plus', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
      ],
      charts: [
        {
          label: 'Total Customers Over Time',
          chartType: 'line', valueFormat: 'number',
          showLabels: true,
          metrics: [{ id: 373, label: 'Total Customers', color: '#2563eb' }],
        },
      ],
    },

    // ── Solo no DEP ─────────────────────────────────────────────
    {
      title: 'Solo no DEP (1 user)',
      charts: [
        {
          label: 'Solo no DEP by Month',
          chartType: 'bar', valueFormat: 'number',
          showLabels: true,
          metrics: [{ id: 374, label: 'Solo no DEP', color: '#6b7280' }],
        },
      ],
    },

    // ── Small Team no DEP ───────────────────────────────────────
    {
      title: 'Small Team no DEP (2-3 users)',
      charts: [
        {
          label: 'Small Team no DEP by Month',
          chartType: 'bar', valueFormat: 'number',
          showLabels: true,
          metrics: [{ id: 375, label: '2-3 no DEP', color: '#3b82f6' }],
        },
      ],
    },

    // ── Team no DEP ─────────────────────────────────────────────
    {
      title: 'Team no DEP (4+ users)',
      charts: [
        {
          label: 'Team no DEP by Month',
          chartType: 'bar', valueFormat: 'number',
          showLabels: true,
          metrics: [{ id: 376, label: '4+ no DEP', color: '#7c3aed' }],
        },
      ],
    },

    // ── Team AI Plus ────────────────────────────────────────────
    {
      title: 'Team AI Plus (DEP)',
      charts: [
        {
          label: 'Team AI Plus by Month',
          chartType: 'bar', valueFormat: 'number',
          showLabels: true,
          metrics: [{ id: 377, label: 'Team AI Plus', color: '#059669' }],
        },
      ],
    },

    // ── Customer List ───────────────────────────────────────────
    {
      type: 'rawTable',
      title: 'Customer List',
      label: 'All Customers (Current Month)',
      metricId: 373,
      columns: ['EntityFullName', 'AccountCount', 'TotalUsers', 'HasDEP', 'Segment'],
      limit: 200,
    },
  ],
};
