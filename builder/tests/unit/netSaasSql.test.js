import { describe, it, expect } from 'vitest';
import { buildBridgeSql, buildDimSplitSql, buildComponentSplitSql, buildAccountTableSql, buildBookSplitSql, buildBookHeatmapSql, buildHealthChurnBenchmarkSql, buildPredictorGridSql, buildCohortAgeChurnSql, buildDistinctValuesSql, buildRateSql, buildAccountHistorySql, buildAccountLifecycleSql, buildAccountActivitiesSql, buildAccountCasesSql } from '../../src/lib/netSaasSql.js';

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
  it('churn→CohortAge slice: joins firsts CTE and filters by age range, not a column', () => {
    const sql = buildAccountTableSql({ month:'2026-05-01', drill:'churn', dim:'CohortAge', slice:'4-12', filters:{} });
    expect(sql).not.toContain('CohortAge =');           // never references a nonexistent column
    expect(sql).toContain('FirstSaaSInvoiceTxnDate');    // derives tenure from first paid date
    expect(sql).toContain('last_month');                 // tenure-at-churn, not age-to-today
    expect(sql).toContain('BETWEEN 4 AND 12');           // 4-12 bucket → tenure range
    expect(sql).toContain('Cancellations > 0');
  });
  it('churn→CohortAge 25+ slice: open-ended age range', () => {
    const sql = buildAccountTableSql({ month:'2026-05-01', drill:'churn', dim:'CohortAge', slice:'25+', filters:{} });
    expect(sql).toContain('>= 25');
    expect(sql).not.toContain('BETWEEN');
  });
});

