// Read-only prototype for pulling a "Method customer detail" view straight
// from BigQuery, joined across four tables Brandon didn't know existed
// until this was scoped out live on 2026-07-10:
//
//   v7_classification.account_labels      — one row per account_record_id
//                                            (industry, business description)
//   v7_classification.account_entity_map  — account_record_id -> customer_record_id
//                                            (the bridge to the revenue/EntityRecordID grain)
//   net.accounts                          — Segment-style account snapshots,
//                                            keyed by record_id = account_record_id
//   revenue.int_customers / int_customer_mrr — monthly customer-grain metrics,
//                                            keyed by EntityRecordID = customer_record_id
//   call_prep.snapshots                   — call-prep's own per-call history
//                                            (separate table, untouched by this)
//
// Every function here only issues SELECT queries via lib/bigquery.js's
// queryBq() (same BQ OAuth scope the rest of the app already uses — no new
// consent needed). Nothing here writes to BigQuery or Supabase.
import { queryBq } from './bigquery';
import { validateInt, escapeBqString } from './sanitize';

const PROJECT = 'project-for-method-dw';

export async function searchAccounts(term) {
  const safe = escapeBqString(term.trim());
  const sql = `
    SELECT account_record_id, company_account, l1, l2, confidence
    FROM \`${PROJECT}.v7_classification.account_labels\`
    WHERE LOWER(company_account) LIKE LOWER('%${safe}%')
    ORDER BY company_account
    LIMIT 25
  `;
  const { rows } = await queryBq(sql);
  return rows;
}

export async function fetchAccountDetail(accountRecordId) {
  const id = validateInt(accountRecordId, 'account_record_id');

  const [labelRes, entityRes, usageRes, snapRes] = await Promise.all([
    queryBq(`
      SELECT account_record_id, company_account, l1, l2, l3, operating_model, confidence, business_description
      FROM \`${PROJECT}.v7_classification.account_labels\`
      WHERE account_record_id = ${id} LIMIT 1
    `),
    queryBq(`
      SELECT customer_record_id
      FROM \`${PROJECT}.v7_classification.account_entity_map\`
      WHERE account_record_id = ${id} LIMIT 1
    `),
    queryBq(`
      SELECT record_id, company_account_name, company_method_rep_email, company_method_rep_fullname,
             company_active, company_user_count, company_employee_count, company_health_score,
             company_last_login_date, company_onboarding_status, company_monthly_subscription_cost,
             company_signup_date, received_at
      FROM \`${PROJECT}.net.accounts\`
      WHERE record_id = ${id}
      ORDER BY received_at DESC
      LIMIT 1
    `),
    queryBq(`
      SELECT snapshot_date, call_type, consultant, dep_enrolled, sync_status, tt_session_count, cases_open_count, doc_link
      FROM \`${PROJECT}.call_prep.snapshots\`
      WHERE account_record_id = ${id}
      ORDER BY snapshot_date DESC
      LIMIT 5
    `),
  ]);

  const customerRecordId = entityRes.rows[0]?.customer_record_id || null;
  let customerLatest = null;
  let mrrTrend = [];

  if (customerRecordId) {
    const cid = validateInt(customerRecordId, 'customer_record_id');
    const [custRes, mrrRes] = await Promise.all([
      queryBq(`
        SELECT Month, EntityFullName, AccountCount, TotalUsers, HasDEP, UserTier, Segment, IsActive, IsNew, IsChurned
        FROM \`${PROJECT}.revenue.int_customers\`
        WHERE EntityRecordID = ${cid}
        ORDER BY Month DESC
        LIMIT 1
      `),
      queryBq(`
        SELECT Month, Company, p2_saas, StartMRR, NewMRR, Expansions, Downgrades, Cancellations, HasDEP
        FROM \`${PROJECT}.revenue.int_customer_mrr\`
        WHERE EntityRecordID = ${cid}
        ORDER BY Month DESC
        LIMIT 12
      `),
    ]);
    customerLatest = custRes.rows[0] || null;
    mrrTrend = [...mrrRes.rows].reverse(); // chronological for display
  }

  return {
    label: labelRes.rows[0] || null,
    usage: usageRes.rows[0] || null,
    customerRecordId,
    customerLatest,
    mrrTrend,
    callSnapshots: snapRes.rows,
  };
}

// BQ REST API returns TIMESTAMP columns as epoch-seconds strings (e.g. "1.774416532E9"),
// not ISO strings — this is the one formatting gotcha worth documenting.
export function epochToDate(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return new Date(n * 1000);
}
