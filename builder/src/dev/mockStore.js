// Writable dev store for the project tracker.
//
// The tracker needs create/edit/log-work flows before its backing store exists,
// so mock mode keeps a mutable copy of the project fixtures in localStorage.
// Edits survive a page reload — you can't design an editing flow against data
// that resets on every render — and `resetStore()` puts it back.
//
// Rows are held in **BigQuery REST shape** (every scalar a string) and the mock
// SQL routes in mockBq.js read from here rather than straight from the fixtures.
// So reads still flow through the real SQL builders and the real normalizers:
// the write path is fake, but the read contract stays honest.
//
// Dev-only. Nothing here is reachable from a production build (MOCK_MODE).

import { projectFixtures } from './fixtures/projects.js';
import { mockWarn } from './mockMode.js';

const STORAGE_KEY = 'method_metrics_mock_store';
// Bump when the row shape changes — a stale saved store is discarded rather
// than half-migrated, which is the right trade for throwaway design data.
const STORAGE_VERSION = 3;

const TABLES = ['projects', 'items', 'events', 'workLog', 'reps', 'handoffs'];

let state = null;

function seed() {
  const f = projectFixtures();
  return {
    projects: f.PROJECTS.map((r) => ({ ...r })),
    items: f.PROJECT_ITEMS.map((r) => ({ ...r })),
    events: f.PROJECT_EVENTS.map((r) => ({ ...r })),
    workLog: f.PROJECT_WORK_LOG.map((r) => ({ ...r })),
    reps: f.REPS.map((r) => ({ ...r })),
    // Handoffs created by reassignment. The base handoff fixtures live in
    // fixtures/ps.js; mockBq concatenates the two.
    handoffs: [],
  };
}

function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === STORAGE_VERSION && TABLES.every((t) => Array.isArray(parsed[t]))) {
        state = parsed;
        return state;
      }
      mockWarn('saved mock store is from an older shape — reseeding from fixtures');
    }
  } catch (e) {
    mockWarn('could not read the saved mock store — reseeding from fixtures', e?.message);
  }
  state = { version: STORAGE_VERSION, ...seed() };
  save();
  return state;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // Private-mode / quota failures shouldn't break a design session — the
    // in-memory copy still works for the life of the page.
    mockWarn('could not persist the mock store; edits are in-memory only', e?.message);
  }
}

/** Throw the store away and reseed from the fixtures. */
export function resetStore() {
  state = { version: STORAGE_VERSION, ...seed() };
  save();
  return state;
}

/** Current tables, for the mock SQL routes. Copies out, so callers can't mutate. */
export function storeSnapshot() {
  const s = load();
  return {
    PROJECTS: s.projects.map((r) => ({ ...r })),
    PROJECT_ITEMS: s.items.map((r) => ({ ...r })),
    PROJECT_EVENTS: s.events.map((r) => ({ ...r })),
    PROJECT_WORK_LOG: s.workLog.map((r) => ({ ...r })),
    REPS: s.reps.map((r) => ({ ...r })),
    HANDOFFS: s.handoffs.map((r) => ({ ...r })),
  };
}

