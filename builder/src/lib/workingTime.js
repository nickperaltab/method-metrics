// Working time: how many hours a consultant was expected to be available.
//
// The denominator of utilization. Method has no capacity table, so this is
// computed: 8 hours times the working days in the month, where a working day is
// a weekday that is not an Ontario statutory or civic holiday (Method's office
// is in Toronto).
//
// Two things justify computing it rather than reading it:
//
// 1. It agrees with Method. `TimeTracking` attendance rows — the shift clock,
//    which `utilization.js` keeps out of every work bucket — post exactly
//    160.0 hours for August 2026 for 22 of the 24 consultants on the roster.
//    That is 8 x 20, the same figure this file derives. The other two post
//    168.0, which is 21 weekdays x 8, i.e. the Civic Holiday not netted out. So
//    the source Method keeps is not self-consistent, and this one is.
// 2. The holidays are rules, not a list. Family Day is the third Monday of
//    February forever; Good Friday follows Easter. Deriving them means the
//    denominator is right in 2028 without anyone editing a table. A hardcoded
//    list is a dashboard that silently goes wrong every January.
//
// What this deliberately does NOT model is time off. Method tracks no PTO,
// vacation or leave anywhere in `TimeTracking` — attendance posts a flat
// monthly figure regardless — so a consultant on a two-week vacation is charged
// full capacity and reads as half-utilized. There is no data with which to fix
// that; the screen says so rather than pretending.
//
// Every function that needs to know "how much of this month has happened" takes
// an `asOf` date, and the caller passes the last day that has TIME ENTRIES, not
// today. Those are not the same day: on 9 Sep 2026 the newest entry in
// `TimeTracking` was 8 Sep, because time is logged in arrears. Charging today as
// an elapsed working day would bill the roster 176 hours of capacity against
// zero logged hours and understate September by about 14%.

export const HOURS_PER_DAY = 8;

const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const key = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dayOf = (y, m, d) => utc(y, m, d).getUTCDay();
const isWeekend = (y, m, d) => { const w = dayOf(y, m, d); return w === 0 || w === 6; };
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Day of month of the nth given weekday, e.g. nth(2026, 2, 1, 3) = 3rd Monday of Feb. */
const nth = (y, m, weekday, n) => 1 + ((weekday - dayOf(y, m, 1) + 7) % 7) + (n - 1) * 7;

/** Day of month of the last Monday strictly before `d`. Victoria Day's rule. */
const mondayBefore = (y, m, d) => {
  let back = (dayOf(y, m, d) + 6) % 7;
  if (back === 0) back = 7; // strictly before: a Monday the 25th means the 18th
  return d - back;
};

/** Easter Sunday, Meeus/Jones/Butcher. Good Friday is two days earlier. */
function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return { month, day: ((h + l - 7 * m + 114) % 31) + 1 };
}

/**
 * The observed date of a holiday with a fixed calendar date.
 *
 * A statutory holiday falling on a weekend is taken on the next weekday, and
 * `taken` carries the days already claimed so Boxing Day cannot land on the day
 * Christmas was moved to.
 */
function observed(y, m, d, taken) {
  const at = utc(y, m, d);
  for (;;) {
    const [yy, mm, dd] = [at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate()];
    if (!isWeekend(yy, mm, dd) && !taken.has(key(yy, mm, dd))) return key(yy, mm, dd);
    at.setUTCDate(at.getUTCDate() + 1);
  }
}

/**
 * Ontario statutory and civic holidays for one year, as a Set of YYYY-MM-DD.
 *
 * Fixed-date holidays are added first and in calendar order, because the
 * observed-date rule for a later one depends on where an earlier one landed.
 */
export function holidays(year) {
  const out = new Set();
  out.add(observed(year, 1, 1, out));                          // New Year's Day
  out.add(key(year, 2, nth(year, 2, 1, 3)));                   // Family Day, 3rd Mon Feb
  const e = easter(year);
  const gf = utc(year, e.month, e.day - 2);
  out.add(key(gf.getUTCFullYear(), gf.getUTCMonth() + 1, gf.getUTCDate())); // Good Friday
  out.add(key(year, 5, mondayBefore(year, 5, 25)));            // Victoria Day
  out.add(observed(year, 7, 1, out));                          // Canada Day
  out.add(key(year, 8, nth(year, 8, 1, 1)));                   // Civic Holiday, 1st Mon Aug
  out.add(key(year, 9, nth(year, 9, 1, 1)));                   // Labour Day, 1st Mon Sep
  out.add(key(year, 10, nth(year, 10, 1, 2)));                 // Thanksgiving, 2nd Mon Oct
  out.add(observed(year, 12, 25, out));                        // Christmas
  out.add(observed(year, 12, 26, out));                        // Boxing Day
  return out;
}

const cache = new Map();
const holidaysCached = (year) => {
  if (!cache.has(year)) cache.set(year, holidays(year));
  return cache.get(year);
};

export const isHoliday = (ymd) => holidaysCached(Number(ymd.slice(0, 4))).has(ymd);

/** A weekday that is not a holiday. */
export const isWorkingDay = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return !isWeekend(y, m, d) && !isHoliday(ymd);
};

const parseMonth = (month) => {
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split('-').map(Number);
  return m >= 1 && m <= 12 ? [y, m] : null;
};

/** Working days in a YYYY-MM month, counting up to and including `throughDay`. */
function countWorkingDays(month, throughDay = Infinity) {
  const parsed = parseMonth(month);
  if (!parsed) return 0;
  const [y, m] = parsed;
  const last = Math.min(daysInMonth(y, m), throughDay);
  let n = 0;
  for (let d = 1; d <= last; d += 1) if (isWorkingDay(key(y, m, d))) n += 1;
  return n;
}

/** Every working day in the month. */
export const workingDaysInMonth = (month) => countWorkingDays(month);

/** Working hours in a full month: the 160 for August 2026. */
export const workingHoursInMonth = (month) => workingDaysInMonth(month) * HOURS_PER_DAY;

/**
 * A YYYY-MM-DD as a LOCAL date. `new Date('2026-09-08')` is UTC midnight, which
 * reads back as the 7th anywhere west of Greenwich — and this whole file counts
 * days, so an off-by-one there is an off-by-eight-hours in capacity.
 */
export const parseDay = (ymd) => {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** The YYYY-MM a date falls in. */
export const monthOf = (asOf = new Date()) =>
  `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, '0')}`;

/** True while the month has not finished, so its capacity is not all spent yet. */
export const isOpenMonth = (month, asOf = new Date()) => month >= monthOf(asOf);

/**
 * Working days of a month that have happened, up to and including `asOf`.
 *
 * A month still running has not spent its whole capacity. Charging September's
 * full 168 hours on the 9th would report a third of the real rate, so an open
 * month is measured against the working days elapsed instead. Pass the last day
 * that has time entries, not today — see the header note.
 */
export const workingDaysElapsed = (month, asOf = new Date()) => {
  if (month > monthOf(asOf)) return 0;
  if (month < monthOf(asOf)) return workingDaysInMonth(month);
  return countWorkingDays(month, asOf.getDate());
};

/**
 * The capacity one consultant-month is charged, in hours.
 *
 * A closed month is worth its full working hours. An open one is prorated to
 * the working days elapsed, which is what makes the current month's utilization
 * comparable to a finished month's rather than a third of it.
 */
export const monthCapacityHours = (month, asOf = new Date()) =>
  (isOpenMonth(month, asOf) ? workingDaysElapsed(month, asOf) : workingDaysInMonth(month)) * HOURS_PER_DAY;
