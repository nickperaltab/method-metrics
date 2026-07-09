import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/bigquery', () => ({
  queryBq: vi.fn(),
}));

import {
  fetchIntakeMix, fetchAttachByCohort, fetchIntakeBenchmark,
  fetchIntakeQuality, fetchConvertRateByBand, fetchGrowthByCohort,
  fetchSleepingGiants, fetchGiantsPeerBenchmark,
  toQuarterSeries, attachMaturity, convertMaturity,
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

describe('convertMaturity', () => {
  // Q1 2024 = Jan–Mar; quarter end = 2024-03-31; +365d = 2025-03-31.
  it('is mature exactly at quarter-end + 365 days (boundary)', () => {
    expect(convertMaturity('2024-01-01', '2025-03-31')).toBe(true);
    expect(convertMaturity('2024-01-01', '2025-03-30')).toBe(false);
  });

  it('a quarter under 12 months old is immature', () => {
    expect(convertMaturity('2026-04-01', '2026-08-01')).toBe(false);
  });
});

describe('fetchIntakeQuality', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes percentages client-side and coerces counts', async () => {
    queryBq.mockResolvedValue({
      rows: [{
        quarter: '2024-01-01', trials: '100', trials_1m_plus: '40', trials_5m_plus: '10',
        converts: '20', converts_5m_plus: '5', avg_mrr_at_convert: '350',
      }],
    });
    const [r] = await fetchIntakeQuality({ startDate: '2024-01-01', todayIso: '2026-07-01' });
    expect(r.trials).toBe(100);
    expect(r.pct_trials_1m).toBe(40);
    expect(r.pct_trials_5m).toBe(10);
    expect(r.pct_converts_5m).toBe(25);
    expect(r.avg_mrr_at_convert).toBe(350);
    expect(r.convert_mature).toBe(true); // Q1 2024 fully mature by mid-2026
  });

  it('guards zero denominators to null (no divide by zero)', async () => {
    queryBq.mockResolvedValue({
      rows: [{ quarter: '2026-07-01', trials: '0', trials_1m_plus: '0', trials_5m_plus: '0', converts: '0', converts_5m_plus: '0', avg_mrr_at_convert: '0' }],
    });
    const [r] = await fetchIntakeQuality({ startDate: '2024-01-01', todayIso: '2026-08-01' });
    expect(r.pct_trials_1m).toBeNull();
    expect(r.pct_trials_5m).toBeNull();
    expect(r.pct_converts_5m).toBeNull();
    expect(r.convert_mature).toBe(false); // Q3 2026 still maturing
  });
});

describe('fetchConvertRateByBand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pivots to per-quarter band maps with rate computed client-side', async () => {
    queryBq.mockResolvedValue({
      rows: [
        { quarter: '2024-01-01', band: '$5M+', trials: '20', converts: '10' },
        { quarter: '2024-01-01', band: '<$1M', trials: '0', converts: '0' },
      ],
    });
    const out = await fetchConvertRateByBand({ startDate: '2024-01-01', todayIso: '2026-07-01' });
    expect(out).toHaveLength(1);
    expect(out[0].bands['$5M+']).toEqual({ trials: 20, converts: 10, rate: 50 });
    expect(out[0].bands['<$1M'].rate).toBeNull(); // zero-denominator guard
    expect(out[0].convert_mature).toBe(true);
  });
});

describe('fetchGrowthByCohort', () => {
  beforeEach(() => vi.clearAllMocks());

  it('coerces counts and exposes pct_grew / pct_gone / median_multiple + maturity', async () => {
    queryBq.mockResolvedValue({
      rows: [{ cohort_quarter: '2024-01-01', band: '$5M+', converts: '100', grew_10pct: '43', gone: '40', median_mrr_multiple: '1.55' }],
    });
    const [r] = await fetchGrowthByCohort({ startDate: '2024-01-01', nowMonth: '2026-06-01', todayIso: '2026-07-01' });
    expect(r.converts).toBe(100);
    expect(r.pct_grew).toBe(43);
    expect(r.pct_gone).toBe(40);
    expect(r.median_multiple).toBe(1.55);
    expect(r.mature).toBe(true);
  });
});

describe('fetchSleepingGiants', () => {
  beforeEach(() => vi.clearAllMocks());

  // BQ returns booleans as 'true'/'false' strings — 'false' is truthy, so a
  // naive Boolean() coercion would mark every non-US giant as US.
  it('coerces numbers and parses is_us/is_customized via string compare', async () => {
    queryBq.mockResolvedValue({
      rows: [{
        Company: 'Acme Co', EntityRecordID: '9001', mrr: '99', sales: '7500000',
        is_us: 'false', is_customized: 'true', l1: 'Manufacturing & Distribution',
        tenure_years: '3', account_count: '2',
      }],
    });
    const [r] = await fetchSleepingGiants({ nowMonth: '2026-06-01', minSales: 5000000, maxMrr: 219 });
    expect(r.company).toBe('Acme Co');
    expect(r.mrr).toBe(99);
    expect(r.sales).toBe(7500000);
    expect(r.is_us).toBe(false); // 'false' string must NOT become true
    expect(r.is_customized).toBe(true);
    expect(r.account_count).toBe(2);
    expect(r.tenure_years).toBe(3);
  });

  it('parses a genuine boolean true from is_us', async () => {
    queryBq.mockResolvedValue({
      rows: [{ Company: 'X', EntityRecordID: '1', mrr: '10', sales: '6000000', is_us: true, is_customized: false, l1: null, tenure_years: '0', account_count: '1' }],
    });
    const [r] = await fetchSleepingGiants({ nowMonth: '2026-06-01' });
    expect(r.is_us).toBe(true);
    expect(r.is_customized).toBe(false);
    expect(r.l1).toBeNull();
  });
});

describe('fetchGiantsPeerBenchmark', () => {
  beforeEach(() => vi.clearAllMocks());

  it('coerces the single peer-benchmark row', async () => {
    queryBq.mockResolvedValue({ rows: [{ avg_peer_mrr: '778', n: '520' }] });
    expect(await fetchGiantsPeerBenchmark({ nowMonth: '2026-06-01' })).toEqual({ avg_peer_mrr: 778, n: 520 });
  });

  it('returns null when there are no rows', async () => {
    queryBq.mockResolvedValue({ rows: [] });
    expect(await fetchGiantsPeerBenchmark({ nowMonth: '2026-06-01' })).toBeNull();
  });
});
