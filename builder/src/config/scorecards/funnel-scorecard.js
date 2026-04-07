/**
 * Funnel Dashboard
 * Full Trials → Syncs → Conversions pipeline with rate metrics.
 * Depends on metrics 54 (Trials), 55 (Syncs), 56 (Conversions).
 * Rate metrics 300, 301, 302 are computed from those primitives.
 */

export default {
  id: 'funnel',
  title: 'Funnel',
  status: 'pending',
  sections: [
    // ── Overview ────────────────────────────────────────────────
    {
      title: 'Overview',
      kpis: [
        { metricId: 54, label: 'Trials This Month', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 55, label: 'Syncs This Month', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 56, label: 'Conversions This Month', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
      ],
      charts: [
        {
          label: 'Trials, Syncs & Conversions',
          chartType: 'bar', valueFormat: 'number', lastNMonths: 6,
          metrics: [
            { id: 54, label: 'Trials', color: '#2563eb' },
            { id: 55, label: 'Syncs', color: '#059669' },
            { id: 56, label: 'Conversions', color: '#dc2626' },
          ],
        },
      ],
    },

    // ── Sync Rate ────────────────────────────────────────────────
    {
      title: 'Sync Rate',
      kpis: [
        { metricId: 300, label: 'Sync Rate', format: 'percent',
          valueSelector: 'current_or_latest', showDelta: true },
      ],
      charts: [
        {
          label: 'Sync Rate Over Time',
          chartType: 'line', valueFormat: 'percent', lastNMonths: 12,
          metrics: [{ id: 300, label: 'Sync Rate', color: '#7c3aed' }],
        },
      ],
    },

    // ── Trial-to-Close Rate ──────────────────────────────────────
    {
      title: 'Trial-to-Close Rate',
      kpis: [
        { metricId: 302, label: 'Trial-to-Close Rate', format: 'percent',
          valueSelector: 'current_or_latest', showDelta: true },
      ],
      charts: [
        {
          label: 'Trial-to-Close Rate Over Time',
          chartType: 'line', valueFormat: 'percent', lastNMonths: 12,
          metrics: [{ id: 302, label: 'Trial-to-Close Rate', color: '#dc2626' }],
        },
      ],
    },

    // ── Sync-to-Conversion Rate ──────────────────────────────────
    {
      title: 'Sync-to-Conversion Rate',
      kpis: [
        { metricId: 301, label: 'Sync-to-Conversion Rate', format: 'percent',
          valueSelector: 'current_or_latest', showDelta: true },
      ],
      charts: [
        {
          label: 'Sync-to-Conversion Rate Over Time',
          chartType: 'line', valueFormat: 'percent', lastNMonths: 12,
          metrics: [{ id: 301, label: 'Sync-to-Conversion Rate', color: '#ea580c' }],
        },
      ],
    },
  ],
};
