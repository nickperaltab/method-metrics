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

// How long after a Free Hour an agreement still counts as following from it.
export const AGREEMENT_WINDOW_DAYS = 90;

export function buildFreeHoursSql(start = REPORTING_START) {
  // start is a module constant, never user input, but keep the shape strict.
  const from = /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : REPORTING_START;
  return `
    WITH v0 AS (
      SELECT * FROM ${FREE_HOUR_VIEW} WHERE cohort_month >= DATE '${from}'
    ),
    -- Eligibility. An account already mid-engagement when the call happened
    -- cannot be opened by it, but one that finished a case long ago can be
    -- re-opened — which is why this is "open at the call", not "ever had one".
    consulting_cases AS (
      SELECT MethodCompanyAccountRecordID AS account_record_id,
             DATE(CreatedDate) AS opened, DATE(ClosedDate) AS closed
      FROM \`project-for-method-dw.revenue.Cases\`
      WHERE NOT COALESCE(IsDeleted, FALSE)
        AND CaseType = 'Consulting Request'
        AND MethodCompanyAccountRecordID IS NOT NULL
    ),
    -- Trial vs existing customer needs two hops: the Free Hour grain carries
    -- account_record_id, but SaaS MRR is keyed on entity_record_id. Joining MRR
    -- directly on account_record_id silently matches under 4% of rows.
    acct AS (
      SELECT account_record_id, entity_record_id
      FROM \`project-for-method-dw.revenue.int_accounts\`
    ),
    saas AS (
      SELECT EntityRecordID, Month, StartMRR
      FROM \`project-for-method-dw.revenue.int_customer_mrr\`
      WHERE Month >= DATE_SUB(DATE '${from}', INTERVAL 12 MONTH)
    ),
    -- Agreements the Free Hour's OWN consultant sent. A proposal desk writes
    -- most proposals that follow a Free Hour (69% of them), so matching on
    -- assigned_to is what separates the rep's own follow-through from the desk's.
    props AS (
      SELECT account_record_id, assigned_to, contract_type, DATE(created_date) AS sent_date
      FROM \`project-for-method-dw.call_prep.ps_proposals\`
      WHERE created_date IS NOT NULL AND account_record_id IS NOT NULL
        AND contract_type IN ('Pay-Per-Use','Dedicated','Fast Track Dedicated')
    ),
    -- Attach the most recent MRR month AT OR BEFORE the call, not the call's own
    -- month. int_customer_mrr publishes a month in arrears, so an exact-month
    -- join reads every Free Hour in the current month as a trial — an error that
    -- grows all month until the month closes. Ranking a <= join also covers an
    -- account with a gap in its MRR history. BigQuery cannot de-correlate a
    -- "latest row" subquery here, hence the window.
    v AS (
      SELECT v0.*, sa.StartMRR AS mrr_at_call,
             ROW_NUMBER() OVER (PARTITION BY v0.fh_id ORDER BY sa.Month DESC) AS mrr_rn
      FROM v0
      LEFT JOIN acct a ON a.account_record_id = v0.account_record_id
      LEFT JOIN saas sa
        ON sa.EntityRecordID = a.entity_record_id
       AND sa.Month <= DATE_TRUNC(v0.call_date, MONTH)
    )
    SELECT
      v.fh_id,
      v.account_record_id,
      v.account,
      v.consultant,
      FORMAT_DATE('%Y-%m-%d', v.call_date) AS call_date,
      FORMAT_DATE('%Y-%m', v.cohort_month) AS cohort_month,
      v.fh_seq,
      FORMAT_DATE('%Y-%m', v.account_last_fh_date) AS last_fh_month,
      v.account_fh_count,
      (SELECT COUNT(1) > 0 FROM consulting_cases c
         WHERE c.account_record_id = v.account_record_id
           AND c.opened < v.call_date
           AND (c.closed IS NULL OR c.closed >= v.call_date)) AS open_case_at_call,
      COALESCE(v.mrr_at_call, 0) > 0 AS paying_saas_at_call,
      v.mrr_at_call IS NULL AS saas_state_unknown,
      v.prior_consulting_case,
      IF(v.first_ppu_date IS NULL, NULL, DATE_DIFF(v.first_ppu_date, v.call_date, DAY)) AS days_to_ppu,
      IF(v.first_dep_date IS NULL, NULL, DATE_DIFF(v.first_dep_date, v.call_date, DAY)) AS days_to_dep,
      IF(v.first_agreement_date IS NULL, NULL, DATE_DIFF(v.first_agreement_date, v.call_date, DAY)) AS days_to_agreement,
      DATE_DIFF((SELECT MIN(p.sent_date) FROM props p
         WHERE p.account_record_id = v.account_record_id
           AND p.assigned_to = v.consultant
           AND p.sent_date >= v.call_date
           AND p.sent_date <= DATE_ADD(v.call_date, INTERVAL ${AGREEMENT_WINDOW_DAYS} DAY)
        ), v.call_date, DAY) AS days_to_agreement_sent,
      ROUND(v.paid_hours_90d, 1) AS paid_hours_90d,
      v.days_elapsed
    FROM v
    WHERE v.mrr_rn = 1
    ORDER BY v.call_date DESC`;
}

