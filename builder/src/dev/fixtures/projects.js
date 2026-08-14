// Synthetic fixtures for the PS project tracker (/projects).
//
// THIS FILE MUST STAY FAKE — same rule as fixtures/ps.js. Public repo.
//
// There is no projects store yet: BigQuery-vs-Supabase is an open decision, and
// this fixture shape IS the current proposal for it. Treat the column names here
// and the SQL in lib/projects.js as the draft contract — when the real store
// lands, that's what it has to produce.
//
// Account ids and names deliberately match fixtures/ps.js so a project can
// cross-link to that account's call-prep brief and land on real-looking data.
//
// Built inside a function, not at module scope, so Rollup drops the whole thing
// from a production build (see the note in fixtures/ps.js).
//
// Hours model, because it's easy to conflate three numbers:
//   project.hours_budget   — what the engagement was quoted/budgeted at
//   item.estimate_hours    — hours PROMISED for that specific task
//   work_log.hours         — hours actually DELIVERED, one row per session
// Efficiency compares the last two. The budget is a separate, coarser signal.

import { iso, ME_FULL, ME_SHORT } from './ps.js';

const str = (v) => (v == null ? null : String(v));
const bool = (v) => (v ? 'true' : 'false');

function project(o) {
  return {
    project_id: str(o.projectId),
    account_record_id: str(o.accountId),
    account_name: o.accountName,
    project_name: o.projectName,
    phase: o.phase,
    status: o.status,
    owner: o.owner,
    kickoff_date: o.kickoff,
    target_date: o.target,
    go_live_date: str(o.goLive ?? null),
    next_action: o.nextAction,
    next_action_due: str(o.nextDue ?? null),
    last_activity_date: o.lastActivity,
    hours_budget: str(o.budget ?? null),
    risk_note: str(o.risk ?? null),
    jira_key: str(o.jira ?? null),
    doc_link: `https://docs.google.com/document/d/mock-project-${o.projectId}`,
    handoff_needed: bool(o.handoffNeeded),
    created_at: `${o.kickoff}T09:00:00Z`,
    updated_at: `${o.lastActivity}T17:30:00Z`,
  };
}

function item(o) {
  return {
    item_id: str(o.itemId),
    project_id: str(o.projectId),
    account_record_id: str(o.accountId),
    title: o.title,
    item_type: o.type,
    status: o.status,
    owner: o.owner,
    priority: o.priority ?? 'Normal',
    created_date: o.created,
    due_date: str(o.due ?? null),
    closed_date: str(o.closed ?? null),
    is_promised: bool(o.promised),
    estimate_hours: str(o.est ?? null),
    case_ref: str(o.caseRef ?? null),
    notes: str(o.notes ?? null),
  };
}

function event(o) {
  return {
    event_id: str(o.eventId),
    project_id: str(o.projectId),
    account_record_id: str(o.accountId),
    event_date: o.date,
    event_type: o.type,
    author: o.author,
    summary: o.summary,
    // Set only on 'Phase change' events. The detail page's phase timeline reads
    // its dates off these rather than parsing the summary text.
    to_phase: str(o.to ?? null),
  };
}

function workEntry(o) {
  return {
    entry_id: str(o.entryId),
    project_id: str(o.projectId),
    item_id: str(o.itemId ?? null),
    account_record_id: str(o.accountId),
    work_date: o.date,
    author: o.author,
    hours: str(o.hours),
    billable: o.billable ?? 'Billable',
    summary: o.summary,
    notes_md: o.notes,
    created_at: `${o.date}T18:00:00Z`,
  };
}

function rep(o) {
  return {
    rep_id: str(o.repId),
    name: o.name,
    email: o.email,
    role: o.role ?? 'Consultant',
    is_active: bool(o.active ?? true),
  };
}

