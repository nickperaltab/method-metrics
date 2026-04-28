/**
 * Revenue Engine Scorecard
 *
 * Mirrors the three-pillar framework documented in
 * Obsidian Vault / Rev Ops System / Q1-2026-Roadmap / Revenue-Engine-Visual-Framework.md
 *
 *   ARR Growth = New Logo ARR + (NRR − 1) × Starting ARR
 *   NRR = GRR + Expansion Rate
 *
 * Sections: Snapshot → Acquire → Expand → Retain → ARR Bridge.
 *
 * Status: pending — this is a testing ground. Empty/placeholder slots are
 * intentional — fill them in as the underlying metrics get built (ARPC,
 * PS Attach Rate, New Logo ARR, 180+ day cohort churn, activation rate).
 */

// Pillar colors match the framework doc (RETAIN red, EXPAND blue, ACQUIRE green).
const COLOR_ACQUIRE = '#4CAF50';
const COLOR_EXPAND  = '#2196F3';
const COLOR_RETAIN  = '#e94560';

export default {
  id: 'revenue-engine',
  title: 'Revenue Engine',
  group: 'revenue',
  status: 'pending',
  views: {
    v_conversions:          { dateCol: 'FirstSaaSInvoiceTxnDate' },
    v_customer_mrr:         { dateCol: 'Month' },
    v_customer_annual_mrr:  { dateCol: 'Month' },
    v_cancellations:        { dateCol: 'CancellationDate' },
  },
  sections: [
    // ── Snapshot — composite view across all three pillars ───────
    {
      title: 'Snapshot',
      description: 'NRR = GRR + Expansion. The two engines that drive ARR growth — plus new-logo acquisition.',
      kpis: [
        { metricId: 388, label: 'Annual GRR %',  format: 'percent',
          valueSelector: 'current_or_latest' },
        { metricId: 389, label: 'Annual NRR %',  format: 'percent',
          valueSelector: 'current_or_latest' },
        { metricId: 56,  label: 'Conversions This Month', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
      ],
    },

    // ── Acquire — new logo growth ────────────────────────────────
    {
      title: 'Acquire',
      description: 'New paying customers added each month. Future: New Logo ARR, win rate, pipeline velocity.',
      kpis: [
        { metricId: 56, label: 'Conversions This Month', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
      ],
      charts: [
        {
          label: 'Monthly Conversions',
          chartType: 'bar', valueFormat: 'number',
          showLabels: true,
          metrics: [{ id: 56, label: 'Conversions', color: COLOR_ACQUIRE }],
        },
        {
          label: 'Conversions: This Year vs Last Year',
          chartType: 'bar', valueFormat: 'number',
          yoy: true,
          metrics: [{ id: 56, label: 'Conversions' }],
        },
      ],
    },

    // ── Expand — grow what stays ─────────────────────────────────
    {
      title: 'Expand',
      description: 'Revenue from existing customers growing. Future: ARPC growth ($168 → $178 target), PS attach rate (23% → TBD), expansion rate %.',
      kpis: [
        { metricId: 387, label: 'Annual Expansions ($)',  format: 'currency',
          valueSelector: 'current_or_latest' },
        { metricId: 381, label: 'Monthly Expansions ($)', format: 'currency',
          valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Monthly Expansions ($)',
          chartType: 'bar', valueFormat: 'currency',
          showLabels: true,
          metrics: [{ id: 381, label: 'Expansions ($)', color: COLOR_EXPAND }],
        },
        {
          label: 'Annual Expansions ($)',
          chartType: 'bar', valueFormat: 'currency',
          showLabels: true,
          metrics: [{ id: 387, label: 'Annual Expansions ($)', color: COLOR_EXPAND }],
        },
      ],
    },

    // ── Retain — stop the bleeding ───────────────────────────────
    {
      title: 'Retain',
      description: 'Keeping the existing base. GRR is the retention floor before expansion.',
      kpis: [
        { metricId: 382, label: 'Monthly GRR %',          format: 'percent',
          valueSelector: 'current_or_latest' },
        { metricId: 388, label: 'Annual GRR %',           format: 'percent',
          valueSelector: 'current_or_latest' },
        { metricId: 379, label: 'Monthly Cancellations',  format: 'currency',
          valueSelector: 'current_or_latest' },
        { metricId: 380, label: 'Monthly Downgrades',     format: 'currency',
          valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Monthly Cancellations ($)',
          chartType: 'bar', valueFormat: 'currency',
          showLabels: true,
          metrics: [{ id: 379, label: 'Cancellations ($)', color: COLOR_RETAIN }],
        },
        {
          label: 'Monthly Downgrades ($)',
          chartType: 'bar', valueFormat: 'currency',
          showLabels: true,
          metrics: [{ id: 380, label: 'Downgrades ($)', color: COLOR_RETAIN }],
        },
      ],
      tables: [
        {
          label: 'Monthly Retention Summary',
          lastNMonths: 4,
          columns: [
            { metricId: 378, label: 'Start MRR',     format: 'currency' },
            { metricId: 379, label: 'Cancellations', format: 'currency' },
            { metricId: 380, label: 'Downgrades',    format: 'currency' },
            { metricId: 381, label: 'Expansions',    format: 'currency' },
            { metricId: 382, label: 'GRR %',         format: 'percent'  },
            { metricId: 383, label: 'NRR %',         format: 'percent'  },
          ],
        },
        {
          label: 'Annual Retention Summary (12-month cohort)',
          lastNMonths: 4,
          columns: [
            { metricId: 384, label: 'Start MRR (12m ago)', format: 'currency' },
            { metricId: 385, label: 'Cancellations',       format: 'currency' },
            { metricId: 386, label: 'Downgrades',          format: 'currency' },
            { metricId: 387, label: 'Expansions',          format: 'currency' },
            { metricId: 388, label: 'GRR %',               format: 'percent'  },
            { metricId: 389, label: 'NRR %',               format: 'percent'  },
          ],
        },
      ],
    },

    // ── ARR Bridge — operational view ────────────────────────────
    {
      title: 'ARR Bridge',
      description: 'Starting MRR + Expansions − Downgrades − Cancellations = Ending MRR. The monthly bridge run by Finance/CS to see which engine is moving (or dragging) ARR.',
      charts: [
        {
          label: 'Monthly Movement Components',
          chartType: 'bar', valueFormat: 'currency',
          showLabels: true,
          metrics: [
            { id: 381, label: 'Expansions',     color: COLOR_EXPAND },
            { id: 380, label: 'Downgrades',     color: '#f59e0b' },
            { id: 379, label: 'Cancellations',  color: COLOR_RETAIN },
          ],
        },
      ],
    },
  ],
};
