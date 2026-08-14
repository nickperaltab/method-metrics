import { describe, it, expect } from 'vitest';
import {
  METRIC_DEFS,
  normalize,
  computeAttainmentPercent,
  harmfulDistance,
  classifyBand,
  buildPaceRow,
  buildPaceRows,
} from '../../src/lib/methodMondayPace';
import methodMonday from '../../src/config/scorecards/method-monday-scorecard.js';

// Build a fake dataMap the same shape resolveKpiValue expects: a Map from
// metricId -> { labels, data }, with the current month's value at the last
// index so 'current_or_latest' resolves it.
function fakeSeries(value) {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { labels: [period], data: [value] };
}

function mapFrom(values) {
  const m = new Map();
  for (const [id, v] of Object.entries(values)) {
    m.set(Number(id), fakeSeries(v));
  }
  return m;
}

describe('methodMondayPace: churn inversion', () => {
  it('classifies 111% attainment as bad for churn (over forecast = harmful)', () => {
    const band = classifyBand(111, /* inverted */ true);
    expect(band).not.toBe('green');
    expect(harmfulDistance(111, true)).toBe(11);
  });

  it('classifies 111% attainment as good for trials (over forecast = ahead of pace)', () => {
    const band = classifyBand(111, /* inverted */ false);
    expect(band).toBe('green');
    expect(harmfulDistance(111, false)).toBe(-11);
  });

  it('classifies 89% attainment as bad for trials (behind pace) and good for churn (under forecast)', () => {
    expect(classifyBand(89, false)).not.toBe('green');
    expect(classifyBand(89, true)).toBe('green');
  });

  it('end-to-end: churn row at 110.8% attainment (109.69 / 99) is flagged harmful, not on-pace', () => {
    const churnDef = METRIC_DEFS.find((d) => d.key === 'churn');
    const dataMap = mapFrom({ 411: 109.69, 274: 99 });
    const row = buildPaceRow(churnDef, dataMap);
    expect(row.attainment).toBeCloseTo(110.8, 1);
    expect(row.harmfulDistance).toBeGreaterThan(0);
    expect(row.band).not.toBe('green');
  });
});

describe('methodMondayPace: percentage/decimal normalization', () => {
  it('multiplies a decimal_rate value by 100, leaves a percent value unchanged', () => {
    expect(normalize(0.2474, 'decimal_rate')).toBeCloseTo(24.74, 5);
    expect(normalize(50.0, 'percent')).toBe(50.0);
    expect(normalize(620, 'number')).toBe(620);
  });

  it('returns null for null/NaN input rather than propagating a bad value', () => {
    expect(normalize(null, 'decimal_rate')).toBeNull();
    expect(normalize(undefined, 'percent')).toBeNull();
  });

  it('regression: dividing an un-normalized decimal_rate by a percent produces the same', () => {
    // This is exactly the shape of the 3289% bug: one series on 0-1, the
    // other on 0-100, divided without normalizing first would be off by
    // ~100x. Sync Conversion Rate: #400 (decimal 0.2474) / #402 (decimal
    // 0.2711) — both normalized to the same 0-100 scale by buildPaceRow.
    const def = METRIC_DEFS.find((d) => d.key === 'syncConversionRate');
    const dataMap = mapFrom({ 400: 0.2474, 402: 0.2711 });
    const row = buildPaceRow(def, dataMap);
    // Correct: (24.74 / 27.11) * 100 ~= 91.3%
    expect(row.attainment).toBeCloseTo(91.3, 0);
    // The bug this guards against: forgetting to normalize would compute
    // (0.2474 / 27.11) * 100 ~= 0.91%, or (24.74 / 0.2711) * 100 ~= 9125% —
    // either is off by ~100x from the correct value.
    expect(row.attainment).not.toBeCloseTo(0.91, 1);
    expect(row.attainment).toBeLessThan(200);
  });

  it('Conversion Rate group: normalizes #319 (decimal) against #321 (already percent)', () => {
    const def = METRIC_DEFS.find((d) => d.key === 'conversionRate');
    // #321 = 8.49 (percent), #319 = 0.18 (decimal) -> forecast normalized to 18.0
    const dataMap = mapFrom({ 321: 8.49, 319: 0.18 });
    const row = buildPaceRow(def, dataMap);
    expect(row.denominator).toBeCloseTo(18.0, 5);
    expect(row.attainment).toBeCloseTo((8.49 / 18.0) * 100, 3);
  });

  it('computeAttainmentPercent guards divide-by-zero and missing data', () => {
    expect(computeAttainmentPercent(50, 0)).toBeNull();
    expect(computeAttainmentPercent(null, 100)).toBeNull();
    expect(computeAttainmentPercent(50, null)).toBeNull();
    expect(computeAttainmentPercent(75, 150)).toBe(50);
  });
});

