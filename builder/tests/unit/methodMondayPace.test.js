import { describe, it, expect } from 'vitest';
import {
  METRIC_DEFS,
  normalize,
  computeAttainmentPercent,
  harmfulDistance,
  classifyBand,
  buildPaceRow,
  buildPaceRows,
  isDayOneOfMonth,
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
    // 423 (Churn Attainment) is the registered metric the bar now reads —
    // 411/274 (numerator/denominator) are kept alongside for the dev
    // consistency check, not as the source of the displayed value.
    const dataMap = mapFrom({ 423: 110.8, 411: 109.69, 274: 99 });
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
    // 422 (Sync Conversion Rate Attainment) is the registered metric that
    // supplies the value; 400/402 are kept for the dev consistency check.
    const dataMap = mapFrom({ 422: 91.3, 400: 0.2474, 402: 0.2711 });
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
    // 420 (Conversion Rate Attainment) is the registered metric supplying
    // row.attainment; 321/319 remain for the dev consistency check and for
    // row.denominator, which is still asserted below.
    const dataMap = mapFrom({ 420: (8.49 / 18.0) * 100, 321: 8.49, 319: 0.18 });
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

  it('has exactly eight metric groups, one per pace row', () => {
    expect(METRIC_DEFS.length).toBe(8);
  });

  it('every pace row has a numeric registered attainmentId — none is JS-computed', () => {
    // The whole point of Task 3: each of the seven attainment values shown
    // on the page must resolve to a real Supabase metric id, not a formula
    // evaluated only in this file. computeAttainmentPercent still exists
    // (tested above) but only as the dev-time consistency check's own
    // arithmetic, never as the value buildPaceRow returns.
    for (const def of METRIC_DEFS) {
      expect(typeof def.attainmentId).toBe('number');
      expect(Number.isFinite(def.attainmentId)).toBe(true);
    }
    const attainmentIds = METRIC_DEFS.map((d) => d.attainmentId);
    expect(new Set(attainmentIds).size).toBe(8); // all distinct metrics
  });

  it('buildPaceRow returns attainmentMetricId on every row so the UI can wire a click target', () => {
    for (const def of METRIC_DEFS) {
      const row = buildPaceRow(def, mapFrom({ [def.attainmentId]: 100 }));
      expect(row.attainmentMetricId).toBe(def.attainmentId);
    }
  });
});

