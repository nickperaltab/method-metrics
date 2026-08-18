/**
 * Method Monday — queried-window label.
 *
 * The sales director could see the pace bars but not the window they cover
 * ("not 100% clear on the data start and end date"). Looker states this
 * plainly ("Aug 1, 2026 - Aug 16, 2026"); this page only said "excludes
 * today" in small print. This module turns the three columns
 * `int_method_monday` already computes (`period`, `elapsed_days`,
 * `days_in_month` — see models/intermediate/int_method_monday.sql) into
 * that same plain-language label.
 *
 * Deliberately NOT derived from `new Date()`: the model's `period` /
 * `elapsed_days` come from BigQuery's `CURRENT_DATE()`, which can disagree
 * with the browser's local clock across a timezone boundary. Showing a
 * window computed from the browser clock could display a range that was
 * never actually queried — worse than showing nothing. Callers must pass
 * the live values fetched from `int_method_monday` (see
 * hooks/useMethodMondayWindow.js); if those aren't available, this returns
 * null and the caller renders nothing.
 *
 * `period` is always the first of the month with exactly one row (see the
 * model's `not_null, unique` test on that column), and `elapsed_days` never
 * exceeds `days_in_month`, so the window is always within a single month —
 * the label only needs to print the month name once.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * @param {{ period: string, elapsedDays: number, daysInMonth: number }} window
 * @returns {{ rangeLabel: string, dayLabel: string } | null}
 */
export function formatMethodMondayWindow(window) {
  if (!window) return null;
  const { period, elapsedDays, daysInMonth } = window;
  if (period == null || elapsedDays == null || daysInMonth == null) return null;
  if (!Number.isFinite(elapsedDays) || !Number.isFinite(daysInMonth)) return null;
  // elapsed_days is 0 on the 1st of the month (see int_method_monday.sql) —
  // zero complete days means no window has been queried yet.
  if (elapsedDays <= 0) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(period));
  if (!match) return null;
  const [, yearStr, monthStr] = match;
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const monthName = MONTHS[monthIndex];
  if (!monthName) return null;

  // `period` is always the first of the month (day 1); the window covers
  // complete days 1 through elapsed_days.
  const endDay = elapsedDays;

  return {
    rangeLabel: `${monthName} 1 – ${monthName} ${endDay}, ${year}`,
    dayLabel: `day ${elapsedDays} of ${daysInMonth}`,
  };
}
