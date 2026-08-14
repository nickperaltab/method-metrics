// Project tracker data layer. Sibling of callPrep.js / handoffs.js and built to
// the same contract: SQL builders + normalizers + injectable fetchers, so the
// pages never see a raw BQ row and the pure logic stays unit-testable.
//
// ⚠️ THE BACKING STORE DOES NOT EXIST YET. The tables named below are a
// proposal, not something you can query — the store (BigQuery table written by
// a routine vs. a writable Supabase table) is still an open decision. Today
// these queries only ever resolve against the offline fixtures in
// src/dev/fixtures/projects.js, which is why /projects is dev-only in the nav.
//
// When the real store is chosen, this file is the seam: swap the SQL (or the
// fetchers' transport) and the pages, normalizers and helpers below carry over
// unchanged. Keep the column names here and in the fixtures in lockstep — the
// fixture shape is the draft schema.

import { validateInt } from './sanitize.js';
import { queryBqWithRetry } from './bigquery.js';

export const PROJECTS_TABLE = '`project-for-method-dw.call_prep.projects`';
export const PROJECT_ITEMS_TABLE = '`project-for-method-dw.call_prep.project_items`';
export const PROJECT_EVENTS_TABLE = '`project-for-method-dw.call_prep.project_events`';
export const PROJECT_WORK_LOG_TABLE = '`project-for-method-dw.call_prep.project_work_log`';
export const REPS_TABLE = '`project-for-method-dw.call_prep.reps`';
// The customer picker on the new-project form reads accounts from the call-prep
// snapshots — the closest thing to an account list PS already has.
export const SNAPSHOTS_TABLE = '`project-for-method-dw.call_prep.snapshots`';

/** Delivery lifecycle, in order. The detail page's timeline walks this. */
export const PROJECT_PHASES = ['Discovery', 'Design', 'Build', 'UAT', 'Go-live', 'Handoff'];

/** Project health, worst first — this is also the board's sort order. */
export const PROJECT_STATUSES = ['Blocked', 'At risk', 'On track', 'On hold', 'Complete'];

/**
 * Work-item statuses. The first six are "open"; only `Done` closes an item.
 * The action-shaped ones (Ready for Follow-Up, Check Case Status, New Intake)
 * are the statuses the Sheets orchestrator dispatched agents on — keeping the
 * same vocabulary means that automation can point here later without a mapping.
 */
export const ITEM_STATUSES = [
  'Blocked',
  'Ready for Follow-Up',
  'Check Case Status',
  'In Progress',
  'Waiting on Customer',
  'New Intake',
  'Done',
];

export const OPEN_ITEM_STATUSES = ITEM_STATUSES.filter((s) => s !== 'Done');

export const ITEM_TYPES = ['Task', 'Customization', 'Question', 'Case', 'Follow-up'];

/**
 * Project ids are opaque keys from an upstream system, so they get validated
 * rather than escaped — a strict allowlist can't be smuggled through, which is
 * the same posture sanitize.js takes for identifiers.
 */
export function validateProjectId(value) {
  const id = String(value ?? '');
  if (!/^[A-Za-z]{2,6}-\d{1,8}$/.test(id)) throw new Error(`Invalid project id: "${value}"`);
  return id;
}

// Counts and hours are aggregated in the same round trip as the projects, so
// the board isn't N+1 over a list of projects.
//
// `promised_hours` is the sum of per-task estimates — what we told the customer
// each task would take. `logged_hours` is what the work log actually records.
// Efficiency compares those two; a project's `hours_budget` is a separate,
// coarser signal and is deliberately NOT part of the ratio.
function itemRollupSql() {
  return `
    SELECT
      project_id,
      COUNTIF(status != 'Done') AS open_items,
      COUNTIF(status != 'Done' AND due_date < CURRENT_DATE()) AS overdue_items,
      COUNTIF(status != 'Done' AND is_promised) AS promised_items,
      COUNTIF(is_promised) AS promised_total,
      COUNTIF(
        is_promised AND status = 'Done'
        AND (due_date IS NULL OR closed_date <= due_date)
      ) AS promised_on_time,
      SUM(estimate_hours) AS promised_hours
    FROM ${PROJECT_ITEMS_TABLE}
    GROUP BY project_id`;
}

function workRollupSql() {
  return `
    SELECT
      project_id,
      SUM(hours) AS logged_hours,
      SUM(IF(billable = 'Billable', hours, 0)) AS billable_hours,
      MAX(work_date) AS last_work_date
    FROM ${PROJECT_WORK_LOG_TABLE}
    GROUP BY project_id`;
}

