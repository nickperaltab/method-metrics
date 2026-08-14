// Customer page data layer — everything known about one account, from the
// tables that already exist in BigQuery.
//
// Unlike lib/projects.js, MOST OF THIS IS REAL. Verified 2026-08-05:
//
//   customer_signals.v_conversations  7,935 calls + transcripts, 3,306 accounts,
//                                     2025-01-02 → 2026-07-27   (account_id)
//   call_audits.ps_call_audit           505 scored PPU audits, 370 accounts,
//                                     2026-05-27 → 2026-07-15   (account = subdomain, see below)
//   call_audits.free_hour_audit          54 scored free-hour audits
//   customer_signals.signals_by_call     87 rows, 76 accounts (account_id)
//   customer_signals.call_summaries      25 rows, one day only (company_account_record_id)
//   call_prep.snapshots                 143 preps, 104 accounts, current
//   call_prep.brief_content              24 rows, STOPPED 2026-07-16
//
// So the page has to survive wildly uneven coverage: an account can have 40 calls
// and no audit, or a prep today and no call transcript. Every section loads
// independently (Promise.allSettled in the page) and says what's missing rather
// than rendering a confident blank.
//
// ⚠️ THE AUDIT JOIN IS PARTIAL, AND IT IS A DATA BUG UPSTREAM. The audit tables
// key on `account` (a STRING) rather than an account id. 118 distinct values are
// subdomain-shaped and match int_accounts.company_account exactly; 303 contain
// spaces — they're display names, and revenue.Account has no display-name column
// to resolve them against. So joining by subdomain reaches ~28% of PPU-audit
// accounts and ~81% of free-hour ones. Fixing that means making the audit
// routines write account_record_id (or consistently the subdomain); until then
// auditCoverageCaveat() tells the user what they're not seeing.

import { validateInt } from './sanitize.js';
import { queryBqWithRetry } from './bigquery.js';

export const ACCOUNT_TABLE = '`project-for-method-dw.revenue.Account`';
export const INT_ACCOUNTS_TABLE = '`project-for-method-dw.revenue.int_accounts`';
export const CONVERSATIONS_TABLE = '`project-for-method-dw.customer_signals.v_conversations`';
export const CALL_SUMMARIES_TABLE = '`project-for-method-dw.customer_signals.call_summaries`';
export const CALL_SIGNALS_TABLE = '`project-for-method-dw.customer_signals.signals_by_call`';
export const PS_AUDIT_TABLE = '`project-for-method-dw.call_audits.ps_call_audit`';
export const FREE_HOUR_AUDIT_TABLE = '`project-for-method-dw.call_audits.free_hour_audit`';
export const SNAPSHOTS_TABLE = '`project-for-method-dw.call_prep.snapshots`';
export const BRIEF_CONTENT_TABLE = '`project-for-method-dw.call_prep.brief_content`';
export const TIME_TRACKING_TABLE = '`project-for-method-dw.revenue.TimeTracking`';
export const PROJECT_WORK_LOG_TABLE = '`project-for-method-dw.call_prep.project_work_log`';
export const PROJECT_EVENTS_TABLE = '`project-for-method-dw.call_prep.project_events`';

/**
 * A "Skipped" audit is one the routine declined to score; it carries
 * overall_pct = 0, which would otherwise read as a catastrophic call and drag an
 * account's average down. Everything that averages or ranks scores excludes it.
 * (Real rating vocabulary, observed 2026-08-05: Excellent, Meets Expectations,
 * Needs Coaching, Unsatisfactory, Skipped.)
 */
export const SKIPPED_RATING = 'Skipped';

/**
 * `flagged` is true on 191 of 505 PPU audits (38%) and 32 of 54 free-hour ones —
 * far too common to badge an account with. A single flagged call is routine
 * coaching; a pattern is worth surfacing, so the account list only shows it from
 * this many upward. `escalation_risk`, by contrast, fires on 19 of 505 (3.8%) and
 * always carries evidence, so one is enough.
 */
export const FLAGGED_PATTERN_THRESHOLD = 2;

// Transcripts are expensive in two different ways, measured 2026-08-05:
//
//   1. Size — the largest single transcript is 141,333 characters. Shipping whole
//      transcripts for an account with 27 calls would be over a megabyte of JSON.
//   2. Scan cost — customer_signals.conversations is 291 MB, almost all of it
//      transcript_text, and it is NEITHER PARTITIONED NOR CLUSTERED. A WHERE on
//      account_id therefore scans the entire column: selecting transcript_text at
//      all costs ~290 MB per query, however few rows come back.
//
// So the call list deliberately selects NO transcript column (a few MB), and
// excerpts are fetched separately, only when someone actually opens a transcript.
// That fetch pulls every excerpt for the account in one go — queryBq caches by
// SQL string for the session, so the 290 MB scan happens at most once per
// account per page load instead of once per expand.
//
// The real fix is upstream: cluster `conversations` by account_id, or keep the
// transcripts in a side table so the call index can be read cheaply.
const TRANSCRIPT_EXCERPT_CHARS = 1200;
const CALL_LIMIT = 100;

