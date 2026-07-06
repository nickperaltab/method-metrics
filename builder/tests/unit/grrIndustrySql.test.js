import { describe, it, expect } from 'vitest';
import {
  buildGrrBySegmentSql,
  buildGrrAccountsSql,
  buildGrrTrendSql,
  buildCustomerAccountsSql,
  buildLabelFilterClauses,
  buildCustomizationSql,
  GRR_DIMENSIONS,
} from '../../src/lib/grrIndustrySql.js';
import { computeAllUpGrr } from '../../src/lib/grrIndustryData.js';

// The label join is keyed on the entity primary-label VIEW (one row per
// customer_record_id = EntityRecordID). The view does the dedupe + fold-
// UNCLASSIFIABLE + multi-client flag server-side, so the builders carry no
// dedupe CTE and can never fan out MRR. Industry dimensions (l1/l2/l3) route
// multi-client entities into their own 'Multi-client' bucket rather than
// forcing them into one industry; operating_model is a plain bucket.

const VIEW_JOIN = 'LEFT JOIN `project-for-method-dw.v7_classification.v_entity_primary_label` v ON v.customer_record_id = c.EntityRecordID';
const L1_SEG = "CASE WHEN v.is_multi_client THEN 'Multi-client' ELSE COALESCE(v.l1, 'Unclassified') END";

describe('GRR_DIMENSIONS', () => {
  it('allows exactly the four label dimensions', () => {
    expect(GRR_DIMENSIONS).toEqual(['l1', 'l2', 'l3', 'operating_model']);
  });
});

describe('buildLabelFilterClauses', () => {
  it('routes industry dims through the multi-client/Unclassified bucket expression on the view alias', () => {
    const out = buildLabelFilterClauses({ l1: 'Construction & Trades' });
    expect(out).toContain(`AND ${L1_SEG} = 'Construction & Trades'`);
  });

  it('uses a plain COALESCE bucket for operating_model', () => {
    const out = buildLabelFilterClauses({ operating_model: 'Service_Only' });
    expect(out).toContain("AND COALESCE(v.operating_model, 'Unclassified') = 'Service_Only'");
  });

  it('skips null/empty values', () => {
    expect(buildLabelFilterClauses({ l1: null, l2: '' })).toBe('');
  });

  it('escapes single quotes in values (injection guard)', () => {
    const out = buildLabelFilterClauses({ l1: "Bob's Industry" });
    expect(out).toContain("'Bob''s Industry'");
  });

  it('throws on a non-allowlisted dimension key (injection guard)', () => {
    expect(() => buildLabelFilterClauses({ 'l1; DROP TABLE x': 'v' })).toThrow(/dimension/i);
  });
});

describe('buildCustomizationSql', () => {
  const PROSERV_JOIN = 'LEFT JOIN `project-for-method-dw.revenue.int_customer_proserv` p ON p.EntityRecordID = c.EntityRecordID';

  it("returns empty fragments for 'all' and undefined (default SQL unchanged)", () => {
    expect(buildCustomizationSql('all')).toEqual({ join: '', clause: '' });
    expect(buildCustomizationSql()).toEqual({ join: '', clause: '' });
  });

  it("'customized' joins int_customer_proserv and filters on the flag", () => {
    const { join, clause } = buildCustomizationSql('customized');
    expect(join).toContain(PROSERV_JOIN);
    expect(clause).toContain('AND COALESCE(p.is_customized, FALSE)');
    expect(clause).not.toContain('NOT COALESCE');
  });

  it("'not_customized' negates the flag", () => {
    const { clause } = buildCustomizationSql('not_customized');
    expect(clause).toContain('AND NOT COALESCE(p.is_customized, FALSE)');
  });

  it('throws on an unknown value (injection guard)', () => {
    expect(() => buildCustomizationSql('x; DROP')).toThrow(/customization/i);
  });
});