const ROLLUP_COLUMNS = `
      r.open_items, r.overdue_items, r.promised_items,
      r.promised_total, r.promised_on_time, r.promised_hours,
      w.logged_hours, w.billable_hours, w.last_work_date`;

export function buildProjectsSql() {
  return `
    WITH rollup AS (${itemRollupSql()}),
    work AS (${workRollupSql()})
    SELECT p.*,${ROLLUP_COLUMNS}
    FROM ${PROJECTS_TABLE} p
    LEFT JOIN rollup r USING (project_id)
    LEFT JOIN work w USING (project_id)
    ORDER BY p.last_activity_date DESC`;
}

export function buildProjectSql(projectId) {
  const id = validateProjectId(projectId);
  return `
    WITH rollup AS (${itemRollupSql()}),
    work AS (${workRollupSql()})
    SELECT p.*,${ROLLUP_COLUMNS}
    FROM ${PROJECTS_TABLE} p
    LEFT JOIN rollup r USING (project_id)
    LEFT JOIN work w USING (project_id)
    WHERE p.project_id = '${id}'
    LIMIT 1`;
}

// ── Account-scoped variants, for the customer page ─────────────────────────
// Both of these tables carry account_record_id, so the customer page gets every
// project's work log and event history in one query each rather than N+1 over
// the account's projects.

export function buildAccountProjectsSql(accountRecordId) {
  const id = validateInt(accountRecordId, 'account_record_id');
  return `
    WITH rollup AS (${itemRollupSql()}),
    work AS (${workRollupSql()})
    SELECT p.*,${ROLLUP_COLUMNS}
    FROM ${PROJECTS_TABLE} p
    LEFT JOIN rollup r USING (project_id)
    LEFT JOIN work w USING (project_id)
    WHERE p.account_record_id = ${id}
    ORDER BY p.last_activity_date DESC`;
}

export function buildAccountWorkLogSql(accountRecordId) {
  const id = validateInt(accountRecordId, 'account_record_id');
  return `
    SELECT *
    FROM ${PROJECT_WORK_LOG_TABLE}
    WHERE account_record_id = ${id}
    ORDER BY work_date DESC, entry_id DESC`;
}

export function buildAccountProjectEventsSql(accountRecordId) {
  const id = validateInt(accountRecordId, 'account_record_id');
  return `
    SELECT *
    FROM ${PROJECT_EVENTS_TABLE}
    WHERE account_record_id = ${id}
    ORDER BY event_date DESC`;
}

export function buildProjectWorkLogSql(projectId) {
  const id = validateProjectId(projectId);
  return `
    SELECT *
    FROM ${PROJECT_WORK_LOG_TABLE}
    WHERE project_id = '${id}'
    ORDER BY work_date DESC, entry_id DESC`;
}

/** Every rep, for the owner picker. Inactive ones are kept out of the list. */
export function buildRepsSql() {
  return `
    SELECT *
    FROM ${REPS_TABLE}
    WHERE is_active
    ORDER BY name`;
}

/** Customer options for the new-project form, from the call-prep snapshots. */
export function buildAccountOptionsSql() {
  return `
    SELECT DISTINCT account_record_id, account_name
    FROM ${SNAPSHOTS_TABLE}
    WHERE account_name IS NOT NULL
    ORDER BY account_name`;
}

export function buildProjectItemsSql(projectId) {
  const id = validateProjectId(projectId);
  return `
    SELECT *
    FROM ${PROJECT_ITEMS_TABLE}
    WHERE project_id = '${id}'
    ORDER BY due_date`;
}

export function buildProjectEventsSql(projectId) {
  const id = validateProjectId(projectId);
  return `
    SELECT *
    FROM ${PROJECT_EVENTS_TABLE}
    WHERE project_id = '${id}'
    ORDER BY event_date DESC`;
}

const toInt = (v, fallback = null) => (v == null || v === '' ? fallback : parseInt(v, 10));
const toFloat = (v) => (v == null || v === '' ? null : parseFloat(v));
const toBool = (v) => v === true || v === 'true';
const toStr = (v) => (v == null || v === '' ? null : String(v));
// Only http(s) through — these render in an <a href>, and React does not block
// javascript:/data: URLs there. Mirrors callPrep's toHttpUrl.
const toHttpUrl = (v) => {
  const s = toStr(v);
  return s && /^https?:\/\//i.test(s) ? s : null;
};

