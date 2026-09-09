// Consultant utilization data layer. Answers two different questions that are
// easy to confuse, and much of the design of this file is about keeping them apart:
//
//   Utilization          billable hours / working hours — of the time a
//                        consultant was expected to be available, how much
//                        became billable customer work. Working hours are 8 x
//                        the working days in the month: 160 for August 2026.
//                        See workingTime.js.
//   % of billable work   billable hours / hours logged — of the time actually
//                        logged, how much was billable. Says nothing about
//                        whether enough hours were logged in the first place.
//
// A consultant who logs 40 hours in a month and bills all of them is at 100% of
// billable work and 25% utilization. That gap is the reason both exist.
//
// Reads `revenue.TimeTracking` directly rather than the `int_consultant_work`
// view. The view drops `ItemServiceRecordID`, which is the only way to tell
// internal project time from internal onboarding, and it doubles every duration
// (see 1 below). Six things about the source are worth knowing before changing
// anything here:
//
// 1. `DurationHours` and `DurationMinutes` are the SAME duration in two units,
//    not hours plus a remainder: a two-hour entry stores 2.0 and 120.0. All
//    18,083 entries in 2026 satisfy `DurationMinutes = DurationHours * 60`, with
//    no exceptions. So `DurationHours + DurationMinutes / 60` — which is what
//    `int_consultant_work` computes — returns exactly twice the real figure.
//    Read `DurationHours` alone.
// 2. Two of the five buckets live in the NOTES, not in a column. Method has no
//    field for either. An unused-dedicated entry carries
//    `*** UNUSED DEDICATED TIME FOR <MONTH> ***`; a discounted one carries
//    `*** DISCOUNT APPROVED BY <name> ***` (or REQUESTED BY). Both are billed
//    Dedicated/Pay-per-use entries, so without the note they read as real work.
// 3. A bare `DISCOUNT` match is wrong. 645 entries in 2026 mention "discount" in
//    a customer note ("add a discount box under pricelist"); only ~150 carry the
//    approval marker. The `***` fence is what separates them.
// 4. Internal time is the entries with NO MethodSupportType. That is Method's own
//    marker and it is exact — every such entry in 2026 was an Internal Project
//    Hours, Internal On-boarding/Training or Product Hours line. Matching on the
//    service item instead would go stale the day someone adds an internal item.
// 5. Unused dedicated time is posted at MONTH END (nearly all of it on the last
//    day). An in-progress month therefore shows no bankable hours and a
//    flattering share, which is why `isInProgress` exists.
// 6. Attendance entries are BOTH excluded and essential. They are the shift
//    clock, so they are kept out of every hour bucket — but their presence is
//    what says a person was a working consultant that month, and utilization is
//    only charged against people on that roster. In August 2026 the roster is 24
//    consultants; Joseph McDonald is on it with no billable work at all (a real
//    0%), while Zachary Cutler and Ashur Shamon logged a few hours with no
//    attendance row and are therefore off it. Without that gate, charging a
//    manager who logged 3 hours a full 160 hours of capacity would quietly drag
//    the team rate down.
//
// Everything below the fetch is pure so it can be tested without BigQuery.

import { queryBqWithRetry } from './bigquery.js';
import {
  monthCapacityHours, workingDaysInMonth, workingHoursInMonth, isOpenMonth, monthOf, parseDay,
} from './workingTime.js';

export const TIME_TRACKING = '`project-for-method-dw.revenue.TimeTracking`';
export const ENTITY = '`project-for-method-dw.revenue.Entity`';
export const ITEM = '`project-for-method-dw.revenue.Item`';

// Matches the Free Hours screen so the two report on the same period.
export const REPORTING_START = '2026-01-01';

// The note fences. Kept as exported constants because they are the definition of
// two of the five buckets, and a test asserts the SQL still carries them.
export const UNUSED_DEDICATED_MARKER = 'UNUSED DEDICATED';
export const DISCOUNT_MARKER = String.raw`\*\*\* *DISCOUNT (APPROVED|REQUESTED) BY`;

// The service item that means internal project work. Everything else with no
// support type is internal too, just not project time.
export const INTERNAL_PROJECT_ITEM = 'Internal Project Hours';

