// builder/tests/unit/bigquery-retry.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

globalThis.localStorage = { getItem: () => 'fake-token', setItem: () => {}, removeItem: () => {} };

const { queryBqWithRetry, _setBqToken } = await import('../../src/lib/bigquery.js');

function bqResponse(rows, fields = [{ name: 'period' }, { name: 'value' }]) {
  return {
    ok: true, status: 200,
    json: async () => ({
      schema: { fields },
      rows: rows.map(r => ({ f: fields.map(f => ({ v: r[f.name] })) })),
    }),
  };
}

function bqEmptyResponse() {
  return {
    ok: true, status: 200,
    json: async () => ({ schema: { fields: [{ name: 'period' }, { name: 'value' }] } }),
  };
}

function bqErrorResponse(status) {
  return { ok: false, status, json: async () => ({}) };
}

describe('queryBqWithRetry', () => {
  beforeEach(() => { mockFetch.mockReset(); _setBqToken('fake-token'); });

  it('returns data on first success', async () => {
    mockFetch.mockResolvedValueOnce(bqResponse([{ period: '2026-01', value: '42' }]));
    const result = await queryBqWithRetry('SELECT 1');
    expect(result.rows).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 400 and succeeds on second attempt', async () => {
    mockFetch
      .mockResolvedValueOnce(bqErrorResponse(400))
      .mockResolvedValueOnce(bqResponse([{ period: '2026-01', value: '10' }]));
    const result = await queryBqWithRetry('SELECT 1', { baseDelay: 10 });
    expect(result.rows).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 rate limit', async () => {
    mockFetch
      .mockResolvedValueOnce(bqErrorResponse(429))
      .mockResolvedValueOnce(bqResponse([{ period: '2026-01', value: '5' }]));
    const result = await queryBqWithRetry('SELECT 1', { baseDelay: 10 });
    expect(result.rows).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on timeout message', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('BigQuery query timed out (30s). Try a narrower time range.'))
      .mockResolvedValueOnce(bqResponse([{ period: '2026-02', value: '7' }]));
    const result = await queryBqWithRetry('SELECT 1', { baseDelay: 10 });
    expect(result.rows).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on 401 — throws immediately', async () => {
    mockFetch.mockResolvedValueOnce(bqErrorResponse(401));
    await expect(queryBqWithRetry('SELECT 1')).rejects.toThrow('BQ session expired');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws after max retries exhausted', async () => {
    mockFetch
      .mockResolvedValueOnce(bqErrorResponse(400))
      .mockResolvedValueOnce(bqErrorResponse(400))
      .mockResolvedValueOnce(bqErrorResponse(400));
    await expect(queryBqWithRetry('SELECT 1', { maxRetries: 2, baseDelay: 10 }))
      .rejects.toThrow('BQ 400');
    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('retries on empty results when retryOnEmpty is true', async () => {
    mockFetch
      .mockResolvedValueOnce(bqEmptyResponse())
      .mockResolvedValueOnce(bqResponse([{ period: '2026-01', value: '5' }]));
    const result = await queryBqWithRetry('SELECT 1', { retryOnEmpty: true, baseDelay: 10 });
    expect(result.rows).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry empty results by default', async () => {
    mockFetch.mockResolvedValueOnce(bqEmptyResponse());
    const result = await queryBqWithRetry('SELECT 1', { baseDelay: 10 });
    expect(result.rows).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