export function normalizeProjectRow(row) {
  return {
    projectId: toStr(row.project_id),
    accountRecordId: toInt(row.account_record_id),
    accountName: toStr(row.account_name),
    projectName: toStr(row.project_name),
    phase: toStr(row.phase),
    status: toStr(row.status),
    owner: toStr(row.owner),
    kickoffDate: toStr(row.kickoff_date),
    targetDate: toStr(row.target_date),
    goLiveDate: toStr(row.go_live_date),
    nextAction: toStr(row.next_action),
    nextActionDue: toStr(row.next_action_due),
    lastActivityDate: toStr(row.last_activity_date),
    hoursBudget: toFloat(row.hours_budget),
    riskNote: toStr(row.risk_note),
    jiraKey: toStr(row.jira_key),
    docLink: toHttpUrl(row.doc_link),
    handoffNeeded: toBool(row.handoff_needed),
    // Rollups — always numbers so the UI never has to null-guard arithmetic.
    openItems: toInt(row.open_items, 0),
    overdueItems: toInt(row.overdue_items, 0),
    promisedItems: toInt(row.promised_items, 0),
    promisedTotal: toInt(row.promised_total, 0),
    promisedOnTime: toInt(row.promised_on_time, 0),
    promisedHours: toFloat(row.promised_hours) ?? 0,
    loggedHours: toFloat(row.logged_hours) ?? 0,
    billableHours: toFloat(row.billable_hours) ?? 0,
    lastWorkDate: toStr(row.last_work_date),
  };
}

export function normalizeWorkEntryRow(row) {
  return {
    entryId: toStr(row.entry_id),
    projectId: toStr(row.project_id),
    itemId: toStr(row.item_id),
    accountRecordId: toInt(row.account_record_id),
    workDate: toStr(row.work_date),
    author: toStr(row.author),
    hours: toFloat(row.hours) ?? 0,
    billable: toStr(row.billable),
    summary: toStr(row.summary),
    notesMd: toStr(row.notes_md),
    createdAt: toStr(row.created_at),
  };
}

export function normalizeRepRow(row) {
  return {
    repId: toStr(row.rep_id),
    name: toStr(row.name),
    email: toStr(row.email),
    role: toStr(row.role),
    isActive: toBool(row.is_active),
  };
}

export function normalizeAccountOptionRow(row) {
  return {
    accountRecordId: toInt(row.account_record_id),
    accountName: toStr(row.account_name),
  };
}

export function normalizeItemRow(row) {
  const status = toStr(row.status);
  return {
    itemId: toStr(row.item_id),
    projectId: toStr(row.project_id),
    accountRecordId: toInt(row.account_record_id),
    title: toStr(row.title),
    itemType: toStr(row.item_type),
    status,
    isOpen: status !== 'Done',
    owner: toStr(row.owner),
    priority: toStr(row.priority),
    createdDate: toStr(row.created_date),
    dueDate: toStr(row.due_date),
    closedDate: toStr(row.closed_date),
    isPromised: toBool(row.is_promised),
    // Hours promised for this task — the denominator side of efficiency. Null,
    // not 0, when nobody estimated it: an unestimated task is unmeasurable, and
    // 0 would make every logged hour look like an overrun.
    estimateHours: toFloat(row.estimate_hours),
    caseRef: toStr(row.case_ref),
    notes: toStr(row.notes),
  };
}

export function normalizeEventRow(row) {
  return {
    eventId: toStr(row.event_id),
    projectId: toStr(row.project_id),
    accountRecordId: toInt(row.account_record_id),
    date: toStr(row.event_date),
    type: toStr(row.event_type),
    author: toStr(row.author),
    summary: toStr(row.summary),
    toPhase: toStr(row.to_phase),
  };
}

const MS_PER_DAY = 86400000;

