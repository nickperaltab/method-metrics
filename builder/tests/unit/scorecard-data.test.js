import { describe, it, expect } from 'vitest';

const { topoSortDerived } = await import('../../src/hooks/useScorecardData.js');

describe('topoSortDerived', () => {
  it('sorts derived metrics so dependencies are computed first', () => {
    const metrics = [
      // 363 depends on 300 and 361 (both derived)
      { id: 363, formula: '{300} - {361}', depends_on: [300, 361] },
      // 361 depends on 286 and 285 (primitives, not in this list)
      { id: 361, formula: 'SAFE_DIVIDE({286}, {285}) * 100', depends_on: [286, 285] },
      // 300 depends on 55 and 54 (primitives, not in this list)
      { id: 300, formula: 'SAFE_DIVIDE({55}, {54}) * 100', depends_on: [55, 54] },
    ];

    const sorted = topoSortDerived(metrics);
    const ids = sorted.map(m => m.id);

    // 300 and 361 must come before 363
    expect(ids.indexOf(300)).toBeLessThan(ids.indexOf(363));
    expect(ids.indexOf(361)).toBeLessThan(ids.indexOf(363));
  });

  it('handles flat list with no inter-derived dependencies', () => {
    const metrics = [
      { id: 300, formula: 'SAFE_DIVIDE({55}, {54}) * 100', depends_on: [55, 54] },
      { id: 301, formula: 'SAFE_DIVIDE({56}, {55}) * 100', depends_on: [56, 55] },
    ];

    const sorted = topoSortDerived(metrics);
    expect(sorted).toHaveLength(2);
    // Both should be present, order doesn't matter
    expect(sorted.map(m => m.id).sort()).toEqual([300, 301]);
  });

  it('handles empty list', () => {
    expect(topoSortDerived([])).toEqual([]);
  });

  it('handles single metric', () => {
    const metrics = [{ id: 300, formula: '{55}', depends_on: [55] }];
    const sorted = topoSortDerived(metrics);
    expect(sorted).toEqual(metrics);
  });

  it('handles multi-level chain: A → B → C', () => {
    const metrics = [
      { id: 3, formula: '{2}', depends_on: [2] },    // depends on 2
      { id: 1, formula: '{99}', depends_on: [99] },   // depends on primitive only
      { id: 2, formula: '{1}', depends_on: [1] },     // depends on 1
    ];

    const sorted = topoSortDerived(metrics);
    const ids = sorted.map(m => m.id);

    expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(2));
    expect(ids.indexOf(2)).toBeLessThan(ids.indexOf(3));
  });
});
