import { describe, it, expect } from 'vitest';
import { getMonthIndices, formatMonthLabels, sliceSeries, computeGrowthSeries } from '../../src/lib/yoyUtils.js';

describe('yoyUtils', () => {
  it('normalizes mixed month inputs', () => {
    const indices = getMonthIndices(['Oct', 'november', 12, 'Jan']);
    expect(indices).toEqual([9, 10, 11, 0]);
  });

  it('defaults to all months when inputs invalid', () => {
    const indices = getMonthIndices(['NotAMonth', 0]);
    expect(indices).toHaveLength(12);
    expect(indices[0]).toBe(0);
    expect(indices[11]).toBe(11);
  });

  it('formats month labels from indices', () => {
    const labels = formatMonthLabels([0, 3, 6]);
    expect(labels).toEqual(['Jan', 'Apr', 'Jul']);
  });

  it('slices a series for selected months', () => {
    const series = Array.from({ length: 12 }, (_, i) => i + 1);
    const data = sliceSeries(series, [0, 1, 11]);
    expect(data).toEqual([1, 2, 12]);
  });

  it('computes YoY growth percentages', () => {
    const seriesMap = {
      2025: [100, 200, 0, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200],
      2026: [150, 200, 0, 200, 750, 600, 700, 1000, 900, 500, 1100, 1800],
    };
    const monthIndices = [9, 10, 11]; // Oct-Dec
    const result = computeGrowthSeries(seriesMap, ['2025', '2026'], monthIndices);
    expect(result.latest).toBe('2026');
    expect(result.prior).toBe('2025');
    // Oct: (500-1000)/1000 = -50% => -50
    // Nov: (1100-1100)/1100 = 0
    // Dec: (1800-1200)/1200 = 50%
    expect(result.data).toEqual([-50, 0, 50]);
  });

  it('returns null when not enough years', () => {
    const seriesMap = { 2025: Array(12).fill(10) };
    const res = computeGrowthSeries(seriesMap, ['2025'], [0, 1]);
    expect(res).toBeNull();
  });
});
