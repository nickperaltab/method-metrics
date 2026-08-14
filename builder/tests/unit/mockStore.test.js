// The writable dev store behind the tracker's create/edit/log-work flows.
//
// The assertion that matters most in here is the round trip: after a write, the
// data has to come back through the *real* SQL builders and normalizers. That's
// what stops the editing UI from being wired to a shape the eventual BigQuery or
// Supabase store won't produce.

import { describe, it, expect, beforeEach } from 'vitest';
import { routeMockSql } from '../../src/dev/mockBq.js';
import {
  resetStore,
  storeSnapshot,
  createProject,
  updateProject,
  createRep,
  createHandoff,
  createWorkEntry,
  updateWorkEntry,
  deleteWorkEntry,
  createItem,
  updateItem,
} from '../../src/dev/mockStore.js';
import {
  buildProjectsSql,
  buildProjectSql,
  buildProjectItemsSql,
  buildProjectEventsSql,
  buildProjectWorkLogSql,
  buildRepsSql,
  buildAccountOptionsSql,
  validateProjectId,
  normalizeProjectRow,
  normalizeItemRow,
  normalizeEventRow,
  normalizeWorkEntryRow,
  normalizeRepRow,
  normalizeAccountOptionRow,
  localToday,
} from '../../src/lib/projects.js';
import { buildHandoffsSql } from '../../src/lib/handoffs.js';
import { buildMyHandoffsSql } from '../../src/lib/psOverview.js';
import { projectEfficiency } from '../../src/lib/efficiency.js';

const TODAY = localToday();
const rowsFor = (sql) => routeMockSql(sql).rows;
const readProject = (id) => {
  const row = rowsFor(buildProjectSql(id))[0];
  return row ? normalizeProjectRow(row) : null;
};
const readItems = (id) => rowsFor(buildProjectItemsSql(id)).map(normalizeItemRow);
const readEvents = (id) => rowsFor(buildProjectEventsSql(id)).map(normalizeEventRow);
const readLog = (id) => rowsFor(buildProjectWorkLogSql(id)).map(normalizeWorkEntryRow);

beforeEach(() => { resetStore(); });

describe('reset', () => {
  it('reseeds every table from the fixtures', () => {
    const before = storeSnapshot();
    createProject({ accountRecordId: 900101, accountName: 'Northwind Traders', projectName: 'Throwaway', phase: 'Discovery', status: 'On track', owner: 'Brandon Saltzman' });
    expect(storeSnapshot().PROJECTS).toHaveLength(before.PROJECTS.length + 1);
    resetStore();
    expect(storeSnapshot().PROJECTS).toHaveLength(before.PROJECTS.length);
  });
});

describe('createProject', () => {
  it('is readable through the real projects query afterwards', () => {
    const created = createProject({
      accountRecordId: 900103,
      accountName: 'Cedarline Millwork',
      projectName: 'Second Cedarline project',
      phase: 'Discovery',
      status: 'On track',
      owner: 'Marisol Cruz',
      targetDate: '2026-12-01',
      hoursBudget: 25,
    });
    expect(() => validateProjectId(created.project_id)).not.toThrow();

    const project = readProject(created.project_id);
    expect(project.projectName).toBe('Second Cedarline project');
    expect(project.accountName).toBe('Cedarline Millwork');
    expect(project.owner).toBe('Marisol Cruz');
    expect(project.hoursBudget).toBe(25);
    // A brand-new project has no items or log, and the rollups must read as
    // zeroes rather than nulls so the board can do arithmetic on them.
    expect(project.openItems).toBe(0);
    expect(project.promisedHours).toBe(0);
    expect(project.loggedHours).toBe(0);
    expect(projectEfficiency(project).hoursEfficiency).toBeNull();
  });

  it('shows up in the board listing', () => {
    const created = createProject({ accountRecordId: 900101, accountName: 'Northwind Traders', projectName: 'Board visibility', phase: 'Build', status: 'On track', owner: 'Brandon Saltzman' });
    const ids = rowsFor(buildProjectsSql()).map((r) => r.project_id);
    expect(ids).toContain(created.project_id);
  });

  it('logs its creation to the activity feed at the starting phase', () => {
    const created = createProject({ accountRecordId: 900101, accountName: 'Northwind Traders', projectName: 'Logged creation', phase: 'Design', status: 'On track', owner: 'Brandon Saltzman' });
    const events = readEvents(created.project_id);
    expect(events).toHaveLength(1);
    expect(events[0].toPhase).toBe('Design');
    expect(events[0].date).toBe(TODAY);
  });

  it('defaults the kickoff date to today when none is given', () => {
    const created = createProject({ accountRecordId: 900101, accountName: 'Northwind Traders', projectName: 'No kickoff', phase: 'Discovery', status: 'On track', owner: 'Brandon Saltzman' });
    expect(readProject(created.project_id).kickoffDate).toBe(TODAY);
  });
});

