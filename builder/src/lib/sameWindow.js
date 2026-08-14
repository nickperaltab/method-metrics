/**
 * Prior-month same-window baselines for month-to-date KPI deltas.
 *
 * The problem this solves: a KPI whose current month is only partway through
 * was being divided by the whole prior month. On 2026-08-10 the Sales
 * Conversions tile read -73.1% (21 August-to-date over all 78 of July) where
 * Looker read -27.6% (21 over July 1-10's 29).
 *
 * The rule, verified against four independent Looker readings on 2026-08-10
 * (Conversions, Trials, Syncs, Sync %), each reproduced to the displayed
 * decimal:
 *
 *     delta = MTD / (prior month, day 1 through today's day-of-month) - 1
 *
 * The window is INCLUSIVE of today. This is a same-window comparison, not a
 * trajectory: it sums the day-grain series the scorecard already fetches
 * over two matching calendar ranges, so it has no need to exclude today the
 * way a trajectory's complete-days divisor does. Verified against Looker
 * directly (see the four readings above) — it does not derive its
 * correctness from any trajectory view's convention, which is free to change
 * (and did, in Task 3 of the 2026-08-10 Method Monday work) without this
 * still being right.
 *
 * Everything here is pure: it reads the day-grain series the scorecard
 * already fetches (the `<id>:day` plan entries) and does arithmetic. No new
 * BigQuery round-trip is involved.
 */

/** Days in a given month. `month` is 0-based, matching Date. */
export function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** True when `asOf` falls on the last day of its month. */
export function isMonthComplete(asOf) {
  const d = asOf instanceof Date ? asOf : new Date(asOf);
  return d.getDate() === daysInMonth(d.getFullYear(), d.getMonth());
}

/**
 * Only measures that sum across days can be windowed from a day-grain series.
 * COUNT(DISTINCT ...), AVG, MIN/MAX and friends cannot — summing their daily
 * values would not reproduce the month's value.
 */
export function isAdditiveMeasure(measure) {
  if (!measure || typeof measure !== 'string') return false;
  if (/\b(DISTINCT|AVG|MIN|MAX|APPROX|PERCENTILE|ANY_VALUE|STDDEV|VARIANCE)\b/i.test(measure)) {
    return false;
  }
  return /^\s*(ROUND\s*\(\s*)?(SUM|COUNT|COUNTIF)\s*\(/i.test(measure);
}

/**
 * Inclusive [start, end] ISO date bounds for the current month-to-date window
 * and the matching window in the prior month.
 *
 * @param {Date} asOf
 * @returns {{currentStart: string, currentEnd: string, priorStart: string,
 *            priorEnd: string, clamped: boolean}}
 */
export function sameWindowBounds(asOf) {
  const d = asOf instanceof Date ? asOf : new Date(asOf);
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();

  const priorYear = month === 0 ? year - 1 : year;
  const priorMonth = month === 0 ? 11 : month - 1;
  const priorLastDay = daysInMonth(priorYear, priorMonth);

  // UNVERIFIED CONVENTION. When the prior month is shorter than today's
  // day-of-month — 30 March against February, say — there is no matching day
  // to stop at, so we clamp to the prior month's last day and the baseline
  // becomes the whole prior month. This clamp has NOT been checked against
  // Looker; it is a reasonable default, not a confirmed convention. Do not
  // cite it as verified.
  const priorDay = Math.min(day, priorLastDay);

  return {
    currentStart: isoDate(year, month, 1),
    currentEnd: isoDate(year, month, day),
    priorStart: isoDate(priorYear, priorMonth, 1),
    priorEnd: isoDate(priorYear, priorMonth, priorDay),
    clamped: priorDay < day,
  };
}

/**
 * Sum a day-grain series over an inclusive ISO date range.
 * Labels are 'YYYY-MM-DD', so lexical comparison is chronological.
 *
 * @param {{labels: string[], data: number[]}} daily
 * @returns {number|null} null if the series is unusable
 */
export function sumDailyWindow(daily, startIso, endIso) {
  if (!daily || !Array.isArray(daily.labels) || !Array.isArray(daily.data)) return null;
  let total = 0;
  for (let i = 0; i < daily.labels.length; i++) {
    const label = daily.labels[i];
    if (label >= startIso && label <= endIso) total += Number(daily.data[i]) || 0;
  }
  return total;
}

const DAY_LABEL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Current MTD and prior-month same-window totals from a day-grain series.
 *
 * @param {{labels: string[], data: number[]}|null} daily
 * @param {Date} asOf
 * @returns {{current: number, prior: number, clamped: boolean}|null}
 *          null when the series is missing, empty, or not day-grain.
 */
export function computeSameWindowPair(daily, asOf) {
  if (!daily || !Array.isArray(daily.labels) || daily.labels.length === 0) return null;
  // Guard against a monthly series being handed in by mistake — summing
  // '2026-07' rows would silently produce a full-month baseline again.
  if (!DAY_LABEL.test(daily.labels[0])) return null;

  const b = sameWindowBounds(asOf);
  const current = sumDailyWindow(daily, b.currentStart, b.currentEnd);
  const prior = sumDailyWindow(daily, b.priorStart, b.priorEnd);
  if (current == null || prior == null) return null;
  return { current, prior, clamped: b.clamped };
}
