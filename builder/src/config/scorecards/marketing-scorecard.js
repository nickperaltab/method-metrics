/**
 * Marketing Scorecard — 4 sections
 * Replicates the Looker Marketing Scorecard layout.
 */

const VIEWS = {
  v_trials: { dateCol: 'SignupDate' },
  v_syncs: { dateCol: 'SyncDate' },
};

export default {
  id: 'marketing-scorecard',
  title: 'Marketing Scorecard',
  status: 'pending',
  views: VIEWS,
  sections: [
    // ── 1. Snapshot ──────────────────────────────────────────
    {
      title: 'Snapshot',
      layout: 'scorecard-row',
      kpis: [
        { metricId: 361, label: 'Forecast', format: 'percent',
          valueSelector: 'current_or_latest' },
        { metricId: 300, label: 'Current Sync %', format: 'percent',
          valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Trials',
          chartType: 'bar', valueFormat: 'number', stacked: true, stackRemainder: true,
          lastNMonths: 1, showLabels: true,
          metrics: [
            { id: 294, label: 'Trajectory', color: '#2563eb' },
            { id: 285, label: 'Forecast', color: '#e84393' },
          ],
        },
        {
          label: 'Syncs',
          chartType: 'bar', valueFormat: 'number', stacked: true, stackRemainder: true,
          lastNMonths: 1, showLabels: true,
          metrics: [
            { id: 295, label: 'Trajectory', color: '#2563eb' },
            { id: 286, label: 'Forecast', color: '#e84393' },
          ],
        },
      ],
    },

    // ── 2. Trials ────────────────────────────────────────────
    {
      title: 'Trials',
      layout: 'scorecard-row',
      kpis: [
        { metricId: 285, label: 'Forecasted Trials', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 54, label: 'Trials To Date', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 294, label: 'Trials Trajectory', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 349, label: 'Trajectory vs. Forecast', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 350, label: 'Forecasted Attainment', format: 'percent2',
          valueSelector: 'current_or_latest' },
      ],
      tables: [
        {
          label: 'Trial Summary Table',
          lastNMonths: 4,
          columns: [
            { metricId: 54, label: 'Trial', format: 'number' },
            { metricId: 285, label: 'Forecasted Trials', format: 'number' },
            { metricId: 354, label: 'Forecast vs. Trials', format: 'number' },
            { metricId: 353, label: 'Budgeted Trials', format: 'number' },
            { metricId: 355, label: 'Budget vs. Trials', format: 'number' },
          ],
        },
      ],
      charts: [
        {
          label: 'Weekly Trials Actual',
          chartType: 'bar', valueFormat: 'number', timeBucket: 'week',
          lastNMonths: 2, showLabels: true,
          metrics: [
            { id: 54, label: 'Trial', color: '#9dc3e6' },
          ],
        },
        {
          label: 'Monthly Trials to Budget & Forecast',
          chartType: 'bar', valueFormat: 'number',
          lastNMonths: 4, showLabels: true,
          metrics: [
            { id: 353, label: 'Budgeted Trials', color: '#1e3a5f' },
            { id: 285, label: 'Forecasted Trials', color: '#2563eb' },
            { id: 54, label: 'Trial', color: '#9dc3e6' },
          ],
        },
      ],
    },

    // ── 3. Syncs ─────────────────────────────────────────────
    {
      title: 'Syncs',
      layout: 'scorecard-row',
      kpis: [
        { metricId: 286, label: 'Forecasted Syncs', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 55, label: 'Syncs To Date', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 295, label: 'Sync Trajectory', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 351, label: 'Trajectory vs. Forecast', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 352, label: 'Forecasted Attainment', format: 'percent2',
          valueSelector: 'current_or_latest' },
      ],
      tables: [
        {
          label: 'Sync Summary Table',
          lastNMonths: 4,
          columns: [
            { metricId: 55, label: 'Sync', format: 'number' },
            { metricId: 286, label: 'Forecasted Syncs', format: 'number' },
            { metricId: 359, label: 'Forecast vs. Syncs', format: 'number' },
            { metricId: 358, label: 'Budgeted Syncs', format: 'number' },
            { metricId: 360, label: 'Budget vs. Syncs', format: 'number' },
          ],
        },
      ],
      charts: [
        {
          label: 'Weekly Actual Syncs',
          chartType: 'bar', valueFormat: 'number', timeBucket: 'week',
          lastNMonths: 2, showLabels: true,
          metrics: [
            { id: 55, label: 'Sync', color: '#9dc3e6' },
          ],
        },
        {
          label: 'Monthly Syncs to Budget & Forecast',
          chartType: 'bar', valueFormat: 'number',
          lastNMonths: 4, showLabels: true,
          metrics: [
            { id: 358, label: 'Budgeted Syncs', color: '#1e3a5f' },
            { id: 286, label: 'Forecasted Syncs', color: '#2563eb' },
            { id: 55, label: 'Sync', color: '#9dc3e6' },
          ],
        },
      ],
    },

    // ── 4. Trial to Sync Rate ────────────────────────────────
    {
      title: 'Trial to Sync Rate',
      layout: 'scorecard-row',
      kpis: [
        { metricId: 361, label: 'Forecasted Sync %', format: 'percent',
          valueSelector: 'current_or_latest' },
        { metricId: 300, label: 'Current Sync %', format: 'percent',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 363, label: 'Actual vs. Forecast', format: 'percent2',
          valueSelector: 'current_or_latest' },
        { metricId: 364, label: 'Forecasted Attainment', format: 'percent2',
          valueSelector: 'current_or_latest' },
      ],
      tables: [
        {
          label: 'Sync Rate Summary Table',
          lastNMonths: 4,
          columns: [
            { metricId: 300, label: 'Actual Sync %', format: 'percent' },
            { metricId: 361, label: 'Forecasted Sync %', format: 'percent' },
            { metricId: 363, label: 'Actual vs. Forecast', format: 'percent' },
            { metricId: 362, label: 'Budgeted Sync Rate', format: 'percent' },
            { label: 'Actual vs. Budget', format: 'percent',
              derived: { a: 300, b: 362 } },
          ],
        },
      ],
      charts: [
        {
          label: 'Monthly Sync % to Budget & Forecast',
          chartType: 'bar', valueFormat: 'percent',
          lastNMonths: 4, showLabels: true,
          metrics: [
            { id: 362, label: 'Budgeted Sync %', color: '#1e3a5f' },
            { id: 361, label: 'Forecasted Sync %', color: '#2563eb' },
            { id: 300, label: 'Actual Sync %', color: '#9dc3e6' },
          ],
        },
      ],
    },
  ],
};
