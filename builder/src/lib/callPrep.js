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