// Method-side people. Names match the `owner` strings on projects; the two
// spellings of Brandon are intentional (see fixtures/ps.js).
function repSeed() {
  return [
    { repId: 'REP-1', name: ME_FULL, email: 'b.saltzman@method.me', role: 'Senior Consultant' },
    { repId: 'REP-2', name: 'S. Zarei', email: 's.zarei@method.me' },
    { repId: 'REP-3', name: 'Vinesh Gobin', email: 'v.gobin@method.me' },
    { repId: 'REP-4', name: 'Marisol Cruz', email: 'm.cruz@method.me' },
    { repId: 'REP-5', name: 'Owen Fairbanks', email: 'o.fairbanks@method.me', role: 'Solutions Architect' },
    { repId: 'REP-6', name: 'Priya Raman', email: 'p.raman@method.me', role: 'PS Manager' },
  ];
}

// Eight projects covering every status the board has to render, across four
// owners so the "Mine / Everyone" filter has something to do.
function projectSeed() {
  return [
    {
      projectId: 'PRJ-1041', accountId: 900101, accountName: 'Northwind Traders',
      projectName: 'Order-to-cash rebuild', phase: 'Build', status: 'At risk',
      owner: ME_FULL, kickoff: iso(-74), target: iso(12), lastActivity: iso(-2),
      budget: 60, jira: 'PS-4182',
      nextAction: 'Get sign-off on the estimate-approval email scope',
      nextDue: iso(-3),
      risk: 'Two customization requests landed after scope was frozen. Target date holds only if the PDF attachment work is deferred to a phase 2.',
    },
    {
      projectId: 'PRJ-1052', accountId: 900104, accountName: 'Pike & Powell Supply',
      projectName: 'Contractor portal rollout', phase: 'UAT', status: 'On track',
      owner: ME_SHORT, kickoff: iso(-96), target: iso(21), lastActivity: iso(-1),
      budget: 120, jira: 'PS-4090',
      nextAction: 'Walk the ops lead through UAT script 3 (order approvals)',
      nextDue: iso(2),
    },
    {
      projectId: 'PRJ-1067', accountId: 900102, accountName: 'Harborview Dental Group',
      projectName: 'Multi-location scheduling', phase: 'Discovery', status: 'On track',
      owner: ME_SHORT, kickoff: iso(-16), target: iso(58), lastActivity: iso(-6),
      budget: 40,
      nextAction: 'Confirm which of the four locations goes first',
      nextDue: iso(4),
    },
    {
      projectId: 'PRJ-1033', accountId: 900109, accountName: 'Sunfield Nutrition',
      projectName: 'Wholesale portal + pricing tiers', phase: 'Build', status: 'Blocked',
      owner: ME_FULL, kickoff: iso(-118), target: iso(-6), lastActivity: iso(-3),
      budget: 90, jira: 'PS-3901', handoffNeeded: false,
      nextAction: 'Chase the tier pricing sheet — build cannot continue without it',
      nextDue: iso(-11),
      risk: 'Inherited mid-flight from S. Zarei. Target date already passed; needs a reset conversation before any more build hours go in.',
    },
    {
      projectId: 'PRJ-1058', accountId: 900105, accountName: 'Bright Harbor Logistics',
      projectName: 'Dispatch board + driver app', phase: 'Go-live', status: 'On track',
      owner: ME_FULL, kickoff: iso(-88), target: iso(5), lastActivity: iso(-9),
      budget: 75, jira: 'PS-4011',
      nextAction: 'Cutover call Thursday — confirm the driver list import',
      nextDue: iso(3),
    },
    {
      projectId: 'PRJ-1075', accountId: 900103, accountName: 'Cedarline Millwork',
      projectName: 'Estimate-to-build workflow', phase: 'Design', status: 'On hold',
      owner: ME_FULL, kickoff: iso(-52), target: iso(40), lastActivity: iso(-48),
      budget: 30,
      nextAction: 'Waiting on the customer to name a project owner',
      risk: 'No contact for 7 weeks. Their champion left. Candidate for closing out if the next email goes unanswered.',
    },
    {
      projectId: 'PRJ-0994', accountId: 900107, accountName: 'Ridgeway Plumbing Co',
      projectName: 'Work order + tech scheduling', phase: 'Handoff', status: 'Complete',
      owner: ME_SHORT, kickoff: iso(-165), target: iso(-30), goLive: iso(-34),
      lastActivity: iso(-28), budget: 45, jira: 'PS-3744',
      nextAction: 'Close out — final invoice sent',
    },
    {
      projectId: 'PRJ-1071', accountId: 900110, accountName: 'Lumen Fabrication',
      projectName: 'Job costing rollup', phase: 'Build', status: 'On track',
      owner: 'Vinesh Gobin', kickoff: iso(-41), target: iso(30), lastActivity: iso(-15),
      budget: 50, jira: 'PS-4155',
      nextAction: 'Review the labour burden calculation with the controller',
      nextDue: iso(6),
    },
  ];
}