// BigQuery single-quoted literals escape with a backslash, not by doubling —
// matches escapeSqlLiteral in callPrep.js. (sanitize.js's escapeBqString
// implements the doubling convention and would not neutralise a quote here.)
function escapeSqlLiteral(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Account header. int_accounts is the canonical operational shape (and keeps the
 * dbt seam), joined to revenue.Account only for the few attributes the model
 * doesn't expose: vertical, sector, signup and cancellation dates.
 */
export function buildCustomerOverviewSql(recordId) {
  const id = validateInt(recordId, 'account_record_id');
  return `
    SELECT
      a.account_record_id,
      a.company_account,
      a.entity_record_id,
      a.is_active,
      a.saas_pay_type,
      a.mrr_run_rate,
      a.user_licenses,
      a.health_score,
      src.Vertical AS vertical,
      src.Sector AS sector,
      src.SignUpDate AS signup_date,
      NULLIF(src.CancellationDate, DATE '0001-01-01') AS cancellation_date
    FROM ${INT_ACCOUNTS_TABLE} a
    LEFT JOIN ${ACCOUNT_TABLE} src ON src.RecordID = a.account_record_id
    WHERE a.account_record_id = ${id}
    LIMIT 1`;
}

/**
 * The call index — the backbone of the timeline. Deliberately selects no
 * transcript column so a page load doesn't scan the 291 MB transcript blob (see
 * the note above). Topic and participants are enough to render a timeline row.
 */
export function buildCustomerCallsSql(recordId, { limit = CALL_LIMIT } = {}) {
  const id = validateInt(recordId, 'account_record_id');
  const cap = validateInt(limit, 'limit');
  return `
    SELECT
      conversation_id,
      source,
      occurred_at,
      call_type,
      link_status,
      topic,
      participants
    FROM ${CONVERSATIONS_TABLE}
    WHERE account_id = ${id}
    ORDER BY occurred_at DESC
    LIMIT ${cap}`;
}

/**
 * Transcript excerpts for every call on the account, fetched lazily the first
 * time someone opens one. One query for the whole account rather than per call:
 * the scan cost is the same either way, so paying it once is strictly better.
 */
export function buildCustomerTranscriptsSql(recordId, { limit = CALL_LIMIT } = {}) {
  const id = validateInt(recordId, 'account_record_id');
  const cap = validateInt(limit, 'limit');
  return `
    SELECT
      conversation_id,
      LENGTH(transcript_text) AS transcript_chars,
      SUBSTR(transcript_text, 0, ${TRANSCRIPT_EXCERPT_CHARS}) AS transcript_excerpt
    FROM ${CONVERSATIONS_TABLE}
    WHERE account_id = ${id}
    ORDER BY occurred_at DESC
    LIMIT ${cap}`;
}

/** AI call summaries. Keyed on company_account_record_id, not account_id. */
export function buildCustomerSummariesSql(recordId) {
  const id = validateInt(recordId, 'account_record_id');
  return `
    SELECT
      activity_record_id,
      company_account_record_id,
      activity_type,
      zoom_meeting_id,
      contact_email,
      created_date,
      summary_text
    FROM ${CALL_SUMMARIES_TABLE}
    WHERE company_account_record_id = ${id}
    ORDER BY created_date DESC`;
}

/** Extracted signals per call — what the customer actually said they need. */
export function buildCustomerSignalsSql(recordId) {
  const id = validateInt(recordId, 'account_record_id');
  return `
    SELECT
      conversation_id,
      call_type,
      occurred_at,
      is_impact_relevant,
      situation,
      pain,
      impact,
      critical_event,
      decision,
      stated_goals,
      whitespace_signals,
      evidence,
      extraction_status
    FROM ${CALL_SIGNALS_TABLE}
    WHERE account_id = ${id}
      AND extraction_status = 'ok'
    ORDER BY occurred_at DESC`;
}

/**
 * Scored call audits, both rubrics in one shape.
 *
 * The two tables score different sections (PPU: opening/scoping/training/next
 * steps; free hour: opening/discovery/closing), so the sections are projected
 * into a JSON array rather than fixed columns — one normalizer then handles both
 * and a rubric change doesn't need new columns. JSON string, not a repeated
 * STRUCT, because bigquery.js's row flattener only unwraps one level of `{v}`.
 *
 * Keyed on the subdomain-style account name. See the audit-join warning at the
 * top of this file: this reaches some accounts and not others.
 */
export function buildCustomerAuditsSql(companyAccount) {
  const name = escapeSqlLiteral(String(companyAccount ?? '').toLowerCase().trim());
  if (!name) throw new Error('buildCustomerAuditsSql needs a company_account');
  return `
    WITH ppu AS (
      SELECT
        'PPU' AS audit_kind, id, audit_date, call_type, consultant, duration_min,
        overall_pct, rating, flagged, escalation_risk, escalation_evidence,
        highlights, insights, context_flags,
        TO_JSON_STRING([
          STRUCT('Opening' AS label, opening_pct AS pct),
          STRUCT('Scoping' AS label, scoping_pct AS pct),
          STRUCT('Training' AS label, training_pct AS pct),
          STRUCT('Next steps' AS label, nextsteps_pct AS pct)
        ]) AS sections_json,
        CAST(NULL AS INT64) AS problems_count,
        CAST(NULL AS INT64) AS unactioned_count,
        tt_hours_after_call
      FROM ${PS_AUDIT_TABLE}
      WHERE LOWER(TRIM(account)) = '${name}'
    ),
    free AS (
      SELECT
        'FREE' AS audit_kind, id, audit_date, call_type, consultant, duration_min,
        overall_pct, rating, flagged, escalation_risk, escalation_evidence,
        highlights, insights, context_flags,
        TO_JSON_STRING([
          STRUCT('Opening' AS label, opening_pct AS pct),
          STRUCT('Discovery' AS label, discovery_pct AS pct),
          STRUCT('Closing' AS label, closing_pct AS pct)
        ]) AS sections_json,
        problems_count,
        unactioned_count,
        CAST(NULL AS FLOAT64) AS tt_hours_after_call
      FROM ${FREE_HOUR_AUDIT_TABLE}
      WHERE LOWER(TRIM(account)) = '${name}'
    )
    SELECT * FROM ppu
    UNION ALL
    SELECT * FROM free
    ORDER BY audit_date DESC`;
}

/**
 * Call preps for this account, with the brief content when it exists.
 * brief_content is the only source of scheduled call times and stopped being
 * written on 2026-07-16 — LEFT JOIN so preps still appear without it.
 */
export function buildCustomerPrepsSql(recordId) {
  const id = validateInt(recordId, 'account_record_id');
  return `
    SELECT
      s.account_record_id,
      s.account_name,
      s.snapshot_date,
      s.call_type,
      s.consultant,
      s.dep_enrolled,
      s.sync_status,
      s.sync_fail_count,
      s.cases_open_count,
      s.tt_last_session_date,
      s.doc_link,
      b.scheduled_time,
      b.top_3,
      b.why_today,
      b.business_context,
      b.contact_name,
      b.contact_email
    FROM ${SNAPSHOTS_TABLE} s
    LEFT JOIN ${BRIEF_CONTENT_TABLE} b
      ON b.account_record_id = s.account_record_id
     AND b.snapshot_date = s.snapshot_date
    WHERE s.account_record_id = ${id}
    ORDER BY s.snapshot_date DESC`;
}

// ── Cross-account indicators (for the account list) ────────────────────────
//
// The account list needs last-activity and escalation state for every account on
// screen. Fetching that per account would be N+1 across five tables, so both of
// these are batched: one query covering every account in the list.

/** Comma-separated validated id list for an IN (…) clause. */
function idList(accountIds) {
  const ids = (accountIds ?? []).map((id) => validateInt(id, 'account_record_id'));
  if (!ids.length) throw new Error('buildAccount…Sql needs at least one account id');
  return [...new Set(ids)].join(', ');
}

/**
 * Last activity per account per source, so the caller can pick the newest.
 *
 * "Activity" means something a person did on the account: work logged, a project
 * event, a billed session, a call, a prep. Audits are deliberately excluded —
 * an audit is our review of a call, not activity on the account, and letting one
 * count would make an account look alive when nobody has touched it in a month.
 *
 * The actor is a name where a name exists. Billed sessions only carry
 * `AssignedToRecordID`, and there is no staff/user table in `revenue` to resolve
 * it against (checked 2026-08-05 — only customer-side `Contacts`), so those rows
 * come back with an id and no name rather than a guess.
 */
export function buildAccountActivitySql(accountIds) {
  const ids = idList(accountIds);
  return `
    WITH work AS (
      SELECT
        account_record_id AS account_id, work_date AS activity_date, author AS actor,
        CAST(NULL AS INT64) AS actor_id, 'work log' AS source, summary AS detail
      FROM ${PROJECT_WORK_LOG_TABLE}
      WHERE account_record_id IN (${ids})
      QUALIFY ROW_NUMBER() OVER (PARTITION BY account_record_id ORDER BY work_date DESC, entry_id DESC) = 1
    ),
    events AS (
      SELECT
        account_record_id AS account_id, event_date AS activity_date, author AS actor,
        CAST(NULL AS INT64) AS actor_id, 'project' AS source, summary AS detail
      FROM ${PROJECT_EVENTS_TABLE}
      WHERE account_record_id IN (${ids})
      QUALIFY ROW_NUMBER() OVER (PARTITION BY account_record_id ORDER BY event_date DESC, event_id DESC) = 1
    ),
    sessions AS (
      SELECT
        MethodCompanyAccountRecordID AS account_id, TxnDate AS activity_date,
        CAST(NULL AS STRING) AS actor, AssignedToRecordID AS actor_id,
        'billed session' AS source, MethodSupportType AS detail
      FROM ${TIME_TRACKING_TABLE}
      WHERE MethodCompanyAccountRecordID IN (${ids})
        AND IsDeleted = FALSE
      QUALIFY ROW_NUMBER() OVER (PARTITION BY MethodCompanyAccountRecordID ORDER BY TxnDate DESC) = 1
    ),
    calls AS (
      SELECT
        account_id, DATE(occurred_at) AS activity_date,
        CAST(NULL AS STRING) AS actor, CAST(NULL AS INT64) AS actor_id,
        'call' AS source, topic AS detail
      FROM ${CONVERSATIONS_TABLE}
      WHERE account_id IN (${ids})
      QUALIFY ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY occurred_at DESC) = 1
    ),
    preps AS (
      SELECT
        account_record_id AS account_id, snapshot_date AS activity_date, consultant AS actor,
        CAST(NULL AS INT64) AS actor_id, 'call prep' AS source, call_type AS detail
      FROM ${SNAPSHOTS_TABLE}
      WHERE account_record_id IN (${ids})
      QUALIFY ROW_NUMBER() OVER (PARTITION BY account_record_id ORDER BY snapshot_date DESC) = 1
    )
    SELECT * FROM work
    UNION ALL SELECT * FROM events
    UNION ALL SELECT * FROM sessions
    UNION ALL SELECT * FROM calls
    UNION ALL SELECT * FROM preps
    ORDER BY account_id, activity_date DESC`;
}

/**
 * Audit escalation state per account, keyed back to account_record_id by joining
 * int_accounts on the subdomain. Same partial-coverage caveat as everywhere else
 * the audit tables are touched — an account with no row here may still have
 * audits filed under a display name.
 */
export function buildAccountEscalationSql(accountIds) {
  const ids = idList(accountIds);
  return `
    WITH audits AS (
      SELECT LOWER(TRIM(account)) AS company_account, audit_date, escalation_risk, flagged, overall_pct, rating
      FROM ${PS_AUDIT_TABLE}
      UNION ALL
      SELECT LOWER(TRIM(account)) AS company_account, audit_date, escalation_risk, flagged, overall_pct, rating
      FROM ${FREE_HOUR_AUDIT_TABLE}
    )
    SELECT
      a.account_record_id AS account_id,
      COUNT(*) AS audit_count,
      COUNTIF(x.rating != '${SKIPPED_RATING}') AS scored_count,
      COUNTIF(x.escalation_risk) AS escalation_count,
      COUNTIF(x.flagged) AS flagged_count,
      MAX(IF(x.escalation_risk, x.audit_date, NULL)) AS last_escalation_date,
      -- A skipped audit scores 0, which would read as a catastrophic call.
      MIN(IF(x.rating = '${SKIPPED_RATING}', NULL, x.overall_pct)) AS worst_pct,
      MAX(x.audit_date) AS last_audit_date
    FROM ${INT_ACCOUNTS_TABLE} a
    JOIN audits x ON x.company_account = LOWER(TRIM(a.company_account))
    WHERE a.account_record_id IN (${ids})
    GROUP BY a.account_record_id`;
}

const toInt = (v, fallback = null) => (v == null || v === '' ? fallback : parseInt(v, 10));
const toFloat = (v) => (v == null || v === '' ? null : parseFloat(v));
const toBool = (v) => v === true || v === 'true';
const toStr = (v) => (v == null || v === '' ? null : String(v));
const toDay = (v) => toStr(v)?.slice(0, 10) ?? null;
/** Repeated STRING columns arrive as [{ v }] through the REST flattener. */
const toList = (v) => (v || []).map((x) => x?.v).filter(Boolean);

export function normalizeCustomerRow(row) {
  if (!row) return null;
  const licenses = toInt(row.user_licenses);
  return {
    accountRecordId: toInt(row.account_record_id),
    companyAccount: toStr(row.company_account),
    entityRecordId: toInt(row.entity_record_id),
    isActive: toBool(row.is_active),
    saasPayType: toStr(row.saas_pay_type),
    mrrRunRate: toFloat(row.mrr_run_rate),
    // int_accounts documents negatives from credits/adjustments — guard here so
    // no caller divides by them.
    userLicenses: licenses != null && licenses > 0 ? licenses : null,
    healthScore: toFloat(row.health_score),
    vertical: toStr(row.vertical),
    sector: toStr(row.sector),
    signupDate: toDay(row.signup_date),
    cancellationDate: toDay(row.cancellation_date),
  };
}

export function normalizeCallRow(row) {
  return {
    conversationId: toStr(row.conversation_id),
    source: toStr(row.source),
    occurredAt: toStr(row.occurred_at),
    date: toDay(row.occurred_at),
    callType: toStr(row.call_type),
    linkStatus: toStr(row.link_status),
    topic: toStr(row.topic),
    participants: toStr(row.participants),
  };
}

export function normalizeTranscriptRow(row) {
  return {
    conversationId: toStr(row.conversation_id),
    transcriptChars: toInt(row.transcript_chars, 0),
    transcriptExcerpt: toStr(row.transcript_excerpt),
  };
}

export function normalizeSummaryRow(row) {
  return {
    activityRecordId: toInt(row.activity_record_id),
    accountRecordId: toInt(row.company_account_record_id),
    activityType: toStr(row.activity_type),
    zoomMeetingId: toStr(row.zoom_meeting_id),
    contactEmail: toStr(row.contact_email),
    date: toDay(row.created_date),
    summaryText: toStr(row.summary_text),
  };
}

export function normalizeSignalRow(row) {
  return {
    conversationId: toStr(row.conversation_id),
    callType: toStr(row.call_type),
    date: toDay(row.occurred_at),
    isImpactRelevant: toBool(row.is_impact_relevant),
    situation: toStr(row.situation),
    pain: toStr(row.pain),
    impact: toStr(row.impact),
    criticalEvent: toStr(row.critical_event),
    decision: toStr(row.decision),
    statedGoals: toStr(row.stated_goals),
    whitespaceSignals: toStr(row.whitespace_signals),
    evidence: toStr(row.evidence),
  };
}

/** Audit sections come back as a JSON string; drop the ones with no score. */
function parseSections(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && s.pct != null)
      .map((s) => ({ label: String(s.label), pct: Number(s.pct) }));
  } catch {
    return [];
  }
}

