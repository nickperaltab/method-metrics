// Free Hour outcomes data layer. Answers one question: how many Free Hours did
// we deliver, and how many turned into paid PS work? Sibling of callPrep.js and
// handoffs.js — same BQ OAuth layer, same normalize-then-render discipline.
//
// Reads `project-for-method-dw.call_prep.free_hour_outcomes`, a view over
// `revenue.int_consultant_work`. Two things about that view are worth knowing
// before changing anything here:
//
// 1. A delivered Free Hour is the consultant's own logged `Free` time entry
//    with hours > 0 — NOT an `AI Summary - Free Hour` activity. revenue.Activity
//    stores those in two shapes and one carries no account, date or consultant,
//    so counting from it silently drops whole months (April 2026 reads as zero
//    against 71 real sessions). The time entry is complete in every month.
// 2. Conversion comes from the SAME table — the first billed `Pay-per-use` or
//    `Dedicated` entry on that account after the call. One grain for both halves,
//    so a Free Hour and the revenue that followed are counted the same way.
//
// Everything below the fetch is pure so it can be tested without BigQuery.

import { queryBqWithRetry } from './bigquery.js';

export const FREE_HOUR_VIEW = '`project-for-method-dw.call_prep.free_hour_outcomes`';

// Free time entries exist back to 2020, but PS reporting starts here — earlier
// months predate the current Free Hour motion and would muddy the trend.
export const REPORTING_START = '2026-01-01';

// Window used for the like-for-like rate. The headline rate counts a conversion
// whenever it happened, which flatters older cohorts simply for being older;
// this bounds both sides to the same 30 days so months can be compared.
export const FAIR_WINDOW_DAYS = 30;

export function buildFreeHoursSql(start = REPORTING_START) {
  // start is a module constant, never user input, but keep the shape strict.
  const from = /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : REPORTING_START;
  return `
    SELECT
      fh_id,
      account_record_id,
      account,
      consultant,
      FORMAT_DATE('%Y-%m-%d', call_date) AS call_date,
      FORMAT_DATE('%Y-%m', cohort_month) AS cohort_month,
      fh_seq,
      (had_ppu_before OR had_dep_before) AS already_paying,
      prior_consulting_case,
      IF(first_ppu_date IS NULL, NULL, DATE_DIFF(first_ppu_date, call_date, DAY)) AS days_to_ppu,
      IF(first_dep_date IS NULL, NULL, DATE_DIFF(first_dep_date, call_date, DAY)) AS days_to_dep,
      IF(first_agreement_date IS NULL, NULL, DATE_DIFF(first_agreement_date, call_date, DAY)) AS days_to_agreement,
      ROUND(paid_hours_90d, 1) AS paid_hours_90d,
      days_elapsed
    FROM ${FREE_HOUR_VIEW}
    WHERE cohort_month >= DATE '${from}'
    ORDER BY call_date DESC`;
}

const toInt = (v, fallback = null) => (v == null || v === '' ? fallback : parseInt(v, 10));
const toNum = (v, fallback = null) => (v == null || v === '' ? fallback : Number(v));
const toStr = (v) => (v == null || v === '' ? null : String(v));
// BQ REST returns booleans as the strings 'true'/'false'.
const toBool = (v) => v === true || v === 'true';

/** Convert a raw BQ REST row into a typed Free Hour. */
export function normalizeFreeHourRow(row) {
  return {
    id: toInt(row.fh_id),
    accountRecordId: toInt(row.account_record_id),
    account: toStr(row.account),
    consultant: toStr(row.consultant),
    callDate: toStr(row.call_date),
    month: toStr(row.cohort_month),
    seq: toInt(row.fh_seq, 1),
    alreadyPaying: toBool(row.already_paying),
    priorConsultingCase: toBool(row.prior_consulting_case),
    daysToPpu: toInt(row.days_to_ppu),
    daysToDep: toInt(row.days_to_dep),
    daysToAgreement: toInt(row.days_to_agreement),
    paidHours90d: toNum(row.paid_hours_90d, 0),
    daysElapsed: toInt(row.days_elapsed, 0),
  };
}

// ── Classification ─────────────────────────────────────────────────────────

/**
 * Which paid engagement followed this Free Hour, or null. When both PPU and
 * Dedicated followed, the earlier one is what the Free Hour produced.
 * `withinDays` bounds it for like-for-like comparison; omit for "ever".
 */
export function conversionType(call, withinDays = null) {
  const ok = (d) => d != null && d >= 0 && (withinDays == null || d <= withinDays);
  const ppu = ok(call.daysToPpu);
  const dep = ok(call.daysToDep);
  if (!ppu && !dep) return null;
  if (ppu && dep) return call.daysToPpu <= call.daysToDep ? 'ppu' : 'dep';
  return ppu ? 'ppu' : 'dep';
}

/** Days from the Free Hour to the first billed hour, or null. */
export function daysToConversion(call, withinDays = null) {
  const k = conversionType(call, withinDays);
  if (k === 'ppu') return call.daysToPpu;
  if (k === 'dep') return call.daysToDep;
  return null;
}