export function buildUtilizationSql(start = REPORTING_START) {
  // start is a module constant, never user input, but keep the shape strict.
  const from = /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : REPORTING_START;
  return `
    WITH src AS (
      SELECT
        e.EntityFullName AS consultant,
        DATE(t.TxnDate) AS txn_date,
        DATE_TRUNC(DATE(t.TxnDate), MONTH) AS txn_month,
        -- DurationHours alone. DurationMinutes is the same duration in minutes,
        -- so adding them doubles every entry.
        ROUND(COALESCE(t.DurationHours, t.DurationMinutes / 60.0, 0), 4) AS hours,
        t.MethodSupportType AS support_type,
        -- 'US-Method:Pro Services:Internal Project Hours' -> the last segment.
        REGEXP_EXTRACT(i.ItemFullName, r'([^:]+)$') AS service_item,
        REGEXP_CONTAINS(UPPER(t.Notes), r'${UNUSED_DEDICATED_MARKER}') AS unused_dedicated,
        REGEXP_CONTAINS(UPPER(t.Notes), r'${DISCOUNT_MARKER}') AS discounted,
        COALESCE(t.IsAttendenceEntry, FALSE) AS is_attendance
      FROM ${TIME_TRACKING} t
      INNER JOIN ${ENTITY} e ON e.RecordID = t.EntityRecordID
      LEFT JOIN ${ITEM} i ON i.RecordID = t.ItemServiceRecordID
      WHERE DATE(t.TxnDate) >= DATE '${from}'
        AND NOT COALESCE(t.IsDeleted, FALSE)
    ),
    -- No MethodSupportType means the time was never against a customer.
    -- Attendance entries are the shift clock, not work, so they are gone by here.
    classified AS (
      SELECT *, support_type IS NULL AS internal FROM src WHERE NOT is_attendance
    ),
    work AS (
      SELECT
        consultant,
        txn_month,
        COUNT(1) AS entries,
        ROUND(SUM(hours), 2) AS logged_hours,
        -- The four clean buckets. Their sum is the billable hours both rates
        -- report, which is why the two note markers are excluded from every one.
        ROUND(SUM(IF(NOT internal AND NOT unused_dedicated AND NOT discounted AND support_type = 'Dedicated', hours, 0)), 2) AS dedicated_hours,
        ROUND(SUM(IF(NOT internal AND NOT unused_dedicated AND NOT discounted AND support_type = 'Pay-per-use', hours, 0)), 2) AS ppu_hours,
        ROUND(SUM(IF(NOT internal AND NOT unused_dedicated AND NOT discounted AND support_type = 'Free', hours, 0)), 2) AS free_hours,
        -- Any support type Method adds later lands here rather than vanishing
        -- from the total, so the buckets always add up to the hours logged.
        ROUND(SUM(IF(NOT internal AND NOT unused_dedicated AND NOT discounted AND support_type NOT IN ('Dedicated', 'Pay-per-use', 'Free'), hours, 0)), 2) AS other_hours,
        ROUND(SUM(IF(NOT internal AND unused_dedicated, hours, 0)), 2) AS unused_dedicated_hours,
        -- Split by side so a discounted Free Hour is never counted as billed.
        -- That combination does not occur today; the split keeps it from mattering.
        ROUND(SUM(IF(NOT internal AND NOT unused_dedicated AND discounted AND support_type != 'Free', hours, 0)), 2) AS discounted_paid_hours,
        ROUND(SUM(IF(NOT internal AND NOT unused_dedicated AND discounted AND support_type = 'Free', hours, 0)), 2) AS discounted_free_hours,
        ROUND(SUM(IF(internal AND service_item = '${INTERNAL_PROJECT_ITEM}', hours, 0)), 2) AS internal_project_hours,
        ROUND(SUM(IF(internal AND (service_item IS NULL OR service_item != '${INTERNAL_PROJECT_ITEM}'), hours, 0)), 2) AS internal_other_hours
      FROM classified
      GROUP BY consultant, txn_month
    ),
    -- The roster: who Method had on the clock that month. Utilization is charged
    -- only against these consultant-months, so someone who logged a stray hour
    -- with no attendance record is not billed a full month of capacity.
    roster AS (
      SELECT consultant, txn_month, ROUND(SUM(hours), 2) AS attendance_hours
      FROM src
      WHERE is_attendance
      GROUP BY consultant, txn_month
    )
    -- FULL OUTER so a consultant on the roster who billed nothing still shows up
    -- as a real 0%, instead of disappearing and flattering the team rate.
    SELECT
      COALESCE(w.consultant, r.consultant) AS consultant,
      FORMAT_DATE('%Y-%m', COALESCE(w.txn_month, r.txn_month)) AS month,
      r.consultant IS NOT NULL AS on_roster,
      r.attendance_hours AS attendance_hours,
      COALESCE(w.entries, 0) AS entries,
      COALESCE(w.dedicated_hours, 0) AS dedicated_hours,
      COALESCE(w.ppu_hours, 0) AS ppu_hours,
      COALESCE(w.free_hours, 0) AS free_hours,
      COALESCE(w.other_hours, 0) AS other_hours,
      COALESCE(w.unused_dedicated_hours, 0) AS unused_dedicated_hours,
      COALESCE(w.discounted_paid_hours, 0) AS discounted_paid_hours,
      COALESCE(w.discounted_free_hours, 0) AS discounted_free_hours,
      COALESCE(w.internal_project_hours, 0) AS internal_project_hours,
      COALESCE(w.internal_other_hours, 0) AS internal_other_hours,
      -- The last day anyone logged work. The open month's capacity is prorated
      -- to this, not to today: time is logged in arrears, so on 9 Sep the newest
      -- entry was 8 Sep, and charging today would bill a day nobody has filled in.
      (SELECT FORMAT_DATE('%Y-%m-%d', MAX(txn_date)) FROM src WHERE NOT is_attendance) AS data_through
    FROM work w
    FULL OUTER JOIN roster r
      ON r.consultant = w.consultant AND r.txn_month = w.txn_month
    WHERE COALESCE(w.logged_hours, 0) > 0 OR r.consultant IS NOT NULL
    ORDER BY month DESC, consultant`;
}