export function normalizeAuditRow(row) {
  return {
    auditId: toStr(row.id),
    kind: toStr(row.audit_kind),
    date: toDay(row.audit_date),
    callType: toStr(row.call_type),
    consultant: toStr(row.consultant),
    durationMin: toFloat(row.duration_min),
    overallPct: toFloat(row.overall_pct),
    rating: toStr(row.rating),
    flagged: toBool(row.flagged),
    escalationRisk: toBool(row.escalation_risk),
    escalationEvidence: toStr(row.escalation_evidence),
    highlights: toStr(row.highlights),
    insights: toStr(row.insights),
    contextFlags: toList(row.context_flags),
    sections: parseSections(row.sections_json),
    problemsCount: toInt(row.problems_count),
    unactionedCount: toInt(row.unactioned_count),
    ttHoursAfterCall: toFloat(row.tt_hours_after_call),
  };
}

export function normalizePrepRow(row) {
  return {
    accountRecordId: toInt(row.account_record_id),
    accountName: toStr(row.account_name),
    date: toDay(row.snapshot_date),
    callType: toStr(row.call_type),
    consultant: toStr(row.consultant),
    depEnrolled: toBool(row.dep_enrolled),
    syncStatus: toStr(row.sync_status),
    syncFailCount: toInt(row.sync_fail_count, 0),
    casesOpenCount: toInt(row.cases_open_count, 0),
    docLink: /^https?:\/\//i.test(String(row.doc_link ?? '')) ? String(row.doc_link) : null,
    scheduledTime: toStr(row.scheduled_time),
    top3: toList(row.top_3),
    whyToday: toStr(row.why_today),
    businessContext: toStr(row.business_context),
    contactName: toStr(row.contact_name),
    contactEmail: toStr(row.contact_email),
  };
}

