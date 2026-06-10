import { describe, it, expect } from 'vitest';
import { normalizeFunnel, isCohortMature } from '../../src/lib/funnelTransform.js';

describe('normalizeFunnel', () => {
  it('builds stages with counts, % of trials, and drop-off to next', () => {
    const stages = normalizeFunnel({ trials: 1000, synced: 620, converted: 185 });
    expect(stages.map(s => s.key)).toEqual(['trial', 'synced', 'converted']);
    expect(stages[0]).toMatchObject({ count: 1000, pctOfTrials: 1, dropToNext: 0.38 });
    expect(stages[1]).toMatchObject({ count: 620, pctOfTrials: 0.62 });
    expect(stages[2]).toMatchObject({ count: 185, pctOfTrials: 0.185, dropToNext: null });
  });
  it('guards divide-by-zero on an empty cohort', () => {
    const stages = normalizeFunnel({ trials: 0, synced: 0, converted: 0 });
    expect(stages[0].pctOfTrials).toBe(0);
    expect(stages[0].dropToNext).toBe(0);
  });
});

describe('isCohortMature', () => {
  it('is false for a cohort younger than the maturity window', () => {
    expect(isCohortMature('2026-06-01', '2026-06-10', 90)).toBe(false);
    expect(isCohortMature('2026-01-01', '2026-06-10', 90)).toBe(true);
  });
});
