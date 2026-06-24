/**
 * Customers Scorecard (entity grain)
 * Backed by metric 373 "Customers" on int_customers with Segment as a dimension.
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
    int_customers: { dateCol: 'Month' },
    int_customer_mrr: { dateCol: 'Month' },
    int_customer_annual_mrr: { dateCol: 'Month' },
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
      description: 'Annual Pre-FX retention rates and the 12-month cohort movements behind them. Each month compares to the same month 12 months prior. Matches the Annual Summary column from the board deck.',
      kpis: [
        { metricId: 388, label: 'Annual GRR %', format: 'percent',
          valueSelector: 'latest' },
        { metricId: 389, label: 'Annual NRR %', format: 'percent',
          valueSelector: 'latest' },
        { metricId: 384, label: 'Start MRR (12m ago)', format: 'currency',
          valueSelector: 'latest' },
        { metricId: 385, label: 'Cancellations', format: 'currency',
          valueSelector: 'latest' },
        { metricId: 386, label: 'Downgrades', format: 'currency',
          valueSelector: 'latest' },
        { metricId: 387, label: 'Expansions', format: 'currency',
          valueSelector: 'latest' },
      ],
      charts: [
        {
          label: 'Annual GRR & NRR Over Time',
          chartType: 'line', valueFormat: 'percent',
          showLabels: true,
          metrics: [
            { id: 388, label: 'GRR %', color: '#2563eb' },
            { id: 389, label: 'NRR %', color: '#059669' },
          ],
        },
        {
          label: '12-Month MRR Movements',
          chartType: 'bar', valueFormat: 'currency',
          showLabels: false,
          metrics: [
            { id: 387, label: 'Expansions', color: '#22c55e' },
            { id: 385, label: 'Cancellations', color: '#ef4444' },
            { id: 386, label: 'Downgrades', color: '#f59e0b' },
          ],
        },
      ],
    },

    // ── Monthly Retention ───────────────────────────────────────
    {
      title: 'Monthly Retention',
      description: 'Month-over-month retention: each month compared to the immediately prior month. This is the customer-grain equivalent of the Looker NRR/GRR chart — same data source (TransLineFlattened), but rolls multi-account customers up to one record by EntityRecordID. A franchise with multiple billing accounts where one closes but others stay shows here as a Downgrade (the customer is smaller); the Looker chart shows it as a Churn (one account fully cancelled). Same dollars at risk; different classification. Customers whose entire prior-month SaaS was Prepay Expiry Income are excluded from both Start MRR and Cancellations (symmetric, CEO-confirmed methodology 2026-04-28). Headline GRR/NRR lands within ~10bp of the Looker chart.',
      kpis: [
        { metricId: 382, label: 'Monthly GRR %', format: 'percent',
          valueSelector: 'latest', showDelta: true },
        { metricId: 383, label: 'Monthly NRR %', format: 'percent',
          valueSelector: 'latest', showDelta: true },
        { metricId: 378, label: 'Start MRR (last month)', format: 'currency',
          valueSelector: 'latest' },
        { metricId: 379, label: 'Cancellations', format: 'currency',
          valueSelector: 'latest' },
        { metricId: 380, label: 'Downgrades', format: 'currency',
          valueSelector: 'latest' },
        { metricId: 381, label: 'Expansions', format: 'currency',
          valueSelector: 'latest' },
      ],
      charts: [
        {
          label: 'Monthly GRR & NRR Over Time',
          chartType: 'line', valueFormat: 'percent',
          showLabels: true,
          metrics: [
            { id: 382, label: 'GRR %', color: '#2563eb' },
            { id: 383, label: 'NRR %', color: '#059669' },
          ],
        },
        {
          label: 'Monthly MRR Movements',
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

    // ── Retention by Segment ────────────────────────────────────
    {
      title: 'Retention by Segment',
      description: 'Annual GRR and NRR broken out by customer segment. Each segment weighted by its Start MRR 12 months ago.',
      layout: 'column',
      charts: [
        {
          label: 'Annual GRR % by Segment',
          chartType: 'line', valueFormat: 'percent',
          showLabels: false,
          groupByDimension: 'Segment',
          metrics: [{ id: 388, label: 'GRR %' }],
        },
        {
          label: 'Annual NRR % by Segment',
          chartType: 'line', valueFormat: 'percent',
          showLabels: false,
          groupByDimension: 'Segment',
          metrics: [{ id: 389, label: 'NRR %' }],
        },
      ],
    },

    // ── Cohort survival ─────────────────────────────────────────
    {
      title: 'Cohort Survival by First-Pay Vintage',
      component: 'cohortSurvival',
      dbtModel: 'int_customer_survival',
    },

    // ── Retention triangle ──────────────────────────────────────
    {
      title: 'Customer Retention Triangle',
      component: 'retentionTriangle',
      dbtModel: 'int_customer_retention_triangle',
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