// ── Timeline ───────────────────────────────────────────────────────────────

/** Every timeline entry kind, in the order the filter chips render. */
export const TIMELINE_KINDS = ['call', 'prep', 'audit', 'session', 'case', 'work', 'project'];

export const KIND_LABELS = {
  call: 'Calls',
  prep: 'Call preps',
  audit: 'Audit feedback',
  session: 'Billed sessions',
  case: 'Cases',
  work: 'Work log',
  project: 'Project events',
};

const entry = (kind, date, title, fields) => ({ kind, date, title, ...fields });

/**
 * Merge every source into one reverse-chronological stream.
 *
 * A Zoom call and the billed time entry for it are the same hour of work seen
 * from two systems, so they are NOT deduplicated — one carries the transcript,
 * the other carries the billing decision and the consultant's own write-up, and
 * collapsing them would lose whichever we didn't pick. They land on the same day
 * and the day grouping in the UI makes the pairing obvious.
 *
 * Entries with no date are dropped: an undated row can't be placed on a
 * timeline, and putting it at the top would misrepresent it as the latest thing
 * that happened.
 */
export function buildTimeline({
  calls = [],
  summaries = [],
  preps = [],
  audits = [],
  sessions = [],
  cases = [],
  workLog = [],
  projectEvents = [],
} = {}) {
  const summaryByDay = new Map();
  for (const s of summaries) {
    if (s.date && !summaryByDay.has(s.date)) summaryByDay.set(s.date, s);
  }

  const items = [
    ...calls.map((call) => entry('call', call.date, call.topic || `${call.callType ?? 'Call'}`, {
      call,
      // A summary from the same day is almost certainly this call's summary.
      // Same-day is the only link available: call_summaries carries zoom ids,
      // v_conversations carries conversation_id, and they don't line up.
      summary: summaryByDay.get(call.date) ?? null,
      subtitle: call.participants,
    })),
    ...preps.map((prep) => entry('prep', prep.date, `Call prep — ${prep.callType ?? 'call'}`, {
      prep,
      subtitle: prep.consultant,
    })),
    ...audits.map((audit) => entry('audit', audit.date, `${audit.kind === 'FREE' ? 'Free-hour' : 'PPU'} call audit`, {
      audit,
      subtitle: audit.consultant,
    })),
    ...sessions.map((session) => entry('session', session.date, session.supportType ?? 'Session', {
      session,
      subtitle: [session.billable, session.durationHours != null ? `${session.durationHours}h` : null]
        .filter(Boolean).join(' · '),
    })),
    ...cases.map((kase) => entry('case', kase.createdDate, kase.subject ?? 'Case', {
      case: kase,
      subtitle: [kase.status, kase.priority].filter(Boolean).join(' · '),
    })),
    ...workLog.map((work) => entry('work', work.workDate, work.summary ?? 'Work logged', {
      work,
      subtitle: [work.author, `${work.hours}h`, work.billable].filter(Boolean).join(' · '),
    })),
    ...projectEvents.map((event) => entry('project', event.date, event.summary ?? event.type, {
      event,
      subtitle: [event.type, event.author].filter(Boolean).join(' · '),
    })),
  ].filter((item) => Boolean(item.date));

  return items.sort((a, b) => b.date.localeCompare(a.date));
}