describe('updateProject', () => {
  it('patches only the fields it was given', () => {
    const before = readProject('PRJ-1041');
    updateProject('PRJ-1041', { status: 'On track' });
    const after = readProject('PRJ-1041');
    expect(after.status).toBe('On track');
    expect(after.projectName).toBe(before.projectName);
    expect(after.targetDate).toBe(before.targetDate);
  });

  it('logs a phase change so the lifecycle timeline picks up the date', () => {
    updateProject('PRJ-1041', { phase: 'UAT' });
    const events = readEvents('PRJ-1041');
    const change = events.find((e) => e.toPhase === 'UAT');
    expect(change).toBeDefined();
    expect(change.date).toBe(TODAY);
    expect(change.summary).toContain('Build → UAT');
  });

  it('does not log a phase change when the phase is unchanged', () => {
    const before = readEvents('PRJ-1041').length;
    updateProject('PRJ-1041', { phase: 'Build', status: 'On track' });
    expect(readEvents('PRJ-1041')).toHaveLength(before);
  });

  it('logs a reassignment even when no handoff document is created', () => {
    updateProject('PRJ-1041', { owner: 'Owen Fairbanks' });
    const events = readEvents('PRJ-1041');
    expect(events[0].type).toBe('Handoff');
    expect(events[0].summary).toContain('Owen Fairbanks');
    expect(readProject('PRJ-1041').owner).toBe('Owen Fairbanks');
  });

  it('rejects an unknown project', () => {
    expect(() => updateProject('PRJ-9999', { status: 'Blocked' })).toThrow();
  });
});

describe('reps', () => {
  it('adds a rep that the owner picker can then read', () => {
    createRep({ name: 'Rowan Ellis', email: 'r.ellis@method.me', role: 'Consultant' });
    const reps = rowsFor(buildRepsSql()).map(normalizeRepRow);
    expect(reps.map((r) => r.name)).toContain('Rowan Ellis');
    // The query orders by name, so the picker is alphabetical.
    expect(reps.map((r) => r.name)).toEqual([...reps.map((r) => r.name)].sort());
  });

  it('does not duplicate an existing rep', () => {
    const before = rowsFor(buildRepsSql()).length;
    const again = createRep({ name: 'vinesh gobin' });
    expect(again.name).toBe('Vinesh Gobin');
    expect(rowsFor(buildRepsSql())).toHaveLength(before);
  });

  it('requires a name', () => {
    expect(() => createRep({ name: '   ' })).toThrow();
  });
});

