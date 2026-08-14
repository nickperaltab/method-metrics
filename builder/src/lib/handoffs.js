// Handoffs data layer. Reads the PS handoff packets that the /handoff skill
// writes to project-for-method-dw.call_prep.handoffs, via the shared BQ OAuth
// layer (see bigquery.js). Sibling of callPrep.js.
//
// Table contract: the skill appends one row per generation or status change.
// "Latest per account" = QUALIFY ROW_NUMBER() OVER (PARTITION BY
// account_record_id ORDER BY created_at DESC) = 1 — same discipline as
// callPrep's buildBookSql.

import { validateInt } from './sanitize.js';
import { queryBqWithRetry } from './bigquery.js';

export const HANDOFF_TABLE = '`project-for-method-dw.call_prep.handoffs`';

// The lifecycle, in order. Exported so the UI can rank/colour consistently and
// so a status the backend adds later still renders (unknown → end of order).
export const HANDOFF_STATUSES = [
  'Draft',
  'Questions Pending',
  'Ready',
  'Shared',
  'Accepted',
  'Complete',
];

// BigQuery single-quoted string literals escape via backslash (\'), not the
// doubled-quote ('') convention used elsewhere in this repo — matches
// callPrep.js's escapeSqlLiteral.
function escapeSqlLiteral(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Latest handoff per account, newest first. Powers the Handoffs list.
export function buildHandoffsSql() {
  return `
    SELECT *
    FROM ${HANDOFF_TABLE}
    QUALIFY ROW_NUMBER() OVER (PARTITION BY account_record_id ORDER BY created_at DESC) = 1
    ORDER BY created_at DESC`;
}

// Latest handoff per account for one incoming rep. Powers the "my incoming
// handoffs" filter without pulling the whole table client-side.
export function buildHandoffsForIncomingSql(incomingRep) {
  const name = escapeSqlLiteral(incomingRep);
  return `
    SELECT *
    FROM ${HANDOFF_TABLE}
    WHERE incoming_rep = '${name}'
    QUALIFY ROW_NUMBER() OVER (PARTITION BY account_record_id ORDER BY created_at DESC) = 1
    ORDER BY created_at DESC`;
}

// Full status history for one account — the timeline on the detail page.
export function buildAccountHandoffsSql(recordId) {
  const id = validateInt(recordId, 'account_record_id');
  return `
    SELECT *
    FROM ${HANDOFF_TABLE}
    WHERE account_record_id = ${id}
    ORDER BY created_at DESC`;
}

const toInt = (v, fallback = null) => (v == null || v === '' ? fallback : parseInt(v, 10));
const toStr = (v) => (v == null || v === '' ? null : String(v));
// Only allow http(s) URLs through — doc_link renders in an <a href>, and React
// does not block javascript:/data: URLs there. Mirrors callPrep's toHttpUrl.
const toHttpUrl = (v) => {
  const s = toStr(v);
  return s && /^https?:\/\//i.test(s) ? s : null;
};

/** Convert a raw BQ REST row (all strings, [{v}] arrays) into a typed handoff. */
export function normalizeHandoffRow(row) {
  return {
    accountRecordId: toInt(row.account_record_id),
    accountName: toStr(row.account_name),
    handoffDate: toStr(row.handoff_date),
    outgoingRep: toStr(row.outgoing_rep),
    incomingRep: toStr(row.incoming_rep),
    status: toStr(row.status),
    docLink: toHttpUrl(row.doc_link),
    openInProgress: toInt(row.open_in_progress, 0),
    openPromised: toInt(row.open_promised, 0),
    catalogueMatches: toInt(row.catalogue_matches, 0),
    flags: (row.flags || []).map((x) => x?.v).filter(Boolean),
    firstPriority: toStr(row.first_priority),
    createdAt: toStr(row.created_at),
  };
}

/** Order index for a status, for sorting/colour. Unknown statuses sort last. */
export function statusRank(status) {
  const i = HANDOFF_STATUSES.indexOf(status);
  return i === -1 ? HANDOFF_STATUSES.length : i;
}

export async function fetchHandoffs({ query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildHandoffsSql());
  return rows.map(normalizeHandoffRow);
}

export async function fetchHandoffsForIncoming(incomingRep, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildHandoffsForIncomingSql(incomingRep));
  return rows.map(normalizeHandoffRow);
}

export async function fetchAccountHandoffs(recordId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildAccountHandoffsSql(recordId));
  return rows.map(normalizeHandoffRow);
}