/** Today as YYYY-MM-DD in local time. toISOString() would shift us to UTC. */
export function localToday(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole days from `todayIso` to `iso`. Negative = in the past. */
export function daysUntil(iso, todayIso) {
  if (!iso) return null;
  return Math.round((Date.parse(iso) - Date.parse(todayIso)) / MS_PER_DAY);
}

export function phaseIndex(phase) {
  const i = PROJECT_PHASES.indexOf(phase);
  return i === -1 ? PROJECT_PHASES.length : i;
}

export function statusRank(status) {
  const i = PROJECT_STATUSES.indexOf(status);
  return i === -1 ? PROJECT_STATUSES.length : i;
}

export const isComplete = (project) => project.status === 'Complete';

/** An item counts as overdue only while it's still open. */
export function isOverdue(item, todayIso) {
  if (!item.isOpen || !item.dueDate) return false;
  return item.dueDate < todayIso;
}

/**
 * Phase progress as a 0–1 fraction, for the board's phase column. A complete
 * project reads 1 regardless of which phase it stopped in — otherwise a project
 * closed out at Go-live would look less finished than one at Handoff.
 */
export function phaseProgress(project) {
  if (isComplete(project)) return 1;
  return (phaseIndex(project.phase) + 1) / PROJECT_PHASES.length;
}

/**
 * Board ordering: worst status first, then most overdue work, then the nearest
 * target date. Sorting by last activity (what the SQL returns) would bury a
 * blocked project under whichever one happened to get touched this morning.
 */
export function compareProjects(a, b) {
  const byStatus = statusRank(a.status) - statusRank(b.status);
  if (byStatus !== 0) return byStatus;
  if (a.overdueItems !== b.overdueItems) return b.overdueItems - a.overdueItems;
  const aTarget = a.targetDate ?? '9999-12-31';
  const bTarget = b.targetDate ?? '9999-12-31';
  if (aTarget !== bTarget) return aTarget.localeCompare(bTarget);
  return (a.accountName ?? '').localeCompare(b.accountName ?? '');
}

/** Headline numbers for the board's stat row. Completed projects don't count. */
export function summarizeProjects(projects, todayIso) {
  const live = projects.filter((p) => !isComplete(p));
  return {
    active: live.length,
    needsAttention: live.filter((p) => p.status === 'Blocked' || p.status === 'At risk').length,
    openItems: live.reduce((sum, p) => sum + p.openItems, 0),
    overdueItems: live.reduce((sum, p) => sum + p.overdueItems, 0),
    promisedItems: live.reduce((sum, p) => sum + p.promisedItems, 0),
    overdueTargets: live.filter((p) => p.targetDate && p.targetDate < todayIso).length,
  };
}

/**
 * The phase timeline for the detail page: one entry per lifecycle phase, marked
 * done / current / upcoming, dated from the project's 'Phase change' events.
 * A phase with no event still renders (dateless) — real projects skip phases.
 */
export function phaseTimeline(project, events = []) {
  const started = new Map();
  for (const e of events) {
    if (!e.toPhase) continue;
    const existing = started.get(e.toPhase);
    if (!existing || e.date < existing) started.set(e.toPhase, e.date);
  }
  const current = phaseIndex(project.phase);
  return PROJECT_PHASES.map((phase, i) => ({
    phase,
    date: started.get(phase) ?? null,
    state: isComplete(project) || i < current ? 'done' : i === current ? 'current' : 'upcoming',
  }));
}

/** Items grouped for the detail page: overdue first, then open, then done. */
export function sortItems(items, todayIso) {
  const bucket = (i) => (isOverdue(i, todayIso) ? 0 : i.isOpen ? 1 : 2);
  return [...items].sort((a, b) => {
    const byBucket = bucket(a) - bucket(b);
    if (byBucket !== 0) return byBucket;
    const aDue = a.dueDate ?? '9999-12-31';
    const bDue = b.dueDate ?? '9999-12-31';
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    return (a.title ?? '').localeCompare(b.title ?? '');
  });
}

export async function fetchProjects({ query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildProjectsSql());
  return rows.map(normalizeProjectRow).sort(compareProjects);
}

export async function fetchProject(projectId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildProjectSql(projectId));
  return rows[0] ? normalizeProjectRow(rows[0]) : null;
}

export async function fetchProjectItems(projectId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildProjectItemsSql(projectId));
  return rows.map(normalizeItemRow);
}

export async function fetchProjectEvents(projectId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildProjectEventsSql(projectId));
  return rows.map(normalizeEventRow);
}

export async function fetchProjectWorkLog(projectId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildProjectWorkLogSql(projectId));
  return rows.map(normalizeWorkEntryRow);
}

export async function fetchAccountProjects(accountRecordId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildAccountProjectsSql(accountRecordId));
  return rows.map(normalizeProjectRow).sort(compareProjects);
}

export async function fetchAccountWorkLog(accountRecordId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildAccountWorkLogSql(accountRecordId));
  return rows.map(normalizeWorkEntryRow);
}

export async function fetchAccountProjectEvents(accountRecordId, { query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildAccountProjectEventsSql(accountRecordId));
  return rows.map(normalizeEventRow);
}

export async function fetchReps({ query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildRepsSql());
  return rows.map(normalizeRepRow);
}

export async function fetchAccountOptions({ query = queryBqWithRetry } = {}) {
  const { rows } = await query(buildAccountOptionsSql());
  return rows.map(normalizeAccountOptionRow);
}
