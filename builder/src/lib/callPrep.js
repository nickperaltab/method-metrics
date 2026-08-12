// Call Prep data layer. Reads b.saltzman's precall snapshot table directly
// from the browser via the shared BQ OAuth layer (see bigquery.js).
//
// Table contract: docs/superpowers/specs/2026-07-13-call-prep-design.md.
// Book fallback: until call_prep.consultant_book exists upstream, "a
// consultant's book" = distinct accounts they have snapshots for.

import { validateInt } from './sanitize.js';
import { queryBqWithRetry } from './bigquery.js';

export const CALL_PREP_TABLE = '`project-for-method-dw.call_prep.snapshots`';
export const BRIEF_CONTENT_TABLE = '`project-for-method-dw.call_prep.brief_content`';
export const TIME_TRACKING_TABLE = '`project-for-method-dw.revenue.TimeTracking`';
export const CASES_TABLE = '`project-for-method-dw.revenue.Cases`';
export const ACCOUNTS_TABLE = '`project-for-method-dw.revenue.int_accounts`';
export const OPPORTUNITY_FIT_TABLE = '`project-for-method-dw.call_prep.opportunity_fit`';
export const ACTIVITY_TABLE = '`project-for-method-dw.revenue.Activity`';

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

// Every prep this consultant has, newest first — one row per account per day,
// not deduped to the latest like buildBookSql. Feeds both the Today and Past
// preps tabs, which are the same rows split on snapshot_date.
export const PREP_HISTORY_LIMIT = 500;

export function buildPrepHistorySql(consultant, limit = PREP_HISTORY_LIMIT) {
  const name = escapeSqlLiteral(consultant);
  const rows = validateInt(limit, 'limit');
  return `
    SELECT *
    FROM ${CALL_PREP_TABLE}
    WHERE consultant = '${name}'
    ORDER BY snapshot_date DESC, account_name
    LIMIT ${rows}`;
}

// The account brief. snapshots carries the account facts; brief_content carries
// the written parts of the /call-prep doc — the top 3 points, why today, the
// business summary and the contact. brief_content stopped being written on
// 2026-07-16 and only ever covered 24 preps, so LEFT JOIN: an older prep still
// renders, just without the prose.
//
// Both tables are append-only and neither has a key, so a routine that runs
// twice in a day leaves two rows for the same (account, date) — measured
// 2026-08-10: 7 such pairs in snapshots, 1 in brief_content. Without the two
// QUALIFYs below that duplicate would fan the join out and show the same date
// twice in the date picker. Newest row per date wins.
export function buildAccountSnapshotsSql(recordId) {
  const id = validateInt(recordId, 'account_record_id');
  return `
    SELECT
      s.*,
      b.scheduled_time,
      b.top_3,
      b.why_today,
      b.business_context,
      b.contact_name,
      b.contact_email,
      b.contact_phone,
      b.website
    FROM ${CALL_PREP_TABLE} s
    LEFT JOIN (
      SELECT *
      FROM ${BRIEF_CONTENT_TABLE}
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY account_record_id, snapshot_date ORDER BY created_at DESC
      ) = 1
    ) b
      ON b.account_record_id = s.account_record_id
     AND b.snapshot_date = s.snapshot_date
    WHERE s.account_record_id = ${id}
    QUALIFY ROW_NUMBER() OVER (PARTITION BY s.snapshot_date ORDER BY s.created_at DESC) = 1
    ORDER BY s.snapshot_date DESC`;
}

// Session history for the account's timeline. TimeTracking keys to the account
// via MethodCompanyAccountRecordID (= snapshots.account_record_id). Notes are
// full call write-ups; cap length so a chatty account doesn't bloat the payload.
export function buildAccountSessionsSql(recordId) {
  const id = validateInt(recordId, 'account_record_id');
  return `
    SELECT
      TxnDate,
      MethodSupportType,
      BillableStatus,
      IsDemo,
      DurationHours,
      AssignedToRecordID,
      SUBSTR(Notes, 0, 4000) AS Notes
    FROM ${TIME_TRACKING_TABLE}
    WHERE MethodCompanyAccountRecordID = ${id}
      AND IsDeleted = FALSE
    ORDER BY TxnDate`;
}

// Account overview (MRR run-rate, licenses, health) from the dbt model
// revenue.int_accounts, keyed on account_record_id (= snapshots.account_record_id).
export function buildAccountOverviewSql(recordId) {
  const id = validateInt(recordId, 'account_record_id');
  return `
    SELECT
      account_record_id,
      mrr_run_rate,
      user_licenses,
      health_score,
      is_active,
      saas_pay_type
    FROM ${ACCOUNTS_TABLE}
    WHERE account_record_id = ${id}
    LIMIT 1`;
}

