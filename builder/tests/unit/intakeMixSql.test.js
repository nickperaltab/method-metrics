import { describe, it, expect } from 'vitest';
import {
  buildIntakeMixSql,
  buildAttachByCohortSql,
  buildBenchmarkSql,
  buildIntakeQualitySql,
  buildConvertRateByBandSql,
  buildGrowthByCohortSql,
  buildSleepingGiantsSql,
  buildGiantsPeerBenchmarkSql,
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

describe('buildIntakeQualitySql', () => {
  it('emits trials-side and convert-side counts with the deduped acct CTE', () => {
    const sql = buildIntakeQualitySql({ startDate: '2024-01-01' });
    expect(sql).toContain('MAX(IF(CustDatAnnualSales BETWEEN 1 AND 1e10, CustDatAnnualSales, NULL)) AS sales');
    expect(sql).toContain('project-for-method-dw.revenue.int_motion_funnel');
    expect(sql).toContain('DATE_TRUNC(f.signup_month, QUARTER) AS quarter');
    expect(sql).toContain('COUNT(*) AS trials');
    expect(sql).toContain('COUNTIF(a.sales >= 1000000) AS trials_1m_plus');
    expect(sql).toContain('COUNTIF(a.sales >= 5000000) AS trials_5m_plus');
    expect(sql).toContain('COUNTIF(f.converted) AS converts');
    expect(sql).toContain('COUNTIF(f.converted AND a.sales >= 5000000) AS converts_5m_plus');
    expect(sql).toContain('ROUND(AVG(IF(f.converted, f.mrr0, NULL)), 0) AS avg_mrr_at_convert');
    expect(sql).toContain("WHERE f.signup_month >= '2024-01-01'");
  });

  it('escapes single quotes in startDate (injection guard)', () => {
    const sql = buildIntakeQualitySql({ startDate: "2024-01-01' OR '1'='1" });
    expect(sql).toContain("'2024-01-01'' OR ''1''=''1'");
  });
});

describe('buildConvertRateByBandSql', () => {
  it('reuses the banded size CTE and emits trials + converts per quarter/band', () => {
    const sql = buildConvertRateByBandSql({ startDate: '2024-01-01' });
    // reuses the shared banded CASE (same cutoffs, No data band)
    expect(sql).toContain("WHEN annual_sales < 1000000 THEN '<$1M'");
    expect(sql).toContain("WHEN annual_sales < 5000000 THEN '$1M–$5M'");
    expect(sql).toContain("COALESCE(b.band, 'No data') AS band");
    expect(sql).toContain('DATE_TRUNC(f.signup_month, QUARTER) AS quarter');
    expect(sql).toContain('COUNT(*) AS trials');
    expect(sql).toContain('COUNTIF(f.converted) AS converts');
    expect(sql).toContain('LEFT JOIN banded b USING (EntityRecordID)');
    expect(sql).toContain("WHERE f.signup_month >= '2024-01-01'");
    expect(sql).toContain('GROUP BY 1, 2');
  });

  it('escapes single quotes in startDate (injection guard)', () => {
    const sql = buildConvertRateByBandSql({ startDate: "2024-01-01' OR '1'='1" });
    expect(sql).toContain("'2024-01-01'' OR ''1''=''1'");
  });
});

describe('buildGrowthByCohortSql', () => {
  // Validated reference values (2024 cohorts, for a test comment only):
  //   $5M+ grew 42.6%, gone 40.5%, median multiple 1.55; <$1M grew 10.2%, gone 70.6%, median 1.0
  it('emits growth measures by convert-cohort quarter × band at nowMonth', () => {
    const sql = buildGrowthByCohortSql({ startDate: '2024-01-01', nowMonth: '2026-06-01' });
    expect(sql).toContain('project-for-method-dw.revenue.int_customer_mrr');
    expect(sql).toContain("WHERE Month = '2026-06-01'");
    expect(sql).toContain('DATE_TRUNC(f.convert_month, QUARTER) AS cohort_quarter');
    // band CASE on cleaned sales
    expect(sql).toContain("WHEN a.sales < 1000000 THEN '<$1M'");
    expect(sql).toContain("WHEN a.sales < 5000000 THEN '$1M–$5M'");
    expect(sql).toContain('COUNT(*) AS converts');
    expect(sql).toContain('COUNTIF(COALESCE(n.mrr_now, 0) > f.mrr0 * 1.1) AS grew_10pct');
    expect(sql).toContain('COUNTIF(COALESCE(n.mrr_now, 0) = 0) AS gone');
    expect(sql).toContain('APPROX_QUANTILES(SAFE_DIVIDE(n.mrr_now, f.mrr0), 2)[OFFSET(1)]');
    expect(sql).toContain('WHERE f.converted AND f.convert_month >= ');
    expect(sql).toContain('AND f.mrr0 > 0');
    expect(sql).toContain('GROUP BY 1, 2');
  });

  it('escapes single quotes in startDate and nowMonth (injection guard)', () => {
    const sql = buildGrowthByCohortSql({ startDate: "2024-01-01' OR '1'='1", nowMonth: "2026-06-01' OR '1'='1" });
    expect(sql).toContain("'2024-01-01'' OR ''1''=''1'");
    expect(sql).toContain("'2026-06-01'' OR ''1''=''1'");
  });
});

describe('buildSleepingGiantsSql', () => {
  // Validated headline numbers (test comment only): 236 accounts, $26.7K MRR total, 162 US.
  it('selects active $5M+ customers paying under the cap, with display columns', () => {
    const sql = buildSleepingGiantsSql({ nowMonth: '2026-06-01', minSales: 5000000, maxMrr: 219 });
    expect(sql).toContain('project-for-method-dw.revenue.int_customer_mrr');
    expect(sql).toContain("WHERE Month = '2026-06-01'");
    expect(sql).toContain('HAVING SUM(StartMRR) > 0');
    // display columns
    expect(sql).toContain('c.Company');
    expect(sql).toContain('c.EntityRecordID');
    expect(sql).toContain("a.country IN ('United States', 'USA', 'US') AS is_us");
    expect(sql).toContain('COALESCE(p.is_customized, FALSE) AS is_customized');
    expect(sql).toContain('v.l1');
    expect(sql).toContain('DATE_DIFF(');
    expect(sql).toContain('a.account_count');
    // tenure from first invoice, bounded
    expect(sql).toContain("MIN(IF(FirstSaaSInvoiceTxnDate BETWEEN '2000-01-01' AND '2026-06-01', FirstSaaSInvoiceTxnDate, NULL)) AS first_invoice");
    // joins
    expect(sql).toContain('project-for-method-dw.revenue.int_customer_proserv');
    expect(sql).toContain('project-for-method-dw.v7_classification.v_entity_primary_label');
    // filter + ordering (numeric literals, not string-escaped)
    expect(sql).toContain('WHERE a.sales >= 5000000 AND c.mrr < 219');
    expect(sql).toContain('ORDER BY is_us DESC, a.sales DESC');
    expect(sql).toContain('LIMIT 250');
  });

  it('escapes single quotes in nowMonth (injection guard)', () => {
    const sql = buildSleepingGiantsSql({ nowMonth: "2026-06-01' OR '1'='1" });
    expect(sql).toContain("'2026-06-01'' OR ''1''=''1'");
  });

  it('throws when minSales/maxMrr are non-numeric (injection guard)', () => {
    expect(() => buildSleepingGiantsSql({ nowMonth: '2026-06-01', minSales: '5000000; DROP TABLE x' })).toThrow(/minSales/i);
    expect(() => buildSleepingGiantsSql({ nowMonth: '2026-06-01', maxMrr: NaN })).toThrow(/maxMrr/i);
    expect(() => buildSleepingGiantsSql({ nowMonth: '2026-06-01', minSales: -1 })).toThrow(/minSales/i);
  });
});

describe('buildGiantsPeerBenchmarkSql', () => {
  // Validated: avg engaged $5M+ peer MRR = $778 at nowMonth = '2026-06-01'.
  it('averages MRR of active $5M+ customers paying a real plan', () => {
    const sql = buildGiantsPeerBenchmarkSql({ nowMonth: '2026-06-01', minSales: 5000000, minMrr: 219 });
    expect(sql).toContain('project-for-method-dw.revenue.int_customer_mrr');
    expect(sql).toContain("WHERE Month = '2026-06-01'");
    expect(sql).toContain('ROUND(AVG(c.mrr)) AS avg_peer_mrr');
    expect(sql).toContain('WHERE a.sales >= 5000000 AND c.mrr >= 219');
  });

  it('throws when minSales/minMrr are non-numeric (injection guard)', () => {
    expect(() => buildGiantsPeerBenchmarkSql({ nowMonth: '2026-06-01', minMrr: 'x' })).toThrow(/minMrr/i);
    expect(() => buildGiantsPeerBenchmarkSql({ nowMonth: '2026-06-01', minSales: 0 })).toThrow(/minSales/i);
  });
});