// Work items. `est` = hours promised for the task, `logged` = hours actually
// delivered (the work-log rows below are generated from it). The spread is
// deliberate: some tasks beat the estimate, some blow through it, so the
// efficiency numbers have something real to show.
function itemSeed() {
  return {
    'PRJ-1041': [
      { title: 'Estimate approval email should attach the PDF', type: 'Customization', status: 'Ready for Follow-Up', due: -3, priority: 'High', promised: true, est: 6, logged: 8.5, notes: 'Raised on the call 2 weeks ago and promised a scope + price. Nothing sent yet — this is the overdue one.' },
      { title: 'Invoice screen: hide internal cost column from sales role', type: 'Task', status: 'Done', due: -12, closed: -10, est: 3, logged: 2.25 },
      { title: 'Sync error — unmapped income account', type: 'Case', status: 'Check Case Status', due: 1, caseRef: '9001010', est: 1, logged: 1.5 },
      { title: 'Confirm whether phase 2 covers the customer portal', type: 'Question', status: 'Waiting on Customer', due: 5, est: 0.5, logged: 0.5 },
      { title: 'Build the reorder-point report', type: 'Task', status: 'In Progress', due: 8, est: 8, logged: 5 },
      { title: 'Import historical POs (2024–2025)', type: 'Task', status: 'New Intake', due: null, est: 4, logged: 0 },
    ],
    'PRJ-1052': [
      { title: 'UAT script 3 — order approvals', type: 'Task', status: 'In Progress', due: 2, priority: 'High', est: 5, logged: 3.5 },
      { title: 'Portal login email template', type: 'Task', status: 'Done', due: -6, closed: -7, promised: true, est: 2, logged: 1.5 },
      { title: 'Add branch filter to the open-orders view', type: 'Customization', status: 'In Progress', due: 9, est: 6, logged: 4 },
      { title: 'Train the two branch managers', type: 'Task', status: 'New Intake', due: 16, est: 4, logged: 0 },
      { title: 'Portal login link expired for test user', type: 'Case', status: 'Check Case Status', due: 3, caseRef: '9001042', est: 0.5, logged: 0.75 },
      { title: 'Order approval routing rules', type: 'Customization', status: 'Done', due: -20, closed: -22, promised: true, est: 12, logged: 9.5 },
    ],
    'PRJ-1067': [
      { title: 'Location-by-location process walkthrough', type: 'Task', status: 'In Progress', due: 4, priority: 'High', est: 6, logged: 4.5 },
      { title: 'Which location goes first?', type: 'Question', status: 'Waiting on Customer', due: 4, est: 0.5, logged: 0.5 },
      { title: 'Scope doc + estimate', type: 'Task', status: 'New Intake', due: 11, est: 4, logged: 0 },
    ],
    'PRJ-1033': [
      { title: 'Tier pricing sheet from the customer', type: 'Question', status: 'Blocked', due: -11, priority: 'High', est: 1, logged: 2.5, notes: 'Asked three times. Build is stalled behind it; every other item here is downstream.' },
      { title: 'Wholesale price list screen', type: 'Customization', status: 'Blocked', due: -4, priority: 'High', promised: true, est: 10, logged: 14 },
      { title: 'Portal user provisioning', type: 'Task', status: 'In Progress', due: 7, est: 5, logged: 6.5 },
      { title: 'Handoff review with S. Zarei', type: 'Follow-up', status: 'Done', due: -5, closed: -3, promised: true, est: 1, logged: 1.5 },
      { title: 'Reset the timeline with the customer', type: 'Follow-up', status: 'Ready for Follow-Up', due: 1, priority: 'High', promised: true, est: 1, logged: 0 },
    ],
    'PRJ-1058': [
      { title: 'Driver list import — final file', type: 'Task', status: 'In Progress', due: 3, priority: 'High', est: 3, logged: 2 },
      { title: 'Cutover runbook', type: 'Task', status: 'Done', due: -4, closed: -4, promised: true, est: 4, logged: 3.5 },
      { title: 'Dispatch board colour rules', type: 'Customization', status: 'Done', due: -14, closed: -12, est: 8, logged: 7 },
      { title: 'Post-go-live check-in booked?', type: 'Follow-up', status: 'New Intake', due: 10, est: 0.5, logged: 0 },
      { title: 'Driver app rollout training', type: 'Task', status: 'Done', due: -22, closed: -21, est: 10, logged: 11 },
    ],
    'PRJ-1075': [
      { title: 'Name a project owner', type: 'Question', status: 'Blocked', due: -30, priority: 'High', est: 0.5, logged: 0.5 },
      { title: 'Estimate template design', type: 'Task', status: 'In Progress', due: null, est: 6, logged: 1.5 },
    ],
    'PRJ-0994': [
      { title: 'Final invoice', type: 'Task', status: 'Done', due: -30, closed: -28, est: 0.5, logged: 0.5 },
      { title: 'Handoff doc to support', type: 'Task', status: 'Done', due: -32, closed: -31, promised: true, est: 2, logged: 1.5 },
      { title: '30-day post-go-live check-in', type: 'Follow-up', status: 'Done', due: -4, closed: -4, promised: true, est: 1, logged: 1 },
      { title: 'Tech scheduling board', type: 'Customization', status: 'Done', due: -70, closed: -68, est: 20, logged: 22 },
      { title: 'Work order screens', type: 'Task', status: 'Done', due: -95, closed: -96, est: 18, logged: 16 },
    ],
    'PRJ-1071': [
      { title: 'Labour burden calculation review', type: 'Task', status: 'In Progress', due: 6, est: 3, logged: 2 },
      { title: 'Job costing rollup screen', type: 'Customization', status: 'In Progress', due: 14, est: 12, logged: 9 },
      { title: 'Controller sign-off on the rollup logic', type: 'Question', status: 'Waiting on Customer', due: 9, est: 1, logged: 0.5 },
    ],
  };
}