/** Group a sorted timeline into `[{ date, items }]`, newest day first. */
export function groupTimelineByDay(timeline) {
  const days = new Map();
  for (const item of timeline) {
    if (!days.has(item.date)) days.set(item.date, []);
    days.get(item.date).push(item);
  }
  return [...days.entries()].map(([date, items]) => ({ date, items }));
}

export function countByKind(timeline) {
  const counts = {};
  for (const kind of TIMELINE_KINDS) counts[kind] = 0;
  for (const item of timeline) counts[item.kind] = (counts[item.kind] ?? 0) + 1;
  return counts;
}

// ── Derived summaries ──────────────────────────────────────────────────────

/**
 * Audit quality for this account: the average score, the trend against the
 * previous run, per-section averages and anything flagged. Percentages in these
 * tables are 0–100, not fractions.
 */
export function summarizeAudits(audits = []) {
  if (!audits.length) return null;
  // Skipped audits are excluded from everything score-shaped — see SKIPPED_RATING.
  const scored = audits.filter((a) => a.overallPct != null && a.rating !== SKIPPED_RATING);
  const skipped = audits.filter((a) => a.rating === SKIPPED_RATING);
  const mean = (list) => (list.length ? list.reduce((s, n) => s + n, 0) / list.length : null);

  const sectionTotals = new Map();
  for (const audit of scored) {
    for (const section of audit.sections) {
      if (!sectionTotals.has(section.label)) sectionTotals.set(section.label, []);
      sectionTotals.get(section.label).push(section.pct);
    }
  }

  return {
    count: audits.length,
    scoredCount: scored.length,
    skippedCount: skipped.length,
    averagePct: mean(scored.map((a) => a.overallPct)),
    latest: scored[0] ?? null,
    previous: scored[1] ?? null,
    delta: scored.length > 1 ? scored[0].overallPct - scored[1].overallPct : null,
    flagged: audits.filter((a) => a.flagged).length,
    escalations: audits.filter((a) => a.escalationRisk),
    sections: [...sectionTotals.entries()]
      .map(([label, values]) => ({ label, averagePct: mean(values), count: values.length }))
      .sort((a, b) => a.averagePct - b.averagePct),
  };
}

