import { describe, it, expect } from 'vitest';
import { toBucketKey, formatDateLabel, aggregateRows, computeDerived, applyChannelFilter, applyLastNMonths, buildEChartsOption } from '../../src/lib/chartUtils.js';

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

describe('formatDateLabel', () => {
  it('formats YYYY-MM', () => {
    expect(formatDateLabel('2024-03')).toBe("Mar '24");
  });
  it('formats YYYY-MM-DD', () => {
    expect(formatDateLabel('2024-03-15')).toBe("Mar 15, '24");
  });
  it('passes through non-date', () => {
    expect(formatDateLabel('US')).toBe('US');
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
