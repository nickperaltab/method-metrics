import { describe, it, expect } from 'vitest';
import {
  buildIntakeMixSql,
  buildAttachByCohortSql,
  buildBenchmarkSql,
  INTAKE_POPULATIONS,
} from '../../src/lib/intakeMixSql.js';

describe('INTAKE_POPULATIONS', () => {
  it('allows exactly trials and new_customers', () => {
    expect(INTAKE_POPULATIONS).toEqual(['trials', 'new_customers']);
  });
});

describe('buildIntakeMixSql — shared size-band CTE', () => {
  it('cleans CustDatAnnualSales to BETWEEN 1 AND 1e10 and dedupes with MAX', () => {
    const sql = buildIntakeMixSql({ population: 'trials' });
    expect(sql).toContain('MAX(IF(CustDatAnnualSales BETWEEN 1 AND 1e10, CustDatAnnualSales, NULL))');
    expect(sql).toContain('project-for-method-dw.revenue.Account');
  });

  it('bands NULL as No data and uses the $1M/$5M cutoffs', () => {
    const sql = buildIntakeMixSql({ population: 'trials' });
    expect(sql).toContain("WHEN annual_sales IS NULL THEN 'No data'");
    expect(sql).toContain("WHEN annual_sales < 1000000 THEN '<$1M'");
    expect(sql).toContain("WHEN annual_sales < 5000000 THEN '$1M–$5M'");
    expect(sql).toContain("ELSE '$5M+'");
  });

  it("COALESCEs the band to 'No data' AFTER the LEFT JOIN (missing-from-Account gotcha)", () => {
    const sql = buildIntakeMixSql({ population: 'trials' });
    expect(sql).toContain("COALESCE(b.band, 'No data') AS band");
  });
});

describe('buildIntakeMixSql — trials', () => {
  it('buckets trials by signup quarter from int_motion_funnel', () => {
    const sql = buildIntakeMixSql({ population: 'trials', startDate: '2024-01-01' });
    expect(sql).toContain('project-for-method-dw.revenue.int_motion_funnel');
    expect(sql).toContain('DATE_TRUNC(f.signup_month, QUARTER) AS quarter');
    expect(sql).toContain('COUNT(*) AS n');
    expect(sql).toContain("WHERE f.signup_month >= '2024-01-01'");
    expect(sql).toContain('LEFT JOIN banded b ON b.EntityRecordID = f.EntityRecordID');
    expect(sql).toContain('GROUP BY quarter, band');
  });
});

describe('buildIntakeMixSql — new_customers', () => {
  it('buckets new paying customers by Month quarter with IsNew filter', () => {
    const sql = buildIntakeMixSql({ population: 'new_customers', startDate: '2024-01-01' });
    expect(sql).toContain('project-for-method-dw.revenue.int_customers');
    expect(sql).toContain('DATE_TRUNC(c.Month, QUARTER) AS quarter');
    expect(sql).toContain('COUNT(DISTINCT c.EntityRecordID) AS n');
    expect(sql).toContain('WHERE c.IsNew AND c.Month >=');
    expect(sql).toContain('LEFT JOIN banded b ON b.EntityRecordID = c.EntityRecordID');
  });

  it('escapes single quotes in startDate (injection guard)', () => {
    const sql = buildIntakeMixSql({ population: 'new_customers', startDate: "2024-01-01' OR '1'='1" });
    expect(sql).toContain("'2024-01-01'' OR ''1''=''1'");
  });

  it('throws on a non-allowlisted population (injection guard)', () => {
    expect(() => buildIntakeMixSql({ population: 'x; DROP TABLE y' })).toThrow(/population/i);
  });
});

describe('buildAttachByCohortSql', () => {
  it('cohorts by first-pay quarter with 90/180-day attach windows', () => {
    const sql = buildAttachByCohortSql({ startDate: '2024-01-01' });
    expect(sql).toContain('project-for-method-dw.revenue.int_customers');
    expect(sql).toContain('project-for-method-dw.revenue.int_customer_proserv');
    expect(sql).toContain('MIN(Month) AS fp');
    expect(sql).toContain('DATE_TRUNC(fp.fp, QUARTER) AS cohort_quarter');
    expect(sql).toContain('COUNT(*) AS new_customers');
    expect(sql).toContain('DATE_DIFF(p.first_ps_date, fp.fp, DAY) <= 90) AS attached_90d');
    expect(sql).toContain('DATE_DIFF(p.first_ps_date, fp.fp, DAY) <= 180) AS attached_180d');
    expect(sql).toContain("WHERE fp.fp >= '2024-01-01'");
  });

  it('escapes single quotes in startDate (injection guard)', () => {
    const sql = buildAttachByCohortSql({ startDate: "2024-01-01' OR '1'='1" });
    expect(sql).toContain("'2024-01-01'' OR ''1''=''1'");
  });
});

describe('buildBenchmarkSql', () => {
  // Validated live result for month = '2026-06-01':
  //   n = 949, avg_mrr = 576, pct_5m_plus = 42.5, pct_customized = 84, pct_mnd = 47.8
  it('builds the top-30%-by-MRR fingerprint for a month', () => {
    const sql = buildBenchmarkSql({ month: '2026-06-01' });
    expect(sql).toContain('project-for-method-dw.revenue.int_customer_annual_mrr');
    expect(sql).toContain("WHERE Month = '2026-06-01' AND StartMRR > 0");
    // top-30% via ROW_NUMBER()/COUNT()
    expect(sql).toContain('ROW_NUMBER() OVER (ORDER BY mrr DESC)');
    expect(sql).toContain('COUNT(*) OVER ()');
    expect(sql).toContain('WHERE pr <= 0.30');
    // the five fingerprint measures
    expect(sql).toContain('COUNT(*) AS n');
    expect(sql).toContain('ROUND(AVG(t.mrr)) AS avg_mrr');
    expect(sql).toContain('COUNTIF(s.annual_sales >= 5000000)');
    expect(sql).toContain('COUNTIF(COALESCE(p.is_customized, FALSE))');
    expect(sql).toContain("COUNTIF(v.l1 = 'Manufacturing & Distribution')");
    // joins to size / proserv / label view
    expect(sql).toContain('project-for-method-dw.revenue.int_customer_proserv');
    expect(sql).toContain('project-for-method-dw.v7_classification.v_entity_primary_label');
  });

  it('escapes single quotes in month (injection guard)', () => {
    const sql = buildBenchmarkSql({ month: "2026-06-01' OR '1'='1" });
    expect(sql).toContain("'2026-06-01'' OR ''1''=''1'");
  });
});
