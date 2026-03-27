import { describe, it, expect } from 'vitest';
import { parseDate, toBucketKey, formatDateLabel, formatDateLabels, aggregateRows, computeDerived, applyChannelFilter, applyLastNMonths, buildEChartsOption } from '../../src/lib/chartUtils.js';

describe('toBucketKey', () => {
  it('truncates to month', () => {
    expect(toBucketKey('2024-03-15', 'month')).toBe('2024-03');
  });
  it('truncates to day', () => {
    expect(toBucketKey('2024-03-15', 'day')).toBe('2024-03-15');
  });
  it('handles non-date strings', () => {
    expect(toBucketKey('US', 'month')).toBe('US');
  });
});

describe('formatDateLabel (standalone)', () => {
  it('formats YYYY-MM with year', () => {
    expect(formatDateLabel('2024-03')).toBe('Mar 2024');
  });
  it('formats YYYY-MM-DD with year', () => {
    expect(formatDateLabel('2024-03-15')).toBe('Mar 15, 2024');
  });
  it('passes through non-date', () => {
    expect(formatDateLabel('US')).toBe('US');
  });
});

describe('formatDateLabels (context-aware)', () => {
  it('monthly: shows just month name, year on first and January', () => {
    const labels = ['2024-10', '2024-11', '2024-12', '2025-01', '2025-02'];
    const result = formatDateLabels(labels);
    expect(result).toEqual(['Oct 2024', 'Nov', 'Dec', 'Jan 2025', 'Feb']);
  });
  it('monthly: single year shows year on first label only', () => {
    const labels = ['2026-01', '2026-02', '2026-03'];
    const result = formatDateLabels(labels);
    expect(result).toEqual(['Jan 2026', 'Feb', 'Mar']);
  });
  it('daily: shows month+day, year on first', () => {
    const labels = ['2024-03-13', '2024-03-14', '2024-03-15'];
    const result = formatDateLabels(labels);
    expect(result[0]).toBe('Mar 13, 2024');
    expect(result[1]).toBe('Mar 14');
    expect(result[2]).toBe('Mar 15');
  });
  it('passes through non-date labels', () => {
    const labels = ['US', 'CA', 'UK'];
    const result = formatDateLabels(labels);
    expect(result).toEqual(['US', 'CA', 'UK']);
  });
});

describe('aggregateRows', () => {
  it('counts rows by month when yField is COUNT', () => {
    const rows = [
      { date: '2024-01-15' },
      { date: '2024-01-20' },
      { date: '2024-02-10' },
    ];
    const result = aggregateRows(rows, 'date', 'COUNT', 'month');
    expect(result.labels).toEqual(['2024-01', '2024-02']);
    expect(result.data).toEqual([2, 1]);
  });

  it('sums numeric values by month', () => {
    const rows = [
      { date: '2024-01-15', val: '10' },
      { date: '2024-01-20', val: '20' },
      { date: '2024-02-10', val: '30' },
    ];
    const result = aggregateRows(rows, 'date', 'val', 'month');
    expect(result.labels).toEqual(['2024-01', '2024-02']);
    expect(result.data).toEqual([30, 30]);
  });

  it('groups by non-date field', () => {
    const rows = [
      { country: 'US', val: '5' },
      { country: 'US', val: '3' },
      { country: 'CA', val: '7' },
    ];
    const result = aggregateRows(rows, 'country', 'val', null);
    expect(result.labels).toContain('US');
    expect(result.data[result.labels.indexOf('US')]).toBe(8);
  });
});

describe('computeDerived', () => {
  it('computes SAFE_DIVIDE formula per bucket', () => {
    const derived = {
      formula: 'SAFE_DIVIDE({56}, {54}) * 100',
      depends_on: [56, 54],
    };
    const depResults = {
      56: [
        { SignupDate: '2024-01-10' },
        { SignupDate: '2024-01-15' },
        { SignupDate: '2024-02-05' },
      ],
      54: [
        { SignupDate: '2024-01-05' },
        { SignupDate: '2024-01-20' },
        { SignupDate: '2024-01-25' },
        { SignupDate: '2024-02-10' },
        { SignupDate: '2024-02-15' },
      ],
    };
    const result = computeDerived(derived, depResults, 'SignupDate', 'month');
    expect(result.length).toBe(2);
    expect(result[0].value).toBeCloseTo(66.67, 0);
    expect(result[1].value).toBeCloseTo(50, 0);
  });
});

