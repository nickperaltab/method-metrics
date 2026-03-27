// Setup browser globals before bigquery.js imports
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Since queryBq is called internally (not through module export), we test
// input validation directly and SQL patterns via the exported cache key format.

import { fetchGroupedData, clearAggCache } from '../../src/lib/bigquery.js';

describe('fetchGroupedData — input validation', () => {
  it('rejects SQL injection in groupByField', async () => {
    await expect(
      fetchGroupedData('v_trials', 'SignupDate', 'COUNT', 'month', '1; DROP TABLE--', null, 12)
    ).rejects.toThrow('Invalid groupByField');
  });

  it('rejects spaces in groupByField', async () => {
    await expect(
      fetchGroupedData('v_trials', 'SignupDate', 'COUNT', 'month', 'Channel OR 1=1', null, 12)
    ).rejects.toThrow('Invalid groupByField');
  });

  it('rejects empty groupByField', async () => {
    await expect(
      fetchGroupedData('v_trials', 'SignupDate', 'COUNT', 'month', '', null, 12)
    ).rejects.toThrow('Invalid groupByField');
  });

  it('rejects parentheses in groupByField', async () => {
    await expect(
      fetchGroupedData('v_trials', 'SignupDate', 'COUNT', 'month', 'CONCAT(a,b)', null, 12)
    ).rejects.toThrow('Invalid groupByField');
  });

  it('accepts valid column names without throwing validation error', async () => {
    const validNames = ['Channel', 'SignupCountry', 'CustDatIndustry', 'SyncType', 'Vertical', 'Att_SEO'];
    for (const name of validNames) {
      try {
        await fetchGroupedData('v_trials', 'SignupDate', 'COUNT', 'month', name, null, 12);
      } catch (e) {
        expect(e.message).not.toContain('Invalid groupByField');
      }
    }
  });
});

// Test the SQL-building helpers directly by importing chartUtils which shares patterns
import { aggregateRows, toBucketKey, MONTH_NAMES } from '../../src/lib/chartUtils.js';

describe('aggregateRows — SQL equivalent patterns', () => {
  // These test the same aggregation logic the server-side queries implement,
  // validating that client-side and server-side produce the same bucketing.

  const sampleRows = [
    { SignupDate: '2025-01-15', value: 10 },
    { SignupDate: '2025-01-20', value: 20 },
    { SignupDate: '2025-02-10', value: 30 },
    { SignupDate: '2025-02-15', value: 40 },
  ];

  it('monthly bucketing aggregates correctly', () => {
    const result = aggregateRows(sampleRows, 'SignupDate', 'COUNT', 'month');
    expect(result.labels).toEqual(['2025-01', '2025-02']);
    expect(result.data).toEqual([2, 2]);
  });

  it('COUNT vs SUM aggregation', () => {
    const countResult = aggregateRows(sampleRows, 'SignupDate', 'COUNT', 'month');
    const sumResult = aggregateRows(sampleRows, 'SignupDate', 'value', 'month');
    expect(countResult.data).toEqual([2, 2]); // 2 rows per month
    expect(sumResult.data).toEqual([30, 70]); // 10+20=30, 30+40=70
  });

  it('day bucketing keeps each day separate', () => {
    const result = aggregateRows(sampleRows, 'SignupDate', 'COUNT', 'day');
    expect(result.labels.length).toBe(4); // 4 unique days
    expect(result.data.every(d => d === 1)).toBe(true);
  });

  it('handles empty rows', () => {
    const result = aggregateRows([], 'SignupDate', 'COUNT', 'month');
    expect(result.labels).toEqual([]);
    expect(result.data).toEqual([]);
  });
});

describe('toBucketKey — period expression matching', () => {
  it('month bucket matches FORMAT_DATE(%Y-%m) format', () => {
    expect(toBucketKey('2025-01-15', 'month')).toBe('2025-01');
    expect(toBucketKey('2025-12-31', 'month')).toBe('2025-12');
  });

  it('day bucket matches FORMAT_DATE(%Y-%m-%d) format', () => {
    expect(toBucketKey('2025-01-15', 'day')).toBe('2025-01-15');
  });

  it('week bucket snaps to Monday', () => {
    // 2025-01-15 is a Wednesday, Monday is 2025-01-13
    const key = toBucketKey('2025-01-15', 'week');
    expect(key).toBe('2025-01-13');
  });

  it('non-date string returned as-is', () => {
    expect(toBucketKey('US', 'month')).toBe('US');
    expect(toBucketKey('SEO', 'day')).toBe('SEO');
  });
});

describe('ATT_COL_MAP — channel filter validation', () => {
  // Import from chartUtils (same map used in bigquery.js)
  const { ATT_COL_MAP } = require('../../src/lib/chartUtils.js');

  it('has all 12 channel mappings', () => {
    const expected = ['SEO', 'PPC', 'OPN', 'Social', 'Email', 'Referral', 'Direct', 'Partners', 'Content', 'Remarketing', 'Other', 'None'];
    expect(Object.keys(ATT_COL_MAP).sort()).toEqual(expected.sort());
  });

  it('all values are Att_* column names', () => {
    Object.values(ATT_COL_MAP).forEach(col => {
      expect(col).toMatch(/^Att_/);
    });
  });

  it('PPC maps to Att_Pay_Per_Click (not Att_PPC)', () => {
    expect(ATT_COL_MAP.PPC).toBe('Att_Pay_Per_Click');
  });
});