const toInt = (v, fallback = null) => (v == null || v === '' ? fallback : parseInt(v, 10));
const toNum = (v, fallback = 0) => (v == null || v === '' ? fallback : Number(v));
const toStr = (v) => (v == null || v === '' ? null : String(v));
// BQ REST hands booleans back as the strings 'true'/'false'.
const toBool = (v) => v === true || v === 'true';

/**
 * Convert a raw BQ REST row into one consultant-month.
 *
 * The eight hour buckets are disjoint and exhaustive: they add up to everything
 * that consultant logged that month. Every figure the screen shows is a sum of
 * some of them, which is what makes the leaderboard auditable column by column.
 */
export function normalizeMonthRow(row) {
  return {
    consultant: toStr(row.consultant),
    month: toStr(row.month),
    onRoster: toBool(row.on_roster),
    attendanceHours: row.attendance_hours == null ? null : toNum(row.attendance_hours),
    entries: toInt(row.entries, 0),
    dedicated: toNum(row.dedicated_hours),
    ppu: toNum(row.ppu_hours),
    free: toNum(row.free_hours),
    other: toNum(row.other_hours),
    unusedDedicated: toNum(row.unused_dedicated_hours),
    discountedPaid: toNum(row.discounted_paid_hours),
    discountedFree: toNum(row.discounted_free_hours),
    internalProject: toNum(row.internal_project_hours),
    internalOther: toNum(row.internal_other_hours),
  };
}

// ── Filtering ──────────────────────────────────────────────────────────────

export function filterMonths(rows, { from = null, to = null, consultant = 'all' } = {}) {
  return rows.filter((r) => {
    if (from && r.month < from) return false;
    if (to && r.month > to) return false;
    if (consultant !== 'all' && r.consultant !== consultant) return false;
    return true;
  });
}

export function distinctMonths(rows) {
  return [...new Set(rows.map((r) => r.month).filter(Boolean))].sort();
}

export function distinctConsultants(rows) {
  return [...new Set(rows.map((r) => r.consultant).filter(Boolean))].sort();
}

// ── Rounding ───────────────────────────────────────────────────────────────

/**
 * Round DOWN to two decimals. Every number this screen reports goes through
 * here, so a rate is never rounded up into a target it did not reach.
 *
 * `toPrecision(12)` before the floor is load-bearing, not defensive: in binary
 * floating point 0.29 * 100 is 28.999999999999996, and flooring that gives
 * 28.99. Twelve significant digits is far more precision than any hour figure
 * carries and far less than the error, so it collapses the representation noise
 * without moving a real value.
 */
