// Consultant utilization data layer. Answers one question: of the hours a
// consultant logged this month, how many were real billable work? Sibling of
// freeHours.js — same BQ OAuth layer, same normalize-then-render discipline,
// same reporting window so the two screens can be read side by side.
//
// Reads `revenue.TimeTracking` directly rather than the `int_consultant_work`
// view, for two reasons. The view drops `ItemServiceRecordID`, which is the only
// way to tell internal project time from internal onboarding, and it drops
// nothing else this needs. Four things about the source are worth knowing before
// changing anything here:
//
// 1. Two of the five buckets live in the NOTES, not in a column. Method has no
//    field for either. An unused-dedicated entry carries
//    `*** UNUSED DEDICATED TIME FOR <MONTH> ***`; a discounted one carries
//    `*** DISCOUNT APPROVED BY <name> ***` (or REQUESTED BY). Both are billed
//    Dedicated/Pay-per-use entries, so without the note they read as real work.
// 2. A bare `DISCOUNT` match is wrong. 645 entries in 2026 mention "discount" in
//    a customer note ("add a discount box under pricelist"); only ~150 carry the
//    approval marker. The `***` fence is what separates them.
// 3. Internal time is the entries with NO MethodSupportType. That is Method's own
//    marker and it is exact — every such entry in 2026 was an Internal Project
//    Hours, Internal On-boarding/Training or Product Hours line. Matching on the
//    service item instead would go stale the day someone adds an internal item.
// 4. Unused dedicated time is posted at MONTH END (nearly all of it on the last
//    day). An in-progress month therefore shows no bankable hours and a
//    flattering rate, which is why `isInProgress` exists.
//
// Everything below the fetch is pure so it can be tested without BigQuery.