/**
 * The most recent non-empty value for each signal field. Signals are extracted
 * per call, and an older call often carries a field a newer one didn't mention —
 * so this is a per-field latest, not the latest row.
 */
export function latestSignals(signals = []) {
  const fields = ['situation', 'pain', 'impact', 'criticalEvent', 'decision', 'statedGoals', 'whitespaceSignals'];
  const out = {};
  for (const field of fields) {
    const hit = signals.find((s) => s[field]);
    out[field] = hit ? { value: hit[field], date: hit.date, conversationId: hit.conversationId } : null;
  }
  return out;
}

/** Days since the most recent call, or null when there has never been one. */
export function daysSinceLastCall(calls = [], todayIso) {
  const latest = calls.find((c) => c.date);
  if (!latest) return null;
  return Math.floor((Date.parse(todayIso) - Date.parse(latest.date)) / 86400000);
}

export function normalizeActivityRow(row) {
  return {
    accountRecordId: toInt(row.account_id),
    date: toDay(row.activity_date),
    actor: toStr(row.actor),
    actorId: toInt(row.actor_id),
    source: toStr(row.source),
    detail: toStr(row.detail),
  };
}

export function normalizeEscalationRow(row) {
  return {
    accountRecordId: toInt(row.account_id),
    auditCount: toInt(row.audit_count, 0),
    escalationCount: toInt(row.escalation_count, 0),
    scoredCount: toInt(row.scored_count, 0),
    flaggedCount: toInt(row.flagged_count, 0),
    lastEscalationDate: toDay(row.last_escalation_date),
    worstPct: toFloat(row.worst_pct),
    lastAuditDate: toDay(row.last_audit_date),
  };
}

/** Label an actor, admitting when only an unresolvable id is available. */
export function actorLabel(activity) {
  if (!activity) return null;
  if (activity.actor) return activity.actor;
  if (activity.actorId != null) return `consultant #${activity.actorId}`;
  return null;
}

/**
 * Newest activity per account, out of the per-source rows.
 * Ties break toward the source that names a person — "logged by" is the point.
 */
export function pickLatestActivity(rows = []) {
  const byAccount = new Map();
  for (const row of rows) {
    if (!row.date) continue;
    const current = byAccount.get(row.accountRecordId);
    if (!current) { byAccount.set(row.accountRecordId, row); continue; }
    if (row.date > current.date) { byAccount.set(row.accountRecordId, row); continue; }
    if (row.date === current.date && !current.actor && row.actor) {
      byAccount.set(row.accountRecordId, row);
    }
  }
  return byAccount;
}

/**
 * The same "last activity" answer for a single customer, computed from the data
 * the customer page already loaded — no extra query. Kept consistent with
 * buildAccountActivitySql: audits are not activity.
 */
