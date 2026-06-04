import { describe, it, expect } from 'vitest';
import { buildBridgeSql, buildDimSplitSql, buildComponentSplitSql, buildAccountTableSql } from '../../src/lib/netSaasSql.js';

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

describe('buildComponentSplitSql', () => {
  it('sums seat/app/price for the given movement_kind', () => {
    const sql = buildComponentSplitSql({ month: '2026-05-01', movementKind: 'expansion', filters: {} });
    expect(sql).toContain('SUM(seat_mrr)');
    expect(sql).toContain('SUM(app_mrr)');
    expect(sql).toContain('SUM(price_mrr)');
    expect(sql).toContain('int_mrr_movement_decomposed');
    expect(sql).toContain("movement_kind = 'expansion'");
    expect(sql).toContain('month = ');
  });

  it('joins int_customer_mrr for dim filters since the decomposition lacks dim columns', () => {
    const sql = buildComponentSplitSql({ month: '2026-05-01', movementKind: 'downgrade', filters: { Segment: 'SMB' } });
    expect(sql).toContain('JOIN');
    expect(sql).toContain("c.Segment = 'SMB'");
  });

  it('omits the join when no filters are set', () => {
    const sql = buildComponentSplitSql({ month: '2026-05-01', movementKind: 'downgrade', filters: {} });
    expect(sql).not.toContain('JOIN');
  });
});

describe('buildAccountTableSql', () => {
  it('downgrade→seats: joins decomposition+icm, orders by |seat_mrr|, limit 50', () => {
    const sql = buildAccountTableSql({ month:'2026-05-01', drill:'downgrade', slice:'seats', filters:{} });
    expect(sql).toContain('int_mrr_movement_decomposed');
    expect(sql).toContain('JOIN');
    expect(sql).toContain('c.Company');
    expect(sql).toContain("d.movement_kind = 'downgrade'");
    expect(sql).toContain('ORDER BY ABS(d.seat_mrr) DESC');
    expect(sql).toContain('LIMIT 50');
  });
  it('new→channel slice: from int_customer_mrr only, filtered by channel', () => {
    const sql = buildAccountTableSql({ month:'2026-05-01', drill:'new', dim:'AttributionChannel', slice:'Paid', filters:{} });
    expect(sql).not.toContain('int_mrr_movement_decomposed');
    expect(sql).toContain('NewMRR > 0');
    expect(sql).toContain("AttributionChannel = 'Paid'");
  });
  it('churn→segment slice: from int_customer_mrr, filtered by segment', () => {
    const sql = buildAccountTableSql({ month:'2026-05-01', drill:'churn', dim:'Segment', slice:'SMB', filters:{} });
    expect(sql).toContain('Cancellations > 0');
    expect(sql).toContain("Segment = 'SMB'");
  });
});