import { queryBqWithRetry } from './bigquery.js';

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
    WITH entries AS (
      SELECT
        e.EntityFullName AS consultant,
        DATE_TRUNC(DATE(t.TxnDate), MONTH) AS txn_month,
        ROUND(t.DurationHours + t.DurationMinutes / 60.0, 4) AS hours,
        t.MethodSupportType AS support_type,
        -- 'US-Method:Pro Services:Internal Project Hours' -> the last segment.
        REGEXP_EXTRACT(i.ItemFullName, r'([^:]+)$') AS service_item,
        REGEXP_CONTAINS(UPPER(t.Notes), r'${UNUSED_DEDICATED_MARKER}') AS unused_dedicated,
        REGEXP_CONTAINS(UPPER(t.Notes), r'${DISCOUNT_MARKER}') AS discounted
      FROM ${TIME_TRACKING} t
      INNER JOIN ${ENTITY} e ON e.RecordID = t.EntityRecordID
      LEFT JOIN ${ITEM} i ON i.RecordID = t.ItemServiceRecordID
      WHERE DATE(t.TxnDate) >= DATE '${from}'
        AND NOT COALESCE(t.IsDeleted, FALSE)
        -- Attendance entries are the shift clock, not work. Counting them would
        -- double every hour a consultant logged.
        AND NOT COALESCE(t.IsAttendenceEntry, FALSE)
    ),
    -- No MethodSupportType means the time was never against a customer.
    classified AS (
      SELECT *, support_type IS NULL AS internal FROM entries
    )
    SELECT
      consultant,
      FORMAT_DATE('%Y-%m', txn_month) AS month,
      COUNT(1) AS entries,
      -- The four clean buckets. Their sum is the billable hours the rate reports,
      -- which is why the two note markers are excluded from every one of them.
      ROUND(SUM(IF(NOT internal AND NOT unused_dedicated AND NOT discounted AND support_type = 'Dedicated', hours, 0)), 2) AS dedicated_hours,
      ROUND(SUM(IF(NOT internal AND NOT unused_dedicated AND NOT discounted AND support_type = 'Pay-per-use', hours, 0)), 2) AS ppu_hours,
      ROUND(SUM(IF(NOT internal AND NOT unused_dedicated AND NOT discounted AND support_type = 'Free', hours, 0)), 2) AS free_hours,
      -- Any support type Method adds later lands here rather than vanishing from
      -- the total, so the buckets always add up to the hours logged.
      ROUND(SUM(IF(NOT internal AND NOT unused_dedicated AND NOT discounted AND support_type NOT IN ('Dedicated', 'Pay-per-use', 'Free'), hours, 0)), 2) AS other_hours,
      ROUND(SUM(IF(NOT internal AND unused_dedicated, hours, 0)), 2) AS unused_dedicated_hours,
      -- Split by side so a discounted Free Hour is never counted as billed. That
      -- combination does not occur today; the split keeps it from mattering.
      ROUND(SUM(IF(NOT internal AND NOT unused_dedicated AND discounted AND support_type != 'Free', hours, 0)), 2) AS discounted_paid_hours,
      ROUND(SUM(IF(NOT internal AND NOT unused_dedicated AND discounted AND support_type = 'Free', hours, 0)), 2) AS discounted_free_hours,
      ROUND(SUM(IF(internal AND service_item = '${INTERNAL_PROJECT_ITEM}', hours, 0)), 2) AS internal_project_hours,
      ROUND(SUM(IF(internal AND (service_item IS NULL OR service_item != '${INTERNAL_PROJECT_ITEM}'), hours, 0)), 2) AS internal_other_hours
    FROM classified
    GROUP BY consultant, month
    HAVING SUM(hours) > 0
    ORDER BY month DESC, consultant`;
}

const toInt = (v, fallback = null) => (v == null || v === '' ? fallback : parseInt(v, 10));
const toNum = (v, fallback = 0) => (v == null || v === '' ? fallback : Number(v));
const toStr = (v) => (v == null || v === '' ? null : String(v));

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

// ── Aggregation ────────────────────────────────────────────────────────────

const round1 = (n) => Math.round(n * 10) / 10;
export const percent = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

/**
 * Roll a set of consultant-months into the numbers the screen shows.
 *
 * `billable` is the headline: the hours that survived both deductions. It is
 * the sum of the four clean buckets, because a bankable or discounted hour is
 * excluded from those buckets at the SQL grain rather than subtracted here.
 */
export function summarize(rows) {
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);

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

  return {
    entries: sum((r) => r.entries),
    dedicated: round1(dedicated),
    ppu: round1(ppu),
    free: round1(freeTotal),
    other: round1(other),
    billed: round1(billed),
    unusedDedicated: round1(unusedDedicated),
    discounted: round1(discounted),
    internalProject: round1(internalProject),
    internalOther: round1(internalOther),
    // Brandon's third column: discounted plus internal, the work nobody paid for.
    nonBillable: round1(discounted + internal),
    billable: round1(billable),
    total: round1(total),
    rate: percent(billable, total),
    months: distinctMonths(rows).length,
  };
}

/** The month a partial run falls in, as YYYY-MM. */
export const currentMonth = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

/**
 * True while a month can still gain bankable hours.
 *
 * Unused dedicated time is posted on the last day of the month, so until the
 * month closes the rate is missing its largest single deduction. On the current
 * month the number shown is a ceiling, not a result.
 */
export const isInProgress = (month, now = new Date()) => month >= currentMonth(now);

/** One summary per month, oldest first. */
export function byMonth(rows, now = new Date()) {
  return distinctMonths(rows).map((month) => ({
    month,
    inProgress: isInProgress(month, now),
    ...summarize(rows.filter((r) => r.month === month)),
  }));
}

/**
 * One summary per consultant, most billable hours first.
 *
 * Volume rather than rate is the default order: a consultant who logged forty
 * hours all month can post a perfect rate, and putting them above someone who
 * billed two hundred would make the leaderboard read backwards.
 */
export function byConsultant(rows, now = new Date()) {
  return distinctConsultants(rows)
    .map((consultant) => {
      const mine = rows.filter((r) => r.consultant === consultant);
      return {
        consultant,
        ...summarize(mine),
        // Comparable across people who worked different numbers of months.
        billablePerMonth: round1(
          summarize(mine).billable / Math.max(1, distinctMonths(mine).length),
        ),
      };
    })
    .sort((a, b) => b.billable - a.billable || a.consultant.localeCompare(b.consultant));
}

/** How the hours split across the five buckets, largest first. */
export function composition(rows) {
  const t = summarize(rows);
  return [
    { key: 'billable', label: 'Billable', hours: t.billable },
    { key: 'unused', label: 'Bankable', hours: t.unusedDedicated },
    { key: 'discounted', label: 'Discounted', hours: t.discounted },
    { key: 'internalProject', label: 'Internal projects', hours: t.internalProject },
    { key: 'internalOther', label: 'Other internal', hours: t.internalOther },
  ].map((b) => ({ ...b, share: percent(b.hours, t.total) }));
}

export async function fetchUtilization({ query = queryBqWithRetry, start = REPORTING_START } = {}) {
  const { rows } = await query(buildUtilizationSql(start));
  return rows.map(normalizeMonthRow);
}