describe('buildGrrBySegmentSql', () => {
  it('computes annual GRR per L1 from int_customer_annual_mrr joined to the entity primary-label view', () => {
    const sql = buildGrrBySegmentSql({ month: '2026-05-01', dimension: 'l1' });
    expect(sql).toContain('revenue.int_customer_annual_mrr');
    expect(sql).toContain('v7_classification.v_entity_primary_label');
    // join is on the stable entity key, not company name
    expect(sql).toContain(VIEW_JOIN);
    // no frontend dedupe — the view guarantees one row per entity
    expect(sql).not.toContain('account_labels');
    expect(sql).not.toContain('QUALIFY');
    expect(sql).not.toContain('lb.company_account = c.Company');
    // bucket: multi-client entities get their own segment, not forced into an industry
    expect(sql).toContain(`${L1_SEG} AS segment`);
    // GRR formula matches v_metric__annual_grr: (start - cancel - downgrade) / start
    expect(sql).toContain(
      'SAFE_DIVIDE(SUM(c.StartMRR) - SUM(c.Cancellations) - SUM(c.Downgrades), SUM(c.StartMRR)) AS grr'
    );
    expect(sql).toContain("c.Month = '2026-05-01'");
    expect(sql).toContain('GROUP BY segment');
    expect(sql).toContain('HAVING SUM(c.StartMRR) > 0');
    expect(sql).toContain('ORDER BY start_mrr DESC');
  });

  it('applies drill-path filters for deeper levels', () => {
    const sql = buildGrrBySegmentSql({
      month: '2026-05-01', dimension: 'l2', filters: { l1: 'Construction & Trades' },
    });
    expect(sql).toContain("COALESCE(v.l2, 'Unclassified') AS segment");
    expect(sql).toContain(`AND ${L1_SEG} = 'Construction & Trades'`);
  });

  it('supports operating_model as the dimension (plain bucket, no multi-client split)', () => {
    const sql = buildGrrBySegmentSql({ month: '2026-05-01', dimension: 'operating_model' });
    expect(sql).toContain("COALESCE(v.operating_model, 'Unclassified') AS segment");
    expect(sql).not.toContain("THEN 'Multi-client' ELSE COALESCE(v.operating_model");
  });

  it('throws on an unknown dimension (injection guard)', () => {
    expect(() => buildGrrBySegmentSql({ month: '2026-05-01', dimension: 'Company; DROP' }))
      .toThrow(/dimension/i);
  });

  it('escapes single quotes in month', () => {
    const sql = buildGrrBySegmentSql({ month: "2026-05-01' OR '1'='1", dimension: 'l1' });
    expect(sql).toContain("'2026-05-01'' OR ''1''=''1'");
  });

  it('applies the customization filter when requested', () => {
    const sql = buildGrrBySegmentSql({ month: '2026-05-01', dimension: 'l1', customization: 'customized' });
    expect(sql).toContain('LEFT JOIN `project-for-method-dw.revenue.int_customer_proserv` p ON p.EntityRecordID = c.EntityRecordID');
    expect(sql).toContain('AND COALESCE(p.is_customized, FALSE)');
  });

  it('leaves the SQL unchanged (no proserv join) by default', () => {
    const sql = buildGrrBySegmentSql({ month: '2026-05-01', dimension: 'l1' });
    expect(sql).not.toContain('int_customer_proserv');
  });
});

describe('buildGrrAccountsSql', () => {
  it('lists entities for a clicked segment with the view label + multi-client flag, sorted by lost $', () => {
    const sql = buildGrrAccountsSql({
      month: '2026-05-01', filters: { l1: 'Construction & Trades' },
    });
    expect(sql).toContain('revenue.int_customer_annual_mrr');
    expect(sql).toContain(VIEW_JOIN);
    // EntityRecordID travels so a row can drill into its constituent accounts
    expect(sql).toContain('c.EntityRecordID');
    expect(sql).toContain('c.Company');
    expect(sql).toContain('SUM(c.StartMRR)      AS start_mrr');
    expect(sql).toContain('SUM(c.Cancellations) AS churn_mrr');
    expect(sql).toContain('SUM(c.Downgrades)    AS downgrade_mrr');
    expect(sql).toContain('v.l1, v.l2, v.l3, v.operating_model, v.confidence, v.is_multi_client');
    // per-account reasoning is fetched lazily via buildCustomerAccountsSql, not here
    expect(sql).not.toContain('business_description');
    expect(sql).toContain(`AND ${L1_SEG} = 'Construction & Trades'`);
    expect(sql).toContain('ORDER BY (SUM(c.Cancellations) + SUM(c.Downgrades)) DESC');
    expect(sql).toContain('LIMIT 200');
  });

  it('only includes entities in the annual GRR base (StartMRR > 0)', () => {
    const sql = buildGrrAccountsSql({ month: '2026-05-01', filters: { operating_model: 'Service_Only' } });
    expect(sql).toContain('HAVING SUM(c.StartMRR) > 0');
  });

  it('applies the not_customized customization filter', () => {
    const sql = buildGrrAccountsSql({ month: '2026-05-01', filters: { l1: 'Construction & Trades' }, customization: 'not_customized' });
    expect(sql).toContain('AND NOT COALESCE(p.is_customized, FALSE)');
  });
});

