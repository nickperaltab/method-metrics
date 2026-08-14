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
 * Churn inverts: for every other metric, under 100% attainment is bad
 * (behind pace). For churn, OVER 100% is bad (more cancellations than
 * forecast). `harmfulDistance()` is the one function that encodes this —
 * every other function in this module is direction-agnostic.
 */

import { resolveKpiValue } from '../components/scorecards/utils';

/**
 * One entry per pace row. `attainmentId` is used directly when the metric
 * already has a registered attainment view (Trials #416, Syncs #418);
 * otherwise attainment is derived from numerator ÷ denominator.
 *
 * `numeratorFormat` / `denominatorFormat` / `attainmentFormat` describe the
 * RAW format each id's metric emits (see method-monday-scorecard.js), not
 * how it should be displayed — normalize() converts to a common 0–100 scale.
 */
export const METRIC_DEFS = [
  {
    key: 'trials',
    label: 'Trials',
    attainmentId: 416,
    attainmentFormat: 'percent',
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
    numeratorId: 295,
    numeratorFormat: 'number',
    denominatorId: 286,
    denominatorFormat: 'number',
    inverted: false,
  },
  {
    key: 'conversions',
    label: 'Conversions',
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
    // scale-invariant the way the sync conversion rate pair is.
    numeratorId: 321,
    numeratorFormat: 'percent',
    denominatorId: 319,
    denominatorFormat: 'decimal_rate',
    inverted: false,
  },
  {
    key: 'syncPercent',
    label: 'Sync %',
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
    numeratorId: 400,
    numeratorFormat: 'decimal_rate',
    denominatorId: 402,
    denominatorFormat: 'decimal_rate',
    inverted: false,
  },
  {
    key: 'churn',
    label: 'Churn',
    numeratorId: 411,
    numeratorFormat: 'number',
    denominatorId: 274,
    denominatorFormat: 'number',
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
 * Resolve one metric definition against the loaded dataMap into a fully
 * computed pace row: attainment, band, harmful distance, and the raw
 * trajectory/forecast pair (normalized to the same scale for display).
 */
export function buildPaceRow(def, dataMap) {
  const rawNumerator = resolveKpiValue(dataMap.get(def.numeratorId), 'current_or_latest');
  const rawDenominator = resolveKpiValue(dataMap.get(def.denominatorId), 'current_or_latest');
  const numerator = normalize(rawNumerator, def.numeratorFormat);
  const denominator = normalize(rawDenominator, def.denominatorFormat);

  let attainment;
  if (def.attainmentId) {
    const rawAttainment = resolveKpiValue(dataMap.get(def.attainmentId), 'current_or_latest');
    attainment = normalize(rawAttainment, def.attainmentFormat);
  } else {
    attainment = computeAttainmentPercent(numerator, denominator);
  }

  return {
    key: def.key,
    label: def.label,
    inverted: !!def.inverted,
    attainment,
    band: classifyBand(attainment, def.inverted),
    harmfulDistance: harmfulDistance(attainment, def.inverted),
    numerator,
    denominator,
    numeratorFormat: def.numeratorFormat,
    denominatorFormat: def.denominatorFormat,
  };
}

/**
 * Build every pace row and sort worst-first, i.e. descending by harmful
 * distance. A row with unknown/missing attainment sorts last (harmful
 * distance null is treated as "least urgent", not "most urgent" — we don't
 * want a data gap to visually outrank a real problem).
 */
export function buildPaceRows(dataMap) {
  const rows = METRIC_DEFS.map((def) => buildPaceRow(def, dataMap));
  return rows.sort((a, b) => {
    if (a.harmfulDistance == null && b.harmfulDistance == null) return 0;
    if (a.harmfulDistance == null) return 1;
    if (b.harmfulDistance == null) return -1;
    return b.harmfulDistance - a.harmfulDistance;
  });
}
