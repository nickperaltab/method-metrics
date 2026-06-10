import { describe, it, expect } from 'vitest';
import { buildFunnelSpineSql } from '../../src/lib/funnelSql.js';

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