describe('reassignment handoffs', () => {
  it('captures the open and promised counts at the moment of handoff', () => {
    const project = readProject('PRJ-1033');
    const handoff = createHandoff({
      projectId: 'PRJ-1033',
      outgoingRep: project.owner,
      incomingRep: 'Marisol Cruz',
    });
    expect(handoff.status).toBe('Draft');
    expect(Number(handoff.open_in_progress)).toBe(project.openItems);
    expect(Number(handoff.open_promised)).toBe(project.promisedItems);
    // Sunfield is blocked and past target in the fixtures — both must be flagged.
    const flags = handoff.flags.map((f) => f.v);
    expect(flags).toContain('Promised work outstanding');
    expect(flags).toContain('Blocked at handoff');
    expect(flags).toContain('Past target date');
  });

  it('appears on the Handoffs screens next to the seeded ones', () => {
    createHandoff({ projectId: 'PRJ-1041', outgoingRep: 'Brandon Saltzman', incomingRep: 'Marisol Cruz' });
    const all = rowsFor(buildHandoffsSql());
    expect(all.map((r) => Number(r.account_record_id))).toContain(900101);
    // And it's picked up by "my handoffs" for the outgoing rep.
    const mine = rowsFor(buildMyHandoffsSql('b.saltzman@method.me'));
    expect(mine.map((r) => Number(r.account_record_id))).toContain(900101);
  });

  it('logs the handoff to the project activity', () => {
    createHandoff({ projectId: 'PRJ-1041', outgoingRep: 'Brandon Saltzman', incomingRep: 'Marisol Cruz' });
    const events = readEvents('PRJ-1041');
    expect(events[0].type).toBe('Handoff');
    expect(events[0].summary).toContain('Draft');
  });
});

