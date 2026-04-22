// builder/tests/unit/kpi-dimension-filter.test.js
import { describe, it, expect } from 'vitest';
import { resolveKpiValue, resolveFilteredKpiSeries } from '../../src/components/scorecards/utils.js';

describe('resolveFilteredKpiSeries', () => {
  const grouped = {
    labels: ['2026-02', '2026-03', '2026-04'],
    seriesMap: {
      'Solo no DEP':  [10, 11, 12],
      '2-3 no DEP':   [20, 22, 24],
      '4+ no DEP':    [30, 33, 36],
      'Team AI Plus': [40, 44, 48],
    },
  };

  it('returns the matching series as {labels, data}', () => {
    const s = resolveFilteredKpiSeries(grouped, { Segment: 'Solo no DEP' });
    expect(s).toEqual({ labels: ['2026-02', '2026-03', '2026-04'], data: [10, 11, 12] });
  });

  it('returns null when the dimension value is absent from the grouped series', () => {
    const s = resolveFilteredKpiSeries(grouped, { Segment: 'NonexistentSegment' });
    expect(s).toBeNull();
  });

  it('returns null when grouped payload is missing', () => {
    expect(resolveFilteredKpiSeries(undefined, { Segment: 'Solo no DEP' })).toBeNull();
    expect(resolveFilteredKpiSeries(null,       { Segment: 'Solo no DEP' })).toBeNull();
  });

  it('integrates with resolveKpiValue — current_or_latest picks last data point of filtered series', () => {
    const s = resolveFilteredKpiSeries(grouped, { Segment: 'Team AI Plus' });
    expect(resolveKpiValue(s, 'current_or_latest')).toBe(48);
  });
});
