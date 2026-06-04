// builder/tests/unit/kpi-dimension-filter.test.js
import { describe, it, expect } from 'vitest';
import { resolveKpiValue, resolveFilteredKpiSeries } from '../../src/components/scorecards/utils.js';

// Build month labels relative to "now" so the resolveKpiValue integration test
// stays valid over time. resolveKpiValue('current_or_latest') only returns the
// last data point when the latest label IS the current month; if the data ends
// in a past month it intentionally returns 0 (commit 8de77a16). The original
// fixture hardcoded 2026-02..2026-04, which became past months and broke the
// "picks last data point" assertion once the clock moved past 2026-04.
function monthLabel(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const LABELS = [monthLabel(-2), monthLabel(-1), monthLabel(0)];

describe('resolveFilteredKpiSeries', () => {
  const grouped = {
    labels: LABELS,
    seriesMap: {
      'Solo no DEP':  [10, 11, 12],
      '2-3 no DEP':   [20, 22, 24],
      '4+ no DEP':    [30, 33, 36],
      'Team AI Plus': [40, 44, 48],
    },
  };

  it('returns the matching series as {labels, data}', () => {
    const s = resolveFilteredKpiSeries(grouped, { Segment: 'Solo no DEP' });
    expect(s).toEqual({ labels: LABELS, data: [10, 11, 12] });
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