describe('methodMondayPace: metric ids resolve against the actual page config', () => {
  const configIds = new Set(
    methodMonday.sections.flatMap((s) => (s.kpis || []).map((k) => k.metricId))
  );

  it('every numerator/denominator/attainment id referenced by METRIC_DEFS exists in the page config', () => {
    for (const def of METRIC_DEFS) {
      expect(configIds.has(def.numeratorId)).toBe(true);
      expect(configIds.has(def.denominatorId)).toBe(true);
      if (def.attainmentId) {
        expect(configIds.has(def.attainmentId)).toBe(true);
      }
    }
  });

  it('has exactly seven metric groups, one per pace row', () => {
    expect(METRIC_DEFS.length).toBe(7);
  });
});

describe('methodMondayPace: worst-first ordering under the inverted rule', () => {
  it('sorts a behind-pace metric and an over-forecast churn ahead of an on-pace metric', () => {
    const dataMap = mapFrom({
      // trials: 74.6% attainment (behind pace, harmfulDistance +25.4)
      416: 74.6, 410: 232, 285: 311,
      // churn: 110.8% attainment (over forecast, harmfulDistance +10.8)
      411: 109.69, 274: 99,
      // syncs: exactly on pace (harmfulDistance 0)
      418: 100, 295: 100, 286: 100,
    });
    // Only wire the three defs we're testing to keep this deterministic —
    // build directly rather than depending on the other four groups' data.
    const rows = ['trials', 'churn', 'syncs']
      .map((key) => METRIC_DEFS.find((d) => d.key === key))
      .map((def) => buildPaceRow(def, dataMap))
      .sort((a, b) => {
        if (a.harmfulDistance == null && b.harmfulDistance == null) return 0;
        if (a.harmfulDistance == null) return 1;
        if (b.harmfulDistance == null) return -1;
        return b.harmfulDistance - a.harmfulDistance;
      });

    expect(rows.map((r) => r.key)).toEqual(['trials', 'churn', 'syncs']);
  });

  it('a metric with missing attainment sorts last, not first', () => {
    const dataMap = mapFrom({
      416: 50, 410: 155, 285: 310, // trials: badly behind pace
      // churn deliberately has no data at all
    });
    const trials = buildPaceRow(METRIC_DEFS.find((d) => d.key === 'trials'), dataMap);
    const churn = buildPaceRow(METRIC_DEFS.find((d) => d.key === 'churn'), new Map());
    expect(churn.attainment).toBeNull();
    const sorted = [churn, trials].sort((a, b) => {
      if (a.harmfulDistance == null && b.harmfulDistance == null) return 0;
      if (a.harmfulDistance == null) return 1;
      if (b.harmfulDistance == null) return -1;
      return b.harmfulDistance - a.harmfulDistance;
    });
    expect(sorted.map((r) => r.key)).toEqual(['trials', 'churn']);
  });

  it('buildPaceRows returns all seven rows sorted worst-first end to end', () => {
    // 2026-08-14 acceptance values from the design check.
    const dataMap = mapFrom({
      416: 74.6, 410: 232, 285: 311,       // trials attainment given directly
      418: 59.2, 295: 130, 286: 220,        // syncs attainment given directly
      296: 57.23, 273: 106,                 // conversions: derive 54.0%
      414: 50.0, 361: 63.1,                 // sync %: derive 79.2%
      400: 0.2474, 402: 0.2711,             // sync conversion rate: derive 91.3%
      411: 109.69, 274: 99,                 // churn: derive 110.8%, inverted
      321: 8.49, 319: 0.18,                 // conversion rate: unresolved live inputs, computed here for shape only
    });
    const rows = buildPaceRows(dataMap);
    expect(rows.length).toBe(7);
    // Descending harmful distance end to end (worst first).
    for (let i = 1; i < rows.length; i++) {
      const prevKnown = rows[i - 1].harmfulDistance;
      const curKnown = rows[i].harmfulDistance;
      if (prevKnown == null || curKnown == null) continue;
      expect(prevKnown).toBeGreaterThanOrEqual(curKnown);
    }
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.trials.attainment).toBeCloseTo(74.6, 1);
    expect(byKey.syncs.attainment).toBeCloseTo(59.2, 1);
    expect(byKey.conversions.attainment).toBeCloseTo(54.0, 1);
    expect(byKey.syncPercent.attainment).toBeCloseTo(79.2, 1);
    expect(byKey.syncConversionRate.attainment).toBeCloseTo(91.3, 0);
    expect(byKey.churn.attainment).toBeCloseTo(110.8, 1);
    expect(byKey.churn.band).not.toBe('green');
  });
});