export function latestActivityFrom({ workLog = [], projectEvents = [], sessions = [], calls = [], preps = [] } = {}) {
  const candidates = [
    ...workLog.map((w) => ({ date: w.workDate, actor: w.author, actorId: null, source: 'work log', detail: w.summary })),
    ...projectEvents.map((e) => ({ date: e.date, actor: e.author, actorId: null, source: 'project', detail: e.summary })),
    ...sessions.map((x) => ({ date: x.date, actor: null, actorId: x.consultantId, source: 'billed session', detail: x.supportType })),
    ...calls.map((c) => ({ date: c.date, actor: null, actorId: null, source: 'call', detail: c.topic })),
    ...preps.map((p) => ({ date: p.date, actor: p.consultant, actorId: null, source: 'call prep', detail: p.callType })),
  ].filter((x) => x.date);
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.actor ? 1 : 0) - (a.actor ? 1 : 0);
  });
  return candidates[0];
}

// ── Escalation flags ───────────────────────────────────────────────────────

/** Days with no activity before an account reads as quiet, then as stalled. */
export const QUIET_DAYS = 30;
export const STALLED_DAYS = 60;

const SEVERITY_RANK = { critical: 0, warn: 1, info: 2 };

const flag = (code, severity, label, extra = {}) => ({ code, severity, label, ...extra });

/** Worst first, then newest — the top of the list is what to deal with today. */
export function compareFlags(a, b) {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (bySeverity !== 0) return bySeverity;
  return String(b.date ?? '').localeCompare(String(a.date ?? ''));
}

/**
 * Everything worth escalating on one customer, ranked. Built from what the
 * customer page already has in hand.
 *
 * Deliberately excludes "low audit score" on its own: a single 60% on one call is
 * a coaching signal for the consultant, not an escalation on the account. It only
 * appears here when the audit itself was flagged as an escalation risk.
 */
export function escalationFlags({
  customer,
  audits = [],
  projects = [],
  preps = [],
  cases = [],
  lastActivity = null,
  todayIso,
} = {}) {
  const flags = [];

  for (const audit of audits.filter((a) => a.escalationRisk)) {
    flags.push(flag('audit-escalation', 'critical', 'Escalation risk on call', {
      date: audit.date,
      detail: audit.escalationEvidence,
      source: `${audit.kind === 'FREE' ? 'free-hour' : 'PPU'} audit · ${audit.consultant ?? 'unknown'}`,
    }));
  }

  for (const project of projects.filter((p) => p.status === 'Blocked')) {
    flags.push(flag('project-blocked', 'critical', `Blocked: ${project.projectName}`, {
      date: project.lastActivityDate,
      detail: project.riskNote ?? project.nextAction,
      source: 'project tracker',
    }));
  }

  const pastTarget = projects.filter(
    (p) => p.status !== 'Complete' && p.targetDate && p.targetDate < todayIso
  );
  for (const project of pastTarget) {
    flags.push(flag('past-target', 'warn', `Past target: ${project.projectName}`, {
      date: project.targetDate,
      detail: `Target was ${project.targetDate}.`,
      source: 'project tracker',
    }));
  }

  const promised = projects.reduce((sum, p) => sum + p.promisedItems, 0);
  const overdue = projects.reduce((sum, p) => sum + p.overdueItems, 0);
  if (overdue > 0) {
    flags.push(flag('overdue-items', 'warn', `${overdue} overdue work item${overdue === 1 ? '' : 's'}`, {
      detail: promised > 0 ? `${promised} of them promised to the customer.` : null,
      source: 'project tracker',
    }));
  }

  // On the page a single flagged call is worth mentioning (there's room for the
  // insight text); on the list it isn't — 38% of audited calls are flagged.
  const flagged = audits.filter((a) => a.flagged && !a.escalationRisk);
  if (flagged.length) {
    flags.push(flag(
      'audit-flagged',
      flagged.length >= FLAGGED_PATTERN_THRESHOLD ? 'warn' : 'info',
      `${flagged.length} call${flagged.length === 1 ? '' : 's'} flagged in audit`,
      { date: flagged[0].date, detail: flagged[0].insights, source: 'call audits' }
    ));
  }

  const latestPrep = preps[0];
  if (latestPrep?.syncFailCount > 0) {
    flags.push(flag('sync-failing', 'warn', `QuickBooks sync failing (${latestPrep.syncFailCount})`, {
      date: latestPrep.date,
      source: 'call prep snapshot',
    }));
  }

  if (lastActivity?.date) {
    const quietDays = Math.floor((Date.parse(todayIso) - Date.parse(lastActivity.date)) / 86400000);
    if (quietDays >= STALLED_DAYS) {
      flags.push(flag('stalled', 'critical', `No activity for ${quietDays} days`, {
        date: lastActivity.date,
        detail: `Last touch was ${lastActivity.source}${actorLabel(lastActivity) ? ` by ${actorLabel(lastActivity)}` : ''}.`,
        source: 'all sources',
      }));
    } else if (quietDays >= QUIET_DAYS) {
      flags.push(flag('quiet', 'warn', `Quiet for ${quietDays} days`, {
        date: lastActivity.date,
        detail: `Last touch was ${lastActivity.source}${actorLabel(lastActivity) ? ` by ${actorLabel(lastActivity)}` : ''}.`,
        source: 'all sources',
      }));
    }
  } else {
    flags.push(flag('no-activity', 'warn', 'No activity on record', { source: 'all sources' }));
  }

  const openCases = cases.filter((c) => c.isOpen).length;
  if (openCases > 0) {
    flags.push(flag('open-cases', 'info', `${openCases} open case${openCases === 1 ? '' : 's'}`, {
      source: 'Method cases',
    }));
  }

  if (customer && customer.isActive === false) {
    flags.push(flag('churned', 'info', 'Account has churned', {
      date: customer.cancellationDate,
      source: 'account record',
    }));
  }

  return flags.sort(compareFlags);
}