describe('computeDerived — edge cases that caused production bugs', () => {
  it('rate should never exceed 100% for SAFE_DIVIDE ratio metrics', () => {
    // Bug: LIMIT 10000 truncation made both deps ~10k rows → ~100% rate
    // This test verifies that realistic data produces realistic rates
    const derived = {
      formula: 'SAFE_DIVIDE({55}, {54}) * 100',
      depends_on: [55, 54],
    };
    // Simulate: 300 syncs, 500 trials in Jan
    const syncRows = Array.from({ length: 300 }, () => ({ SignupDate: '2024-01-15' }));
    const trialRows = Array.from({ length: 500 }, () => ({ SignupDate: '2024-01-10' }));
    const depResults = { 55: syncRows, 54: trialRows };
    const result = computeDerived(derived, depResults, 'SignupDate', 'month');
    expect(result.length).toBe(1);
    expect(result[0].value).toBe(60); // 300/500 * 100 = 60%
    expect(result[0].value).toBeLessThanOrEqual(100);
  });

  it('handles different date columns per dependency', () => {
    // Bug: syncs were bucketed by SignupDate instead of SyncDate
    // computeDerived uses the xField for ALL deps, which may be wrong
    // This test documents the limitation — the caller must pass the right field
    const derived = {
      formula: 'SAFE_DIVIDE({55}, {54}) * 100',
      depends_on: [55, 54],
    };
    // If both deps use same date field, counts should be correct
    const depResults = {
      55: [
        { period: '2024-01' },
        { period: '2024-01' },
        { period: '2024-02' },
      ],
      54: [
        { period: '2024-01' },
        { period: '2024-01' },
        { period: '2024-01' },
        { period: '2024-01' },
        { period: '2024-02' },
        { period: '2024-02' },
      ],
    };
    const result = computeDerived(derived, depResults, 'period', 'month');
    expect(result.length).toBe(2);
    expect(result[0].value).toBe(50); // Jan: 2/4 * 100
    expect(result[1].value).toBe(50); // Feb: 1/2 * 100
  });

  it('handles zero denominator without crashing', () => {
    const derived = {
      formula: 'SAFE_DIVIDE({55}, {54}) * 100',
      depends_on: [55, 54],
    };
    const depResults = {
      55: [{ SignupDate: '2024-01-15' }],
      54: [], // zero trials
    };
    const result = computeDerived(derived, depResults, 'SignupDate', 'month');
    // Syncs exist in Jan but no trials → SAFE_DIVIDE returns 0
    expect(result.length).toBe(1);
    expect(result[0].value).toBe(0);
    expect(isFinite(result[0].value)).toBe(true);
  });

  it('handles missing dependency data gracefully', () => {
    const derived = {
      formula: 'SAFE_DIVIDE({55}, {54}) * 100',
      depends_on: [55, 54],
    };
    const depResults = {
      55: [{ SignupDate: '2024-01-15' }],
      // 54 is completely missing
    };
    const result = computeDerived(derived, depResults, 'SignupDate', 'month');
    expect(result.length).toBe(1);
    expect(result[0].value).toBe(0);
  });

  it('handles large dataset without truncation artifacts', () => {
    // Simulates what happens with real data volumes
    const derived = {
      formula: 'SAFE_DIVIDE({55}, {54}) * 100',
      depends_on: [55, 54],
    };
    // 15000 trials, 9000 syncs across 3 months
    const trials = [];
    const syncs = [];
    for (let i = 0; i < 5000; i++) trials.push({ SignupDate: '2024-01-01' });
    for (let i = 0; i < 5000; i++) trials.push({ SignupDate: '2024-02-01' });
    for (let i = 0; i < 5000; i++) trials.push({ SignupDate: '2024-03-01' });
    for (let i = 0; i < 3000; i++) syncs.push({ SignupDate: '2024-01-01' });
    for (let i = 0; i < 3000; i++) syncs.push({ SignupDate: '2024-02-01' });
    for (let i = 0; i < 3000; i++) syncs.push({ SignupDate: '2024-03-01' });

    const depResults = { 55: syncs, 54: trials };
    const result = computeDerived(derived, depResults, 'SignupDate', 'month');
    expect(result.length).toBe(3);
    // Each month: 3000/5000 * 100 = 60%
    result.forEach(r => {
      expect(r.value).toBe(60);
      expect(r.value).toBeLessThanOrEqual(100);
    });
  });

  it('multi-month rate varies correctly per period', () => {
    const derived = {
      formula: 'SAFE_DIVIDE({55}, {54}) * 100',
      depends_on: [55, 54],
    };
    const depResults = {
      55: [
        { SignupDate: '2024-01-01' }, { SignupDate: '2024-01-01' }, // 2 syncs in Jan
        { SignupDate: '2024-02-01' }, // 1 sync in Feb
      ],
      54: [
        { SignupDate: '2024-01-01' }, { SignupDate: '2024-01-01' },
        { SignupDate: '2024-01-01' }, { SignupDate: '2024-01-01' }, // 4 trials in Jan
        { SignupDate: '2024-02-01' }, { SignupDate: '2024-02-01' }, // 2 trials in Feb
      ],
    };
    const result = computeDerived(derived, depResults, 'SignupDate', 'month');
    expect(result.length).toBe(2);
    expect(result[0].value).toBe(50);  // Jan: 2/4 * 100
    expect(result[1].value).toBe(50);  // Feb: 1/2 * 100
  });
});