export const floor2 = (n) =>
  (Number.isFinite(n) ? Math.floor(Number((n * 100).toPrecision(12))) / 100 : null);

/** A percentage, floored to two decimals. Null on a zero denominator. */
export const percent = (n, d) => (d > 0 ? floor2((n / d) * 100) : null);

// ── Aggregation ────────────────────────────────────────────────────────────

/**
 * Roll a set of consultant-months into the numbers the screen shows.
 *
 * `billable` is the headline: the hours that survived both deductions. It is
 * the sum of the four clean buckets, because a bankable or discounted hour is
 * excluded from those buckets at the SQL grain rather than subtracted here.
 *
 * The two rates have different denominators AND different numerators. Both are
 * deliberate. `utilization` is measured only over roster consultant-months —
 * numerator and denominator drawn from the same population — because charging
 * capacity to someone with no attendance record, or counting their hours against
 * capacity nobody was charged, would break the ratio in opposite directions.
 */
export function summarize(rows, asOf = new Date()) {
  const sum = (f, of = rows) => of.reduce((a, r) => a + f(r), 0);

  const dedicated = sum((r) => r.dedicated);
  const ppu = sum((r) => r.ppu);
  const free = sum((r) => r.free);
  const other = sum((r) => r.other);
  const unusedDedicated = sum((r) => r.unusedDedicated);
  const discountedPaid = sum((r) => r.discountedPaid);
  const discountedFree = sum((r) => r.discountedFree);
  const internalProject = sum((r) => r.internalProject);
  const internalOther = sum((r) => r.internalOther);

  const discounted = discountedPaid + discountedFree;
  const internal = internalProject + internalOther;
  // What the customer was invoiced for, before either deduction comes out.
  const billed = dedicated + ppu + other + unusedDedicated + discountedPaid;
  const freeTotal = free + discountedFree;
  const billable = dedicated + ppu + free + other;
  const total = billed + freeTotal + internal;

  // Everything that went against a customer: the four clean buckets plus both
  // deductions. Internal time is the only thing outside it. This is the top of
  // the reconciliation ladder — "all in" — and each figure below removes one
  // deduction from it, so the four can be read against each other.
  const allIn = total - internal;
  const exBankable = allIn - unusedDedicated;
  const exDiscounted = allIn - discounted;

  // Capacity: 8 hours x the working days of each roster consultant-month, with
  // an open month prorated to the working days that have actually happened.
  const onRoster = rows.filter((r) => r.onRoster);
  const capacity = sum((r) => monthCapacityHours(r.month, asOf), onRoster);
  // Roster-only copies of the ladder. Utilization draws numerator and
  // denominator from the same population, so an off-roster consultant's hours
  // cannot be measured against capacity nobody was charged.
  const rosterBankable = sum((r) => r.unusedDedicated, onRoster);
  const rosterDiscounted = sum((r) => r.discountedPaid + r.discountedFree, onRoster);
  const rosterAllIn = sum(
    (r) => r.dedicated + r.ppu + r.free + r.other + r.unusedDedicated + r.discountedPaid + r.discountedFree,
    onRoster,
  );
  const rosterBillable = rosterAllIn - rosterBankable - rosterDiscounted;

  return {
    entries: sum((r) => r.entries),
    dedicated: floor2(dedicated),
    ppu: floor2(ppu),
    free: floor2(freeTotal),
    other: floor2(other),
    billed: floor2(billed),
    unusedDedicated: floor2(unusedDedicated),
    discounted: floor2(discounted),
    internalProject: floor2(internalProject),
    internalOther: floor2(internalOther),
    // Brandon's third column: discounted plus internal, the work nobody paid for.
    nonBillable: floor2(discounted + internal),
    billable: floor2(billable),
    total: floor2(total),
    // ── The reconciliation ladder ────────────────────────────────────────
    // Four bases for the same month, differing only in which deduction comes
    // out. Brandon audits Miguel Teodoro's August against these: 101.83 all in,
    // 99.83 without discounted, 87.32 without bankable, 85.32 without either.
    /** Everything against a customer. Internal time is all that is outside it. */
    allIn: floor2(allIn),
    /** All in, less bankable. */
    exBankable: floor2(exBankable),
    /** All in, less discounted. */
    exDiscounted: floor2(exDiscounted),
    // ── The rates ────────────────────────────────────────────────────────
    /** Working hours the roster was available for: the utilization denominator. */
    capacity: floor2(capacity),
    rosterBillable: floor2(rosterBillable),
    /** Billable hours as a share of the hours the consultant was available. */
    utilization: percent(rosterBillable, capacity),
    /** The same rate on each of the other three bases. */
    utilizationAllIn: percent(rosterAllIn, capacity),
    utilizationExBankable: percent(rosterAllIn - rosterBankable, capacity),
    utilizationExDiscounted: percent(rosterAllIn - rosterDiscounted, capacity),
    /** Billable hours as a share of the hours actually logged. */
    billableShare: percent(billable, total),
    // Roster size, for the working-hours tile's footnote.
    rosterMonths: onRoster.length,
    rosterConsultants: distinctConsultants(onRoster).length,
    months: distinctMonths(rows).length,
  };
}

