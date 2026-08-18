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
 * trajectory tile would just repeat the same number. The trials-level
 * Conversion Rate group (#319/#357/#321) is NOT scale-invariant — its
 * denominator is the lagged full-month trials figure and doesn't scale with
 * elapsed days — so it keeps forecast, actual and trajectory as three tiles.
 *
 * Churn Rate (metrics 344/345) shipped 2026-08-17, repointed at
 * v_metric__churn_rate_mtd / v_metric__churn_rate_trajectory on the
 * complete-days convention -- see churn-rate-report.md. Unlike Sync
 * Conversion Rate, this group needs both an actual and a trajectory tile:
 * the denominator (beginning-of-month customer base) does not scale with
 * elapsed days, so the two are genuinely different numbers, not one value
 * shown twice.
 *
 * ── Redesign (2026-08-14) ────────────────────────────────────────────
 * The original build rendered all 25 tiles below as 3 equal-weight rows —
 * nothing told the reader which metric was in trouble. This adds a headline
 * "Pace" section: one shared 0–150% axis, one bar per metric group, sorted
 * worst-first, colored by how far off pace each metric is IN THE HARMFUL
 * DIRECTION (churn inverts — see lib/methodMondayPace.js). It replaces
 * Looker's seven small forecast-vs-actual charts, which each have their own
 * y-axis and so can't be compared to each other or read at a glance.
 *
 * The pace section is a page-scoped component (see
 * components/method-monday/MethodMondayPaceView.jsx), not a change to the
 * shared components/scorecards/ rendering surface. The 25 detail tiles
 * below are unchanged in substance — same metric ids, same formats — only
 * regrouped from 3 undifferentiated rows into one section per metric so a
 * reader can go from the pace bar straight to that metric's own tiles.
 *
 * ── Progressive disclosure (2026-08-14, round 2) ─────────────────────
 * Keeping all 25 detail tiles AND the 7 pace rows on screen at once put
 * every number on the page twice — Nic's "so many numbers" feedback. The 7
 * sections below (Sync %, Trials, ... Churn) now carry `renderedBy:
 * 'methodMondayPace'`, which tells Scorecard.jsx's main render loop to skip
 * them as always-visible blocks. They still live in `sections` — unchanged
 * — so `collectMetricIds` (lib/sql/plan.js) still finds every kpi and still
 * loads all the same data into `dataMap`. MethodMondayPaceView reads them
 * back out (matched by title == pace row label) and renders each one,
 * unmodified, as the expanded detail under its own pace row — reusing
 * ScorecardSection/KpiColumn/KpiTile exactly as they already exist, not a
 * second copy of them.
 */

// Why: trajectories divide by complete elapsed days (day_of_month - 1), so
// today's partial data is excluded and the number doesn't drift during the day.
// That rationale is a code comment, not UI text — see the em-dash-justification
// tell in builder/.claude/skills/ui-review/SKILL.md.
const EXCLUDES_TODAY = 'Figures exclude today.';

export default {
  id: 'method-monday',
  title: 'Method Monday',
  status: 'pending',
  // The 3M/6M/12M/All range pills are hidden: every metric on this page is
  // hardcoded to the current month in SQL, so the control changed nothing.
  // A dead filter is worse than no filter. Removed 2026-08-18 at Nic's
  // request; restore it if/when the metrics become window-parameterised.
  hideDateFilter: true,
  views: {
    int_method_monday: { dateCol: 'period' },
  },
  sections: [
    // ── Pace: shared-axis attainment view, worst-first ───────────
    {
      title: 'Pace',
      component: 'methodMondayPace',
    },

    // ── Sync % ────────────────────────────────────────────────────
    {
      title: 'Sync %',
      // Rendered inline by MethodMondayPaceView when its Pace row expands,
      // not as its own always-visible block — see renderedBy note below.
      renderedBy: 'methodMondayPace',
      layout: 'scorecard-row',
      description: EXCLUDES_TODAY,
      kpis: [
        { metricId: 361, label: 'Sync % Forecast', format: 'percent',
          valueSelector: 'current_or_latest' },
        { metricId: 414, label: 'Sync % Actual', format: 'percent',
          valueSelector: 'current_or_latest' },
        { metricId: 421, label: 'Sync % Attainment', format: 'percent',
          valueSelector: 'current_or_latest' },
      ],
    },

    // ── Trials ────────────────────────────────────────────────────
    {
      title: 'Trials',
      renderedBy: 'methodMondayPace',
      layout: 'scorecard-row',
      description: EXCLUDES_TODAY,
      kpis: [
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
      ],
    },

    // ── Syncs ─────────────────────────────────────────────────────
    {
      title: 'Syncs',
      renderedBy: 'methodMondayPace',
      layout: 'scorecard-row',
      description: EXCLUDES_TODAY,
      kpis: [
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

    // ── Conversions ───────────────────────────────────────────────
    {
      title: 'Conversions',
      renderedBy: 'methodMondayPace',
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
        { metricId: 419, label: 'Conversions Attainment', format: 'percent',
          valueSelector: 'current_or_latest' },
      ],
    },

    // ── Conversion Rate (trials-level) ───────────────────────────
    {
      title: 'Conversion Rate',
      renderedBy: 'methodMondayPace',
      layout: 'scorecard-row',
      description: EXCLUDES_TODAY,
      kpis: [
        // Trials-level Conversion Rate group. Distinct from the sync
        // conversion rate below: this denominator is the lagged full-month
        // trials figure and does NOT scale with elapsed days, so forecast
        // and trajectory are genuinely different numbers here (Looker shows
        // 18.0% forecast against 13.2% trajectory) — unlike Sync Conversion
        // Rate, this group needs two tiles.
        //
        // Formats are deliberately not uniform, copied verbatim from
        // sales-scorecard.js:189-195: 319/357 emit decimals; 321's formula
        // (SAFE_DIVIDE({296},{320})*100) emits a percentage (8.49). #321
        // depends on #296, so it inherits the complete-days convention this
        // page uses and its value moves accordingly — it will disagree with
        // Looker's Sales page, consistently with the rest of this change.
        { metricId: 319, label: 'Forecasted Conversion Rate', format: 'decimal_rate',
          valueSelector: 'current_or_latest' },
        { metricId: 357, label: 'Conversion Rate', format: 'decimal_rate',
          valueSelector: 'current_or_latest' },
        // 321 formula outputs percentage number (8.49), not decimal — use 'percent'
        { metricId: 321, label: 'Conversion Rate Trajectory', format: 'percent',
          valueSelector: 'current_or_latest' },
        { metricId: 420, label: 'Conversion Rate Attainment', format: 'percent',
          valueSelector: 'current_or_latest' },
      ],
    },

    // ── Sync Conversion Rate ──────────────────────────────────────
    {
      title: 'Sync Conversion Rate',
      renderedBy: 'methodMondayPace',
      layout: 'scorecard-row',
      description: EXCLUDES_TODAY,
      kpis: [
        // One tile, not two — see file header. #400 emits a decimal rate
        // (0.2474), not a percentage; 'decimal_rate' renders it as 24.74%.
        { metricId: 400, label: 'Sync Conversion Rate', format: 'decimal_rate',
          valueSelector: 'current_or_latest' },
        // #402 also emits a decimal rate (0.2711).
        { metricId: 402, label: 'Sync Conversion Rate Forecast', format: 'decimal_rate',
          valueSelector: 'current_or_latest' },
        { metricId: 422, label: 'Sync Conversion Rate Attainment', format: 'percent',
          valueSelector: 'current_or_latest' },
      ],
    },

    // ── Churn ─────────────────────────────────────────────────────
    {
      title: 'Churn',
      renderedBy: 'methodMondayPace',
      layout: 'scorecard-row',
      description: EXCLUDES_TODAY,
      kpis: [
        // Full-month forecast, matching how 285/286 sit in the other groups.
        { metricId: 274, label: 'Forecasted Churn', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 413, label: 'Churn Forecast MTD', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 409, label: 'Churn MTD', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 411, label: 'Churn Trajectory', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 423, label: 'Churn Attainment', format: 'percent',
          valueSelector: 'current_or_latest' },
      ],
    },

    // ── Churn Rate ────────────────────────────────────────────────
    {
      title: 'Churn Rate',
      renderedBy: 'methodMondayPace',
      layout: 'scorecard-row',
      description: EXCLUDES_TODAY,
      kpis: [
        // #342 ("Forecasted Churn Rate %") is the pre-existing metric,
        // repointed 2026-08-17 at v_metric__churn_rate_forecasted -- #424
        // was a duplicate minted by mistake and is deprecated (kept
        // queued, not deleted, for audit trail; see that metric's
        // description in Supabase). #342 emits a PERCENTAGE (2.5),
        // deliberately rescaled from the source sheet's decimal (0.025) --
        // see v_metric__churn_rate_forecasted.yml. Sharing one scale with
        // #344/#345 is what lets #425's attainment formula stay in the
        // standard SAFE_DIVIDE(a, b) * 100 shape instead of carrying a
        // silent compensating omission (the #319 trap).
        { metricId: 342, label: 'Churn Rate Forecast', format: 'percent',
          valueSelector: 'current_or_latest' },
        // #344/#345 both emit a PERCENTAGE (2.41, not 0.0241) -- use 'percent',
        // not 'decimal_rate'. Getting this backwards is exactly the 3289%-scale
        // bug this page's header comment and lib/methodMondayPace.js warn about.
        { metricId: 344, label: 'Churn Rate MTD', format: 'percent',
          valueSelector: 'current_or_latest' },
        { metricId: 345, label: 'Churn Rate Trajectory', format: 'percent',
          valueSelector: 'current_or_latest' },
        { metricId: 425, label: 'Churn Rate Attainment', format: 'percent',
          valueSelector: 'current_or_latest' },
      ],
    },
  ],
};