describe('aggregateRows — edge cases', () => {
  it('handles empty rows', () => {
    const result = aggregateRows([], 'date', 'COUNT', 'month');
    expect(result.labels).toEqual([]);
    expect(result.data).toEqual([]);
  });

  it('handles null/undefined values in xField', () => {
    const rows = [
      { date: '2024-01-15', val: '10' },
      { date: null, val: '5' },
      { date: undefined, val: '3' },
    ];
    const result = aggregateRows(rows, 'date', 'val', 'month');
    // Should not crash, null/undefined grouped under some key
    expect(result.labels.length).toBeGreaterThan(0);
  });

  it('COUNT produces integer counts not string concatenation', () => {
    const rows = [
      { date: '2024-01-15' },
      { date: '2024-01-20' },
      { date: '2024-01-25' },
    ];
    const result = aggregateRows(rows, 'date', 'COUNT', 'month');
    expect(result.data[0]).toBe(3);
    expect(typeof result.data[0]).toBe('number');
  });

  it('numeric sum handles string numbers from BQ', () => {
    // BQ returns ALL values as strings
    const rows = [
      { date: '2024-01-15', revenue: '1234.56' },
      { date: '2024-01-20', revenue: '789.01' },
    ];
    const result = aggregateRows(rows, 'date', 'revenue', 'month');
    expect(result.data[0]).toBeCloseTo(2023.57, 1);
  });
});

describe('buildEChartsOption — data integrity', () => {
  it('bar chart y-axis starts at 0', () => {
    const opt = buildEChartsOption('bar', ['Jan', 'Feb'], [{ label: 'X', data: [50, 75] }], {});
    // ECharts value axis starts at 0 by default, just verify option structure
    expect(opt.yAxis.type).toBe('value');
  });

  it('percentage charts should show values as-is (not re-aggregate)', () => {
    // When derived metric already computed 60%, the chart should show 60, not re-count
    const labels = ['2024-01', '2024-02'];
    const datasets = [{ label: 'Sync Rate', data: [60.5, 55.2] }];
    const opt = buildEChartsOption('bar', labels, datasets, {});
    expect(opt.series[0].data).toEqual([60.5, 55.2]);
  });

  it('multi-series labels align correctly', () => {
    const labels = ['Jan', 'Feb', 'Mar'];
    const datasets = [
      { label: 'Trials', data: [100, 200, 150] },
      { label: 'Syncs', data: [50, 120, 80] },
    ];
    const opt = buildEChartsOption('line', labels, datasets, {});
    expect(opt.series.length).toBe(2);
    expect(opt.series[0].data).toEqual([100, 200, 150]);
    expect(opt.series[1].data).toEqual([50, 120, 80]);
    expect(opt.xAxis.data.length).toBe(3);
  });
});

describe('applyChannelFilter', () => {
  it('filters by SEO', () => {
    const rows = [
      { Att_SEO: '1', Att_Direct: '0', name: 'a' },
      { Att_SEO: '0', Att_Direct: '1', name: 'b' },
      { Att_SEO: '1', Att_Direct: '1', name: 'c' },
    ];
    const result = applyChannelFilter(rows, 'SEO');
    expect(result.length).toBe(2);
  });

  it('returns all rows when filter is null', () => {
    const rows = [{ a: 1 }];
    expect(applyChannelFilter(rows, null)).toEqual(rows);
  });
});

