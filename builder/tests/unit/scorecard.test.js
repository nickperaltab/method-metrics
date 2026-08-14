import { describe, it, expect } from 'vitest';
import { formatValue, resolveKpiValue, computeDelta } from '../../src/components/scorecards/utils';
import salesScorecard from '../../src/config/scorecards/sales-scorecard';

// ── formatValue ──────────────────────────────────────────────

describe('formatValue', () => {
  it('formats currency with cents', () => {
    expect(formatValue(1165.60, 'currency')).toBe('$1,165.60');
  });

  it('formats large currency', () => {
    expect(formatValue(15486.04, 'currency')).toBe('$15,486.04');
  });

  it('formats decimal_rate (raw decimal → percentage)', () => {
    expect(formatValue(0.176, 'decimal_rate')).toBe('17.60%');
  });

  it('formats percent (already a percentage number)', () => {
    expect(formatValue(95.5, 'percent')).toBe('95.5%');
  });

  it('formats number', () => {
    expect(formatValue(758, 'number')).toBe('758');
  });

  it('formats large number with commas', () => {
    expect(formatValue(810463, 'number')).toBe('810,463');
  });

  it('returns No data for null', () => {
    expect(formatValue(null, 'number')).toBe('No data');
  });

  it('returns No data for NaN', () => {
    expect(formatValue(NaN, 'currency')).toBe('No data');
  });

  it('formats zero correctly', () => {
    expect(formatValue(0, 'number')).toBe('0');
    expect(formatValue(0, 'currency')).toBe('$0.00');
    expect(formatValue(0, 'percent')).toBe('0.0%');
  });

  it('formats negative currency', () => {
    // JS toLocaleString puts sign after $ for negative numbers
    expect(formatValue(-9075.24, 'currency')).toBe('$-9,075.24');
  });

  // The 2026 styling pass touched every other file in components/scorecards/
  // but deliberately left this function's numeric logic alone. The two percent
  // formats are NOT interchangeable: 'percent' takes a number already scaled to
  // 100, 'decimal_rate' takes a raw fraction and scales it. Collapsing them is
  // what once shipped a tile reading 3289%. Same input, two answers, on purpose.
  it('keeps percent and decimal_rate distinct for the same input', () => {
    expect(formatValue(32.89, 'percent')).toBe('32.9%');
    expect(formatValue(32.89, 'decimal_rate')).toBe('3289.00%');
    expect(formatValue(0.3289, 'percent')).toBe('0.3%');
    expect(formatValue(0.3289, 'decimal_rate')).toBe('32.89%');
  });

  it('keeps its remaining branches: percent2, delta, currency_delta, default', () => {
    expect(formatValue(95.55, 'percent2')).toBe('95.55%');
    expect(formatValue(4.2, 'delta')).toBe('+4.20%');
    expect(formatValue(-4.2, 'delta')).toBe('-4.20%');
    expect(formatValue(1200.5, 'currency_delta')).toBe('+$1,200.5');
    expect(formatValue(-1200.5, 'currency_delta')).toBe('$-1,200.5');
    expect(formatValue(7, 'unrecognised')).toBe('7');
  });
});

// ── resolveKpiValue ──────────────────────────────────────────