// Markdown bodies for generated work-log entries. Written the way a consultant
// actually writes them up after a session — headings, bullets, a next step.
const NOTE_BODIES = [
  `## What we did

- Walked the current process end to end with the ops lead
- Mapped the three approval steps onto Method's approval routing
- Confirmed the existing QuickBooks item list is clean enough to use as-is

## Decisions

- Approvals stay in Method; no email-only path
- Phase 1 covers **orders only**, not estimates

## Next steps

- Send the updated flow diagram
- Book the build review for next week`,

  `## What we did

- Built the screen and wired the two lookup fields
- Added the role-based filter so sales can't see cost
- Smoke-tested with a copy of their live data

## Blockers

- One field name on their side is a duplicate — needs renaming before go-live

## Next steps

- Customer to rename the field, then re-test`,

  `## What we did

- Session with the two new users on estimates and invoicing
- Both created a full estimate → invoice cycle unaided by the end

## Notes

- They want a printed pick list; noted as a possible customization
- Recording and the getting-started doc sent afterwards`,

  `## What we did

- Debugged the sync failure: unmapped income account on three items
- Remapped and re-ran; sync clean at end of call

## Notes

- Root cause was an item created directly in QuickBooks last week
- Showed them where to check the sync error list themselves`,

  `## What we did

- Scoping conversation for the portal
- Walked through exactly what a portal user can and cannot see

## Open questions

- Who approves the spend? Their ops lead is out until Monday

## Next steps

- Send the one-page scope + price
- Follow up Tuesday if nothing back`,

  `## What we did

- Reviewed all open work items together
- Cleaned up two stale requests the customer no longer wants

## Decisions

- Deferring the PDF attachment work to a phase 2
- Keeping the current target date on that basis

## Next steps

- Confirm the deferral in writing`,

  `## What we did

- Internal review of where the project actually stands
- Rebuilt the remaining-hours estimate from the open items

## Notes

- We are over the promised hours on the price-list screen
- Recommend a reset conversation before logging more build time`,
];

