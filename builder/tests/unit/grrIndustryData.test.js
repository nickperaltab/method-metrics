import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/bigquery', () => ({
  queryBq: vi.fn(),
}));

import { fetchGrrAccounts } from '../../src/lib/grrIndustryData.js';
import { queryBq } from '../../src/lib/bigquery.js';

const row = (over = {}) => ({
  EntityRecordID: '123', Company: 'Acme Roofing',
  start_mrr: '100', churn_mrr: '0', downgrade_mrr: '0',
  l1: 'Field Services & Trades', l2: 'Specialty Construction', l3: null,
  operating_model: 'Project_Services', confidence: '0.9', is_multi_client: 'false',
  ...over,
});

describe('fetchGrrAccounts', () => {
  beforeEach(() => vi.clearAllMocks());

  // BQ's REST API returns BOOLs as the strings 'true'/'false'. The string
  // 'false' is truthy, which made the multi-client badge render on every
  // classified row — coercion to a real boolean is load-bearing.
  it('coerces is_multi_client string values to real booleans', async () => {
    queryBq.mockResolvedValue({
      rows: [
        row({ is_multi_client: 'false' }),
        row({ is_multi_client: 'true' }),
        row({ is_multi_client: null }), // unlabeled entity (LEFT JOIN miss)
      ],
    });
    const out = await fetchGrrAccounts({ month: '2026-06-01', filters: {} });
    expect(out.map((r) => r.is_multi_client)).toEqual([false, true, false]);
  });

  it('coerces MRR fields to numbers', async () => {
    queryBq.mockResolvedValue({ rows: [row({ start_mrr: '250.5', churn_mrr: null })] });
    const [r] = await fetchGrrAccounts({ month: '2026-06-01', filters: {} });
    expect(r.start_mrr).toBe(250.5);
    expect(r.churn_mrr).toBe(0);
    expect(r.confidence).toBe(0.9);
  });
});
