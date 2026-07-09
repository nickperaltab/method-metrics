import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/bigquery', () => ({
  queryBq: vi.fn(),
}));

import {
  fetchIntakeMix, fetchAttachByCohort, fetchIntakeBenchmark,
  toQuarterSeries, attachMaturity,
} from '../../src/lib/intakeMixData.js';
import { queryBq } from '../../src/lib/bigquery.js';

describe('fetchIntakeMix', () => {
  beforeEach(() => vi.clearAllMocks());

  // BQ's REST API returns all values as strings; n must become a real number.
  it('coerces n to a number and keeps quarter/band as strings', async () => {
    queryBq.mockResolvedValue({ rows: [{ quarter: '2024-01-01', band: '$5M+', n: '42' }] });
    const [r] = await fetchIntakeMix({ population: 'trials', startDate: '2024-01-01' });
    expect(r).toEqual({ quarter: '2024-01-01', band: '$5M+', n: 42 });
  });
});

describe('fetchAttachByCohort', () => {
  beforeEach(() => vi.clearAllMocks());

  it('coerces attach counts to numbers', async () => {
    queryBq.mockResolvedValue({
      rows: [{ cohort_quarter: '2024-01-01', new_customers: '100', attached_90d: '25', attached_180d: '40' }],
    });
    const [r] = await fetchAttachByCohort({ startDate: '2024-01-01' });
    expect(r.new_customers).toBe(100);
    expect(r.attached_90d).toBe(25);
    expect(r.attached_180d).toBe(40);
  });
});

describe('fetchIntakeBenchmark', () => {
  beforeEach(() => vi.clearAllMocks());

  it('coerces the single benchmark row to numbers', async () => {
    queryBq.mockResolvedValue({
      rows: [{ n: '949', avg_mrr: '576', pct_5m_plus: '42.5', pct_customized: '84', pct_mnd: '47.8' }],
    });
    const out = await fetchIntakeBenchmark({ month: '2026-06-01' });
    expect(out).toEqual({ n: 949, avg_mrr: 576, pct_5m_plus: 42.5, pct_customized: 84, pct_mnd: 47.8 });
  });

  it('returns null when there are no rows', async () => {
    queryBq.mockResolvedValue({ rows: [] });
    expect(await fetchIntakeBenchmark({ month: '2026-06-01' })).toBeNull();
  });
});

describe('toQuarterSeries', () => {
  it('pivots rows into per-quarter band totals sorted ascending', () => {
    const rows = [
      { quarter: '2024-04-01', band: '$5M+', n: 5 },
      { quarter: '2024-01-01', band: '$5M+', n: 10 },
      { quarter: '2024-01-01', band: '<$1M', n: 20 },
      { quarter: '2024-01-01', band: 'No data', n: 4 },
    ];
    const out = toQuarterSeries(rows, '2025-01-15');
    expect(out.map((r) => r.quarter)).toEqual(['2024-01-01', '2024-04-01']);
    expect(out[0].label).toBe('Q1 2024');
    expect(out[0].total).toBe(34);
    expect(out[0].bands).toEqual({ '<$1M': 20, '$1M–$5M': 0, '$5M+': 10, 'No data': 4 });
    expect(out[1].label).toBe('Q2 2024');
  });

  it('labels the quarter containing today as QTD', () => {
    // today in Q3 2026 → the 2026-07-01 quarter is QTD
    const rows = [{ quarter: '2026-07-01', band: '$5M+', n: 1 }];
    const out = toQuarterSeries(rows, '2026-08-10');
    expect(out[0].label).toBe('Q3 2026 (QTD)');
  });

  it('handles null/empty input', () => {
    expect(toQuarterSeries(null, '2026-01-01')).toEqual([]);
    expect(toQuarterSeries([], '2026-01-01')).toEqual([]);
  });
});

describe('attachMaturity', () => {
  // Q1 2024 = Jan–Mar; quarter end = 2024-03-31.
  //   90d threshold  = 2024-06-29
  //   180d threshold = 2024-09-27
  it('is mature exactly at quarter-end + window days (boundary)', () => {
    // exactly on the 90d threshold → mature
    expect(attachMaturity('2024-01-01', '2024-06-29').mature90).toBe(true);
    // one day before → not mature
    expect(attachMaturity('2024-01-01', '2024-06-28').mature90).toBe(false);
    // exactly on the 180d threshold → mature
    expect(attachMaturity('2024-01-01', '2024-09-27').mature180).toBe(true);
    expect(attachMaturity('2024-01-01', '2024-09-26').mature180).toBe(false);
  });

  it('a recent cohort is immature for both windows', () => {
    const m = attachMaturity('2026-04-01', '2026-05-01');
    expect(m.mature90).toBe(false);
    expect(m.mature180).toBe(false);
  });
});