/**
 * The compact version for the account list, built from the two batched queries
 * plus the project rollup — same rules, fewer inputs, no per-account fetch.
 */
export function accountFlagSummary({ rollup, activity, escalation, todayIso }) {
  const flags = [];

  if (escalation?.escalationCount > 0) {
    flags.push(flag('audit-escalation', 'critical', `${escalation.escalationCount} escalation risk${escalation.escalationCount === 1 ? '' : 's'}`, {
      date: escalation.lastEscalationDate,
    }));
  }
  if (rollup?.atRisk > 0) {
    flags.push(flag('at-risk', 'critical', `${rollup.atRisk} project${rollup.atRisk === 1 ? '' : 's'} at risk`));
  }
  if (rollup?.overdueItems > 0) {
    flags.push(flag('overdue-items', 'warn', `${rollup.overdueItems} overdue`));
  }
  // Only a pattern of flagged calls, not a single one — see the threshold note.
  if (escalation?.flaggedCount >= FLAGGED_PATTERN_THRESHOLD) {
    flags.push(flag('audit-flagged', 'warn', `${escalation.flaggedCount} flagged calls`, {
      date: escalation.lastAuditDate,
    }));
  }
  if (activity?.date) {
    const quietDays = Math.floor((Date.parse(todayIso) - Date.parse(activity.date)) / 86400000);
    if (quietDays >= STALLED_DAYS) {
      flags.push(flag('stalled', 'critical', `${quietDays}d silent`, { date: activity.date }));
    } else if (quietDays >= QUIET_DAYS) {
      flags.push(flag('quiet', 'warn', `${quietDays}d quiet`, { date: activity.date }));
    }
  } else {
    flags.push(flag('no-activity', 'warn', 'no activity'));
  }

  return flags.sort(compareFlags);
}

/**
 * What to warn the user they might not be seeing. The audit tables key on a name
 * string, so absence of audits is genuinely ambiguous — it can mean "no audit
 * ran" or "the audit exists under a display name we can't join". Saying so is the
 * difference between a trustworthy screen and a misleading one.
 */
export function auditCoverageCaveat(customer, audits) {
  if (audits.length) return null;
  if (!customer?.companyAccount) {
    return 'This account has no subdomain on file, so audits can’t be looked up at all.';
  }
  return `No call audits matched "${customer.companyAccount}". The audit tables key on an account `
    + 'name rather than an id, and roughly two thirds of PPU-audit rows are written with a display '
    + 'name instead of the subdomain — so an audit may exist for this customer without being '
    + 'findable here.';
}

// ── Fetchers ───────────────────────────────────────────────────────────────

export async function fetchCustomer(recordId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildCustomerOverviewSql(recordId));
  return normalizeCustomerRow(rows[0]);
}

export async function fetchCustomerCalls(recordId, { query = queryBqWithRetry, limit } = {}) {
  const { rows } = await query(buildCustomerCallsSql(recordId, { limit }));
  return rows.map(normalizeCallRow);
}

/** Lazily-loaded transcript excerpts, keyed by conversation id. */
export async function fetchCustomerTranscripts(recordId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildCustomerTranscriptsSql(recordId));
  const byId = new Map();
  for (const row of rows.map(normalizeTranscriptRow)) byId.set(row.conversationId, row);
  return byId;
}

export async function fetchCustomerSummaries(recordId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildCustomerSummariesSql(recordId));
  return rows.map(normalizeSummaryRow);
}

export async function fetchCustomerSignals(recordId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildCustomerSignalsSql(recordId));
  return rows.map(normalizeSignalRow);
}

export async function fetchCustomerAudits(companyAccount, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildCustomerAuditsSql(companyAccount));
  return rows.map(normalizeAuditRow);
}

export async function fetchCustomerPreps(recordId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildCustomerPrepsSql(recordId));
  return rows.map(normalizePrepRow);
}

/** Newest activity per account, for a list of accounts. Map keyed by id. */
export async function fetchAccountActivity(accountIds, { query = queryBqWithRetry } = {}) {
  if (!accountIds?.length) return new Map();
  const { rows } = await query(buildAccountActivitySql(accountIds));
  return pickLatestActivity(rows.map(normalizeActivityRow));
}

/** Audit escalation state per account, for a list of accounts. Map keyed by id. */
export async function fetchAccountEscalations(accountIds, { query = queryBqWithRetry } = {}) {
  if (!accountIds?.length) return new Map();
  const { rows } = await query(buildAccountEscalationSql(accountIds));
  const byAccount = new Map();
  for (const row of rows.map(normalizeEscalationRow)) byAccount.set(row.accountRecordId, row);
  return byAccount;
}
