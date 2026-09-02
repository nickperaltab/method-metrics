// End-of-day follow-through data layer. Reads the findings that the
// `/time-killer` routine writes to project-for-method-dw.call_prep.time_killer_findings,
// via the shared BQ OAuth layer (see bigquery.js). Sibling of handoffs.js.
//
// What a "finding" is: the routine reconstructs a consultant's day — Zoom
// meetings, logged time, Gmail, Alocet activity — and raises one finding per
// piece of follow-through that hasn't happened. This screen is the read side.
// Table contract: PS_Claude Projects/method-ps-time-killer/commands/time-killer.md.
//
// The table is APPEND-ONLY and a finding keeps its identity across runs via a
// deterministic finding_id ({consultant}-{account}-{type}-{anchor_date}), so
// every read must dedupe to the newest row per finding_id. Reading it raw
// shows a finding once per day it survived.

import { queryBqWithRetry } from './bigquery.js';
import { consultantPatternFromEmail } from './psOverview.js';

export const FINDINGS_TABLE = '`project-for-method-dw.call_prep.time_killer_findings`';

// The three checks the routine runs, in the order the screen presents them:
// an unfinished client commitment outranks a bookkeeping gap, which outranks
// an account merely gone quiet.
export const FINDING_TYPES = ['followup_missing', 'email_not_logged', 'mia'];

export const FINDING_LABELS = {
  followup_missing: 'Follow-up incomplete',
  email_not_logged: 'Not logged in Alocet',
  mia: 'Gone quiet',
};

// Lifecycle from the routine's Step 6. `open` and `drafted` are live work;
// `dismissed` and `resolved` are settled and stay out of the default view.
export const OPEN_STATUSES = new Set(['open', 'drafted']);

// The three things a proper follow-up email has to contain. The routine names
// what was missing in `missing_elements`; these are the display labels.
//
// Both `hours_estimate` and `time_estimate` appear in the live table for the
// same check — the routine's prose says "hours estimate" while its own example
// output says "time estimate", and it has written both. Mapping them to one
// label keeps a single finding from rendering as two different gaps.
export const MISSING_ELEMENT_LABELS = {
  recap: 'recap',
  hours_estimate: 'time estimate',
  time_estimate: 'time estimate',
  delivery_date: 'delivery date',
};

/** Canonical key for a missing element, collapsing the two estimate spellings. */
export function canonicalMissingElement(element) {
  const key = String(element ?? '').trim().toLowerCase();
  return key === 'hours_estimate' ? 'time_estimate' : key;
}

function requirePattern(email) {
  const pattern = consultantPatternFromEmail(email);
  if (!pattern) throw new Error(`Can't derive a consultant name from "${email}"`);
  return pattern;
}

// Every finding for the signed-in consultant, newest row per finding_id.
//
// Scoped by name pattern rather than `consultant_email` because the routine
// populates the name on every row but has left the email null on runs where
// Step 0 resolved the consultant from Alocet instead of the Google profile.
// Matching the name is the same fuzzy match psOverview.js uses for the book.
export function buildMyFindingsSql(email, { sinceDays = 60 } = {}) {
  const pattern = requirePattern(email);
  const days = Number.isInteger(sinceDays) && sinceDays > 0 ? sinceDays : 60;
  return `
    SELECT *
    FROM ${FINDINGS_TABLE}
    WHERE run_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
      AND REGEXP_CONTAINS(LOWER(consultant), r'${pattern}')
    QUALIFY ROW_NUMBER() OVER (PARTITION BY finding_id ORDER BY created_at DESC) = 1
    ORDER BY last_seen DESC, account_name`;
}

// Same shape, every consultant — the manager view of who is carrying open
// follow-through. Kept separate so the per-rep read never pulls the whole team.
export function buildAllFindingsSql({ sinceDays = 60 } = {}) {
  const days = Number.isInteger(sinceDays) && sinceDays > 0 ? sinceDays : 60;
  return `
    SELECT *
    FROM ${FINDINGS_TABLE}
    WHERE run_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
    QUALIFY ROW_NUMBER() OVER (PARTITION BY finding_id ORDER BY created_at DESC) = 1
    ORDER BY last_seen DESC, consultant, account_name`;
}

const toInt = (v, fallback = null) => (v == null || v === '' ? fallback : parseInt(v, 10));
const toStr = (v) => (v == null || v === '' ? null : String(v));
const toBool = (v) => (v == null || v === '' ? null : v === true || v === 'true');
// BQ REST returns a repeated field as [{v: 'x'}, …]; a fixture supplies a
// plain array. Accept both so the mock path exercises the same normalizer.
const toList = (v) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? x.v : x)).filter(Boolean) : []);