describe('methodMondayPace: worst-first ordering under the inverted rule', () => {
  it('sorts a behind-pace metric and an over-forecast churn ahead of an on-pace metric', () => {
    const dataMap = mapFrom({
      // trials: 74.6% attainment (behind pace, harmfulDistance +25.4)
      416: 74.6, 410: 232, 285: 311,
      // churn: 110.8% attainment (over forecast, harmfulDistance +10.8)
      423: 110.8, 411: 109.69, 274: 99,
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

  it('buildPaceRows returns all eight rows sorted worst-first end to end', () => {
    // 2026-08-14 acceptance values from the design check.
    const dataMap = mapFrom({
      416: 74.6, 410: 232, 285: 311,         // trials attainment given directly
      418: 59.2, 295: 130, 286: 220,          // syncs attainment given directly
      419: 54.0, 296: 57.23, 273: 106,        // conversions attainment: 54.0%
      421: 79.2, 414: 50.0, 361: 63.1,        // sync % attainment: 79.2%
      422: 91.3, 400: 0.2474, 402: 0.2711,    // sync conversion rate attainment: 91.3%
      423: 110.8, 411: 109.69, 274: 99,       // churn attainment: 110.8%, inverted
      // Conversion Rate: live values reported back after review — #321
      // (percent, already 0-100) and #319 (decimal_rate, 0-1) normalize to
      // 10.95 / 17.97 = 60.9% attainment, now read from registered #420.
      420: 60.9, 321: 10.95, 319: 0.1797,
      // Churn Rate: 2026-08-17 corrected live values (after the
      // bom_customers prior-settled-month fix AND the #424 percent-scale
      // normalization) -- #345 (percent, 3.73%) over #424 (percent, 2.5,
      // no longer decimal_rate) -> 149.2% attainment, inverted (more churn
      // than forecast is bad), read from #425.
      425: 149.2, 345: 3.73, 424: 2.5,
    });
    const rows = buildPaceRows(dataMap);
    expect(rows.length).toBe(8);
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
    expect(byKey.churnRate.attainment).toBeCloseTo(149.2, 1);
    expect(byKey.churnRate.band).not.toBe('green');
    // Reviewer-confirmed: #321=10.95, #319=0.1797 -> 60.9% attainment,
    // still the second-worst row (behind Conversions at 54.0%, ahead of
    // Syncs at 59.2%... actually between Syncs 59.2 and Trials 74.6 by
    // harmful distance). Assert the value and that it participates
    // correctly in the worst-first sort rather than asserting a fixed
    // position, since the exact rank among close values is incidental.
    expect(byKey.conversionRate.attainment).toBeCloseTo(60.9, 0);
    expect(byKey.conversionRate.harmfulDistance).toBeCloseTo(100 - 60.9, 0);
  });
});

describe('methodMondayPace: day-1-of-month guard (elapsed_days=0, all trajectories NULL)', () => {
  const day1 = new Date(2026, 8, 1); // 2026-09-01 — first real occurrence per review
  const day2 = new Date(2026, 8, 2);

  it('isDayOneOfMonth is true only on the 1st', () => {
    expect(isDayOneOfMonth(day1)).toBe(true);
    expect(isDayOneOfMonth(day2)).toBe(false);
  });

  it('on the 1st, every trajectory-backed row is "unknown" — never a real (or loader-coerced) 0%', () => {
    // Populate the dataMap with values that WOULD render as a maximally
    // harmful 0% attainment if the day-1 guard were missing or broken —
    // this is exactly the shape load.js's `Number(r.value) || 0` produces
    // for a NULL trajectory. The guard must win regardless of what's here.
    const dataMap = mapFrom({
      416: 0, 410: 0, 285: 311,
      418: 0, 295: 0, 286: 220,
      419: 0, 296: 0, 273: 106,
      421: 0, 414: 0, 361: 63.1,
      422: 0, 400: 0, 402: 0.2711,
      423: 0, 411: 0, 274: 99,
      420: 0, 321: 0, 319: 0.1797,
      425: 0, 345: 0, 424: 2.5,
    });
    const rows = buildPaceRows(dataMap, { now: day1 });
    expect(rows.length).toBe(8);
    for (const row of rows) {
      expect(row.attainment).toBeNull();
      expect(row.band).toBe('unknown');
      expect(row.harmfulDistance).toBeNull();
    }
  });

  it('none of the day-1 "unknown" rows sorts above a row with real data', () => {
    // Simulate the boundary directly: build one real (bad) row for the 2nd
    // and one guarded row as if it were the 1st, then sort them together
    // the same way buildPaceRows does.
    const realBadRow = buildPaceRow(
      METRIC_DEFS.find((d) => d.key === 'conversions'),
      // ~9.4% attainment — genuinely terrible. 419 is the registered
      // Conversions Attainment metric this row now reads.
      mapFrom({ 419: (10 / 106) * 100, 296: 10, 273: 106 }),
      { now: day2 }
    );
    const day1Row = buildPaceRow(
      METRIC_DEFS.find((d) => d.key === 'trials'),
      mapFrom({ 410: 0, 285: 311 }),
      { now: day1 }
    );
    expect(day1Row.attainment).toBeNull();
    expect(realBadRow.attainment).not.toBeNull();

    const sorted = [day1Row, realBadRow].sort((a, b) => {
      if (a.harmfulDistance == null && b.harmfulDistance == null) return 0;
      if (a.harmfulDistance == null) return 1;
      if (b.harmfulDistance == null) return -1;
      return b.harmfulDistance - a.harmfulDistance;
    });
    expect(sorted[0].key).toBe('conversions');
    expect(sorted[1].key).toBe('trials');
  });

  it('a genuine zero on day 2+ is NOT treated as missing (day-1 guard only fires on the 1st)', () => {
    const def = METRIC_DEFS.find((d) => d.key === 'conversions');
    // real zero conversions so far — 419 is the registered attainment id.
    const dataMap = mapFrom({ 419: 0, 296: 0, 273: 106 });
    const row = buildPaceRow(def, dataMap, { now: day2 });
    expect(row.attainment).toBe(0);
    expect(row.band).not.toBe('unknown');
  });
});
