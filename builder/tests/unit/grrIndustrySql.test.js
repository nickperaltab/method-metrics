import { describe, it, expect } from 'vitest';
import {
  buildGrrBySegmentSql,
  buildGrrAccountsSql,
  buildLabelFilterClauses,
  GRR_DIMENSIONS,
} from '../../src/lib/grrIndustrySql.js';

describe('GRR_DIMENSIONS', () => {
  it('allows exactly the four label dimensions', () => {
    expect(GRR_DIMENSIONS).toEqual(['l1', 'l2', 'l3', 'operating_model']);
  });
});

describe('buildLabelFilterClauses', () => {
  it('builds COALESCE-to-Unclassified equality clauses on the labels alias', () => {
    const out = buildLabelFilterClauses({ l1: 'Construction & Trades', l2: 'Plumbing' });
    expect(out).toContain("AND COALESCE(lb.l1, 'Unclassified') = 'Construction & Trades'");
    expect(out).toContain("AND COALESCE(lb.l2, 'Unclassified') = 'Plumbing'");
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

describe('buildGrrBySegmentSql', () => {
  it('computes annual GRR per L1 from int_customer_annual_mrr joined to deduped labels', () => {
    const sql = buildGrrBySegmentSql({ month: '2026-05-01', dimension: 'l1' });
    expect(sql).toContain('revenue.int_customer_annual_mrr');
    expect(sql).toContain('v7_classification.account_labels');
    // dedupe: one label row per company_account, best confidence first
    expect(sql).toContain('QUALIFY ROW_NUMBER() OVER');
    expect(sql).toContain('PARTITION BY company_account');
    expect(sql).toContain('ORDER BY confidence DESC, classified_at DESC');
    // join + bucket
    expect(sql).toContain('LEFT JOIN labels lb ON lb.company_account = c.Company');
    expect(sql).toContain("COALESCE(lb.l1, 'Unclassified') AS segment");
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
    expect(sql).toContain("COALESCE(lb.l2, 'Unclassified') AS segment");
    expect(sql).toContain("AND COALESCE(lb.l1, 'Unclassified') = 'Construction & Trades'");
  });

  it('supports operating_model as the dimension', () => {
    const sql = buildGrrBySegmentSql({ month: '2026-05-01', dimension: 'operating_model' });
    expect(sql).toContain("COALESCE(lb.operating_model, 'Unclassified') AS segment");
  });

  it('throws on an unknown dimension (injection guard)', () => {
    expect(() => buildGrrBySegmentSql({ month: '2026-05-01', dimension: 'Company; DROP' }))
      .toThrow(/dimension/i);
  });

  it('escapes single quotes in month', () => {
    const sql = buildGrrBySegmentSql({ month: "2026-05-01' OR '1'='1", dimension: 'l1' });
    expect(sql).toContain("'2026-05-01'' OR ''1''=''1'");
  });
});

describe('buildGrrAccountsSql', () => {
  it('lists accounts for a clicked segment with labels, reasoning, sorted by lost $', () => {
    const sql = buildGrrAccountsSql({
      month: '2026-05-01', filters: { l1: 'Construction & Trades' },
    });
    expect(sql).toContain('revenue.int_customer_annual_mrr');
    expect(sql).toContain('QUALIFY ROW_NUMBER() OVER');
    expect(sql).toContain('c.Company');
    expect(sql).toContain('SUM(c.StartMRR)      AS start_mrr');
    expect(sql).toContain('SUM(c.Cancellations) AS churn_mrr');
    expect(sql).toContain('SUM(c.Downgrades)    AS downgrade_mrr');
    expect(sql).toContain('lb.l1, lb.l2, lb.l3, lb.operating_model, lb.confidence');
    expect(sql).toContain('lb.business_description, lb.short_reasoning');
    expect(sql).toContain("AND COALESCE(lb.l1, 'Unclassified') = 'Construction & Trades'");
    expect(sql).toContain('ORDER BY (SUM(c.Cancellations) + SUM(c.Downgrades)) DESC');
    expect(sql).toContain('LIMIT 200');
  });

  it('only includes accounts in the annual GRR base (StartMRR > 0)', () => {
    const sql = buildGrrAccountsSql({ month: '2026-05-01', filters: { operating_model: 'Service_Only' } });
    expect(sql).toContain('HAVING SUM(c.StartMRR) > 0');
  });
});
