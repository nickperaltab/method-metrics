/**
 * Customers Scorecard (entity grain)
 * Backed by metric 373 "Customers" on v_customers with Segment as a dimension.
 * Per-segment sections filter metric 373 via dimensionFilter; the Overview
 * adds a stacked bar + line grouped by Segment (Justin's Slack asks #1 and #2).
 */

export default {
  id: 'customer-segments',
  title: 'Customers',
  description: 'Customers grouped by billing entity. Franchises with multiple accounts count as one customer.',
  status: 'approved',
  hideGrain: true,
  views: {
    v_customers: { dateCol: 'Month' },
    v_customer_mrr: { dateCol: 'Month' },
  },
  sections: [
    // ── Overview ────────────────────────────────────────────────
    {
      title: 'Overview',
      description: 'Each customer falls into exactly one segment. DEP customers are always Team AI Plus regardless of user count.',
      kpis: [
        { metricId: 373, label: 'Total Customers', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 373, label: 'Solo no DEP', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true,
          dimensionFilter: { Segment: 'Solo no DEP' } },
        { metricId: 373, label: 'Small Team no DEP', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true,
          dimensionFilter: { Segment: '2-3 no DEP' } },
        { metricId: 373, label: 'Team no DEP', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true,
          dimensionFilter: { Segment: '4+ no DEP' } },
        { metricId: 373, label: 'Team AI Plus', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true,
          dimensionFilter: { Segment: 'Team AI Plus' } },
      ],
      charts: [
        {
          label: 'Customers by Segment',
          chartType: 'bar', valueFormat: 'number',
          stacked: true,
          showLabels: false,
          groupByDimension: 'Segment',
          metrics: [{ id: 373, label: 'Customers' }],
        },
        {
          label: 'Customers by Segment Over Time',
          chartType: 'line', valueFormat: 'number',
          showLabels: true,
          groupByDimension: 'Segment',
          metrics: [{ id: 373, label: 'Customers' }],
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
          metrics: [{ id: 373, label: 'Solo no DEP', color: '#6b7280',
                      dimensionFilter: { Segment: 'Solo no DEP' } }],
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
          metrics: [{ id: 373, label: '2-3 no DEP', color: '#3b82f6',
                      dimensionFilter: { Segment: '2-3 no DEP' } }],
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
          metrics: [{ id: 373, label: '4+ no DEP', color: '#7c3aed',
                      dimensionFilter: { Segment: '4+ no DEP' } }],
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
          metrics: [{ id: 373, label: 'Team AI Plus', color: '#059669',
                      dimensionFilter: { Segment: 'Team AI Plus' } }],
        },
      ],
    },

    // ── Retention ───────────────────────────────────────────────
    {
      title: 'Retention',
      description: 'Monthly MRR movements and retention rates. Cancellations and downgrades erode MRR; expansions recover it. GRR excludes expansions (pure retention); NRR includes them (net of all movements).',
      kpis: [
        { metricId: 382, label: 'Gross MRR Retention %', format: 'percent',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 383, label: 'Net MRR Retention %', format: 'percent',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 378, label: 'Start MRR', format: 'currency',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 379, label: 'Cancellations', format: 'currency',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 380, label: 'Downgrades', format: 'currency',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 381, label: 'Expansions', format: 'currency',
          valueSelector: 'current_or_latest', showDelta: true },
      ],
      charts: [
        {
          label: 'GRR & NRR Over Time',
          chartType: 'line', valueFormat: 'percent',
          showLabels: true,
          metrics: [
            { id: 382, label: 'GRR %', color: '#2563eb' },
            { id: 383, label: 'NRR %', color: '#059669' },
          ],
        },
        {
          label: 'MRR Movements by Month',
          chartType: 'bar', valueFormat: 'currency',
          showLabels: false,
          metrics: [
            { id: 381, label: 'Expansions', color: '#22c55e' },
            { id: 379, label: 'Cancellations', color: '#ef4444' },
            { id: 380, label: 'Downgrades', color: '#f59e0b' },
          ],
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
