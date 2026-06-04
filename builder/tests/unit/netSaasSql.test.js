import { describe, it, expect } from 'vitest';
import { buildBridgeSql, buildDimSplitSql, buildComponentSplitSql, buildAccountTableSql, buildCohortAgeChurnSql, buildDistinctValuesSql, buildRateSql, buildAccountHistorySql, buildAccountLifecycleSql } from '../../src/lib/netSaasSql.js';

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

describe('buildCohortAgeChurnSql', () => {
  it('sub-selects each entity first month and buckets age', () => {
    const sql = buildCohortAgeChurnSql({ month: '2026-05-01', filters: {} });
    expect(sql).toContain('MIN(Month)');
    expect(sql).toContain('DATE_DIFF');
    expect(sql).toContain("'0-3'");
    expect(sql).toContain("'4-12'");
    expect(sql).toContain("'13-24'");
    expect(sql).toContain("'25+'");
    expect(sql).toContain('SUM(c.Cancellations) AS value');
    expect(sql).toContain('Cancellations > 0');
    expect(sql).toContain('GROUP BY bucket');
  });
  it('applies global filters with the c. alias', () => {
    const sql = buildCohortAgeChurnSql({ month: '2026-05-01', filters: { Segment: 'SMB' } });
    expect(sql).toContain("c.Segment = 'SMB'");
  });
});

describe('buildDistinctValuesSql', () => {
  it('UNION ALLs a distinct-values select per requested dim', () => {
    const sql = buildDistinctValuesSql({ dims: ['Segment', 'SyncType'], months: 24 });
    expect(sql).toContain("'Segment' AS dim");
    expect(sql).toContain("'SyncType' AS dim");
    expect(sql).toContain('UNION ALL');
    expect(sql).toContain('int_customer_mrr');
    expect(sql).toContain('GROUP BY');
    // recent-months scoping present
    expect(sql).toContain('DATE_SUB');
  });
  it('casts each dim to STRING so BOOL dims like HasDEP work', () => {
    const sql = buildDistinctValuesSql({ dims: ['HasDEP'], months: 24 });
    expect(sql).toContain('CAST(HasDEP AS STRING)');
  });
});

describe('grain parameterization', () => {
  it('buildBridgeSql uses annual view when bridgeView passed', () => {
    const sql = buildBridgeSql({ month: '2026-05-01', filters: {}, bridgeView: 'int_customer_annual_mrr' });
    expect(sql).toContain('int_customer_annual_mrr');
    expect(sql).not.toContain('revenue.int_customer_mrr`');
  });
  it('buildBridgeSql defaults to monthly view when bridgeView omitted', () => {
    const sql = buildBridgeSql({ month: '2026-05-01', filters: {} });
    expect(sql).toContain('int_customer_mrr');
  });
  it('buildComponentSplitSql uses annual decomp view when decompView passed', () => {
    const sql = buildComponentSplitSql({ month: '2026-05-01', movementKind: 'downgrade', filters: {}, decompView: 'int_annual_mrr_movement_decomposed' });
    expect(sql).toContain('int_annual_mrr_movement_decomposed');
  });
  it('buildDimSplitSql honors bridgeView', () => {
    const sql = buildDimSplitSql({ month: '2026-05-01', measure: 'NewMRR', dim: 'Segment', filters: {}, bridgeView: 'int_customer_annual_mrr' });
    expect(sql).toContain('int_customer_annual_mrr');
  });
  it('buildAccountTableSql honors views (annual)', () => {
    const sql = buildAccountTableSql({ month: '2026-05-01', drill: 'downgrade', slice: 'seats', filters: {}, bridgeView: 'int_customer_annual_mrr', decompView: 'int_annual_mrr_movement_decomposed' });
    expect(sql).toContain('int_annual_mrr_movement_decomposed');
    expect(sql).toContain('int_customer_annual_mrr');
  });
});

describe('buildRateSql', () => {
  it('selects value from the metric view in revenue_metrics for the period', () => {
    const sql = buildRateSql({ metric: 'v_metric__monthly_grr', period: '2026-05-01' });
    expect(sql).toContain('revenue_metrics.v_metric__monthly_grr');
    expect(sql).toContain("period = '2026-05-01'");
    expect(sql).toContain('value');
  });
});

describe('buildAccountHistorySql', () => {
  it('monthly mrr/licenses/apps for one entity, full history, ordered', () => {
    const sql = buildAccountHistorySql({ entityRecordId: 100037 });
    expect(sql).toContain('int_customer_mrr_lines');
    expect(sql).toContain('entity_record_id = 100037');
    expect(sql).toContain('SUM(saas)');
    expect(sql).toContain('MAX(user_paid_count)');
    expect(sql.toLowerCase()).toContain('as licenses');
    expect(sql.toLowerCase()).toContain('count(distinct');
    expect(sql.toLowerCase()).toContain('group by month');
    expect(sql.toLowerCase()).toContain('order by month');
  });
  it('coerces entityRecordId to a number (no quotes, no injection)', () => {
    const sql = buildAccountHistorySql({ entityRecordId: '100037; DROP' });
    expect(sql).toContain('entity_record_id = 100037');
    expect(sql).not.toContain('DROP');
  });
});

describe('buildAccountLifecycleSql', () => {
  it('aggregates lifecycle dates for one entity from Account', () => {
    const sql = buildAccountLifecycleSql({ entityRecordId: 100037 });
    expect(sql).toContain('revenue.Account');
    expect(sql).toContain('EntityRecordID = 100037');
    expect(sql).toContain('MIN(NULLIF(SignUpDate');
    expect(sql).toContain('MIN(NULLIF(CustDatFirstSyncCompleted');
    expect(sql).toContain('MIN(NULLIF(FirstSaaSInvoiceTxnDate');
    expect(sql).toContain("DATE '0001-01-01'");   // sentinel ignored
    expect(sql).not.toContain('CancellationDate'); // no cancellation marker
  });
});