// Case history from revenue.Cases, keyed on MethodCompanyAccountRecordID.
// CaseSubject is often null while Subject carries the title — coalesce.
export function buildAccountCasesSql(recordId) {
  const id = validateInt(recordId, 'account_record_id');
  return `
    SELECT
      RecordID,
      CaseStatus,
      CasePriority,
      COALESCE(CaseSubject, Subject) AS subject,
      CreatedDate,
      ClosedDate,
      ContactName
    FROM ${CASES_TABLE}
    WHERE MethodCompanyAccountRecordID = ${id}
      AND IsDeleted = FALSE
    ORDER BY CreatedDate DESC
    LIMIT 25`;
}

// Opportunity fit — the brief's per-motion Method Pay / DEP / PPU / Free Hour
// assessment, written by the team call-prep routine. Append-only, one row per
// account + motion + assessed_date, so take the newest assessment per motion
// that is not newer than the prep being read.
export function buildAccountOpportunityFitSql(recordId) {
  const id = validateInt(recordId, 'account_record_id');
  return `
    SELECT
      motion,
      fit,
      rationale,
      signals,
      recommended_hook,
      caveats,
      assessed_date,
      review_status,
      first_flagged_date
    FROM ${OPPORTUNITY_FIT_TABLE}
    WHERE account_record_id = ${id}
    ORDER BY assessed_date DESC, motion`;
}

// Recent activities — the brief's "Recent Activities (last 10)". Unlike Alocet's
// Activity table, the BigQuery copy carries MethodCompanyAccountRecordID, so it
// joins to an account directly.
//
// The date is aliased occurred_on, not activity_date: mockBq's batched
// cross-account indicator route matches on `AS activity_date` and would
// otherwise swallow this query.
//
// COST: revenue.Activity is ~143 MB and neither partitioned nor clustered, and
// Comments is nearly all of it. One account's activities therefore scan the
// whole column (~136 MB measured 2026-08-10) no matter how narrow the WHERE or
// how small the LIMIT. That is why this fetches once per page load and truncates
// Comments server-side rather than paging.
export const ACTIVITY_LIMIT = 10;

export function buildAccountActivitiesSql(recordId, limit = ACTIVITY_LIMIT) {
  const id = validateInt(recordId, 'account_record_id');
  const rows = validateInt(limit, 'limit');
  return `
    SELECT
      RecordID,
      COALESCE(DueDateStart, DATE(CreatedDate)) AS occurred_on,
      ActivityType,
      ActivityStatus,
      AssignedToRecordID,
      SUBSTR(Comments, 0, 2000) AS Comments
    FROM ${ACTIVITY_TABLE}
    WHERE MethodCompanyAccountRecordID = ${id}
      AND IsDeleted = FALSE
    ORDER BY occurred_on DESC, RecordID DESC
    LIMIT ${rows}`;
}

const toInt = (v, fallback = null) => (v == null || v === '' ? fallback : parseInt(v, 10));
const toFloat = (v) => (v == null || v === '' ? null : parseFloat(v));
const toBool = (v) => v === true || v === 'true';
const toStr = (v) => (v == null || v === '' ? null : String(v));
// Only allow http(s) URLs through — BQ-sourced doc_link values render in an
// <a href>, and React does not block javascript:/data: URLs there.
const toHttpUrl = (v) => {
  const s = toStr(v);
  return s && /^https?:\/\//i.test(s) ? s : null;
};

/**
 * brief_content.website is written scheme-less on every historical row
 * ("primodoors.com"), which toHttpUrl drops. Accept a bare host and give it
 * https://, still refusing anything that isn't a plain domain — the value ends
 * up in an <a href>, where React does not block javascript:/data:.
 */
export const toWebsiteUrl = (v) => {
  const s = toStr(v)?.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/[^\s]*)?$/i.test(s) ? `https://${s}` : null;
};

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
    multiEntityParentRecordId: toInt(row.multi_entity_parent_record_id),
    parentIsDep: toBool(row.parent_is_dep),
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
    docLink: toHttpUrl(row.doc_link),
    createdAt: toStr(row.created_at),
    // brief_content — null on every prep the doc-writer didn't cover.
    scheduledTime: toStr(row.scheduled_time),
    top3: (row.top_3 || []).map((x) => x?.v).filter(Boolean),
    whyToday: toStr(row.why_today),
    businessContext: toStr(row.business_context),
    contactName: toStr(row.contact_name),
    contactEmail: toStr(row.contact_email),
    contactPhone: toStr(row.contact_phone),
    website: toWebsiteUrl(row.website),
  };
}