const BILLABLE_CYCLE = ['Billable', 'Billable', 'Non-billable', 'Billable', 'Internal'];

function build() {
  const seeds = projectSeed();
  const PROJECTS = seeds.map(project);
  const REPS = repSeed().map(rep);

  const byId = new Map(seeds.map((s) => [s.projectId, s]));
  const items = itemSeed();
  const events = eventSeed();

  let itemCounter = 0;
  const itemRows = [];
  const workRows = [];
  let entryCounter = 0;

  for (const [projectId, list] of Object.entries(items)) {
    const seed = byId.get(projectId);
    for (const raw of list) {
      const itemId = `ITM-${++itemCounter}`;
      itemRows.push(
        item({
          ...raw,
          itemId,
          projectId,
          accountId: seed.accountId,
          owner: raw.owner ?? seed.owner,
          created: iso(raw.due == null ? -20 : raw.due - 21),
          due: raw.due == null ? null : iso(raw.due),
          closed: raw.closed == null ? null : iso(raw.closed),
        })
      );

      // Delivered hours become one or two sessions, so the log reads like real
      // work rather than a single lump per task.
      const logged = raw.logged ?? 0;
      if (logged <= 0) continue;
      const split = logged > 4 ? [logged / 2, logged / 2] : [logged];
      split.forEach((hours, i) => {
        const dayOffset = (raw.closed ?? raw.due ?? -6) - i * 5 - 1;
        workRows.push(
          workEntry({
            entryId: `WRK-${++entryCounter}`,
            projectId,
            itemId,
            accountId: seed.accountId,
            date: iso(Math.min(dayOffset, -1)),
            author: raw.owner ?? seed.owner,
            hours: Math.round(hours * 4) / 4,
            billable: BILLABLE_CYCLE[entryCounter % BILLABLE_CYCLE.length],
            summary: raw.title,
            notes: NOTE_BODIES[entryCounter % NOTE_BODIES.length],
          })
        );
      });
    }

    // One unlinked session per project — project-level work that doesn't belong
    // to a single task. The UI has to handle item_id being null.
    workRows.push(
      workEntry({
        entryId: `WRK-${++entryCounter}`,
        projectId,
        itemId: null,
        accountId: seed.accountId,
        date: seed.lastActivity,
        author: seed.owner,
        hours: 1,
        billable: 'Non-billable',
        summary: 'Project check-in and status review',
        notes: NOTE_BODIES[(entryCounter + 5) % NOTE_BODIES.length],
      })
    );
  }

  let eventCounter = 0;
  const PROJECT_EVENTS = Object.entries(events).flatMap(([projectId, list]) =>
    list.map((raw) =>
      event({
        ...raw,
        eventId: `EVT-${++eventCounter}`,
        projectId,
        accountId: byId.get(projectId).accountId,
      })
    )
  );

  return {
    PROJECTS,
    PROJECT_ITEMS: itemRows,
    PROJECT_EVENTS,
    PROJECT_WORK_LOG: workRows,
    REPS,
  };
}

