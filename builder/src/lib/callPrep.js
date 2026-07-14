// Call Prep data layer. Reads b.saltzman's precall snapshot table directly
// from the browser via the shared BQ OAuth layer (see bigquery.js).
//
// Table contract: docs/superpowers/specs/2026-07-13-call-prep-design.md.
// Book fallback: until call_prep.consultant_book exists upstream, "a
// consultant's book" = distinct accounts they have snapshots for.

import { validateInt } from './sanitize.js';

export const CALL_PREP_TABLE = '`project-for-method-dw.call_prep.snapshots`';

export function buildConsultantsSql() {
  return `
    SELECT
      consultant,
      COUNT(DISTINCT account_record_id) AS account_count,
      MAX(snapshot_date) AS last_snapshot_date
    FROM ${CALL_PREP_TABLE}
    WHERE consultant IS NOT NULL
    GROUP BY consultant
    ORDER BY consultant`;
}

// BigQuery single-quoted string literals escape via backslash (\'), not the
// doubled-quote ('') convention used elsewhere in this repo. sanitize.js's
// escapeBqString implements doubling, which does not neutralize a quote in
// a BQ literal, so it is not used here — this builds the literal directly.
function escapeSqlLiteral(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function buildBookSql(consultant) {
  const name = escapeSqlLiteral(consultant);
  return `
    SELECT *
    FROM ${CALL_PREP_TABLE}
    WHERE consultant = '${name}'
    QUALIFY ROW_NUMBER() OVER (PARTITION BY account_record_id ORDER BY snapshot_date DESC) = 1
    ORDER BY snapshot_date DESC`;
}

export function buildAccountSnapshotsSql(recordId) {
  const id = validateInt(recordId, 'account_record_id');
  return `
    SELECT *
    FROM ${CALL_PREP_TABLE}
    WHERE account_record_id = ${id}
    ORDER BY snapshot_date DESC`;
}

const toInt = (v, fallback = null) => (v == null || v === '' ? fallback : parseInt(v, 10));
const toFloat = (v) => (v == null || v === '' ? null : parseFloat(v));
const toBool = (v) => v === true || v === 'true';
const toStr = (v) => (v == null || v === '' ? null : String(v));

/** Convert a raw BQ REST row (all strings, [{v}] arrays) into typed camelCase. */
export function normalizeSnapshotRow(row) {
  return {
    accountRecordId: toInt(row.account_record_id),
    accountName: toStr(row.account_name),
    snapshotDate: toStr(row.snapshot_date),
    callType: toStr(row.call_type),
    consultant: toStr(row.consultant),
    accountAgeMonths: toFloat(row.account_age_months),
    signupDate: toStr(row.signup_date),
    depEnrolled: toBool(row.dep_enrolled),
    multiEntityParentName: toStr(row.multi_entity_parent_name),
    syncFailCount: toInt(row.sync_fail_count, 0),
    syncStatus: toStr(row.sync_status)?.toLowerCase() ?? null,
    ttTotalHours: toFloat(row.tt_total_hours),
    ttSessionCount: toInt(row.tt_session_count),
    ttLastSessionDate: toStr(row.tt_last_session_date),
    casesOpenCount: toInt(row.cases_open_count, 0),
    casesClosed90dCount: toInt(row.cases_closed_90d_count, 0),
    depSignals: (row.dep_signals || []).map((x) => x?.v).filter(Boolean),
    industryL1: toStr(row.industry_l1),
    industryL2: toStr(row.industry_l2),
    industryL3: toStr(row.industry_l3),
    operatingModel: toStr(row.operating_model),
    bqConfidence: toFloat(row.bq_confidence),
    docLink: toStr(row.doc_link),
    createdAt: toStr(row.created_at),
  };
}

const STALE_SESSION_DAYS = 30;
const MS_PER_DAY = 86400000;

/**
 * v1 attention rules — deliberately dumb (see spec). Returns UI-ready labels.
 * `snapshot` is a normalized Snapshot or null (account with no snapshot yet).
 */
export function computeFlags(snapshot, todayIso) {
  if (!snapshot) return ['no snapshot'];
  const flags = [];
  if (snapshot.syncFailCount > 0) flags.push('sync failing');
  if (snapshot.casesOpenCount > 0) flags.push('open cases');
  const last = snapshot.ttLastSessionDate;
  const staleDays = last
    ? Math.floor((Date.parse(todayIso) - Date.parse(last)) / MS_PER_DAY)
    : Infinity;
  if (staleDays >= STALE_SESSION_DAYS) flags.push('no recent sessions');
  return flags;
}