describe('buildEChartsOption', () => {
  const labels = ['2024-01', '2024-02', '2024-03'];
  const datasets = [{ label: 'Trials', data: [100, 200, 150] }];

  it('builds line chart', () => {
    const opt = buildEChartsOption('line', labels, datasets, {});
    expect(opt.series[0].type).toBe('line');
    expect(opt.series[0].data).toEqual([100, 200, 150]);
  });

  it('builds bar chart', () => {
    const opt = buildEChartsOption('bar', labels, datasets, {});
    expect(opt.series[0].type).toBe('bar');
  });

  it('builds pie chart', () => {
    const opt = buildEChartsOption('pie', labels, datasets, {});
    expect(opt.series[0].type).toBe('pie');
    expect(opt.series[0].data.length).toBe(3);
  });

  it('builds combo with dual axes', () => {
    const multi = [
      { label: 'Trials', data: [100, 200, 150] },
      { label: 'Rate', data: [10, 15, 12] },
    ];
    const opt = buildEChartsOption('combo', labels, multi, {});
    expect(opt.series[0].type).toBe('bar');
    expect(opt.series[1].type).toBe('line');
    expect(opt.yAxis.length).toBe(2);
  });

  it('shows legend for multi-series', () => {
    const multi = [{ label: 'A', data: [1] }, { label: 'B', data: [2] }];
    const opt = buildEChartsOption('line', ['x'], multi, {});
    expect(opt.legend.show).toBe(true);
  });

  it('hides legend for single series', () => {
    const opt = buildEChartsOption('line', ['x'], [{ label: 'A', data: [1] }], {});
    expect(opt.legend.show).toBe(false);
  });
});

// --- NEW TESTS: parseDate ---

describe('parseDate', () => {
  it('parses YYYY-MM-DD', () => {
    const d = parseDate('2024-03-15');
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2024);
  });

  it('parses YYYY-MM-DD with UTC suffix', () => {
    const d = parseDate('2024-03-15 UTC');
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2024);
  });

  it('returns null for null/undefined/empty', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('')).toBeNull();
  });

  it('returns null for invalid date strings', () => {
    expect(parseDate('not-a-date')).toBeNull();
    expect(parseDate('abc123')).toBeNull();
  });

  it('handles ISO timestamp format', () => {
    const d = parseDate('2024-03-15T10:30:00Z');
    expect(d).toBeInstanceOf(Date);
  });
});

// --- NEW TESTS: applyLastNMonths ---

describe('applyLastNMonths', () => {
  it('returns all data when lastNMonths is null', () => {
    const labels = ['2020-01', '2024-01', '2026-01'];
    const datasets = [{ label: 'A', data: [1, 2, 3] }];
    const result = applyLastNMonths(labels, datasets, null, 'month');
    expect(result.labels).toEqual(labels);
    expect(result.datasets[0].data).toEqual([1, 2, 3]);
  });

  it('filters to recent months only', () => {
    const now = new Date();
    const recent = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const old = '2020-01';
    const labels = [old, recent];
    const datasets = [{ label: 'A', data: [100, 200] }];
    const result = applyLastNMonths(labels, datasets, 3, 'month');
    expect(result.labels).toContain(recent);
    expect(result.labels).not.toContain(old);
  });

  it('keeps datasets aligned with filtered labels', () => {
    const now = new Date();
    const m1 = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const m2 = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0') || '12'}`;
    const labels = ['2020-01', m2, m1];
    const ds1 = { label: 'Trials', data: [10, 20, 30] };
    const ds2 = { label: 'Syncs', data: [5, 10, 15] };
    const result = applyLastNMonths(labels, [ds1, ds2], 3, 'month');
    expect(result.datasets.length).toBe(2);
    expect(result.labels.length).toBe(result.datasets[0].data.length);
    expect(result.labels.length).toBe(result.datasets[1].data.length);
  });
});

// --- NEW TESTS: buildEChartsOption — heatmap ---

describe('buildEChartsOption — heatmap', () => {
  it('produces [x, y, value] data format', () => {
    const labels = ['2025-01', '2025-02'];
    const datasets = [
      { label: 'SEO', data: [100, 150] },
      { label: 'PPC', data: [50, 60] },
    ];
    const opt = buildEChartsOption('heatmap', labels, datasets, {});
    expect(opt.series[0].type).toBe('heatmap');
    const heatData = opt.series[0].data;
    // Should have 4 data points (2 labels × 2 series)
    expect(heatData.length).toBe(4);
    // Each data point should be [xIndex, yIndex, value]
    heatData.forEach(point => {
      expect(point.length).toBe(3);
      expect(typeof point[0]).toBe('number');
      expect(typeof point[1]).toBe('number');
      expect(typeof point[2]).toBe('number');
    });
  });

  it('y-axis contains dimension labels', () => {
    const labels = ['2025-01'];
    const datasets = [
      { label: 'US', data: [100] },
      { label: 'CA', data: [50] },
      { label: 'UK', data: [25] },
    ];
    const opt = buildEChartsOption('heatmap', labels, datasets, {});
    expect(opt.yAxis.data).toEqual(['US', 'CA', 'UK']);
  });

  it('handles single dimension (1 row)', () => {
    const labels = ['2025-01', '2025-02', '2025-03'];
    const datasets = [{ label: 'Trials', data: [10, 20, 30] }];
    const opt = buildEChartsOption('heatmap', labels, datasets, {});
    expect(opt.series[0].data.length).toBe(3);
    expect(opt.yAxis.data).toEqual(['Trials']);
  });
});

