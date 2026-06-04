import { describe, it, expect } from 'vitest';
import { buildBridgeSql, buildDimSplitSql } from '../../src/lib/netSaasSql.js';

describe('buildBridgeSql', () => {
  it('selects all six bridge aggregates for the given month, no filters', () => {
    const sql = buildBridgeSql({ month: '2026-05-01', filters: {} });
    expect(sql).toContain('FROM `project-for-method-dw.revenue.int_customer_mrr`');
    expect(sql).toContain("Month = '2026-05-01'");
    expect(sql).toContain('SUM(StartMRR)');
    expect(sql).toContain('SUM(NewMRR)');
    expect(sql).toContain('SUM(Expansions)');
    expect(sql).toContain('SUM(Downgrades)');
    expect(sql).toContain('SUM(Cancellations)');
    expect(sql).toContain('SUM(p2_saas)');
    expect(sql).not.toContain('AND Segment');
  });

  it('appends single-select global filters as AND clauses', () => {
    const sql = buildBridgeSql({
      month: '2026-05-01',
      filters: { Segment: 'SMB', AttributionChannel: 'Paid' },
    });
    expect(sql).toContain("AND Segment = 'SMB'");
    expect(sql).toContain("AND AttributionChannel = 'Paid'");
  });

  it('escapes single quotes in filter values', () => {
    const sql = buildBridgeSql({ month: '2026-05-01', filters: { Vertical: "Joe's Plumbing" } });
    expect(sql).toContain("Vertical = 'Joe''s Plumbing'");
  });
});

describe('buildDimSplitSql', () => {
  it('groups NewMRR by AttributionChannel where NewMRR > 0', () => {
    const sql = buildDimSplitSql({ month: '2026-05-01', measure: 'NewMRR', dim: 'AttributionChannel', filters: {} });
    expect(sql).toContain('AttributionChannel AS bucket');
    expect(sql).toContain('SUM(NewMRR) AS value');
    expect(sql).toContain('NewMRR > 0');
    expect(sql).toContain('GROUP BY AttributionChannel');
    expect(sql).toContain('ORDER BY value DESC');
  });

  it('groups Cancellations by Segment where Cancellations > 0', () => {
    const sql = buildDimSplitSql({ month: '2026-05-01', measure: 'Cancellations', dim: 'Segment', filters: {} });
    expect(sql).toContain('SUM(Cancellations) AS value');
    expect(sql).toContain('Cancellations > 0');
    expect(sql).toContain('GROUP BY Segment');
  });
});
