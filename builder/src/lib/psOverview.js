// PS overview data layer. Powers the /ps landing page — today's prepped calls,
// my account board, and my handoffs — reading the same BQ tables the Call Prep
// and Handoffs pages use. Sibling of callPrep.js and handoffs.js.
//
// "My book": there is no rep→account mapping in BigQuery (revenue.int_accounts
// has no owner/rep column), so this uses the same fallback callPrep.js does —
// a consultant's book is the distinct accounts they have snapshots for.
//
// Consultant matching is deliberately fuzzy. The snapshots feed writes two name
// conventions for the same person ("Sherry Zarei" and "S. Zarei" are both in
// the table), so matching an exact string splits a book in half. We match on
// first-initial + last name derived from the signed-in Google address instead.

import { queryBqWithRetry } from './bigquery.js';
import {
  CALL_PREP_TABLE,
  ACCOUNTS_TABLE,
  normalizeSnapshotRow,
  normalizeAccountOverview,
  computeFlags,
} from './callPrep.js';
import { HANDOFF_TABLE, normalizeHandoffRow } from './handoffs.js';

/**
 * Build a BQ regex matching every name convention for the person behind an
 * email. `b.saltzman@method.me` → /^b[a-z]*\.? +saltzman$/, which matches
 * "Brandon Saltzman", "B. Saltzman" and "B Saltzman".
 *
 * Returns null when the local part has no first/last structure to work with
 * (e.g. `support@`) — callers must treat that as "can't scope to a person".
 */
export function consultantPatternFromEmail(email) {
  const local = String(email || '').split('@')[0].toLowerCase().trim();
  if (!local) return null;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length < 2) return null;
  const first = parts[0];
  const last = parts[parts.length - 1];
  // Only letters get through, which is also what keeps the pattern safe to
  // interpolate into SQL below — no quotes or backslashes can survive.
  if (!/^[a-z]+$/.test(first) || !/^[a-z]+$/.test(last)) return null;
  return `^${first[0]}[a-z]*\\.? +${last}$`;
}

function requirePattern(email) {
  const pattern = consultantPatternFromEmail(email);
  if (!pattern) throw new Error(`Can't derive a consultant name from "${email}"`);
  return pattern;
}

function requireIsoDate(value) {
  const s = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Expected YYYY-MM-DD, got "${value}"`);
  return s;
}

/** Today's local date as YYYY-MM-DD. toISOString() would shift us to UTC. */
export function localIsoDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Calls I have a prep snapshot for today. The call-prep routine writes these
// the morning of, so this is "what I'm walking into", not a calendar read —
// call_prep.brief_content (the only source of scheduled times) stopped being
// written on 2026-07-16, so there are no clock times to show.
export function buildMyTodaySql(email, todayIso) {
  const pattern = requirePattern(email);
  const day = requireIsoDate(todayIso);
  return `
    SELECT *
    FROM ${CALL_PREP_TABLE}
    WHERE snapshot_date = DATE '${day}'
      AND REGEXP_CONTAINS(LOWER(consultant), r'${pattern}')
    ORDER BY account_name`;
}

// Latest snapshot per account in my book, enriched with the account-grain
// dbt model so the board can show MRR, licenses and health next to the flags.
export function buildMyBoardSql(email) {
  const pattern = requirePattern(email);
  return `
    WITH latest AS (
      SELECT *
      FROM ${CALL_PREP_TABLE}
      WHERE REGEXP_CONTAINS(LOWER(consultant), r'${pattern}')
      QUALIFY ROW_NUMBER() OVER (PARTITION BY account_record_id ORDER BY snapshot_date DESC) = 1
    )
    SELECT
      latest.*,
      a.mrr_run_rate,
      a.user_licenses,
      a.health_score,
      a.is_active,
      a.saas_pay_type
    FROM latest
    LEFT JOIN ${ACCOUNTS_TABLE} a USING (account_record_id)
    ORDER BY latest.snapshot_date DESC`;
}

// Handoffs where I'm on either side of the transition, latest per account.
export function buildMyHandoffsSql(email) {
  const pattern = requirePattern(email);
  return `
    SELECT *
    FROM ${HANDOFF_TABLE}
    WHERE REGEXP_CONTAINS(LOWER(outgoing_rep), r'${pattern}')
       OR REGEXP_CONTAINS(LOWER(incoming_rep), r'${pattern}')
    QUALIFY ROW_NUMBER() OVER (PARTITION BY account_record_id ORDER BY created_at DESC) = 1
    ORDER BY created_at DESC`;
}

/** A board row is a snapshot plus its int_accounts overview, flattened. */
export function normalizeBoardRow(row, todayIso) {
  const snapshot = normalizeSnapshotRow(row);
  return {
    ...snapshot,
    overview: normalizeAccountOverview(row),
    flags: computeFlags(snapshot, todayIso),
  };
}

/**
 * Board ordering: accounts needing attention first, then most flags, then the
 * coldest account. Sorting by snapshot date would bury a failing sync under
 * whichever account happened to get prepped most recently.
 */
export function compareBoardRows(a, b) {
  if (a.flags.length !== b.flags.length) return b.flags.length - a.flags.length;
  const aLast = a.ttLastSessionDate ?? '';
  const bLast = b.ttLastSessionDate ?? '';
  if (aLast !== bLast) return aLast.localeCompare(bLast);
  return (a.accountName ?? '').localeCompare(b.accountName ?? '');
}

/** Headline numbers for the stat row. MRR only counts active accounts. */
export function summarizeBoard(board) {
  const active = board.filter((r) => r.overview?.isActive !== false);
  return {
    accounts: board.length,
    activeMrr: active.reduce((sum, r) => sum + (r.overview?.mrrRunRate ?? 0), 0),
    needsAttention: board.filter((r) => r.flags.length > 0).length,
    licenses: active.reduce((sum, r) => sum + (r.overview?.userLicenses ?? 0), 0),
  };
}

export async function fetchMyToday(email, todayIso, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildMyTodaySql(email, todayIso));
  return rows.map(normalizeSnapshotRow);
}

export async function fetchMyBoard(email, todayIso, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildMyBoardSql(email));
  return rows.map((r) => normalizeBoardRow(r, todayIso)).sort(compareBoardRows);
}

export async function fetchMyHandoffs(email, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildMyHandoffsSql(email));
  return rows.map(normalizeHandoffRow);
}
