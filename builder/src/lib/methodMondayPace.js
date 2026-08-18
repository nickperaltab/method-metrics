/**
 * Method Monday — shared-axis pace view.
 *
 * Every metric group on this page reduces to one quantity: attainment =
 * trajectory ÷ full-month forecast (equivalently actual ÷ prorated
 * forecast — same ratio under linear proration). This module computes that
 * quantity for all seven groups, on a single 0–150% scale, and classifies
 * each one as on-pace / off-pace / bad.
 *
 * Percentage scales are NOT uniform across the metrics feeding this page —
 * `format: 'percent'` values already sit on a 0–100 scale, `format:
 * 'decimal_rate'` values sit on 0–1 and must be multiplied by 100 before
 * they can be divided against a 'percent' value or displayed next to one.
 * `normalize()` below is the single place that conversion happens. Skipping
 * it (or applying it twice) is exactly how a prior chart plotted one series
 * at ~100x the others (see sales-scorecard.js's MONTHLY_SYNC_CONVERSION_RATE_SQL
 * comment for that incident). Every entry in METRIC_DEFS states its raw
 * format explicitly so the normalization is visible at the call site.
 *
 * Churn and Churn Rate invert: for every other metric, under 100%
 * attainment is bad (behind pace). For these two, OVER 100% is bad (more
 * cancellations, or a higher churn rate, than forecast). `harmfulDistance()`
 * is the one function that encodes this — every other function in this
 * module is direction-agnostic.
 */

import { resolveKpiValue } from '../components/scorecards/utils';

/**
 * One entry per pace row. `attainmentId` names the registered Supabase
 * formula metric that IS this row's attainment number (Trials #416, Syncs
 * #418, Conversions #419, Conversion Rate #420, Sync % #421, Sync
 * Conversion Rate #422, Churn #423, Churn Rate #425) — every row reads its
 * displayed percentage from a registered metric, never from a JS computation.
 * `numeratorId`/`denominatorId` carry the raw trajectory/forecast pair, and
 * `actualId` carries the MTD actual — all three are rendered as columns on
 * the collapsed row (see MethodMondayPaceView.jsx) and are also exercised
 * by the dev-time consistency check below and by tests.
 *
 * `numeratorFormat` / `denominatorFormat` / `actualFormat` / `attainmentFormat`
 * describe the RAW format each id's metric emits (see
 * method-monday-scorecard.js), not how it should be displayed — normalize()
 * converts to a common 0–100 scale.
 */
export const METRIC_DEFS = [
  {
    key: 'trials',
    label: 'Trials',
    attainmentId: 416,
    attainmentFormat: 'percent',
    actualId: 406,
    actualFormat: 'number',
    numeratorId: 410,
    numeratorFormat: 'number',
    denominatorId: 285,
    denominatorFormat: 'number',
    inverted: false,
  },
  {
    key: 'syncs',
    label: 'Syncs',
    attainmentId: 418,
    attainmentFormat: 'percent',
    actualId: 407,
    actualFormat: 'number',
    numeratorId: 295,
    numeratorFormat: 'number',
    denominatorId: 286,
    denominatorFormat: 'number',
    inverted: false,
  },
  {
    key: 'conversions',
    label: 'Conversions',
    attainmentId: 419,
    attainmentFormat: 'percent',
    actualId: 408,
    actualFormat: 'number',
    numeratorId: 296,
    numeratorFormat: 'number',
    denominatorId: 273,
    denominatorFormat: 'number',
    inverted: false,
  },
  {
    key: 'conversionRate',
    label: 'Conversion Rate',
    // #321 emits a percentage (0–100). #319 emits a decimal (0–1) — it must
    // be normalized (×100) before it is comparable to #321. See the
    // method-monday-scorecard.js header comment for why these two aren't
    // scale-invariant the way the sync conversion rate pair is. #420
    // (Conversion Rate Attainment) does this same rescaling inside its own
    // registered formula, so the bar and the registered metric agree.
    attainmentId: 420,
    attainmentFormat: 'percent',
    // #357 ("Conversion Rate") is the MTD actual paired with this group,
    // copied verbatim from sales-scorecard.js — it emits a decimal (0–1),
    // same trap as #319 above.
    actualId: 357,
    actualFormat: 'decimal_rate',
    numeratorId: 321,
    numeratorFormat: 'percent',
    denominatorId: 319,
    denominatorFormat: 'decimal_rate',
    inverted: false,
  },
  {
    key: 'syncPercent',
    label: 'Sync %',
    attainmentId: 421,
    attainmentFormat: 'percent',
    actualId: 414,
    actualFormat: 'percent',
    numeratorId: 414,
    numeratorFormat: 'percent',
    denominatorId: 361,
    denominatorFormat: 'percent',
    inverted: false,
  },
  {
    key: 'syncConversionRate',
    label: 'Sync Conversion Rate',
    // Both #400 and #402 emit decimal rates (0–1) — same scale, no mixing
    // risk, but normalize() still runs so the displayed pair reads as a
    // percentage like the rest of the page.
    attainmentId: 422,
    attainmentFormat: 'percent',
    // #400 is both the actual and the trajectory on this convention —
    // numerator and denominator both scale by days_in_month/elapsed_days,
    // so the ratio is scale-invariant (see method-monday-scorecard.js file
    // header). buildPaceRow flags this via `actualEqualsTrajectory` so the
    // UI can say so once in the expanded detail instead of printing the
    // same number under two column headers.
    actualId: 400,
    actualFormat: 'decimal_rate',
    numeratorId: 400,
    numeratorFormat: 'decimal_rate',
    denominatorId: 402,
    denominatorFormat: 'decimal_rate',
    inverted: false,
  },
  {
    key: 'churn',
    label: 'Churn',
    attainmentId: 423,
    attainmentFormat: 'percent',
    actualId: 409,
    actualFormat: 'number',
    numeratorId: 411,
    numeratorFormat: 'number',
    denominatorId: 274,
    denominatorFormat: 'number',
    inverted: true,
  },
  {
    key: 'churnRate',
    label: 'Churn Rate',
    // #345 (trajectory) and #342 (forecast -- "Forecasted Churn Rate %",
    // the pre-existing metric; #424 was a duplicate, deprecated 2026-08-17)
    // BOTH emit a percentage (0-100) -- unlike the trials-level Conversion
    // Rate pair above (#321 percent vs #319 decimal_rate), no rescaling is
    // needed here. #342 deliberately rescales the source sheet's decimal
    // (0.025) to a percentage (2.5) in its own dbt view specifically so
    // this pair shares one scale -- see v_metric__churn_rate_forecasted.yml.
    // The registered attainment formula (#425) is the plain
    // SAFE_DIVIDE({345}, {342}) * 100, identical in shape to every other
    // attainment metric on this page.
    attainmentId: 425,
    attainmentFormat: 'percent',
    actualId: 344,
    actualFormat: 'percent',
    numeratorId: 345,
    numeratorFormat: 'percent',
    denominatorId: 342,
    denominatorFormat: 'percent',
    // Inverted like Churn -- more churn than forecast is bad.
    inverted: true,
  },
];