/** Convert a raw TimeTracking row into a typed camelCase session. */
export function normalizeSessionRow(row) {
  return {
    date: toStr(row.TxnDate),
    supportType: toStr(row.MethodSupportType),
    billable: toStr(row.BillableStatus),
    isDemo: toBool(row.IsDemo),
    durationHours: toFloat(row.DurationHours),
    consultantId: toInt(row.AssignedToRecordID),
    notes: toStr(row.Notes),
  };
}

/** Convert a raw int_accounts row into a typed account overview. */
export function normalizeAccountOverview(row) {
  if (!row) return null;
  const licenses = toInt(row.user_licenses);
  return {
    accountRecordId: toInt(row.account_record_id),
    mrrRunRate: toFloat(row.mrr_run_rate),
    userLicenses: licenses != null && licenses > 0 ? licenses : null,
    healthScore: toFloat(row.health_score),
    isActive: toBool(row.is_active),
    saasPayType: toStr(row.saas_pay_type),
  };
}

/** Convert a raw opportunity_fit row into a typed camelCase assessment. */
export function normalizeOpportunityFitRow(row) {
  return {
    motion: toStr(row.motion),
    fit: toStr(row.fit)?.toLowerCase() ?? null,
    rationale: toStr(row.rationale),
    signals: (row.signals || []).map((x) => x?.v).filter(Boolean),
    recommendedHook: toStr(row.recommended_hook),
    caveats: toStr(row.caveats),
    assessedDate: toStr(row.assessed_date),
    reviewStatus: toStr(row.review_status),
    firstFlaggedDate: toStr(row.first_flagged_date),
  };
}

/**
 * Activity Comments are stored as CRM rich text — tags, entities and inline
 * styles. Strip to plain text so the brief reads as prose. This is cosmetic
 * only: React escapes the string either way, so it is not a sanitizer.
 */
export function stripHtml(value) {
  const raw = toStr(value);
  if (!raw) return null;
  const text = raw
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

/** Convert a raw Activity row into a typed camelCase activity. */
export function normalizeActivityRow(row) {
  return {
    recordId: toInt(row.RecordID),
    date: toStr(row.occurred_on),
    type: toStr(row.ActivityType),
    status: toStr(row.ActivityStatus),
    agentId: toInt(row.AssignedToRecordID),
    notes: stripHtml(row.Comments),
  };
}

/** Convert a raw Cases row into a typed camelCase case. */
export function normalizeCaseRow(row) {
  const status = toStr(row.CaseStatus);
  return {
    recordId: toInt(row.RecordID),
    status,
    isOpen: !!status && status.toLowerCase() !== 'closed',
    priority: toStr(row.CasePriority),
    subject: toStr(row.subject),
    createdDate: toStr(row.CreatedDate)?.slice(0, 10) ?? null,
    closedDate: toStr(row.ClosedDate)?.slice(0, 10) ?? null,
    contactName: toStr(row.ContactName),
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

export async function fetchConsultants({ query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildConsultantsSql());
  return rows.map((r) => ({
    consultant: toStr(r.consultant),
    accountCount: toInt(r.account_count, 0),
    lastSnapshotDate: toStr(r.last_snapshot_date),
  }));
}

export async function fetchBook(consultant, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildBookSql(consultant));
  return rows.map(normalizeSnapshotRow);
}

export async function fetchPrepHistory(consultant, { query = queryBqWithRetry, limit } = {}) {
  const { rows } = await query(buildPrepHistorySql(consultant, limit));
  return rows.map(normalizeSnapshotRow);
}

export async function fetchAccountSnapshots(recordId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildAccountSnapshotsSql(recordId));
  return rows.map(normalizeSnapshotRow);
}

export async function fetchAccountSessions(recordId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildAccountSessionsSql(recordId));
  return rows.map(normalizeSessionRow);
}

export async function fetchAccountCases(recordId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildAccountCasesSql(recordId));
  return rows.map(normalizeCaseRow);
}

export async function fetchAccountOverview(recordId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildAccountOverviewSql(recordId));
  return normalizeAccountOverview(rows[0]);
}

export async function fetchAccountOpportunityFit(recordId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildAccountOpportunityFitSql(recordId));
  return rows.map(normalizeOpportunityFitRow);
}

export async function fetchAccountActivities(recordId, { query = queryBqWithRetry, limit } = {}) {
  const { rows } = await query(buildAccountActivitiesSql(recordId, limit));
  return rows.map(normalizeActivityRow);
}

// Reading order for the fit table, matching the brief's Opportunity Fit section.
export const MOTION_ORDER = ['method_pay', 'dep', 'ppu', 'free_hour'];

export const MOTION_LABELS = {
  method_pay: 'Method Pay',
  dep: 'DEP',
  ppu: 'PPU',
  free_hour: 'Free Hour',
};

