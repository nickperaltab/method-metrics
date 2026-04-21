// builder/tests/unit/batch-queries.test.js
import { describe, it, expect } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

const { buildBatchSql, splitBatchResults } = await import('../../src/lib/sql/index.js');

describe('buildBatchSql', () => {
  it('wraps each query with a _key discriminator', () => {
    const queries = [
      { key: 56, sql: "SELECT '2026-01' AS period, 42 AS value" },
      { key: 296, sql: "SELECT '2026-01' AS period, 10 AS value" },
    ];
    const sql = buildBatchSql(queries);
    expect(sql).toContain("'56' AS _key");
    expect(sql).toContain("'296' AS _key");
    expect(sql).toContain('UNION ALL');
  });

  it('adds ORDER BY _key, period to preserve row ordering', () => {
    const queries = [
      { key: 56, sql: "SELECT '2026-01' AS period, 42 AS value" },
    ];
    const sql = buildBatchSql(queries);
    expect(sql).toContain('ORDER BY _key, period');
  });

  it('returns empty string for empty input', () => {
    expect(buildBatchSql([])).toBe('');
  });

  it('works with string keys (custom SQL)', () => {
    const queries = [
      { key: '__weekly_conv_rate', sql: "SELECT '2026-01-06' AS period, 0.08 AS value" },
    ];
    const sql = buildBatchSql(queries);
    expect(sql).toContain("'__weekly_conv_rate' AS _key");
  });
});

describe('splitBatchResults', () => {
  it('splits rows by _key into a Map', () => {
    const rows = [
      { _key: '56', period: '2026-01', value: '42' },
      { _key: '56', period: '2026-02', value: '50' },
      { _key: '296', period: '2026-01', value: '10' },
    ];
    const keyMap = new Map([[56, 56], [296, 296]]);
    const result = splitBatchResults(rows, keyMap);
    expect(result.get(56)).toHaveLength(2);
    expect(result.get(296)).toHaveLength(1);
    expect(result.get(56)[0]._key).toBeUndefined();
  });

  it('restores numeric keys from keyMap', () => {
    const rows = [{ _key: '56', period: '2026-01', value: '42' }];
    const keyMap = new Map([[56, 56]]);
    const result = splitBatchResults(rows, keyMap);
    expect(result.has(56)).toBe(true);
    expect(result.has('56')).toBe(false);
  });

  it('preserves string keys for custom SQL', () => {
    const rows = [{ _key: '__weekly_conv_rate', period: '2026-01', value: '0.08' }];
    const keyMap = new Map([['__weekly_conv_rate', '__weekly_conv_rate']]);
    const result = splitBatchResults(rows, keyMap);
    expect(result.has('__weekly_conv_rate')).toBe(true);
  });

  it('preserves row ordering within each key', () => {
    const rows = [
      { _key: '56', period: '2026-01', value: '10' },
      { _key: '56', period: '2026-02', value: '20' },
      { _key: '56', period: '2026-03', value: '30' },
    ];
    const keyMap = new Map([[56, 56]]);
    const result = splitBatchResults(rows, keyMap);
    const periods = result.get(56).map(r => r.period);
    expect(periods).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('returns empty Map for empty rows', () => {
    const result = splitBatchResults([], new Map());
    expect(result.size).toBe(0);
  });
});
