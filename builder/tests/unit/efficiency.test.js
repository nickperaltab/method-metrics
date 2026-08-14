// Delivered-vs-promised maths.
//
// The two ratings are the point of the tracker, so this covers the edge cases
// that would otherwise show a confident wrong number: nothing logged yet,
// nothing promised, a promised item with no due date, and rollups where one big
// task must outweigh a small one.

import { describe, it, expect } from 'vitest';
import { routeMockSql } from '../../src/dev/mockBq.js';
import {
  buildProjectsSql,
  buildProjectItemsSql,
  buildProjectWorkLogSql,
  normalizeProjectRow,
  normalizeItemRow,
  normalizeWorkEntryRow,
} from '../../src/lib/projects.js';
import {
  hoursEfficiency,
  deliveryReliability,
  isOnTime,
  loggedHoursForItem,
  itemEfficiency,
  projectEfficiency,
  repRollup,
  accountRollup,
  compareRollups,
  formatRatio,
  formatHours,
  ratingTone,
} from '../../src/lib/efficiency.js';

const rowsFor = (sql) => routeMockSql(sql).rows;
const projects = () => rowsFor(buildProjectsSql()).map(normalizeProjectRow);
const itemsOf = (id) => rowsFor(buildProjectItemsSql(id)).map(normalizeItemRow);
const logOf = (id) => rowsFor(buildProjectWorkLogSql(id)).map(normalizeWorkEntryRow);

describe('hoursEfficiency', () => {
  it('is promised ÷ logged', () => {
    expect(hoursEfficiency(6, 8)).toBe(0.75);
    expect(hoursEfficiency(8, 6)).toBeCloseTo(1.3333);
    expect(hoursEfficiency(4, 4)).toBe(1);
  });

  it('is null when there is nothing to measure — not 0, not Infinity', () => {
    // A task with a promise but no logged time is "not started", not "0% efficient".
    expect(hoursEfficiency(6, 0)).toBeNull();
    expect(hoursEfficiency(6, null)).toBeNull();
    // A task with logged time but no promise cannot be scored at all.
    expect(hoursEfficiency(null, 8)).toBeNull();
  });
});

describe('deliveryReliability', () => {
  it('is on-time ÷ promised', () => {
    expect(deliveryReliability(4, 3)).toBe(0.75);
    expect(deliveryReliability(2, 2)).toBe(1);
    expect(deliveryReliability(3, 0)).toBe(0);
  });

  it('is null when nothing was promised', () => {
    expect(deliveryReliability(0, 0)).toBeNull();
    expect(deliveryReliability(null, null)).toBeNull();
  });
});

describe('isOnTime', () => {
  const base = { isPromised: true, isOpen: false, dueDate: '2026-06-10', closedDate: '2026-06-09' };

  it('scores a promise closed on or before its due date', () => {
    expect(isOnTime(base)).toBe(true);
    expect(isOnTime({ ...base, closedDate: '2026-06-10' })).toBe(true);
  });

  it('does not score a late close', () => {
    expect(isOnTime({ ...base, closedDate: '2026-06-11' })).toBe(false);
  });

  it('does not score a promise that is still open, however new', () => {
    expect(isOnTime({ ...base, isOpen: true, closedDate: null })).toBe(false);
  });

  it('scores a closed promise with no due date — nothing to be late against', () => {
    expect(isOnTime({ ...base, dueDate: null })).toBe(true);
  });

  it('ignores items that were never promised', () => {
    expect(isOnTime({ ...base, isPromised: false })).toBe(false);
  });
});

describe('per-item hours', () => {
  const log = [
    { itemId: 'ITM-1', hours: 2 },
    { itemId: 'ITM-1', hours: 1.5 },
    { itemId: 'ITM-2', hours: 4 },
    { itemId: null, hours: 8 },
  ];

  it('sums only the entries linked to that item', () => {
    expect(loggedHoursForItem('ITM-1', log)).toBe(3.5);
    expect(loggedHoursForItem('ITM-2', log)).toBe(4);
    expect(loggedHoursForItem('ITM-9', log)).toBe(0);
  });

  it('excludes project-level work from every task', () => {
    const total = ['ITM-1', 'ITM-2'].reduce((sum, id) => sum + loggedHoursForItem(id, log), 0);
    expect(total).toBe(7.5); // the unlinked 8h is deliberately not attributed
  });
});