describe('buildCohortAgeChurnSql', () => {
  it('sub-selects each entity first month and buckets age', () => {
    const sql = buildCohortAgeChurnSql({ month: '2026-05-01', filters: {} });
    expect(sql).toContain('FirstSaaSInvoiceTxnDate');     // tenure anchored on true first paid date
    expect(sql).toContain("DATE '0001-01-01'");           // sentinel ignored
    expect(sql).toContain('revenue.Account');
    expect(sql).toContain('int_customer_mrr_lines');      // last active month source
    expect(sql).toContain('last_month');                  // tenure-at-churn = last − first
    expect(sql).toContain('DATE_DIFF(l.last_month, f.first_month');
    expect(sql).toContain("'0-3'");
    expect(sql).toContain("'4-12'");
    expect(sql).toContain("'13-24'");
    expect(sql).toContain("'25+'");
    expect(sql).toContain('SUM(c.Cancellations) AS value');
    expect(sql).toContain('Cancellations > 0');
    expect(sql).toContain('GROUP BY bucket');
    expect(sql).toContain('ORDER BY MIN(DATE_DIFF');       // numeric age order, not lexical
    expect(sql).not.toContain('ORDER BY bucket');
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

describe('buildBookSplitSql (End-MRR current book by health tier)', () => {
  it('splits standing accounts (end MRR > 0) by health tier with MRR + count', () => {
    const sql = buildBookSplitSql({ month: '2026-05-01', filters: {} });
    expect(sql).toContain('FROM `project-for-method-dw.revenue.int_customer_mrr` c');
    expect(sql).toContain('JOIN accts a ON a.EntityRecordID = c.EntityRecordID');
    expect(sql).toContain('MAX(HealthScore) AS health_score'); // deduped Account join
    expect(sql).toContain('c.p2_saas > 0');                    // current book = end MRR > 0
    expect(sql).toContain('SUM(c.p2_saas) AS value');
    expect(sql).toContain('COUNT(*) AS accounts');
    expect(sql).not.toContain('AND DATE_DIFF');                // no cohort filter by default
  });

  it('adds a tenure-cohort floor when minAgeMonths is set (4yr+ = 48)', () => {
    const sql = buildBookSplitSql({ month: '2026-05-01', filters: {}, minAgeMonths: 48 });
    expect(sql).toContain("DATE_DIFF(DATE '2026-05-01', a.first_month, MONTH) >= 48");
  });

  it('applies global filters against the bridge alias', () => {
    const sql = buildBookSplitSql({ month: '2026-05-01', filters: { Segment: 'SMB' } });
    expect(sql).toContain("AND c.Segment = 'SMB'");
  });
});

describe('buildAccountTableSql — book drill (End MRR)', () => {
  it('lists current accounts with health score + age, deduped, riskiest first', () => {
    const sql = buildAccountTableSql({ month: '2026-05-01', drill: 'end', slice: null, filters: {} });
    expect(sql).toContain('WITH accts AS');                 // deduped CTE
    expect(sql).toContain('a.health_score');
    expect(sql).toContain('c.p2_saas AS deltaMrr');
    expect(sql).toContain("DATE_DIFF(DATE '2026-05-01', a.first_month, MONTH) AS age_mo");
    expect(sql).toContain('c.p2_saas > 0');
    expect(sql).toContain('ORDER BY a.health_score IS NULL, a.health_score ASC');
    expect(sql).toContain('LIMIT 50');
  });

  it('reproduces a tier score range when sliced by tier (no HealthTier column)', () => {
    const sql = buildAccountTableSql({ month: '2026-05-01', drill: 'end', slice: 'Red', filters: {} });
    expect(sql).toContain('a.health_score >= 10 AND a.health_score < 40');
    expect(sql).not.toContain("= 'Red'"); // never filters a nonexistent column
  });

  it('handles the No score tier as IS NULL', () => {
    const sql = buildAccountTableSql({ month: '2026-05-01', drill: 'end', slice: 'No score', filters: {} });
    expect(sql).toContain('a.health_score IS NULL');
  });

  it('scopes to a tenure cohort when minAgeMonths is set', () => {
    const sql = buildAccountTableSql({ month: '2026-05-01', drill: 'end', slice: 'Red', filters: {}, minAgeMonths: 48 });
    expect(sql).toContain("DATE_DIFF(DATE '2026-05-01', a.first_month, MONTH) >= 48");
  });

  it('filters by license band when a heatmap cell is drilled (joins seatcount)', () => {
    const sql = buildAccountTableSql({ month: '2026-05-01', drill: 'end', slice: 'Red', licenseBand: '4-5', filters: {} });
    expect(sql).toContain('seatcount AS');
    expect(sql).toContain('s.seats >= 4 AND s.seats <= 5');
    expect(sql).toContain('IFNULL(s.seats, 0) AS seats');
  });

  it('treats the 10+ band as an open upper bound', () => {
    const sql = buildAccountTableSql({ month: '2026-05-01', drill: 'end', slice: 'Green', licenseBand: '10+', filters: {} });
    expect(sql).toContain('s.seats >= 10');
    expect(sql).not.toContain('s.seats <= '); // no upper bound for 10+
  });
});

describe('buildBookHeatmapSql (End MRR health × license heatmap)', () => {
  it('groups the current book by health tier × license band with count + MRR', () => {
    const sql = buildBookHeatmapSql({ month: '2026-05-01', filters: {} });
    expect(sql).toContain('accts AS');       // deduped health
    expect(sql).toContain('seatcount AS');   // seats
    expect(sql).toContain('AS tier');
    expect(sql).toContain('AS license_band');
    expect(sql).toContain('COUNT(*) AS accounts');
    expect(sql).toContain('SUM(c.p2_saas) AS mrr');
    expect(sql).toContain('c.p2_saas > 0');
    expect(sql).toContain('LEFT JOIN seatcount s');
  });

  it('honors the tenure-cohort floor', () => {
    const sql = buildBookHeatmapSql({ month: '2026-05-01', filters: {}, minAgeMonths: 48 });
    expect(sql).toContain("DATE_DIFF(DATE '2026-05-01', a.first_month, MONTH) >= 48");
  });
});

describe('buildHealthChurnBenchmarkSql (trailing-year churn by health tier)', () => {
  it('anchors 12 months before the month and measures churn to the month', () => {
    const sql = buildHealthChurnBenchmarkSql({ month: '2026-05-01', filters: {} });
    expect(sql).toContain("DATE_SUB(DATE '2026-05-01', INTERVAL 12 MONTH)"); // anchor a year back
    expect(sql).toContain("Month = '2026-05-01'");                            // kept = paying now
    expect(sql).toContain('COUNTIF(k.EntityRecordID IS NULL)');               // churned = not in kept
    expect(sql).toContain('AS churn_pct');
    expect(sql).toContain('MAX(HealthScore) AS health_score');                // deduped Account
  });
});

describe('buildPredictorGridSql (tenure × health churn diagnostic)', () => {
  it('buckets MRR churn by tenure (measured at anchor) × health band', () => {
    const sql = buildPredictorGridSql({ month: '2026-05-01', filters: {} });
    expect(sql).toContain("DATE_SUB(DATE '2026-05-01', INTERVAL 12 MONTH)"); // anchor a year back
    expect(sql).toContain('AS tenure_band');
    expect(sql).toContain('AS health_band');
    expect(sql).toContain('SUM(IF(k.EntityRecordID IS NULL, c.p2_saas, 0))'); // MRR-weighted churn
    expect(sql).toContain('NULLIF(SUM(c.p2_saas), 0)');
    expect(sql).toContain('GROUP BY tenure_band, health_band');
  });
});

describe('buildAccountActivitiesSql / buildAccountCasesSql (timeline)', () => {
  it('pulls recent non-deleted activities for one account, body capped', () => {
    const sql = buildAccountActivitiesSql({ entityRecordId: 186459 });
    expect(sql).toContain('revenue.Activity');
    expect(sql).toContain('EntityRecordID = 186459');
    expect(sql).toContain('COALESCE(IsDeleted, FALSE) = FALSE');
    expect(sql).toContain('SUBSTR(Comments, 1, 4000)');
    expect(sql).toContain('ORDER BY DueDateStart DESC');
  });

  it('pulls non-deleted cases with subject/status/category + capped body', () => {
    const sql = buildAccountCasesSql({ entityRecordId: 186459 });
    expect(sql).toContain('revenue.Cases');
    expect(sql).toContain('EntityRecordID = 186459');
    expect(sql).toContain('COALESCE(IsDeleted, FALSE) = FALSE');
    expect(sql).toContain('COALESCE(NULLIF(Subject');
    expect(sql).toContain('SUBSTR(Description, 1, 4000)');
    expect(sql).toContain('ORDER BY CreatedDate DESC');
  });

  it('coerces entityRecordId to a number (injection-safe)', () => {
    const sql = buildAccountActivitiesSql({ entityRecordId: '186459; DROP' });
    expect(sql).toContain('EntityRecordID = 186459');
    expect(sql).not.toContain('DROP');
  });
});