/**
 * An account already buying PS work before the call cannot "convert" — its
 * later billed hours are business as usual, not a result of the Free Hour. Such
 * calls stay in the delivered count but sit outside the rate.
 */
export const canConvert = (call) => !call.alreadyPaying;
export const isRepeat = (call) => call.seq > 1;

export const SEGMENTS = ['all', 'first', 'repeat', 'prior'];

export function matchesSegment(call, segment) {
  if (segment === 'first') return call.seq === 1;
  if (segment === 'repeat') return call.seq > 1;
  if (segment === 'prior') return !!call.priorConsultingCase;
  return true;
}

/** Apply the screen's filters. Any of them may be omitted. */
export function filterCalls(calls, { from = null, to = null, consultant = 'all', segment = 'all' } = {}) {
  return calls.filter((c) => {
    if (from && c.month < from) return false;
    if (to && c.month > to) return false;
    if (consultant !== 'all' && c.consultant !== consultant) return false;
    return matchesSegment(c, segment);
  });
}

// ── Aggregation ────────────────────────────────────────────────────────────

export function median(values) {
  const nums = values.filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const i = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[i] : Math.round((nums[i - 1] + nums[i]) / 2);
}

export const percent = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

/** Headline numbers for a set of Free Hours. */
export function summarize(calls) {
  const eligible = calls.filter(canConvert);
  const won = eligible.filter((c) => conversionType(c));
  const signed = eligible.filter((c) => c.daysToAgreement != null && c.daysToAgreement >= 0);
  // Only calls old enough to have had the full window, counting only
  // conversions inside it — the number to compare month against month.
  const ready = eligible.filter((c) => c.daysElapsed >= FAIR_WINDOW_DAYS);
  const fair = ready.filter((c) => conversionType(c, FAIR_WINDOW_DAYS));
  return {
    delivered: calls.length,
    alreadyPaying: calls.length - eligible.length,
    eligible: eligible.length,
    converted: won.length,
    rate: percent(won.length, eligible.length),
    ppu: won.filter((c) => conversionType(c) === 'ppu').length,
    dep: won.filter((c) => conversionType(c) === 'dep').length,
    paidHours: Math.round(won.reduce((a, c) => a + (c.paidHours90d || 0), 0)),
    medianDaysToAgreement: median(signed.map((c) => c.daysToAgreement)),
    signedCount: signed.length,
    signedSameDay: signed.filter((c) => c.daysToAgreement === 0).length,
    signedWithinWeek: signed.filter((c) => c.daysToAgreement <= 7).length,
    fairReady: ready.length,
    fairConverted: fair.length,
    fairRate: percent(fair.length, ready.length),
    stillYoung: eligible.filter((c) => c.daysElapsed < FAIR_WINDOW_DAYS).length,
  };
}

export function distinctMonths(calls) {
  return [...new Set(calls.map((c) => c.month).filter(Boolean))].sort();
}

export function distinctConsultants(calls) {
  return [...new Set(calls.map((c) => c.consultant).filter(Boolean))].sort();
}

/** One summary per month, oldest first. */
export function byMonth(calls) {
  const months = distinctMonths(calls);
  return months.map((month) => ({
    month,
    ...summarize(calls.filter((c) => c.month === month)),
    youngest: Math.min(...calls.filter((c) => c.month === month).map((c) => c.daysElapsed)),
  }));
}

/** One summary per consultant, best rate first, then by volume. */
export function byConsultant(calls) {
  return distinctConsultants(calls)
    .map((consultant) => ({ consultant, ...summarize(calls.filter((c) => c.consultant === consultant)) }))
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.delivered - a.delivered);
}

export const SEQUENCE_BUCKETS = [
  { key: '1st', label: '1st', test: (c) => c.seq === 1 },
  { key: '2nd', label: '2nd', test: (c) => c.seq === 2 },
  { key: '3rd', label: '3rd', test: (c) => c.seq === 3 },
  { key: '4th+', label: '4th+', test: (c) => c.seq >= 4 },
];

/**
 * Where each Free Hour sits in its account's history. Later Free Hours go
 * overwhelmingly to accounts already paying (3% on the 1st, 84% by the 4th) —
 * they maintain a relationship rather than open new business, which is why the
 * rate alone understates what a repeat session is for.
 */
export function bySequence(calls) {
  return SEQUENCE_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    ...summarize(calls.filter(b.test)),
  }));
}

/** Only the Free Hours that produced billed work, newest first. */
export function conversions(calls) {
  return calls
    .filter(canConvert)
    .filter((c) => conversionType(c))
    .sort((a, b) => (b.callDate ?? '').localeCompare(a.callDate ?? ''));
}

export async function fetchFreeHours({ query = queryBqWithRetry, start = REPORTING_START } = {}) {
  const { rows } = await query(buildFreeHoursSql(start));
  return rows.map(normalizeFreeHourRow);
}
