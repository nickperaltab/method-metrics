/**
 * Method Monday — compact month-pacing view.
 *
 * Convention: every actual excludes today, and every trajectory divides by
 * complete days only (day_of_month - 1). See
 * docs/superpowers/specs/2026-08-10-method-monday-design.md.
 *
 * This deliberately diverges from Looker's Sales page, which counts through
 * today. It matches Looker's Method Monday page.
 *
 * Attainment tiles (Trials/Syncs Attainment) are trajectory ÷ forecast as a
 * percentage. Looker labels the equivalent tiles "Forecast vs Trajectory,"
 * which is wrong — that name belongs to the absolute-difference tiles beside
 * them. This page keeps both quantities and names them correctly.
 *
 * Sync Conversion Rate gets one tile, not two: on this convention its
 * trajectory equals its actual (numerator and denominator both scale by
 * days_in_month / elapsed_days, so the ratio is scale-invariant). A separate
 * trajectory tile would just repeat the same number.
 *
 * Churn Rate (Looker metrics 344/345) is deliberately not included — both are
 * raw chart_sql on the through-today convention, and putting them on this
 * through-yesterday page would reintroduce the exact mismatch this page
 * exists to remove. Deferred, not dropped; see the design doc.
 */

const EXCLUDES_TODAY =
  'All figures exclude today. Trajectories project from complete days only, so they do not move during the day.';

export default {
  id: 'method-monday',
  title: 'Method Monday',
  status: 'pending',
  views: {
    int_method_monday: { dateCol: 'period' },
  },
  sections: [
    // ── Acquisition: Sync %, Trials, Syncs ───────────────────────
    {
      title: 'Acquisition',
      layout: 'scorecard-row',
      description: EXCLUDES_TODAY,
      kpis: [
        { metricId: 361, label: 'Sync % Forecast', format: 'percent',
          valueSelector: 'current_or_latest' },
        { metricId: 414, label: 'Sync % Actual', format: 'percent',
          valueSelector: 'current_or_latest' },

        { metricId: 285, label: 'Trials Forecast', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 406, label: 'Trials MTD', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 410, label: 'Trials Trajectory', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 415, label: 'Trials Forecast vs. Trajectory', format: 'number',
          valueSelector: 'current_or_latest' },
        // Attainment, not "Forecast vs Trajectory" — see file header.
        { metricId: 416, label: 'Trials Attainment', format: 'percent',
          valueSelector: 'current_or_latest' },

        { metricId: 286, label: 'Syncs Forecast', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 407, label: 'Syncs MTD', format: 'number',
          valueSelector: 'current_or_latest' },
        // 295 is the pre-existing "Syncs Trajectory" metric, repointed to the
        // new complete-days convention in Task 3. Not a new pointer.
        { metricId: 295, label: 'Syncs Trajectory', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 417, label: 'Syncs Forecast vs. Trajectory', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 418, label: 'Syncs Attainment', format: 'percent',
          valueSelector: 'current_or_latest' },
      ],
    },

    // ── Conversion: Conversions, Sync Conversion Rate ────────────
    {
      title: 'Conversion',
      layout: 'scorecard-row',
      description: EXCLUDES_TODAY,
      kpis: [
        { metricId: 273, label: 'Conversions Forecast (month)', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 412, label: 'Conversions Forecast MTD', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 408, label: 'Conversions MTD', format: 'number',
          valueSelector: 'current_or_latest' },
        // 296 is the pre-existing "Conversions Trajectory" metric, repointed
        // to the complete-days convention in Task 3. Not a new pointer.
        { metricId: 296, label: 'Conversions Trajectory', format: 'number',
          valueSelector: 'current_or_latest' },

        // One tile, not two — see file header. #400 emits a decimal rate
        // (0.2474), not a percentage; 'decimal_rate' renders it as 24.74%.
        { metricId: 400, label: 'Sync Conversion Rate', format: 'decimal_rate',
          valueSelector: 'current_or_latest' },
        // #402 also emits a decimal rate (0.2711).
        { metricId: 402, label: 'Sync Conversion Rate Forecast', format: 'decimal_rate',
          valueSelector: 'current_or_latest' },
      ],
    },

    // ── Churn ─────────────────────────────────────────────────────
    {
      title: 'Churn',
      layout: 'scorecard-row',
      description: EXCLUDES_TODAY,
      kpis: [
        { metricId: 413, label: 'Churn Forecast MTD', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 409, label: 'Churn MTD', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 411, label: 'Churn Trajectory', format: 'number',
          valueSelector: 'current_or_latest' },
      ],
    },
  ],
};