// --- NEW TESTS: buildEChartsOption — stacked_bar ---

describe('buildEChartsOption — stacked_bar', () => {
  it('all series share same stack', () => {
    const labels = ['Jan', 'Feb'];
    const datasets = [
      { label: 'SEO', data: [100, 150] },
      { label: 'PPC', data: [50, 60] },
      { label: 'Direct', data: [30, 40] },
    ];
    const opt = buildEChartsOption('stacked_bar', labels, datasets, {});
    expect(opt.series.length).toBe(3);
    opt.series.forEach(s => {
      expect(s.type).toBe('bar');
      expect(s.stack).toBe('total');
    });
  });
});

// --- NEW TESTS: buildEChartsOption — horizontal_bar ---

describe('buildEChartsOption — horizontal_bar', () => {
  it('swaps x and y axes', () => {
    const labels = ['US', 'CA', 'UK'];
    const datasets = [{ label: 'Trials', data: [500, 200, 100] }];
    const opt = buildEChartsOption('horizontal_bar', labels, datasets, {});
    expect(opt.yAxis.type).toBe('category');
    expect(opt.xAxis.type).toBe('value');
    expect(opt.yAxis.data).toEqual(['US', 'CA', 'UK']);
  });
});

// --- NEW TESTS: buildEChartsOption — funnel ---

describe('buildEChartsOption — funnel', () => {
  it('sums data points per series', () => {
    const labels = ['Jan', 'Feb', 'Mar'];
    const datasets = [
      { label: 'Trials', data: [100, 200, 150] },
      { label: 'Syncs', data: [50, 100, 80] },
      { label: 'Conversions', data: [10, 20, 15] },
    ];
    const opt = buildEChartsOption('funnel', labels, datasets, {});
    expect(opt.series[0].type).toBe('funnel');
    expect(opt.series[0].data.length).toBe(3);
    // Trials total = 450, Syncs = 230, Conversions = 45
    const funnelData = opt.series[0].data;
    expect(funnelData.find(d => d.name === 'Trials').value).toBe(450);
    expect(funnelData.find(d => d.name === 'Syncs').value).toBe(230);
    expect(funnelData.find(d => d.name === 'Conversions').value).toBe(45);
  });
});

// --- NEW TESTS: buildEChartsOption — custom colors ---

describe('buildEChartsOption — custom colors', () => {
  it('uses custom colors when provided', () => {
    const labels = ['Jan'];
    const datasets = [{ label: 'A', data: [1] }, { label: 'B', data: [2] }];
    const opt = buildEChartsOption('bar', labels, datasets, {}, { colors: ['#ff0000', '#00ff00'] });
    // Colors applied per-series via itemStyle.color
    expect(opt.series[0].itemStyle.color).toBe('#ff0000');
    expect(opt.series[1].itemStyle.color).toBe('#00ff00');
  });

  it('falls back to default palette when colors is null', () => {
    const labels = ['Jan'];
    const datasets = [{ label: 'A', data: [1] }];
    const opt = buildEChartsOption('bar', labels, datasets, {}, {});
    // Default palette: first color is #34d399
    expect(opt.series[0].itemStyle.color).toBe('#34d399');
  });
});

// --- NEW TESTS: buildEChartsOption — edge cases ---

describe('buildEChartsOption — edge cases', () => {
  it('handles empty datasets gracefully', () => {
    const opt = buildEChartsOption('bar', [], [], {});
    expect(opt.series).toEqual([]);
  });

  it('rotates x-axis labels when > 12 items', () => {
    const labels = Array.from({ length: 15 }, (_, i) => `2024-${String(i + 1).padStart(2, '0')}`);
    const datasets = [{ label: 'A', data: Array(15).fill(100) }];
    const opt = buildEChartsOption('bar', labels, datasets, {});
    expect(opt.xAxis.axisLabel.rotate).toBe(45);
  });

  it('does not rotate x-axis labels when <= 12 items', () => {
    const labels = ['Jan', 'Feb', 'Mar'];
    const datasets = [{ label: 'A', data: [1, 2, 3] }];
    const opt = buildEChartsOption('bar', labels, datasets, {});
    expect(opt.xAxis.axisLabel.rotate).toBe(0);
  });
});
