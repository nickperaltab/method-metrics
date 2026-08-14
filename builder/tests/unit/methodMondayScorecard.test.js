import { describe, it, expect } from 'vitest';
import methodMonday from '../../src/config/scorecards/method-monday-scorecard.js';
import { SCORECARDS } from '../../src/config/scorecards/index.js';

describe('Method Monday scorecard', () => {
  it('is registered', () => {
    expect(SCORECARDS['method-monday']).toBe(methodMonday);
  });

  it('starts pending', () => {
    expect(methodMonday.status).toBe('pending');
  });

  it('has the three sections in order', () => {
    expect(methodMonday.sections.map((s) => s.title))
      .toEqual(['Acquisition', 'Conversion', 'Churn']);
  });

  it('every section states that figures exclude today', () => {
    for (const s of methodMonday.sections) {
      expect(s.description).toMatch(/exclude[s]? today/i);
    }
  });

  it('gives every KPI its own metric id', () => {
    for (const s of methodMonday.sections) {
      const ids = s.kpis.map((k) => k.metricId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('uses no placeholder ids', () => {
    const all = JSON.stringify(methodMonday);
    expect(all).not.toMatch(/NEW_|TODO|undefined/);
  });

  it('never labels an attainment tile as forecast-vs-trajectory', () => {
    // Looker mislabels these. We do not inherit the mistake.
    for (const s of methodMonday.sections) {
      for (const k of s.kpis) {
        if (/attainment/i.test(k.label)) {
          expect(k.label).not.toMatch(/forecast vs/i);
        }
      }
    }
  });

  it('has exactly one tile for the sync conversion rate (trajectory == actual)', () => {
    const conversion = methodMonday.sections.find((s) => s.title === 'Conversion');
    const syncRateTiles = conversion.kpis.filter((k) =>
      /sync conversion rate/i.test(k.label) && !/forecast/i.test(k.label)
    );
    expect(syncRateTiles.length).toBe(1);
  });

  it('uses the correct format for every percentage-emitting metric', () => {
    const percentIds = new Set([361, 414, 416, 418, 321]);
    const decimalRateIds = new Set([400, 402, 319, 357]);
    for (const s of methodMonday.sections) {
      for (const k of s.kpis) {
        if (percentIds.has(k.metricId)) expect(k.format).toBe('percent');
        if (decimalRateIds.has(k.metricId)) expect(k.format).toBe('decimal_rate');
      }
    }
  });

  it('includes all thirteen Task 5 metric ids exactly once', () => {
    const expected = [406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418];
    const allIds = methodMonday.sections.flatMap((s) => s.kpis.map((k) => k.metricId));
    for (const id of expected) {
      expect(allIds.filter((x) => x === id).length).toBe(1);
    }
  });

  it('includes all reused pre-existing ids exactly once (fix round 1: full seven-group scope)', () => {
    // 295/296/400/361/402/285/286/273 from the original build, plus
    // 319/357/321 (trials Conversion Rate) and 274 (Forecasted Churn) added
    // in fix round 1 to complete the spec's seven groups.
    const expected = [295, 296, 400, 361, 402, 285, 286, 273, 319, 357, 321, 274];
    const allIds = methodMonday.sections.flatMap((s) => s.kpis.map((k) => k.metricId));
    for (const id of expected) {
      expect(allIds.filter((x) => x === id).length).toBe(1);
    }
  });

  it('has the trials Conversion Rate group in Conversion, distinct from Sync Conversion Rate', () => {
    const conversion = methodMonday.sections.find((s) => s.title === 'Conversion');
    const ids = conversion.kpis.map((k) => k.metricId);
    expect(ids).toEqual(expect.arrayContaining([319, 357, 321]));
  });

  it('has Forecasted Churn (274) in the Churn section', () => {
    const churn = methodMonday.sections.find((s) => s.title === 'Churn');
    expect(churn.kpis.map((k) => k.metricId)).toContain(274);
  });
});
