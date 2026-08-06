// Project tracker data layer + its offline fixtures.
//
// Same round-trip discipline as mockBq.test.js: real SQL builders → mock router
// → real normalizers. Since there is no projects table in BigQuery yet, the
// fixture shape IS the draft schema, and these tests are what keeps it and
// lib/projects.js from drifting apart.

import { describe, it, expect } from 'vitest';
import { routeMockSql } from '../../src/dev/mockBq.js';
import { localIsoDate } from '../../src/lib/psOverview.js';
import {
  PROJECT_PHASES,
  buildProjectsSql,
  buildProjectSql,
  buildProjectItemsSql,
  buildProjectEventsSql,
  validateProjectId,
  normalizeProjectRow,
  normalizeItemRow,
  normalizeEventRow,
  compareProjects,
  summarizeProjects,
  phaseProgress,
  phaseTimeline,
  sortItems,
  isOverdue,
  daysUntil,
  statusRank,
} from '../../src/lib/projects.js';

const TODAY = localIsoDate();
const rowsFor = (sql) => routeMockSql(sql).rows;
const routeFor = (sql) => routeMockSql(sql).route;

const allProjects = () => rowsFor(buildProjectsSql()).map(normalizeProjectRow);

describe('validateProjectId', () => {
  it('accepts the id format the fixtures use', () => {
    expect(validateProjectId('PRJ-1041')).toBe('PRJ-1041');
  });

  it('rejects anything that could carry SQL', () => {
    for (const bad of ["PRJ-1' OR 1=1--", 'PRJ_1041', '', null, 'PRJ-', 'TOOLONGPREFIX-1']) {
      expect(() => validateProjectId(bad)).toThrow();
    }
  });
});

describe('projects board query', () => {
  const sql = buildProjectsSql();

  it('routes to the projects handler, not the work-items one', () => {
    // buildProjectsSql names both tables (the rollup CTE aggregates items), so
    // route order is load-bearing here.
    expect(routeFor(sql)).toMatch(/^projects/);
  });

  it('returns every project with the item rollup joined on', () => {
    const rows = rowsFor(sql);
    expect(rows.length).toBeGreaterThanOrEqual(6);
    for (const row of rows) {
      expect(row).toHaveProperty('open_items');
      expect(row).toHaveProperty('overdue_items');
      expect(row).toHaveProperty('promised_items');
    }
  });

  it('normalizes into typed projects', () => {
    const p = allProjects()[0];
    expect(typeof p.projectId).toBe('string');
    expect(Number.isInteger(p.accountRecordId)).toBe(true);
    expect(typeof p.projectName).toBe('string');
    expect(PROJECT_PHASES).toContain(p.phase);
    expect(Number.isInteger(p.openItems)).toBe(true);
    // Hours are rollups, never null, so the UI can do arithmetic unguarded.
    expect(typeof p.loggedHours).toBe('number');
    expect(typeof p.promisedHours).toBe('number');
  });

  it('counts open, overdue and promised items off the item fixtures', () => {
    const byId = new Map(allProjects().map((p) => [p.projectId, p]));
    // PRJ-1041 (Northwind) has 5 open of 6 items, one of them overdue+promised.
    const northwind = byId.get('PRJ-1041');
    expect(northwind.openItems).toBe(5);
    expect(northwind.overdueItems).toBeGreaterThan(0);
    expect(northwind.promisedItems).toBeGreaterThan(0);
    // A closed-out project has no open work left.
    expect(byId.get('PRJ-0994').openItems).toBe(0);
  });

  it('agrees with the items query about what is open', () => {
    for (const p of allProjects()) {
      const items = rowsFor(buildProjectItemsSql(p.projectId)).map(normalizeItemRow);
      expect(items.filter((i) => i.isOpen)).toHaveLength(p.openItems);
      expect(items.filter((i) => isOverdue(i, TODAY))).toHaveLength(p.overdueItems);
    }
  });

  it('covers every project status, so the board has each chip to render', () => {
    const statuses = new Set(allProjects().map((p) => p.status));
    expect(statuses).toContain('Blocked');
    expect(statuses).toContain('At risk');
    expect(statuses).toContain('On track');
    expect(statuses).toContain('On hold');
    expect(statuses).toContain('Complete');
  });
});

