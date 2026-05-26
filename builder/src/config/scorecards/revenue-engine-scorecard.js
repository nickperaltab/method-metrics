/**
 * Revenue Engine Scorecard
 *
 * Mirrors the three-pillar framework documented in
 * Obsidian Vault / Rev Ops System / Q1-2026-Roadmap / Revenue-Engine-Visual-Framework.md
 *
 *   ARR Growth = New Logo ARR + (NRR − 1) × Starting ARR
 *   NRR = GRR + Expansion Rate
 *
 * Three sections — Acquire / Expand / Retain — one KPI + one chart per pillar,
 * plus a monthly retention summary table on Retain. Monthly grain only.
 *
 * KPIs use `valueSelector: 'latest'` because the underlying retention views
 * exclude the current incomplete month — without 'latest', current_or_latest
 * resolves to zero for any metric whose data lags by one month.
 *
 * Status: pending — testing ground. Future slots called out in section
 * descriptions (ARPC, PS Attach Rate, New Logo ARR) are intentionally
 * empty until the underlying metrics are built.
 */

const COLOR_ACQUIRE = '#4CAF50';
const COLOR_EXPAND  = '#2196F3';
const COLOR_RETAIN  = '#e94560';

export default {
  id: 'revenue-engine',
  title: 'Revenue Engine',
  group: 'revenue',
  status: 'pending',
  // Fetch all available history (default 13 months is too short to zoom out
  // past the trailing year). MRR/Conversions data is small at month-grain,
  // so unbounded fetch is cheap.
  historyMonths: null,
  views: {
    int_conversions:    { dateCol: 'FirstSaaSInvoiceTxnDate' },
    int_customer_mrr:   { dateCol: 'Month' },
  },
  sections: [
    // ── Acquire — new logo growth ────────────────────────────────
    {
      title: 'Acquire',
      description: 'New paying customers added each month. Future: New Logo ARR, win rate, pipeline velocity.',
      kpis: [
        { metricId: 56, label: 'Conversions', format: 'number',
          valueSelector: 'latest', showDelta: true },
      ],
      charts: [
        {
          label: 'Monthly Conversions',
          chartType: 'bar', valueFormat: 'number',
          showLabels: true,
          metrics: [{ id: 56, label: 'Conversions', color: COLOR_ACQUIRE }],
        },
      ],
    },

    // ── Expand — grow what stays ─────────────────────────────────
    {
      title: 'Expand',
      description: 'Revenue from existing customers growing. Future: ARPC growth, PS attach rate, expansion rate %.',
      kpis: [
        { metricId: 381, label: 'Monthly Expansions ($)', format: 'currency',
          valueSelector: 'latest', showDelta: true },
      ],
      charts: [
        {
          label: 'Monthly Expansions ($)',
          chartType: 'bar', valueFormat: 'currency',
          showLabels: true,
          metrics: [{ id: 381, label: 'Expansions', color: COLOR_EXPAND }],
        },
      ],
    },

    // ── Retain — stop the bleeding ───────────────────────────────
    {
      title: 'Retain',
      description: 'Keeping the existing base. GRR is the retention floor before expansion.',
      kpis: [
        { metricId: 382, label: 'Monthly GRR %',         format: 'percent',
          valueSelector: 'latest' },
        { metricId: 383, label: 'Monthly NRR %',         format: 'percent',
          valueSelector: 'latest' },
        { metricId: 379, label: 'Monthly Cancellations', format: 'currency',
          valueSelector: 'latest' },
        { metricId: 380, label: 'Monthly Downgrades',    format: 'currency',
          valueSelector: 'latest' },
      ],
      charts: [
        {
          label: 'Monthly Cancellations ($)',
          chartType: 'bar', valueFormat: 'currency',
          showLabels: true,
          metrics: [{ id: 379, label: 'Cancellations', color: COLOR_RETAIN }],
        },
      ],
      tables: [
        {
          label: 'Monthly Retention Summary',
          lastNMonths: 6,
          columns: [
            { metricId: 378, label: 'Start MRR',     format: 'currency' },
            { metricId: 379, label: 'Cancellations', format: 'currency' },
            { metricId: 380, label: 'Downgrades',    format: 'currency' },
            { metricId: 381, label: 'Expansions',    format: 'currency' },
            { metricId: 382, label: 'GRR %',         format: 'percent'  },
            { metricId: 383, label: 'NRR %',         format: 'percent'  },
          ],
        },
      ],
    },
  ],
};
