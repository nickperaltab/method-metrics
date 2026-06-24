import { describe, it, expect } from 'vitest';
import { toTriangle, RETENTION_MAX_TENURE } from '../../src/lib/retentionTriangleSql.js';

const rows = [
  { cohort_month: '2024-01-01', tenure_k: 0, n_start: 2, n_active: 2, mrr_start: 300, mrr_active: 300 },
  { cohort_month: '2024-01-01', tenure_k: 1, n_start: 2, n_active: 1, mrr_start: 300, mrr_active: 100 },
  { cohort_month: '2024-01-01', tenure_k: 2, n_start: 2, n_active: 2, mrr_start: 300, mrr_active: 250 },
];

describe('toTriangle', () => {
  it('customers from_start = active/start', () => {
    const { cells } = toTriangle(rows, 'customers', 'from_start');
    expect(cells['2024-01-01'][0]).toBe(100);
    expect(cells['2024-01-01'][1]).toBe(50);
    expect(cells['2024-01-01'][2]).toBe(100);
  });
  it('customers mom = active/prior, null at k0, >100% on reactivation', () => {
    const { cells } = toTriangle(rows, 'customers', 'mom');
    expect(cells['2024-01-01'][0]).toBe(null);
    expect(cells['2024-01-01'][1]).toBe(50);
    expect(cells['2024-01-01'][2]).toBe(200); // 2/1 reactivation
  });
  it('mrr from_start and mom', () => {
    expect(toTriangle(rows, 'mrr', 'from_start').cells['2024-01-01'][2]).toBe(83.3); // 250/300
    expect(toTriangle(rows, 'mrr', 'mom').cells['2024-01-01'][2]).toBe(250);          // 250/100
  });
  it('exposes cohorts (with n_start) and averages', () => {
    const t = toTriangle(rows, 'customers', 'from_start');
    expect(t.cohorts).toEqual([{ cohort_month: '2024-01-01', n_start: 2 }]);
    expect(t.tenures[0]).toBe(0);
    expect(t.averages[0]).toBe(100);
  });
});
