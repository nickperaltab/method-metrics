import { describe, it, expect } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

const sql = await import('../../src/lib/sql/index.js');

const trialsMetric = {
  id: 54,
  semantic_table: 'int_trials',
  semantic_measure: 'COUNT(*)',
  semantic_date_col: 'SignupDate',
  semantic_filters: [],
  semantic_dimensions: ['Channel'],
};

describe('buildSemanticSql', () => {
  it('builds monthly GROUP BY query over last N months', () => {
    const out = sql.buildSemanticSql(trialsMetric, 'month', 13, null);
    expect(out).toContain('int_trials');
    expect(out).toContain("FORMAT_DATE('%Y-%m'");
    expect(out).toContain('SignupDate');
    expect(out).toContain('INTERVAL 13 MONTH');
    expect(out).toContain('GROUP BY 1');
  });

  it('uses WEEK(MONDAY) for weekly grain', () => {
    const out = sql.buildSemanticSql(trialsMetric, 'week', 3, null);
    expect(out).toContain('WEEK(MONDAY)');
    expect(out).toContain("FORMAT_DATE('%Y-%m-%d'");
  });

  it('ANDs semantic_filters entries into WHERE', () => {
    const m = { ...trialsMetric, semantic_filters: ["Channel = 'Organic'", 'IsActive = TRUE'] };
    const out = sql.buildSemanticSql(m, 'month', 13, null);
    expect(out).toContain("Channel = 'Organic'");
    expect(out).toContain('IsActive = TRUE');
    expect(out).toMatch(/AND/);
  });

  it('applies endDateRule via buildEndDateClause', () => {
    const out = sql.buildSemanticSql(trialsMetric, 'month', 13, 'yesterday');
    expect(out).toContain('DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)');
  });
});

describe('buildSemanticGroupedSql', () => {
  it('groups by allowed dimension + period', () => {
    const out = sql.buildSemanticGroupedSql(trialsMetric, 'Channel', 'month', 13);
    expect(out).toContain('Channel AS dimension');
    expect(out).toContain('GROUP BY 1, 2');
  });

  it('throws when dimension is not in semantic_dimensions', () => {
    expect(() => sql.buildSemanticGroupedSql(trialsMetric, 'CountryCode', 'month', 13)).toThrow(/not an approved dimension/);
  });
});

describe('wrapChartSql', () => {
  it('adds period time-filter for positive lastNMonths', () => {
    const wrapped = sql.wrapChartSql("SELECT '2026-01' AS period, 42 AS value", 13);
    expect(wrapped).toContain('WHERE period >=');
    expect(wrapped).toContain('INTERVAL 13 MONTH');
  });

  it('returns input unchanged when lastNMonths is null', () => {
    const q = "SELECT '2026-01' AS period, 42 AS value";
    expect(sql.wrapChartSql(q, null)).toBe(q);
  });
});

describe('buildEndDateClause', () => {
  it('yesterday', () => {
    expect(sql.buildEndDateClause('dt', 'yesterday')).toContain('DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)');
  });
  it('previous_sunday', () => {
    expect(sql.buildEndDateClause('dt', 'previous_sunday')).toContain('WEEK(MONDAY)');
  });
  it('days_ago_N', () => {
    expect(sql.buildEndDateClause('dt', 'days_ago_7')).toContain('INTERVAL 7 DAY');
  });
  it('null rule returns null', () => {
    expect(sql.buildEndDateClause('dt', null)).toBeNull();
  });
});