describe('resolveKpiValue', () => {
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const priorDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const priorPeriod = `${priorDate.getFullYear()}-${String(priorDate.getMonth() + 1).padStart(2, '0')}`;

  const series = {
    labels: [priorPeriod, currentPeriod],
    data: [100, 200],
  };

  it('current_month returns value when period exists', () => {
    expect(resolveKpiValue(series, 'current_month')).toBe(200);
  });

  it('current_month returns null when period missing', () => {
    const old = { labels: ['2020-01'], data: [50] };
    expect(resolveKpiValue(old, 'current_month')).toBeNull();
  });

  it('current_or_latest returns current month value when present', () => {
    expect(resolveKpiValue(series, 'current_or_latest')).toBe(200);
  });

  it('current_or_latest returns 0 when data ends before current month', () => {
    const old = { labels: ['2020-01', '2020-02'], data: [50, 60] };
    expect(resolveKpiValue(old, 'current_or_latest')).toBe(0);
  });

  it('prior_month returns prior month value', () => {
    expect(resolveKpiValue(series, 'prior_month')).toBe(100);
  });

  it('latest returns last data point', () => {
    expect(resolveKpiValue(series, 'latest')).toBe(200);
  });

  it('returns null for null series', () => {
    expect(resolveKpiValue(null, 'current_month')).toBeNull();
  });

  it('returns null for empty series', () => {
    expect(resolveKpiValue({ labels: [], data: [] }, 'current_month')).toBeNull();
  });
});

// ── computeDelta ─────────────────────────────────────────────

describe('computeDelta', () => {
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const priorDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const priorPeriod = `${priorDate.getFullYear()}-${String(priorDate.getMonth() + 1).padStart(2, '0')}`;

  it('computes positive delta', () => {
    const series = { labels: [priorPeriod, currentPeriod], data: [100, 150] };
    const result = computeDelta(series);
    expect(result.delta).toBe(50);
    expect(result.deltaPercent).toBe(50);
  });

  it('computes negative delta', () => {
    const series = { labels: [priorPeriod, currentPeriod], data: [200, 100] };
    const result = computeDelta(series);
    expect(result.delta).toBe(-100);
    expect(result.deltaPercent).toBe(-50);
  });

  it('returns null when prior is 0', () => {
    const series = { labels: [priorPeriod, currentPeriod], data: [0, 100] };
    expect(computeDelta(series)).toBeNull();
  });
});

// ── Sales scorecard config validation ────────────────────────

describe('Sales scorecard config', () => {
  it('has 8 sections', () => {
    expect(salesScorecard.sections).toHaveLength(8);
  });

  it('sections are in correct order', () => {
    const titles = salesScorecard.sections.map(s => s.title);
    expect(titles).toEqual([
      'Conversion Rate',
      'Sync Conversion Rate',
      'New Net SaaS',
      'New DEP Revenue',
      'Churn Rate',
      'Total Net SaaS',
      'Total DEP Revenue',
      'NRR',
    ]);
  });

  it('every KPI has required fields', () => {
    for (const section of salesScorecard.sections) {
      for (const kpi of section.kpis || []) {
        expect(kpi).toHaveProperty('metricId');
        expect(kpi).toHaveProperty('label');
        expect(kpi).toHaveProperty('format');
        expect(kpi).toHaveProperty('valueSelector');
        expect(['number', 'percent', 'percent2', 'decimal_rate', 'currency']).toContain(kpi.format);
      }
    }
  });

  it('every chart has required fields', () => {
    for (const section of salesScorecard.sections) {
      for (const chart of section.charts || []) {
        expect(chart).toHaveProperty('label');
        expect(chart).toHaveProperty('chartType');
        expect(chart).toHaveProperty('metrics');
        expect(chart.metrics.length).toBeGreaterThan(0);
      }
    }
  });

  it('Conversion Rate section has correct KPI metric IDs', () => {
    const convRate = salesScorecard.sections[0];
    const ids = convRate.kpis.map(k => k.metricId);
    expect(ids).toEqual([408, 296, 319, 357, 321, 322, 323]);
  });

  it('Churn Rate section uses metric 274 (Forecasted Churn) first', () => {
    const churn = salesScorecard.sections[4];
    expect(churn.kpis[0].metricId).toBe(274);
    expect(churn.kpis[0].label).toBe('Forecasted Churn');
  });

  it('NRR metrics use percent format (not decimal_rate)', () => {
    const nrr = salesScorecard.sections[7];
    for (const kpi of nrr.kpis) {
      expect(kpi.format).toBe('percent');
    }
  });
});
