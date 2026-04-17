/**
 * Customers Scorecard
 * Entity-level segmentation by license tier × DEP status.
 */

export default {
  id: 'customer-segments',
  title: 'Customers',
  description: 'Customer counts by product segment. A "customer" is a billing entity — companies with multiple accounts (e.g. franchises) are grouped as one. User count is the sum of paid users across all accounts.',
  status: 'approved',
  hideGrain: true,
  views: {
    v_customer_segments: { dateCol: 'Month' },
  },
  sections: [
    // ── Overview ────────────────────────────────────────────────
    {
      title: 'Overview',
      description: 'Total customer count across all segments. Each customer appears in exactly one segment.',
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
      title: 'Solo no DEP',
      description: '1 paid user, no DEP. Smallest tier — individual users on base SaaS only.',
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
      title: 'Small Team no DEP',
      description: '2–3 paid users, no DEP. Small teams on base SaaS only.',
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
      title: 'Team no DEP',
      description: '4+ paid users, no DEP. Larger teams on base SaaS only.',
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
      title: 'Team AI Plus',
      description: 'Customers billed for DEP (any user count). DEP is identified by "Enhancement Plan" or "Premium App" billing line items.',
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
      description: 'All customers for the most recent month. Click column headers to sort. Use search to filter.',
      label: 'All Customers',
      metricId: 373,
      columns: ['EntityFullName', 'AccountCount', 'TotalUsers', 'HasDEP', 'Segment'],
      limit: 4000,
    },
  ],
};