/** The month a partial run falls in, as YYYY-MM. */
export const currentMonth = monthOf;

/**
 * True while a month can still gain bankable hours.
 *
 * Unused dedicated time is posted on the last day of the month, so until the
 * month closes the figure is missing its largest single deduction. On the current
 * month the number shown is a ceiling, not a result.
 */
export const isInProgress = isOpenMonth;

/** One summary per month, oldest first. */
export function byMonth(rows, asOf = new Date()) {
  return distinctMonths(rows).map((month) => ({
    month,
    inProgress: isInProgress(month, asOf),
    workingDays: workingDaysInMonth(month),
    workingHours: workingHoursInMonth(month),
    ...summarize(rows.filter((r) => r.month === month), asOf),
  }));
}

/**
 * One summary per consultant, most billable hours first.
 *
 * Volume rather than rate is the default order: a consultant who logged forty
 * hours all month can post a perfect share of billable work, and putting them
 * above someone who billed two hundred would make the leaderboard read backwards.
 */
export function byConsultant(rows, asOf = new Date()) {
  return distinctConsultants(rows)
    .map((consultant) => {
      const mine = rows.filter((r) => r.consultant === consultant);
      const t = summarize(mine, asOf);
      return {
        consultant,
        ...t,
        // Comparable across people who worked different numbers of months.
        billablePerMonth: floor2(t.billable / Math.max(1, t.months)),
      };
    })
    .sort((a, b) => b.billable - a.billable || a.consultant.localeCompare(b.consultant));
}

/**
 * The four bases of the reconciliation ladder, all-in first.
 *
 * Exists so the audit view does not have to hardcode which deduction belongs to
 * which figure, and so a test can assert the four still descend.
 */
export const ladder = (t) => [
  { key: 'allIn', label: 'All in', hours: t.allIn, utilization: t.utilizationAllIn },
  { key: 'exDiscounted', label: 'Less discounted', hours: t.exDiscounted, utilization: t.utilizationExDiscounted },
  { key: 'exBankable', label: 'Less bankable', hours: t.exBankable, utilization: t.utilizationExBankable },
  { key: 'billable', label: 'Less both', hours: t.billable, utilization: t.utilization },
];

/** How the hours split across the five buckets, largest first. */
export function composition(rows, asOf = new Date()) {
  const t = summarize(rows, asOf);
  return [
    { key: 'billable', label: 'Billable', hours: t.billable },
    { key: 'unused', label: 'Bankable', hours: t.unusedDedicated },
    { key: 'discounted', label: 'Discounted', hours: t.discounted },
    { key: 'internalProject', label: 'Internal projects', hours: t.internalProject },
    { key: 'internalOther', label: 'Other internal', hours: t.internalOther },
  ].map((b) => ({ ...b, share: percent(b.hours, t.total) }));
}

/**
 * Fetch the consultant-months, plus the day the data runs to.
 *
 * `asOf` is what prorates the open month's capacity, and it has to come from the
 * data rather than the clock — see workingTime.js. It falls back to today when a
 * result is empty, which only happens when there is nothing to prorate anyway.
 */
export async function fetchUtilization({ query = queryBqWithRetry, start = REPORTING_START } = {}) {
  const { rows } = await query(buildUtilizationSql(start));
  const dataThrough = rows.length ? toStr(rows[0].data_through) : null;
  return {
    rows: rows.map(normalizeMonthRow),
    dataThrough,
    asOf: parseDay(dataThrough) ?? new Date(),
  };
}