describe('work log', () => {
  it('adds hours that the project rollup and efficiency then reflect', () => {
    const before = readProject('PRJ-1067');
    createWorkEntry({
      projectId: 'PRJ-1067',
      itemId: null,
      hours: 2.5,
      summary: 'Scoping session',
      notesMd: '## What we did\n\n- Talked it through',
      author: 'B. Saltzman',
    });
    const after = readProject('PRJ-1067');
    expect(after.loggedHours).toBeCloseTo(before.loggedHours + 2.5, 2);
    // Promised hours are untouched, so efficiency must fall.
    expect(after.promisedHours).toBeCloseTo(before.promisedHours, 2);
    expect(projectEfficiency(after).hoursEfficiency)
      .toBeLessThan(projectEfficiency(before).hoursEfficiency);
  });

  it('counts billable and non-billable separately', () => {
    const before = readProject('PRJ-1067');
    createWorkEntry({ projectId: 'PRJ-1067', hours: 3, summary: 'Internal prep', billable: 'Internal' });
    const after = readProject('PRJ-1067');
    expect(after.loggedHours).toBeCloseTo(before.loggedHours + 3, 2);
    expect(after.billableHours).toBeCloseTo(before.billableHours, 2);
  });

  it('attributes hours to a task when linked', () => {
    const item = readItems('PRJ-1067')[0];
    createWorkEntry({ projectId: 'PRJ-1067', itemId: item.itemId, hours: 1.25, summary: 'Task work' });
    const entries = readLog('PRJ-1067').filter((e) => e.itemId === item.itemId);
    expect(entries.reduce((sum, e) => sum + e.hours, 0)).toBeGreaterThanOrEqual(1.25);
  });

  it('keeps the markdown body intact through the round trip', () => {
    const md = '## What we did\n\n- Fixed the **sync**\n- Logged a `case`\n\n## Next steps\n\n- Follow up';
    const created = createWorkEntry({ projectId: 'PRJ-1067', hours: 1, summary: 'Notes fidelity', notesMd: md });
    const read = readLog('PRJ-1067').find((e) => e.entryId === created.entry_id);
    expect(read.notesMd).toBe(md);
  });

  it('returns entries newest first', () => {
    const dates = readLog('PRJ-1041').map((e) => e.workDate);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('rejects zero, negative and non-numeric hours', () => {
    for (const hours of [0, -2, 'abc', null]) {
      expect(() => createWorkEntry({ projectId: 'PRJ-1067', hours, summary: 'bad' })).toThrow();
    }
  });

  it('rejects an unknown project', () => {
    expect(() => createWorkEntry({ projectId: 'PRJ-9999', hours: 1, summary: 'x' })).toThrow();
  });

  it('edits and deletes an entry, and the rollup follows', () => {
    const created = createWorkEntry({ projectId: 'PRJ-1067', hours: 2, summary: 'Editable' });
    const afterCreate = readProject('PRJ-1067').loggedHours;

    updateWorkEntry(created.entry_id, { hours: 5, summary: 'Edited' });
    expect(readProject('PRJ-1067').loggedHours).toBeCloseTo(afterCreate + 3, 2);
    expect(readLog('PRJ-1067').find((e) => e.entryId === created.entry_id).summary).toBe('Edited');

    expect(deleteWorkEntry(created.entry_id)).toBe(true);
    expect(readProject('PRJ-1067').loggedHours).toBeCloseTo(afterCreate - 2, 2);
    expect(readLog('PRJ-1067').some((e) => e.entryId === created.entry_id)).toBe(false);
  });

  it('advances the last activity date on the project', () => {
    updateProject('PRJ-1075', { status: 'On hold' });
    createWorkEntry({ projectId: 'PRJ-1075', hours: 1, summary: 'Woke it up' });
    expect(readProject('PRJ-1075').lastActivityDate).toBe(TODAY);
  });
});

describe('work items', () => {
  it('adds an item with a promise that efficiency then measures', () => {
    const before = readProject('PRJ-1067');
    createItem({ projectId: 'PRJ-1067', title: 'New promised task', estimateHours: 4, isPromised: true, dueDate: '2026-12-01' });
    const after = readProject('PRJ-1067');
    expect(after.promisedHours).toBeCloseTo(before.promisedHours + 4, 2);
    expect(after.openItems).toBe(before.openItems + 1);
    expect(after.promisedTotal).toBe(before.promisedTotal + 1);
    expect(after.promisedItems).toBe(before.promisedItems + 1);
  });

  it('stamps a close date when an item is marked done', () => {
    const item = readItems('PRJ-1067').find((i) => i.isOpen);
    updateItem(item.itemId, { status: 'Done' });
    const closed = readItems('PRJ-1067').find((i) => i.itemId === item.itemId);
    expect(closed.isOpen).toBe(false);
    expect(closed.closedDate).toBe(TODAY);
  });

  it('clears the close date when an item is reopened', () => {
    const done = readItems('PRJ-1041').find((i) => !i.isOpen);
    updateItem(done.itemId, { status: 'In Progress' });
    const reopened = readItems('PRJ-1041').find((i) => i.itemId === done.itemId);
    expect(reopened.isOpen).toBe(true);
    expect(reopened.closedDate).toBeNull();
  });

  it('moves delivery reliability when a promise is closed on time', () => {
    const before = readProject('PRJ-1067');
    const created = createItem({
      projectId: 'PRJ-1067',
      title: 'Promise to keep',
      estimateHours: 1,
      isPromised: true,
      dueDate: '2099-01-01',
    });
    updateItem(created.item_id, { status: 'Done' });
    const after = readProject('PRJ-1067');
    expect(after.promisedOnTime).toBe(before.promisedOnTime + 1);
  });

  it('does not score a promise closed after its due date', () => {
    const before = readProject('PRJ-1067');
    const created = createItem({
      projectId: 'PRJ-1067',
      title: 'Promise already blown',
      estimateHours: 1,
      isPromised: true,
      dueDate: '2020-01-01',
    });
    updateItem(created.item_id, { status: 'Done' });
    const after = readProject('PRJ-1067');
    expect(after.promisedTotal).toBe(before.promisedTotal + 1);
    expect(after.promisedOnTime).toBe(before.promisedOnTime);
  });

  it('rejects an unknown item or project', () => {
    expect(() => updateItem('ITM-99999', { status: 'Done' })).toThrow();
    expect(() => createItem({ projectId: 'PRJ-9999', title: 'x' })).toThrow();
  });
});

describe('account options', () => {
  it('offers one row per account for the customer picker', () => {
    const options = rowsFor(buildAccountOptionsSql()).map(normalizeAccountOptionRow);
    expect(options.length).toBeGreaterThanOrEqual(8);
    const ids = options.map((o) => o.accountRecordId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const option of options) {
      expect(Number.isInteger(option.accountRecordId)).toBe(true);
      expect(typeof option.accountName).toBe('string');
    }
    expect(options.map((o) => o.accountName)).toEqual([...options.map((o) => o.accountName)].sort());
  });
});