// Ids are max-existing + 1 per prefix, so they're stable and readable rather
// than random — a project created in a design session keeps the same URL.
function nextId(rows, key, prefix) {
  const highest = rows.reduce((max, row) => {
    const n = parseInt(String(row[key] ?? '').replace(`${prefix}-`, ''), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}-${highest + 1}`;
}

const str = (v) => (v == null || v === '' ? null : String(v));
const bool = (v) => (v ? 'true' : 'false');

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function stamp() {
  return `${today()}T${new Date().toTimeString().slice(0, 8)}Z`;
}

/** Append to the activity log. Every mutation that a human would want to see
 *  afterwards goes through here — the log is the audit trail. */
export function appendEvent({ projectId, accountRecordId, type, author, summary, toPhase = null, date }) {
  const s = load();
  const row = {
    event_id: nextId(s.events, 'event_id', 'EVT'),
    project_id: String(projectId),
    account_record_id: str(accountRecordId),
    event_date: date ?? today(),
    event_type: type,
    author: author ?? 'Unknown',
    summary,
    to_phase: str(toPhase),
  };
  s.events.push(row);
  save();
  return row;
}

function touchProject(projectId, date) {
  const s = load();
  const project = s.projects.find((p) => p.project_id === String(projectId));
  if (!project) return;
  const when = date ?? today();
  if (!project.last_activity_date || project.last_activity_date < when) {
    project.last_activity_date = when;
  }
  project.updated_at = stamp();
}

export function createProject(input) {
  const s = load();
  const projectId = nextId(s.projects, 'project_id', 'PRJ');
  const row = {
    project_id: projectId,
    account_record_id: str(input.accountRecordId),
    account_name: str(input.accountName),
    project_name: str(input.projectName),
    phase: input.phase,
    status: input.status,
    owner: str(input.owner),
    kickoff_date: str(input.kickoffDate) ?? today(),
    target_date: str(input.targetDate),
    go_live_date: str(input.goLiveDate),
    next_action: str(input.nextAction),
    next_action_due: str(input.nextActionDue),
    last_activity_date: today(),
    hours_budget: input.hoursBudget == null || input.hoursBudget === '' ? null : String(input.hoursBudget),
    risk_note: str(input.riskNote),
    jira_key: str(input.jiraKey),
    doc_link: str(input.docLink),
    handoff_needed: bool(false),
    created_at: stamp(),
    updated_at: stamp(),
  };
  s.projects.push(row);
  save();
  appendEvent({
    projectId,
    accountRecordId: row.account_record_id,
    type: 'Phase change',
    author: row.owner,
    toPhase: row.phase,
    summary: `Project created at ${row.phase}.`,
  });
  return row;
}

const PROJECT_FIELD_MAP = {
  projectName: 'project_name',
  phase: 'phase',
  status: 'status',
  owner: 'owner',
  kickoffDate: 'kickoff_date',
  targetDate: 'target_date',
  goLiveDate: 'go_live_date',
  nextAction: 'next_action',
  nextActionDue: 'next_action_due',
  hoursBudget: 'hours_budget',
  riskNote: 'risk_note',
  jiraKey: 'jira_key',
  docLink: 'doc_link',
  accountRecordId: 'account_record_id',
  accountName: 'account_name',
  handoffNeeded: 'handoff_needed',
};

/**
 * Patch a project. Logs a 'Phase change' event when the phase moves (so the
 * detail page's lifecycle timeline picks up the new date) and a 'Handoff' event
 * when the owner changes.
 */
export function updateProject(projectId, patch) {
  const s = load();
  const row = s.projects.find((p) => p.project_id === String(projectId));
  if (!row) throw new Error(`No project ${projectId}`);

  const previousPhase = row.phase;
  const previousOwner = row.owner;

  for (const [key, column] of Object.entries(PROJECT_FIELD_MAP)) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (key === 'handoffNeeded') row[column] = bool(value);
    else if (key === 'hoursBudget') row[column] = value == null || value === '' ? null : String(value);
    else row[column] = str(value);
  }
  row.updated_at = stamp();
  save();

  if (patch.phase && patch.phase !== previousPhase) {
    appendEvent({
      projectId,
      accountRecordId: row.account_record_id,
      type: 'Phase change',
      author: row.owner,
      toPhase: patch.phase,
      summary: `${previousPhase} → ${patch.phase}.`,
    });
  }
  if (patch.owner && patch.owner !== previousOwner) {
    appendEvent({
      projectId,
      accountRecordId: row.account_record_id,
      type: 'Handoff',
      author: previousOwner ?? 'Unknown',
      summary: `Reassigned from ${previousOwner ?? 'unassigned'} to ${patch.owner}.`,
    });
  }
  return row;
}

export function createRep({ name, email, role }) {
  const s = load();
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new Error('A rep needs a name');
  const existing = s.reps.find((r) => r.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  const row = {
    rep_id: nextId(s.reps, 'rep_id', 'REP'),
    name: trimmed,
    email: str(email),
    role: str(role) ?? 'Consultant',
    is_active: bool(true),
  };
  s.reps.push(row);
  save();
  return row;
}

/**
 * Create a handoff packet for a reassignment. Carries the open/promised counts
 * at the moment of the handoff, which is what makes the packet worth reading —
 * the same fields the /handoff skill writes.
 */
export function createHandoff({ projectId, outgoingRep, incomingRep, firstPriority }) {
  const s = load();
  const project = s.projects.find((p) => p.project_id === String(projectId));
  if (!project) throw new Error(`No project ${projectId}`);
  const items = s.items.filter((i) => i.project_id === String(projectId));
  const open = items.filter((i) => i.status !== 'Done');
  const promised = open.filter((i) => i.is_promised === 'true');
  const flags = [];
  if (promised.length) flags.push('Promised work outstanding');
  if (project.status === 'Blocked') flags.push('Blocked at handoff');
  if (project.target_date && project.target_date < today()) flags.push('Past target date');

  const row = {
    account_record_id: project.account_record_id,
    account_name: project.account_name,
    handoff_date: today(),
    outgoing_rep: str(outgoingRep),
    incoming_rep: str(incomingRep),
    status: 'Draft',
    doc_link: `https://docs.google.com/document/d/mock-handoff-${project.project_id}`,
    open_in_progress: String(open.length),
    open_promised: String(promised.length),
    catalogue_matches: '0',
    flags: flags.map((v) => ({ v })),
    first_priority: str(firstPriority) ?? str(project.next_action),
    created_at: stamp(),
  };
  s.handoffs.push(row);
  save();
  appendEvent({
    projectId,
    accountRecordId: project.account_record_id,
    type: 'Handoff',
    author: str(outgoingRep) ?? 'Unknown',
    summary: `Handoff document created (Draft) — ${open.length} open item${open.length === 1 ? '' : 's'}, ${promised.length} promised.`,
  });
  return row;
}

export function createWorkEntry(input) {
  const s = load();
  const project = s.projects.find((p) => p.project_id === String(input.projectId));
  if (!project) throw new Error(`No project ${input.projectId}`);
  const hours = Number(input.hours);
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('Hours must be a positive number');

  const row = {
    entry_id: nextId(s.workLog, 'entry_id', 'WRK'),
    project_id: String(input.projectId),
    item_id: str(input.itemId),
    account_record_id: project.account_record_id,
    work_date: str(input.workDate) ?? today(),
    author: str(input.author) ?? project.owner,
    hours: String(hours),
    billable: input.billable ?? 'Billable',
    summary: str(input.summary) ?? 'Work session',
    notes_md: str(input.notesMd),
    created_at: stamp(),
  };
  s.workLog.push(row);
  save();
  touchProject(input.projectId, row.work_date);
  save();
  return row;
}

export function updateWorkEntry(entryId, patch) {
  const s = load();
  const row = s.workLog.find((e) => e.entry_id === String(entryId));
  if (!row) throw new Error(`No work entry ${entryId}`);
  if ('workDate' in patch) row.work_date = str(patch.workDate);
  if ('author' in patch) row.author = str(patch.author);
  if ('hours' in patch) {
    const hours = Number(patch.hours);
    if (!Number.isFinite(hours) || hours <= 0) throw new Error('Hours must be a positive number');
    row.hours = String(hours);
  }
  if ('billable' in patch) row.billable = patch.billable;
  if ('summary' in patch) row.summary = str(patch.summary);
  if ('notesMd' in patch) row.notes_md = str(patch.notesMd);
  if ('itemId' in patch) row.item_id = str(patch.itemId);
  save();
  return row;
}

export function deleteWorkEntry(entryId) {
  const s = load();
  const before = s.workLog.length;
  s.workLog = s.workLog.filter((e) => e.entry_id !== String(entryId));
  save();
  return s.workLog.length < before;
}

export function createItem(input) {
  const s = load();
  const project = s.projects.find((p) => p.project_id === String(input.projectId));
  if (!project) throw new Error(`No project ${input.projectId}`);
  const row = {
    item_id: nextId(s.items, 'item_id', 'ITM'),
    project_id: String(input.projectId),
    account_record_id: project.account_record_id,
    title: str(input.title),
    item_type: input.itemType ?? 'Task',
    status: input.status ?? 'New Intake',
    owner: str(input.owner) ?? project.owner,
    priority: input.priority ?? 'Normal',
    created_date: today(),
    due_date: str(input.dueDate),
    closed_date: null,
    is_promised: bool(input.isPromised),
    estimate_hours: input.estimateHours == null || input.estimateHours === '' ? null : String(input.estimateHours),
    case_ref: str(input.caseRef),
    notes: str(input.notes),
  };
  s.items.push(row);
  save();
  touchProject(input.projectId);
  save();
  return row;
}

const ITEM_FIELD_MAP = {
  title: 'title',
  itemType: 'item_type',
  status: 'status',
  owner: 'owner',
  priority: 'priority',
  dueDate: 'due_date',
  closedDate: 'closed_date',
  estimateHours: 'estimate_hours',
  caseRef: 'case_ref',
  notes: 'notes',
};

export function updateItem(itemId, patch) {
  const s = load();
  const row = s.items.find((i) => i.item_id === String(itemId));
  if (!row) throw new Error(`No work item ${itemId}`);
  for (const [key, column] of Object.entries(ITEM_FIELD_MAP)) {
    if (!(key in patch)) continue;
    const value = patch[key];
    row[column] = key === 'estimateHours'
      ? (value == null || value === '' ? null : String(value))
      : str(value);
  }
  if ('isPromised' in patch) row.is_promised = bool(patch.isPromised);
  // Closing an item stamps the close date, which is what delivery reliability
  // measures against — leaving it null would silently drop the item from the
  // on-time numerator.
  if (patch.status === 'Done' && !row.closed_date) row.closed_date = today();
  if (patch.status && patch.status !== 'Done') row.closed_date = null;
  save();
  touchProject(row.project_id);
  save();
  return row;
}