describe('project rollup against the fixtures', () => {
  const id = 'PRJ-1041';
  const project = projects().find((p) => p.projectId === id);
  const items = itemsOf(id);
  const workLog = logOf(id);

  it('recomputes from detail rows and agrees with the SQL rollup', () => {
    const totals = projectEfficiency(project, { items, workLog });
    expect(totals.promisedHours).toBeCloseTo(project.promisedHours, 2);
    expect(totals.loggedHours).toBeCloseTo(project.loggedHours, 2);
    expect(totals.promisedTotal).toBe(project.promisedTotal);
    expect(totals.promisedOnTime).toBe(project.promisedOnTime);
  });

  it('works from the rollup columns alone when detail rows are not loaded', () => {
    const fromRollup = projectEfficiency(project);
    const fromDetail = projectEfficiency(project, { items, workLog });
    expect(formatRatio(fromRollup.hoursEfficiency)).toBe(formatRatio(fromDetail.hoursEfficiency));
  });

  it('reports the budget alongside, never inside, the ratio', () => {
    const totals = projectEfficiency(project, { items, workLog });
    expect(totals.hoursBudget).toBe(project.hoursBudget);
    // Budget is bigger than the promised total here, so folding it in would have
    // flattered the efficiency number.
    expect(totals.hoursBudget).toBeGreaterThan(totals.promisedHours);
    expect(totals.hoursEfficiency).toBe(hoursEfficiency(totals.promisedHours, totals.loggedHours));
  });

  it('only scores tasks that carry a promise', () => {
    const rows = itemEfficiency(items, workLog);
    expect(rows).toHaveLength(items.length);
    const scoreable = rows.filter((r) => r.promisedHours != null);
    expect(scoreable.length).toBeGreaterThan(0);
    for (const row of scoreable.filter((r) => r.loggedHours > 0)) {
      expect(row.efficiency).toBeCloseTo(row.promisedHours / row.loggedHours, 5);
      expect(row.variance).toBeCloseTo(row.loggedHours - row.promisedHours, 5);
    }
  });

  it('surfaces the over-run task the fixtures were built around', () => {
    const over = itemEfficiency(items, workLog).find((r) => r.item.title.includes('PDF'));
    expect(over.promisedHours).toBe(6);
    expect(over.loggedHours).toBe(8.5);
    expect(over.efficiency).toBeLessThan(1);
    expect(over.onTime).toBe(false); // promised, overdue, still open
  });
});

describe('rollups', () => {
  const all = projects();

  it('sums the parts before dividing, so a big task outweighs a small one', () => {
    // Averaging percentages would give (200% + 50%) / 2 = 125%.
    // Summing the parts gives 12 promised / 22 logged = 55%.
    const fake = [
      { owner: 'A', promisedHours: 2, loggedHours: 1, promisedTotal: 0, promisedOnTime: 0, status: 'On track' },
      { owner: 'A', promisedHours: 10, loggedHours: 21, promisedTotal: 0, promisedOnTime: 0, status: 'On track' },
    ];
    const [rep] = repRollup(fake);
    expect(rep.promisedHours).toBe(12);
    expect(rep.loggedHours).toBe(22);
    expect(formatRatio(rep.hoursEfficiency)).toBe('55%');
  });

  it('groups every project under a rep', () => {
    const reps = repRollup(all);
    expect(reps.length).toBeGreaterThan(1);
    expect(reps.reduce((sum, r) => sum + r.projects, 0)).toBe(all.length);
    for (const rep of reps) expect(rep.projectList.every((p) => (p.owner ?? 'Unassigned') === rep.rep)).toBe(true);
  });

  it('groups every project under an account', () => {
    const accounts = accountRollup(all);
    expect(accounts.reduce((sum, a) => sum + a.projects, 0)).toBe(all.length);
    for (const account of accounts) {
      expect(account.accountName).toBeTruthy();
      expect(account.projectList.every((p) => p.accountRecordId === account.accountRecordId)).toBe(true);
    }
  });

  it('counts active and at-risk projects separately from the total', () => {
    const reps = repRollup(all);
    for (const rep of reps) {
      expect(rep.activeProjects).toBeLessThanOrEqual(rep.projects);
      expect(rep.atRisk).toBeLessThanOrEqual(rep.activeProjects + 1);
    }
  });

  it('sorts at-risk first and unmeasurable rows last', () => {
    const rows = [
      { rep: 'clean', atRisk: 0, overdueItems: 0, deliveryReliability: 1 },
      { rep: 'nodata', atRisk: 0, overdueItems: 0, deliveryReliability: null },
      { rep: 'risky', atRisk: 2, overdueItems: 0, deliveryReliability: 1 },
      { rep: 'weak', atRisk: 0, overdueItems: 0, deliveryReliability: 0.4 },
    ].sort(compareRollups);
    expect(rows.map((r) => r.rep)).toEqual(['risky', 'weak', 'clean', 'nodata']);
  });
});

describe('formatting', () => {
  it('renders a missing rating as an em dash rather than 0%', () => {
    expect(formatRatio(null)).toBe('—');
    expect(formatRatio(0)).toBe('0%');
    expect(formatRatio(1.125)).toBe('113%');
  });

  it('trims float noise off summed quarter-hours', () => {
    expect(formatHours(3.4999999999)).toBe('3.5');
    expect(formatHours(0)).toBe('0');
    expect(formatHours(null)).toBe('—');
  });

  it('is generous about what counts as good — estimates are estimates', () => {
    expect(ratingTone(1.2)).toBe('good');
    expect(ratingTone(0.96)).toBe('good');
    expect(ratingTone(0.8)).toBe('warn');
    expect(ratingTone(0.5)).toBe('bad');
    expect(ratingTone(null)).toBe('neutral');
  });
});
