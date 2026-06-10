import { describe, it, expect } from 'vitest';
import { buildFunnelSpineSql } from '../../src/lib/funnelSql.js';
import { buildConversionMrrSql } from '../../src/lib/funnelSql.js';
import { buildFunnelAccountTableSql } from '../../src/lib/funnelSql.js';

describe('buildFunnelSpineSql', () => {
  it('builds an entity-level cohort spine for one trial-month', () => {
    const sql = buildFunnelSpineSql({ cohortMonth: '2026-01-01' });
    expect(sql).toContain('revenue.Funnel');
    expect(sql).toContain("MIN(IF(EventType='Trial'");
    expect(sql).toContain("MIN(IF(EventType='Sync'");
    expect(sql).toContain("MIN(IF(EventType='Conversion'");
    expect(sql).toContain('COUNTIF(s.sync_date IS NOT NULL AND s.sync_date >= s.trial_date)');
    expect(sql).toContain('COUNTIF(s.conversion_date IS NOT NULL AND s.conversion_date >= s.trial_date)');
    expect(sql).toContain("DATE_TRUNC(s.trial_date, MONTH) = '2026-01-01'");
    expect(sql).not.toContain('GROUP BY segment');
  });

  it('groups by company-size bucket when segment=CompanySize', () => {
    const sql = buildFunnelSpineSql({ cohortMonth: '2026-01-01', segment: 'CompanySize' });
    expect(sql).toContain('MAX(LicenseCount) AS licenses');
    expect(sql).toContain('AS segment');
    expect(sql).toContain('GROUP BY segment');
    expect(sql).toContain('ORDER BY segment');
  });

  it('escapes single quotes in cohortMonth (injection guard)', () => {
    const sql = buildFunnelSpineSql({ cohortMonth: "2026-01-01' OR '1'='1" });
    expect(sql).toContain("'2026-01-01'' OR ''1''=''1'");
  });
});

describe('buildConversionMrrSql', () => {
  it('sums converted-cohort MRR split into core vs DEP from the lines model', () => {
    const sql = buildConversionMrrSql({ cohortMonth: '2026-01-01' });
    expect(sql).toContain('int_customer_mrr_lines');
    expect(sql).toContain("conversion_date IS NOT NULL AND conversion_date >= trial_date");
    expect(sql).toContain("DATE_TRUNC(trial_date, MONTH) = '2026-01-01'");
    expect(sql).toContain('premium app');
    expect(sql).toContain('enhancement plan');
    expect(sql).toContain('AS core_mrr');
    expect(sql).toContain('AS dep_mrr');
    expect(sql).toContain('l.month = (SELECT m FROM latest)');
  });
});

describe('buildFunnelAccountTableSql', () => {
  it('lists converted-stage accounts for a cohort, with mrr as deltaMrr', () => {
    const sql = buildFunnelAccountTableSql({ cohortMonth: '2026-01-01', stage: 'converted' });
    expect(sql).toContain('revenue.Funnel');
    expect(sql).toContain('entity_record_id');
    expect(sql).toContain('AS deltaMrr');
    expect(sql).toContain('s.conversion_date IS NOT NULL AND s.conversion_date >= s.trial_date');
    expect(sql).toContain('LIMIT 50');
  });
  it('synced stage filters on sync_date; trial stage has no extra filter', () => {
    expect(buildFunnelAccountTableSql({ cohortMonth: '2026-01-01', stage: 'synced' }))
      .toContain('s.sync_date IS NOT NULL AND s.sync_date >= s.trial_date');
    const trial = buildFunnelAccountTableSql({ cohortMonth: '2026-01-01', stage: 'trial' });
    expect(trial).not.toContain('sync_date IS NOT NULL');
    expect(trial).not.toContain('conversion_date IS NOT NULL');
  });
});