// Activity log per project. 'Phase change' events are what the detail page's
// phase timeline reads dates off, so every completed phase needs one.
function eventSeed() {
  return {
    'PRJ-1041': [
      { date: iso(-2), type: 'Call', author: ME_FULL, summary: 'Reviewed open work items. Confirmed the invoice screen change is live. Customer asked about the PDF attachment on approval emails — promised a scope.' },
      { date: iso(-9), type: 'Email', author: ME_FULL, summary: 'Sent the reorder-point report mockup for review.' },
      { date: iso(-24), type: 'Phase change', author: ME_FULL, to: 'Build', summary: 'Design → Build. Scope frozen at 11 screens.' },
      { date: iso(-48), type: 'Phase change', author: ME_FULL, to: 'Design', summary: 'Discovery → Design.' },
      { date: iso(-74), type: 'Phase change', author: ME_FULL, to: 'Discovery', summary: 'Kickoff — Discovery.' },
    ],
    'PRJ-1052': [
      { date: iso(-1), type: 'Call', author: ME_SHORT, summary: 'UAT walkthrough with the ops lead. Two defects logged, both cosmetic.' },
      { date: iso(-11), type: 'Phase change', author: ME_SHORT, to: 'UAT', summary: 'Build → UAT. All 14 screens delivered.' },
      { date: iso(-40), type: 'Phase change', author: ME_SHORT, to: 'Build', summary: 'Design → Build.' },
      { date: iso(-70), type: 'Phase change', author: ME_SHORT, to: 'Design', summary: 'Discovery → Design.' },
      { date: iso(-96), type: 'Phase change', author: ME_SHORT, to: 'Discovery', summary: 'Kickoff — Discovery.' },
    ],
    'PRJ-1067': [
      { date: iso(-6), type: 'Zoom', author: ME_SHORT, summary: 'Process walkthrough for the main clinic. Recording and notes shared.' },
      { date: iso(-16), type: 'Phase change', author: ME_SHORT, to: 'Discovery', summary: 'Kickoff — Discovery.' },
    ],
    'PRJ-1033': [
      { date: iso(-3), type: 'Internal note', author: ME_FULL, summary: 'Third ask for the pricing sheet. Recommending we pause billable build hours until it arrives.' },
      { date: iso(-6), type: 'Email', author: ME_FULL, summary: 'Intro email as the new consultant on the account, with a request for the tier pricing sheet.' },
      { date: iso(-10), type: 'Handoff', author: 'S. Zarei', summary: 'Handoff packet generated. Two promised items outstanding.' },
      { date: iso(-62), type: 'Phase change', author: 'S. Zarei', to: 'Build', summary: 'Design → Build.' },
      { date: iso(-118), type: 'Phase change', author: 'S. Zarei', to: 'Discovery', summary: 'Kickoff — Discovery.' },
    ],
    'PRJ-1058': [
      { date: iso(-9), type: 'Call', author: ME_FULL, summary: 'Pre-cutover review. Driver list is the only open dependency.' },
      { date: iso(-15), type: 'Phase change', author: ME_FULL, to: 'Go-live', summary: 'UAT → Go-live. Cutover set for Thursday.' },
      { date: iso(-44), type: 'Phase change', author: ME_FULL, to: 'UAT', summary: 'Build → UAT.' },
      { date: iso(-66), type: 'Phase change', author: ME_FULL, to: 'Build', summary: 'Design → Build.' },
      { date: iso(-88), type: 'Phase change', author: ME_FULL, to: 'Discovery', summary: 'Kickoff — Discovery.' },
    ],
    'PRJ-1075': [
      { date: iso(-48), type: 'Email', author: ME_FULL, summary: 'Followed up on the design review. No response.' },
      { date: iso(-52), type: 'Phase change', author: ME_FULL, to: 'Design', summary: 'Discovery → Design.' },
    ],
    'PRJ-0994': [
      { date: iso(-28), type: 'Call', author: ME_SHORT, summary: '30-day check-in. Techs are using it daily. Closing the project out.' },
      { date: iso(-34), type: 'Phase change', author: ME_SHORT, to: 'Handoff', summary: 'Go-live → Handoff. Live on the 1st.' },
      { date: iso(-60), type: 'Phase change', author: ME_SHORT, to: 'Go-live', summary: 'UAT → Go-live.' },
      { date: iso(-165), type: 'Phase change', author: ME_SHORT, to: 'Discovery', summary: 'Kickoff — Discovery.' },
    ],
    'PRJ-1071': [
      { date: iso(-15), type: 'Call', author: 'Vinesh Gobin', summary: 'Walked the controller through the rollup. Wants burden included.' },
      { date: iso(-41), type: 'Phase change', author: 'Vinesh Gobin', to: 'Discovery', summary: 'Kickoff — Discovery.' },
    ],
  };
}

let cache = null;

/** The project fixture tables, built once on first use (dates resolve then). */
export function projectFixtures() {
  if (!cache) cache = build();
  return cache;
}