/**
 * One row per PS agreement. Deliberately NOT pre-aggregated by consultant and
 * month: the screen only counts agreements sent to an account that consultant
 * personally gave a Free Hour to, and that match needs the account id. Counting
 * everything a rep wrote overstates it by roughly 15x (1,683 vs 113 in 2026),
 * because most of their agreements are for accounts they never ran a Free Hour on.
 */
export function buildAgreementsSentSql(start = REPORTING_START) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : REPORTING_START;
  return `
    SELECT
      proposal_id,
      account_record_id,
      assigned_to AS consultant,
      contract_type,
      FORMAT_DATE('%Y-%m-%d', DATE(created_date)) AS sent_date,
      accepted_date IS NOT NULL AS accepted
    FROM \`project-for-method-dw.call_prep.ps_proposals\`
    WHERE created_date IS NOT NULL
      AND assigned_to IS NOT NULL
      AND account_record_id IS NOT NULL
      AND contract_type IN ('Pay-Per-Use','Dedicated','Fast Track Dedicated')
      AND DATE(created_date) >= DATE '${from}'
    ORDER BY sent_date DESC`;
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
    // The account's most recent Free Hour over the full history, not just the
    // window loaded — lets you filter on how long ago the account last had one.
    lastFhMonth: toStr(row.last_fh_month),
    accountFhCount: toInt(row.account_fh_count, 1),
    // A consulting case already OPEN when the call happened. This is what makes
    // a Free Hour ineligible now; it used to be "billed PPU/DEP work ever",
    // which discarded 31 real conversions on accounts whose earlier engagement
    // had long since closed.
    openCaseAtCall: toBool(row.open_case_at_call),
    // Had paying SaaS MRR in the month of the call, so not a trial.
    payingSaasAtCall: toBool(row.paying_saas_at_call),
    saasStateUnknown: toBool(row.saas_state_unknown),
    priorConsultingCase: toBool(row.prior_consulting_case),
    daysToPpu: toInt(row.days_to_ppu),
    daysToDep: toInt(row.days_to_dep),
    daysToAgreement: toInt(row.days_to_agreement),
    // Days until the SAME consultant sent an agreement, or null if they didn't.
    daysToAgreementSent: toInt(row.days_to_agreement_sent),
    paidHours90d: toNum(row.paid_hours_90d, 0),
    daysElapsed: toInt(row.days_elapsed, 0),
  };
}

