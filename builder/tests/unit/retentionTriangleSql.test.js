import { describe, it, expect } from 'vitest';
import { buildRetentionTriangleSql, toTriangle, RETENTION_MAX_TENURE, filterOptions, FILTER_DIMS } from '../../src/lib/retentionTriangleSql.js';

const rows = [
  { cohort_month: '2024-01-01', tenure_k: 0, n_start: 2, n_active: 2, mrr_start: 300, mrr_active: 300 },
  { cohort_month: '2024-01-01', tenure_k: 1, n_start: 2, n_active: 1, mrr_start: 300, mrr_active: 100 },
  { cohort_month: '2024-01-01', tenure_k: 2, n_start: 2, n_active: 2, mrr_start: 300, mrr_active: 250 },
];

describe('buildRetentionTriangleSql', () => {
  it('builds SQL referencing the model table, filtered to the display window', () => {
    const sql = buildRetentionTriangleSql();
    expect(sql).toContain('int_customer_retention_triangle');
    expect(sql).toContain(`tenure_k <= ${RETENTION_MAX_TENURE}`);
  });
});

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

describe('toTriangle rolling 6-cohort average', () => {
  // 7 cohorts; the oldest (2025-01) has a 0% month-1 that must be EXCLUDED by the
  // rolling-6 window. All-7 average would be 77.1%; rolling-6 is 90%.
  const months = ['2025-07', '2025-06', '2025-05', '2025-04', '2025-03', '2025-02', '2025-01'];
  const rolling = [];
  for (const m of months) {
    rolling.push({ cohort_month: `${m}-01`, tenure_k: 0, n_start: 10, n_active: 10, mrr_start: 100, mrr_active: 100 });
    const active1 = m === '2025-01' ? 0 : 9; // oldest is the outlier
    rolling.push({ cohort_month: `${m}-01`, tenure_k: 1, n_start: 10, n_active: active1, mrr_start: 100, mrr_active: active1 * 10 });
  }

  it('averages only the 6 most recent cohorts per tenure', () => {
    const { averages } = toTriangle(rolling, 'customers', 'from_start');
    expect(averages[0]).toBe(100); // all k0 = 100
    expect(averages[1]).toBe(90);  // 6 newest = 90%; the 0% oldest excluded (all-7 = 77.1)
  });
});

// ── cube-filter tests (Task 4) ──────────────────────────────────────────────

const cubeRows = [
  { cohort_month: '2025-01-01', tenure_k: 0, l1: 'Manufacturing', segment: 'Solo no DEP', country: 'US', channel: 'SEO', n_start: 10, n_active: 10, mrr_start: 100, mrr_active: 100 },
  { cohort_month: '2025-01-01', tenure_k: 0, l1: 'Retail',        segment: 'Team AI Plus', country: 'CA', channel: 'PPC', n_start: 5,  n_active: 5,  mrr_start: 200, mrr_active: 200 },
  { cohort_month: '2025-01-01', tenure_k: 1, l1: 'Manufacturing', segment: 'Solo no DEP', country: 'US', channel: 'SEO', n_start: 10, n_active: 8,  mrr_start: 100, mrr_active: 80  },
  { cohort_month: '2025-01-01', tenure_k: 1, l1: 'Retail',        segment: 'Team AI Plus', country: 'CA', channel: 'PPC', n_start: 5,  n_active: 5,  mrr_start: 200, mrr_active: 200 },
];

describe('cube filtering', () => {
  it('no filter rolls up all dims (All)', () => {
    const t = toTriangle(cubeRows, 'customers', 'from_start');
    expect(t.cohorts[0].n_start).toBe(15);      // 10 + 5
    expect(t.cells['2025-01-01'][1]).toBe(86.7); // (8+5)/15
  });
  it('AND filter selects the slice', () => {
    const t = toTriangle(cubeRows, 'customers', 'from_start', { l1: new Set(['Manufacturing']) });
    expect(t.cohorts[0].n_start).toBe(10);
    expect(t.cells['2025-01-01'][1]).toBe(80);   // 8/10
  });
  it('filterOptions returns sorted distinct values per dim', () => {
    const o = filterOptions(cubeRows);
    expect(o.l1).toEqual(['Manufacturing', 'Retail']);
    expect(o.segment).toEqual(['Solo no DEP', 'Team AI Plus']);
  });
  it('SQL selects the dim columns', () => {
    const sql = buildRetentionTriangleSql();
    ['l1', 'segment', 'country', 'channel'].forEach((d) => expect(sql).toContain(d));
  });
  it('MRR measure: cohort n_start is still customer count, not mrr_start', () => {
    const t = toTriangle(cubeRows, 'mrr', 'from_start');
    expect(t.cohorts[0].n_start).toBe(15); // 10+5 customers, not 100+200 dollars
  });
});