describe('buildCustomerAccountsSql', () => {
  it('lists the constituent accounts of one entity with each account label + reasoning', () => {
    const sql = buildCustomerAccountsSql({ entityRecordId: 133608 });
    expect(sql).toContain('v7_classification.account_entity_map');
    expect(sql).toContain('v7_classification.account_labels');
    // dedupe account_labels to one row per account before showing it
    expect(sql).toContain('QUALIFY ROW_NUMBER() OVER');
    expect(sql).toContain('PARTITION BY account_record_id');
    expect(sql).toContain('m.company_account');
    expect(sql).toContain('l.business_description');
    expect(sql).toContain('l.short_reasoning');
    expect(sql).toContain('WHERE m.customer_record_id = 133608');
  });

  it('rejects a non-integer entityRecordId (injection guard)', () => {
    expect(() => buildCustomerAccountsSql({ entityRecordId: '1; DROP TABLE x' })).toThrow(/entityRecordId/i);
    expect(() => buildCustomerAccountsSql({ entityRecordId: null })).toThrow(/entityRecordId/i);
  });
});

describe('buildGrrTrendSql', () => {
  it('computes annual GRR per L1 per month over the trailing window via the view', () => {
    const sql = buildGrrTrendSql({ endMonth: '2026-05-01' });
    expect(sql).toContain('revenue.int_customer_annual_mrr');
    expect(sql).toContain(VIEW_JOIN);
    expect(sql).not.toContain('account_labels');
    expect(sql).not.toContain('QUALIFY');
    expect(sql).toContain('c.Month AS month');
    expect(sql).toContain(`${L1_SEG} AS segment`);
    // base size travels with each point so a thin segment can't read as a confident trend
    expect(sql).toContain('COUNT(DISTINCT IF(c.StartMRR > 0, c.Company, NULL)) AS customers');
    expect(sql).toContain(
      'SAFE_DIVIDE(SUM(c.StartMRR) - SUM(c.Cancellations) - SUM(c.Downgrades), SUM(c.StartMRR)) AS grr'
    );
    expect(sql).toContain("BETWEEN DATE_SUB(DATE '2026-05-01', INTERVAL 11 MONTH) AND '2026-05-01'");
    expect(sql).toContain('GROUP BY month, segment');
    expect(sql).toContain('HAVING SUM(c.StartMRR) > 0');
    expect(sql).toContain('ORDER BY month, segment');
  });

  it('honors a custom window length', () => {
    const sql = buildGrrTrendSql({ endMonth: '2026-05-01', months: 6 });
    expect(sql).toContain('INTERVAL 5 MONTH');
  });

  it('escapes single quotes in endMonth (injection guard)', () => {
    const sql = buildGrrTrendSql({ endMonth: "2026-05-01' OR '1'='1" });
    expect(sql).toContain("'2026-05-01'' OR ''1''=''1'");
  });

  it('applies the customization filter when requested', () => {
    const sql = buildGrrTrendSql({ endMonth: '2026-05-01', customization: 'customized' });
    expect(sql).toContain('LEFT JOIN `project-for-method-dw.revenue.int_customer_proserv` p ON p.EntityRecordID = c.EntityRecordID');
    expect(sql).toContain('AND COALESCE(p.is_customized, FALSE)');
  });
});

describe('computeAllUpGrr', () => {
  it('recombines segment rows into the all-up annual GRR (parity-gate input)', () => {
    const segments = [
      { start_mrr: 600, churn_mrr: 60, downgrade_mrr: 20 },
      { start_mrr: 400, churn_mrr: 40, downgrade_mrr: 12 }, // incl. Unclassified
    ];
    // (1000 - 100 - 32) / 1000 = 0.868
    expect(computeAllUpGrr(segments)).toBeCloseTo(0.868, 10);
  });

  it('returns null on an empty or zero base', () => {
    expect(computeAllUpGrr([])).toBeNull();
    expect(computeAllUpGrr([{ start_mrr: 0, churn_mrr: 0, downgrade_mrr: 0 }])).toBeNull();
  });
});