/**
 * Convert a raw value to a common 0–100(ish) scale based on its declared
 * format. 'decimal_rate' values (0–1) are multiplied by 100; 'percent' and
 * 'number' values pass through unchanged.
 */
export function normalize(value, format) {
  if (value == null || Number.isNaN(value)) return null;
  return format === 'decimal_rate' ? value * 100 : value;
}

/**
 * attainment = trajectory (or actual) ÷ forecast, as a percentage on the
 * shared 0–150 axis. Returns null when either side is missing or the
 * denominator is zero (never divide-by-zero into Infinity/NaN on the page).
 */
export function computeAttainmentPercent(numerator, denominator) {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

/**
 * Signed distance from 100%, in the direction that is HARMFUL for this
 * metric. Positive = bad (off pace in the direction that hurts). Negative
 * or zero = fine (on pace or ahead, regardless of raw magnitude).
 *
 * For every metric except churn, being behind (attainment < 100) is bad:
 *   harmfulDistance = 100 - attainment
 * For churn, being ahead (attainment > 100, i.e. more churn than forecast)
 * is bad:
 *   harmfulDistance = attainment - 100
 *
 * This is the one place inversion is encoded. Every other function treats
 * "attainment" as a plain number and does not know churn is special.
 */
export function harmfulDistance(attainment, inverted) {
  if (attainment == null) return null;
  return inverted ? attainment - 100 : 100 - attainment;
}

/**
 * Colour band from harmful distance:
 *   within 2 points (in the harmful direction) of 100%  -> 'green'  (on pace)
 *   2-15 points off  -> 'amber'
 *   more than 15 points off -> 'red'
 * A metric that is ahead of pace in the SAFE direction (negative harmful
 * distance) is always 'green', regardless of how far ahead it is — over-
 * performing is never colored as a problem.
 */
export function classifyBand(attainment, inverted) {
  const dist = harmfulDistance(attainment, inverted);
  if (dist == null) return 'unknown';
  if (dist <= 2) return 'green';
  if (dist <= 15) return 'amber';
  return 'red';
}

/**
 * True on the 1st of the month, when elapsed_days is 0 for every trajectory
 * in int_method_monday and SAFE_DIVIDE returns NULL for all of them.
 *
 * This has to be checked directly against the day-of-month — NOT inferred
 * from a value being 0 — because `builder/src/lib/sql/load.js:277` does
 * `Number(r.value) || 0`, so a real NULL trajectory arrives here already
 * coerced to 0. A genuine zero is also possible on day 2+ (e.g. zero
 * conversions or zero churn so far), and treating that as "no data" would
 * hide a real signal. `load.js` is the shared NULL-as-0 surface and is out
 * of scope to fix here (see task constraints) — this guard exists so this
 * page doesn't draw seven false "0% / red / worst" bars on day 1 every
 * month, sorted to the very top, before any real trajectory value exists.
 */
export function isDayOneOfMonth(now = new Date()) {
  return now.getDate() === 1;
}

/**
 * Resolve one metric definition against the loaded dataMap into a fully
 * computed pace row: attainment, band, harmful distance, and the raw
 * trajectory/forecast pair (normalized to the same scale for display).
 *
 * `now` is injectable for testing the day-1 guard deterministically.
 */
export function buildPaceRow(def, dataMap, { now = new Date() } = {}) {
  // The actual (MTD) figure is a real, already-elapsed count — it isn't
  // divided by elapsed_days the way trajectory is, so a genuine 0 on day 1
  // (no days have elapsed yet this month to count) is real information, not
  // the loader's NULL-as-0 coercion. It is resolved on every path, day 1
  // included, unlike numerator/denominator/attainment below.
  const rawActual = resolveKpiValue(dataMap.get(def.actualId), 'current_or_latest');
  const actual = normalize(rawActual, def.actualFormat);
  // True when this row's trajectory and actual are the SAME registered
  // metric (Sync % and Sync Conversion Rate: both are ratios that don't
  // scale with elapsed days, so there is no separate trajectory tile). The
  // UI uses this to say so once in the expanded detail rather than
  // printing one number under two column headers.
  const actualEqualsTrajectory = def.actualId === def.numeratorId;

  if (isDayOneOfMonth(now)) {
    // Every trajectory is genuinely NULL today — do not let the loader's
    // NULL-as-0 coercion masquerade as a real (and maximally harmful) 0%.
    return {
      key: def.key,
      label: def.label,
      inverted: !!def.inverted,
      attainment: null,
      band: 'unknown',
      harmfulDistance: null,
      actual,
      actualFormat: def.actualFormat,
      actualEqualsTrajectory,
      numerator: null,
      denominator: null,
      numeratorFormat: def.numeratorFormat,
      denominatorFormat: def.denominatorFormat,
      attainmentMetricId: def.attainmentId,
    };
  }

  const rawNumerator = resolveKpiValue(dataMap.get(def.numeratorId), 'current_or_latest');
  const rawDenominator = resolveKpiValue(dataMap.get(def.denominatorId), 'current_or_latest');
  const numerator = normalize(rawNumerator, def.numeratorFormat);
  const denominator = normalize(rawDenominator, def.denominatorFormat);

  // Every group now has a registered attainment metric (Trials #416, Syncs
  // #418, Conversions #419, Conversion Rate #420, Sync % #421, Sync
  // Conversion Rate #422, Churn #423, Churn Rate #425) — this is the ONE
  // place the displayed percentage comes from. numerator/denominator are never used
  // to compute it; they exist only for the raw pair and the consistency
  // check below, so the registered formula and this file cannot silently
  // diverge without a warning.
  const rawAttainment = resolveKpiValue(dataMap.get(def.attainmentId), 'current_or_latest');
  const attainment = normalize(rawAttainment, def.attainmentFormat);

  // Dev-time consistency check: every row displays the raw
  // numerator/denominator pair alongside an attainment value read from a
  // SEPARATE registered metric. Nothing enforces those two stay in sync at
  // the data layer, so if a registered formula ever drifts from this
  // file's numerator/denominator pairing, the two would silently disagree.
  // This only warns in dev (no throw, no user-visible effect) and is
  // skipped whenever either side is unavailable to compare.
  if (import.meta.env?.DEV && attainment != null && numerator != null && denominator) {
    const derived = computeAttainmentPercent(numerator, denominator);
    if (derived != null && Math.abs(derived - attainment) > 0.5) {
      console.warn(
        `[methodMondayPace] ${def.label}: registered attainment (#${def.attainmentId}) ` +
        `= ${attainment.toFixed(1)}% disagrees with derived ${def.numeratorId}/${def.denominatorId} ` +
        `= ${derived.toFixed(1)}%. The bar (attainment) and the printed pair (numerator/denominator) ` +
        `will visibly disagree on the page.`
      );
    }
  }

  return {
    key: def.key,
    label: def.label,
    inverted: !!def.inverted,
    attainment,
    band: classifyBand(attainment, def.inverted),
    harmfulDistance: harmfulDistance(attainment, def.inverted),
    actual,
    actualFormat: def.actualFormat,
    actualEqualsTrajectory,
    numerator,
    denominator,
    numeratorFormat: def.numeratorFormat,
    denominatorFormat: def.denominatorFormat,
    attainmentMetricId: def.attainmentId,
  };
}

/**
 * Build every pace row and sort worst-first, i.e. descending by harmful
 * distance. A row with unknown/missing attainment sorts last (harmful
 * distance null is treated as "least urgent", not "most urgent" — we don't
 * want a data gap to visually outrank a real problem). This is also what
 * keeps day-1's seven "unknown" rows from sorting above real data.
 */
export function buildPaceRows(dataMap, { now = new Date() } = {}) {
  const rows = METRIC_DEFS.map((def) => buildPaceRow(def, dataMap, { now }));
  return rows.sort((a, b) => {
    if (a.harmfulDistance == null && b.harmfulDistance == null) return 0;
    if (a.harmfulDistance == null) return 1;
    if (b.harmfulDistance == null) return -1;
    return b.harmfulDistance - a.harmfulDistance;
  });
}