/** Convert a raw BQ REST row into a typed finding. */
export function normalizeFindingRow(row) {
  return {
    findingId: toStr(row.finding_id),
    runDate: toStr(row.run_date),
    consultant: toStr(row.consultant),
    consultantEmail: toStr(row.consultant_email),
    accountRecordId: toInt(row.account_record_id),
    accountName: toStr(row.account_name),
    accountIsDep: toBool(row.account_is_dep),
    findingType: toStr(row.finding_type),
    detail: toStr(row.detail),
    evidence: toStr(row.evidence),
    missingElements: [...new Set(toList(row.missing_elements).map(canonicalMissingElement))],
    daysSinceTouch: toInt(row.days_since_touch),
    motion: toStr(row.motion),
    fit: toStr(row.fit),
    recommendedHook: toStr(row.recommended_hook),
    status: toStr(row.status),
    firstSeen: toStr(row.first_seen),
    lastSeen: toStr(row.last_seen),
    draftedAt: toStr(row.drafted_at),
    draftId: toStr(row.draft_id),
    resolvedAt: toStr(row.resolved_at),
    createdAt: toStr(row.created_at),
  };
}

/** Order index for a finding type. Unknown types sort last. */
export function typeRank(findingType) {
  const i = FINDING_TYPES.indexOf(findingType);
  return i === -1 ? FINDING_TYPES.length : i;
}

/**
 * How long a finding has been carried, in days. Ages from `firstSeen`, not
 * `runDate` — a gap first raised eight days ago and re-confirmed this
 * afternoon is eight days old, not zero.
 *
 * Returns null when firstSeen is missing or unparseable, which the UI shows as
 * "—" rather than as a confident 0.
 */
export function findingAgeDays(finding, todayIso) {
  const first = String(finding?.firstSeen ?? '');
  const today = String(todayIso ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(ms / 86400000));
}

/** Live work only — what the consultant still has to act on. */
export function isOpen(finding) {
  return OPEN_STATUSES.has(finding?.status);
}

/**
 * Ranking: oldest unfinished commitment first.
 *
 * Age leads because a follow-up nobody sent decays — the client has been
 * waiting the whole time, and a three-day-old silence is worse than today's.
 * Type breaks ties so a client-facing gap outranks a bookkeeping one, and DEP
 * accounts outrank PPU at equal age and type because they are on retainer.
 */
export function compareFindings(a, b, todayIso) {
  const ageA = findingAgeDays(a, todayIso) ?? 0;
  const ageB = findingAgeDays(b, todayIso) ?? 0;
  if (ageA !== ageB) return ageB - ageA;
  const rank = typeRank(a.findingType) - typeRank(b.findingType);
  if (rank !== 0) return rank;
  if (!!a.accountIsDep !== !!b.accountIsDep) return a.accountIsDep ? -1 : 1;
  return (a.accountName ?? '').localeCompare(b.accountName ?? '');
}

/** Headline counts for the stat row. Counts open work only. */
export function summarizeFindings(findings) {
  const open = findings.filter(isOpen);
  const byType = (t) => open.filter((f) => f.findingType === t).length;
  return {
    open: open.length,
    accounts: new Set(open.map((f) => f.accountRecordId)).size,
    followupMissing: byType('followup_missing'),
    emailNotLogged: byType('email_not_logged'),
    mia: byType('mia'),
    drafted: open.filter((f) => f.status === 'drafted').length,
    // Settled today-and-earlier, shown as the "already handled" counterweight
    // so the screen isn't only ever a list of things you got wrong.
    resolved: findings.filter((f) => f.status === 'resolved').length,
  };
}

/** Group open findings by account, each group ranked and ordered by its worst item. */
export function groupByAccount(findings, todayIso) {
  const groups = new Map();
  for (const f of findings) {
    const key = f.accountRecordId ?? f.accountName ?? 'unknown';
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        accountRecordId: f.accountRecordId,
        accountName: f.accountName,
        accountIsDep: f.accountIsDep,
        findings: [],
      });
    }
    groups.get(key).findings.push(f);
  }
  const out = [...groups.values()];
  for (const g of out) g.findings.sort((a, b) => compareFindings(a, b, todayIso));
  // An account is as urgent as its most urgent finding.
  out.sort((a, b) => compareFindings(a.findings[0], b.findings[0], todayIso));
  return out;
}

export async function fetchMyFindings(email, { query = queryBqWithRetry, sinceDays } = {}) {
  const { rows } = await query(buildMyFindingsSql(email, { sinceDays }));
  return rows.map(normalizeFindingRow);
}

export async function fetchAllFindings({ query = queryBqWithRetry, sinceDays } = {}) {
  const { rows } = await query(buildAllFindingsSql({ sinceDays }));
  return rows.map(normalizeFindingRow);
}