// Workflow talking points implied by an account's industry — the "what does a
// business like this actually run" cues the call-prep routine applies when it
// writes the Doc but never persists, so the brief has never shown them.
//
// Ported from the skill's Step 6 table (method-ps-skills/commands/call-prep.md)
// and RE-KEYED. That table is still written against the pre-V7.1 L1 names
// ("Professional Services", "Distribution & Wholesale", "Retail & E-Commerce",
// "Manufacturing"), none of which are written to snapshots — four of its five
// rows can never match a real account. The keys below are the deployed V7.1 L1
// names, the same ones config/industryTaxonomy.js pins to
// v7_classification.account_labels. Manufacturing & Distribution merges the
// skill's separate distribution and manufacturing rows, because V7.1 merged the
// industries.
export const WORKFLOWS_BY_INDUSTRY = {
  'Field Services & Trades': [
    'Job costing', 'Work orders', 'Purchasing workflow', 'Field technician scheduling',
  ],
  'Professional & Business Services': [
    'Project tracking', 'Time capture', 'Invoicing', 'Client billing workflow',
  ],
  'Manufacturing & Distribution': [
    'Inventory management', 'Purchase orders', 'Order flow', 'Production workflow',
    'Raw materials', 'Vendor management', 'Customer portal',
  ],
  'Retail & Consumer': [
    'Sync health', 'Payment processing', 'Product catalog', 'Online orders',
  ],
};

// Below this, the classifier's own confidence says don't lean on the label.
// Matches the threshold the skill uses to decide whether to fall back to web
// research (call-prep.md Step 6).
export const INDUSTRY_CONFIDENCE_FLOOR = 0.5;

/**
 * Workflows typical of this account's industry. These are derived from the
 * classification, NOT observed on the account, so the caller must say so.
 * Returns [] when there is no usable classification: 26% of snapshots have no
 * industry at all, and UNCLASSIFIABLE is an explicit "we could not tell".
 */
export function likelyWorkflows(snapshot) {
  const l1 = toStr(snapshot?.industryL1);
  if (!l1 || l1 === 'UNCLASSIFIABLE') return [];
  return WORKFLOWS_BY_INDUSTRY[l1] ?? [];
}

/** True when the industry label is too weak to lean on. */
export function industryIsWeak(snapshot) {
  const c = snapshot?.bqConfidence;
  return c != null && c < INDUSTRY_CONFIDENCE_FLOOR;
}

// The pitch angle recorded against a motion. recommended_hook is a slug enum,
// not prose, so it needs display labels. Only method_pay writes one today
// (checked 2026-08-12: 61 hooks across 263 rows, all method_pay), and the
// routine started writing the field on 2026-08-07, so expect new slugs —
// humanizeHook() covers anything not listed here rather than leaking snake_case
// onto the brief.
export const HOOK_LABELS = {
  overdue_invoice_reminders: 'overdue invoice reminders',
  cc_fee_pass_through: 'card fee pass-through',
  auto_invoicing: 'automatic invoicing',
};

// The routine writes the literal string 'none' to mean "no angle", which is not
// the same as the column being null. Both must read as absent.
const NO_HOOK = new Set(['none', 'n/a', 'unknown']);

/** A recommended_hook slug as a phrase, or null when there is no angle. */
export function humanizeHook(hook) {
  const slug = toStr(hook)?.toLowerCase().trim();
  if (!slug || NO_HOOK.has(slug)) return null;
  return HOOK_LABELS[slug] ?? slug.replace(/_/g, ' ');
}

// Fits worth spending call time on, strongest first.
const PITCHABLE = ['strong', 'moderate'];

/**
 * The motions actually worth pitching, strongest first. `fit: 'current'` is
 * excluded on purpose — the account is already on that motion, so it is context
 * rather than an opportunity.
 */
export function pitchableMotions(fitRows) {
  return (fitRows ?? [])
    .filter((row) => PITCHABLE.includes(row.fit))
    .sort((a, b) =>
      PITCHABLE.indexOf(a.fit) - PITCHABLE.indexOf(b.fit)
      || MOTION_ORDER.indexOf(a.motion) - MOTION_ORDER.indexOf(b.motion));
}

/**
 * The newest assessment per motion that the consultant could have seen on
 * `asOfDate`. The table is append-only, so a later re-review must not rewrite
 * the history of an older prep.
 */
export function latestFitByMotion(rows, asOfDate) {
  const best = new Map();
  for (const row of rows ?? []) {
    if (!row.motion) continue;
    if (asOfDate && row.assessedDate && row.assessedDate > asOfDate) continue;
    const current = best.get(row.motion);
    if (!current || (row.assessedDate ?? '') > (current.assessedDate ?? '')) best.set(row.motion, row);
  }
  return MOTION_ORDER
    .map((motion) => best.get(motion))
    .filter(Boolean)
    .concat([...best.values()].filter((r) => !MOTION_ORDER.includes(r.motion)));
}
