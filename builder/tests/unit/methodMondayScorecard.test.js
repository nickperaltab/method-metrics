import { describe, it, expect } from 'vitest';
import methodMonday from '../../src/config/scorecards/method-monday-scorecard.js';
import { SCORECARDS } from '../../src/config/scorecards/index.js';

const DETAIL_SECTION_TITLES = [
  'Sync %', 'Trials', 'Syncs', 'Conversions', 'Conversion Rate',
  'Sync Conversion Rate', 'Churn',
];

describe('Method Monday scorecard', () => {
  it('is registered', () => {
    expect(SCORECARDS['method-monday']).toBe(methodMonday);
  });

  it('starts pending', () => {
    expect(methodMonday.status).toBe('pending');
  });

  it('leads with the Pace section, followed by one section per metric group', () => {
    expect(methodMonday.sections.map((s) => s.title))
      .toEqual(['Pace', ...DETAIL_SECTION_TITLES]);
  });

  it('the Pace section is a page-scoped component, not a kpi row', () => {
    const pace = methodMonday.sections[0];
    expect(pace.title).toBe('Pace');
    expect(pace.component).toBe('methodMondayPace');
    expect(pace.kpis).toBeUndefined();
  });

  const detailSections = () => methodMonday.sections.filter((s) => s.title !== 'Pace');

  it('every detail section states that figures exclude today', () => {
    for (const s of detailSections()) {
      expect(s.description).toMatch(/exclude[s]? today/i);
    }
  });

  it('gives every KPI its own metric id within a section', () => {
    for (const s of detailSections()) {
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
    for (const s of detailSections()) {
      for (const k of s.kpis) {
        if (/attainment/i.test(k.label)) {
          expect(k.label).not.toMatch(/forecast vs/i);
        }
      }
    }
  });

  it('has exactly one tile for the sync conversion rate (trajectory == actual)', () => {
    const section = methodMonday.sections.find((s) => s.title === 'Sync Conversion Rate');
    const syncRateTiles = section.kpis.filter((k) =>
      /sync conversion rate/i.test(k.label) && !/forecast/i.test(k.label)
    );
    expect(syncRateTiles.length).toBe(1);
  });

  it('uses the correct format for every percentage-emitting metric', () => {
    const percentIds = new Set([361, 414, 416, 418, 321]);
    const decimalRateIds = new Set([400, 402, 319, 357]);
    for (const s of detailSections()) {
      for (const k of s.kpis) {
        if (percentIds.has(k.metricId)) expect(k.format).toBe('percent');
        if (decimalRateIds.has(k.metricId)) expect(k.format).toBe('decimal_rate');
      }
    }
  });

  it('includes all thirteen Task 5 metric ids exactly once', () => {
    const expected = [406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418];
    const allIds = detailSections().flatMap((s) => s.kpis.map((k) => k.metricId));
    for (const id of expected) {
      expect(allIds.filter((x) => x === id).length).toBe(1);
    }
  });

  it('includes all reused pre-existing ids exactly once (fix round 1: full seven-group scope)', () => {
    // 295/296/400/361/402/285/286/273 from the original build, plus
    // 319/357/321 (trials Conversion Rate) and 274 (Forecasted Churn) added
    // in fix round 1 to complete the spec's seven groups.
    const expected = [295, 296, 400, 361, 402, 285, 286, 273, 319, 357, 321, 274];
    const allIds = detailSections().flatMap((s) => s.kpis.map((k) => k.metricId));
    for (const id of expected) {
      expect(allIds.filter((x) => x === id).length).toBe(1);
    }
  });

  it('has the trials Conversion Rate group in its own section, distinct from Sync Conversion Rate', () => {
    const section = methodMonday.sections.find((s) => s.title === 'Conversion Rate');
    const ids = section.kpis.map((k) => k.metricId);
    expect(ids).toEqual(expect.arrayContaining([319, 357, 321]));
  });

  it('has Forecasted Churn (274) in the Churn section', () => {
    const churn = methodMonday.sections.find((s) => s.title === 'Churn');
    expect(churn.kpis.map((k) => k.metricId)).toContain(274);
  });

  it('regroups the 25 pre-existing detail tiles per metric rather than three undifferentiated rows', () => {
    // Redesign requirement: nothing available before the redesign disappears,
    // it's just organized by metric instead of by the old 3-section layout.
    const allIds = detailSections().flatMap((s) => s.kpis.map((k) => k.metricId));
    expect(allIds.length).toBe(25);
    expect(detailSections().length).toBe(7);
  });
});