/** One PS agreement. */
export function normalizeAgreementRow(row) {
  return {
    id: toInt(row.proposal_id),
    accountRecordId: toInt(row.account_record_id),
    consultant: toStr(row.consultant),
    contractType: toStr(row.contract_type),
    sentDate: toStr(row.sent_date),
    accepted: toBool(row.accepted),
    month: toStr(row.sent_date) ? toStr(row.sent_date).slice(0, 7) : null,
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
 * An account mid-engagement when the call happened cannot be opened by it — the
 * hours it bills next were already committed. Such calls stay in the delivered
 * count but sit outside the rate.
 *
 * Deliberately NOT "has ever bought PS work": an account whose consulting case
 * closed a year ago is a real opportunity again, and excluding it threw away 31
 * conversions in 2026 alone. Only a case still open at the call date disqualifies.
 */
export const canConvert = (call) => !call.openCaseAtCall;
export const isRepeat = (call) => call.seq > 1;

/** A Free Hour given to an account with no paying SaaS MRR that month. */
export const isTrial = (call) => !call.payingSaasAtCall;

/** The Free Hour's own consultant sent an agreement within the window. */
export const repSentAgreement = (call) => call.daysToAgreementSent != null;


export const SEGMENTS = ['all', 'first', 'repeat', 'prior', 'trial', 'customer'];

export function matchesSegment(call, segment) {
  if (segment === 'first') return call.seq === 1;
  if (segment === 'repeat') return call.seq > 1;
  if (segment === 'prior') return !!call.priorConsultingCase;
  if (segment === 'trial') return isTrial(call);
  if (segment === 'customer') return !isTrial(call);
  return true;
}

/**
 * Apply the screen's filters. Any of them may be omitted.
 *
 * `from`/`to` bound the Free Hour itself. `lastFrom`/`lastTo` bound the
 * account's MOST RECENT Free Hour, which answers a different question: which
 * accounts has nobody spoken to since a given month, whenever the call in front
 * of you happened.
 */
export function filterCalls(
  calls,
  { from = null, to = null, consultant = 'all', segment = 'all', lastFrom = null, lastTo = null } = {},
) {
  return calls.filter((c) => {
    if (from && c.month < from) return false;
    if (to && c.month > to) return false;
    if (lastFrom && (c.lastFhMonth ?? '') < lastFrom) return false;
    if (lastTo && (c.lastFhMonth ?? '') > lastTo) return false;
    if (consultant !== 'all' && c.consultant !== consultant) return false;
    return matchesSegment(c, segment);
  });
}

/** Distinct months in which accounts most recently had a Free Hour. */
export function distinctLastFhMonths(calls) {
  return [...new Set(calls.map((c) => c.lastFhMonth).filter(Boolean))].sort();
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
  // Trial Free Hours are the base the agreement-sent rate is measured against:
  // an existing customer mid-relationship doesn't need a new agreement the way
  // a trial does, so mixing them would flatter the rate.
  const trials = calls.filter(isTrial);
  const sentAny = calls.filter(repSentAgreement);
  const trialSent = trials.filter(repSentAgreement);
  // The non-trial set is the one the consultant table reports on: an existing
  // customer needs a new agreement or a flag to become PS revenue, whereas a
  // trial's path runs through the subscription first.
  const nonTrials = calls.filter((c) => !isTrial(c));
  const nonTrialSent = nonTrials.filter(repSentAgreement);
  return {
    delivered: calls.length,
    openCaseAtCall: calls.length - eligible.length,
    eligible: eligible.length,
    converted: won.length,
    rate: percent(won.length, eligible.length),
    trialFreeHours: trials.length,
    customerFreeHours: calls.length - trials.length,
    // Agreements the delivering consultant sent themselves, and how often.
    repSentAgreement: sentAny.length,
    trialRepSentAgreement: trialSent.length,
    agreementRateOfTrial: percent(trialSent.length, trials.length),
    medianDaysToAgreementSent: median(sentAny.map((c) => c.daysToAgreementSent)),
    // Non-trial Free Hours and what the delivering rep did with them.
    nonTrialFreeHours: nonTrials.length,
    nonTrialRepSentAgreement: nonTrialSent.length,
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

/**
 * One summary per consultant, best rate first, then by volume.
 *
 * `agreements` is the PS agreement set. `agreementsSent` counts only the ones
 * that consultant sent to an account they personally gave one of these Free
 * Hours to — not everything they wrote.
 */
export function byConsultant(calls, agreements = []) {
  return distinctConsultants(calls)
    .map((consultant) => {
      const mine = calls.filter((c) => c.consultant === consultant);
      return {
        consultant,
        ...summarize(mine),
        agreementsSent: countAgreementsToOwnFreeHourAccounts(mine, agreements),
      };
    })
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.delivered - a.delivered);
}

/** Bound the agreement set to the months the screen is showing. */
export function filterAgreements(agreements, { from = null, to = null } = {}) {
  return agreements.filter((a) => {
    if (from && (a.month ?? '') < from) return false;
    if (to && (a.month ?? '') > to) return false;
    return true;
  });
}

/**
 * The agreements a consultant sent to an account they personally gave one of
 * these Free Hours to.
 *
 * Both halves have to match — same account AND same consultant — because a
 * proposal desk writes most agreements that follow a Free Hour, and reps write
 * plenty of agreements for accounts they never ran one on. That match is the
 * whole rule; the period the screen is showing is the only other bound.
 *
 * Deliberately no ordering or elapsed-time test. Reps often write the agreement
 * during the call itself (49 of 131 in 2026 were sent the same day), and the
 * dates either side are coarse enough that policing the order buys nothing: a
 * 90-day window drops 13 later agreements and an on-or-after test drops 5 more,
 * out of 131.
 *
 * Returns the agreements de-duplicated by id, since one account can receive
 * several and can have had several Free Hours.
 */
export function agreementsToOwnFreeHourAccounts(calls, agreements) {
  const ownAccounts = new Set();
  for (const c of calls) {
    if (!c.consultant || c.accountRecordId == null) continue;
    ownAccounts.add(`${c.accountRecordId}:${c.consultant}`);
  }

  const seen = new Map();
  for (const a of agreements) {
    if (a.id == null || !a.consultant || a.accountRecordId == null || seen.has(a.id)) continue;
    if (ownAccounts.has(`${a.accountRecordId}:${a.consultant}`)) seen.set(a.id, a);
  }
  return [...seen.values()];
}

/** How many of them there were. */
export const countAgreementsToOwnFreeHourAccounts = (calls, agreements) =>
  agreementsToOwnFreeHourAccounts(calls, agreements).length;

/**
 * How Free Hours split by whether the delivering rep sent an agreement.
 * Trials and existing customers are kept apart because they behave differently:
 * a trial has no relationship to fall back on, so the agreement is the whole ask.
 */
export function byAgreementSent(calls) {
  const buckets = [
    { key: 'trial-sent', label: 'Trial', sent: true, test: (c) => isTrial(c) && repSentAgreement(c) },
    { key: 'trial-none', label: 'Trial', sent: false, test: (c) => isTrial(c) && !repSentAgreement(c) },
    { key: 'cust-sent', label: 'Existing customer', sent: true, test: (c) => !isTrial(c) && repSentAgreement(c) },
    { key: 'cust-none', label: 'Existing customer', sent: false, test: (c) => !isTrial(c) && !repSentAgreement(c) },
  ];
  return buckets.map((b) => ({
    key: b.key, label: b.label, sent: b.sent, ...summarize(calls.filter(b.test)),
  }));
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

// ── Sorting ────────────────────────────────────────────────────────────────

/**
 * Sort a set of aggregate rows by one column.
 *
 * `value` reads the column out of a row; `tiebreak` settles equal values so
 * the order never wobbles between renders. Missing values sink to the bottom in
 * BOTH directions — a consultant with no eligible Free Hours has no rate rather
 * than the worst one, and sorting them to the top of an ascending rate column
 * would bury the people the column exists to show.
 */
export function sortRows(rows, { value, dir = 'desc', tiebreak = null } = {}) {
  const sign = dir === 'asc' ? 1 : -1;
  const missing = (v) => v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v));
  return [...rows].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (missing(av) || missing(bv)) {
      if (missing(av) && missing(bv)) return tiebreak ? tiebreak(a, b) : 0;
      return missing(av) ? 1 : -1;
    }
    const cmp = typeof av === 'string' || typeof bv === 'string'
      ? String(av).localeCompare(String(bv))
      : av - bv;
    return cmp * sign || (tiebreak ? tiebreak(a, b) : 0);
  });
}

export async function fetchFreeHours({ query = queryBqWithRetry, start = REPORTING_START } = {}) {
  const { rows } = await query(buildFreeHoursSql(start));
  return rows.map(normalizeFreeHourRow);
}

export async function fetchAgreementsSent({ query = queryBqWithRetry, start = REPORTING_START } = {}) {
  const { rows } = await query(buildAgreementsSentSql(start));
  return rows.map(normalizeAgreementRow);
}