describe('board ordering and stats', () => {
  it('sorts blocked first and complete last', () => {
    const sorted = allProjects().sort(compareProjects);
    expect(sorted[0].status).toBe('Blocked');
    expect(sorted[sorted.length - 1].status).toBe('Complete');
    // Non-decreasing status rank throughout.
    for (let i = 1; i < sorted.length; i++) {
      expect(statusRank(sorted[i].status)).toBeGreaterThanOrEqual(statusRank(sorted[i - 1].status));
    }
  });

  it('breaks status ties on overdue count', () => {
    const a = { status: 'On track', overdueItems: 0, targetDate: '2026-01-01', accountName: 'A' };
    const b = { status: 'On track', overdueItems: 3, targetDate: '2026-01-01', accountName: 'B' };
    expect([a, b].sort(compareProjects)[0]).toBe(b);
  });

  it('excludes complete projects from the stat row', () => {
    const projects = allProjects();
    const stats = summarizeProjects(projects, TODAY);
    expect(stats.active).toBe(projects.filter((p) => p.status !== 'Complete').length);
    expect(stats.needsAttention).toBeGreaterThan(0);
    expect(stats.overdueItems).toBeGreaterThan(0);
    expect(stats.promisedItems).toBeGreaterThan(0);
    // Sunfield's target date has already passed in the fixtures.
    expect(stats.overdueTargets).toBeGreaterThan(0);
  });

  it('reads a complete project as fully progressed whatever phase it stopped in', () => {
    expect(phaseProgress({ status: 'Complete', phase: 'Go-live' })).toBe(1);
    expect(phaseProgress({ status: 'On track', phase: 'Discovery' })).toBeCloseTo(1 / 6);
    expect(phaseProgress({ status: 'On track', phase: 'Handoff' })).toBe(1);
  });
});

describe('project detail', () => {
  const project = normalizeProjectRow(rowsFor(buildProjectSql('PRJ-1041'))[0]);
  const items = rowsFor(buildProjectItemsSql('PRJ-1041')).map(normalizeItemRow);
  const events = rowsFor(buildProjectEventsSql('PRJ-1041')).map(normalizeEventRow);

  it('fetches exactly one project by id', () => {
    expect(rowsFor(buildProjectSql('PRJ-1041'))).toHaveLength(1);
    expect(project.projectId).toBe('PRJ-1041');
    expect(project.accountName).toBe('Northwind Traders');
  });

  it('returns an empty result for an unknown id rather than throwing', () => {
    expect(rowsFor(buildProjectSql('PRJ-9999'))).toHaveLength(0);
  });

  it('scopes items and events to that project', () => {
    expect(items.length).toBeGreaterThan(0);
    expect(events.length).toBeGreaterThan(0);
    for (const i of items) expect(i.projectId).toBe('PRJ-1041');
    for (const e of events) expect(e.projectId).toBe('PRJ-1041');
  });

  it('normalizes items with typed flags', () => {
    const promised = items.find((i) => i.isPromised);
    expect(promised).toBeDefined();
    expect(typeof promised.isPromised).toBe('boolean');
    expect(promised.isOpen).toBe(true);
    const done = items.find((i) => !i.isOpen);
    expect(done.status).toBe('Done');
    expect(done.closedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns the activity log newest first', () => {
    const dates = events.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('builds a phase timeline dated off phase-change events', () => {
    const timeline = phaseTimeline(project, events);
    expect(timeline).toHaveLength(PROJECT_PHASES.length);
    expect(timeline.map((t) => t.phase)).toEqual(PROJECT_PHASES);
    // Northwind is in Build: Discovery/Design done, Build current, rest upcoming.
    expect(timeline.map((t) => t.state)).toEqual([
      'done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming',
    ]);
    // Every completed and current phase has a date from an event.
    for (const step of timeline.filter((t) => t.state !== 'upcoming')) {
      expect(step.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('marks every phase done on a complete project', () => {
    const done = normalizeProjectRow(rowsFor(buildProjectSql('PRJ-0994'))[0]);
    const timeline = phaseTimeline(done, rowsFor(buildProjectEventsSql('PRJ-0994')).map(normalizeEventRow));
    expect(timeline.every((t) => t.state === 'done')).toBe(true);
  });

  it('renders a phase with no event rather than dropping it', () => {
    // Sunfield skipped Design — the timeline must still show the step, dateless.
    const p = normalizeProjectRow(rowsFor(buildProjectSql('PRJ-1033'))[0]);
    const timeline = phaseTimeline(p, rowsFor(buildProjectEventsSql('PRJ-1033')).map(normalizeEventRow));
    const design = timeline.find((t) => t.phase === 'Design');
    expect(design.state).toBe('done');
    expect(design.date).toBeNull();
  });

  it('sorts items overdue → open → done', () => {
    const sorted = sortItems(items, TODAY);
    const bucket = (i) => (isOverdue(i, TODAY) ? 0 : i.isOpen ? 1 : 2);
    const buckets = sorted.map(bucket);
    expect([...buckets].sort()).toEqual(buckets);
  });
});

describe('daysUntil', () => {
  it('is negative in the past, zero today, positive ahead', () => {
    expect(daysUntil(TODAY, TODAY)).toBe(0);
    expect(daysUntil('2026-01-01', '2026-01-11')).toBe(-10);
    expect(daysUntil('2026-01-21', '2026-01-11')).toBe(10);
    expect(daysUntil(null, TODAY)).toBeNull();
  });
});
