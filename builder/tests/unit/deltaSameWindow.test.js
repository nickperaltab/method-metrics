import { describe, it, expect, afterEach, vi } from 'vitest';
import { computeDelta } from '../../src/components/scorecards/utils';
import {
  sameWindowBounds,
  sumDailyWindow,
  computeSameWindowPair,
  isMonthComplete,
  isAdditiveMeasure,
} from '../../src/lib/sameWindow';
import { computeSameWindowValues } from '../../src/lib/sql/load';

// ─────────────────────────────────────────────────────────────
// Fixtures
//
// All four numbers below were read off Looker on 2026-08-10 and are the
// contract this mechanism has to reproduce. See
// .superpowers/delta-fix-report.md.
//
//   Conversions (Sales)  21 MTD vs 29 in Jul 1-10   → -27.6%
//   Trials (Marketing)  134 MTD vs 142 in Jul 1-10  →  -5.6%
//   Syncs (Marketing)    65 MTD vs  79 in Jul 1-10  → -17.7%
//   Sync % (Marketing)  48.5% vs 79/142 = 55.63%    → -12.8%
//
// The Marketing metrics are NOT opted in on any scorecard. They are pinned
// here because they prove the mechanism across three independent readings.
// ─────────────────────────────────────────────────────────────

const AS_OF = new Date(2026, 7, 10); // 2026-08-10, local time

/**
 * Build a day-grain series ({labels:['YYYY-MM-DD'], data:[n]}) that sums to
 * `firstWindow` over days 1..splitDay and to `total` over the whole month,
 * for each month spec given.
 */
function dailySeries(months) {
  const labels = [];
  const data = [];
  for (const { month, days, values } of months) {
    for (let i = 0; i < days; i++) {
      labels.push(`${month}-${String(i + 1).padStart(2, '0')}`);
      data.push(values[i] ?? 0);
    }
  }
  return { labels, data };
}

/** Spread `total` over `days` days with `head` landing in the first `headDays`. */
function spread(days, headDays, head, total) {
  const values = new Array(days).fill(0);
  for (let i = 0; i < headDays; i++) values[i] = head / headDays;
  const tail = total - head;
  for (let i = headDays; i < days; i++) values[i] = tail / (days - headDays);
  return values;
}

/** July (31d) + August (10d so far) daily series with known window sums. */
function julyAugust({ julTotal, julHead, augMtd }) {
  return dailySeries([
    { month: '2026-07', days: 31, values: spread(31, 10, julHead, julTotal) },
    { month: '2026-08', days: 10, values: spread(10, 10, augMtd, augMtd) },
  ]);
}

afterEach(() => {
  vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────────
// The regression: a partial month must never be divided by a full month.
// This test FAILS against the pre-fix computeDelta, which ignores the
// options argument and returns 21/78-1 = -73.1%.
// ─────────────────────────────────────────────────────────────

describe('partial current month vs full prior month (the bug)', () => {
  it('never compares month-to-date against the whole prior month', () => {
    // Monthly series as the scorecard already has it: all of July = 78,
    // August-to-date = 21. The naive delta is -73.1%. Looker says -27.6%.
    const monthly = { labels: ['2026-07', '2026-08'], data: [78, 21] };

    const result = computeDelta(monthly, {
      window: 'same-period',
      sameWindow: { current: 21, prior: 29 },
      asOf: AS_OF,
    });

    expect(result).not.toBeNull();
    expect(result.deltaPercent).toBeCloseTo(-27.6, 1);
    expect(result.deltaPercent).not.toBeCloseTo(-73.1, 1);
  });
});

// ─────────────────────────────────────────────────────────────
// The four verified Looker readings, end to end from a daily series.
// ─────────────────────────────────────────────────────────────

describe('verified Looker readings, 2026-08-10', () => {
  function deltaFromDaily(daily) {
    const pair = computeSameWindowPair(daily, AS_OF);
    const monthly = { labels: ['2026-07', '2026-08'], data: [0, 0] };
    return computeDelta(monthly, { window: 'same-period', sameWindow: pair, asOf: AS_OF });
  }

  it('Conversions: 21 vs 29 → -27.6%', () => {
    const daily = julyAugust({ julTotal: 78, julHead: 29, augMtd: 21 });
    const pair = computeSameWindowPair(daily, AS_OF);
    expect(pair.current).toBeCloseTo(21, 6);
    expect(pair.prior).toBeCloseTo(29, 6);
    expect(deltaFromDaily(daily).deltaPercent).toBeCloseTo(-27.6, 1);
  });

  it('Trials: 134 vs 142 → -5.6%', () => {
    const daily = julyAugust({ julTotal: 300, julHead: 142, augMtd: 134 });
    expect(deltaFromDaily(daily).deltaPercent).toBeCloseTo(-5.6, 1);
  });

  it('Syncs: 65 vs 79 → -17.7%', () => {
    const daily = julyAugust({ julTotal: 190, julHead: 79, augMtd: 65 });
    expect(deltaFromDaily(daily).deltaPercent).toBeCloseTo(-17.7, 1);
  });

  it('Sync %: 48.5% vs 55.63% → -12.8%', () => {
    // A ratio metric: the same-window value comes from the same-window values
    // of its dependencies, not from windowing the ratio's own output.
    const syncs = julyAugust({ julTotal: 190, julHead: 79, augMtd: 65 });
    const trials = julyAugust({ julTotal: 300, julHead: 142, augMtd: 134 });

    const dataMap = new Map([
      ['55:day', syncs],
      ['54:day', trials],
    ]);
    computeSameWindowValues({
      dataMap,
      sameWindowIds: [55, 54],
      derived: [{ id: 999, formula: 'SAFE_DIVIDE({55},{54}) * 100', depends_on: [55, 54] }],
      asOf: AS_OF,
    });

    const pair = dataMap.get('999:samewindow');
    expect(pair.current).toBeCloseTo(48.507, 2);
    expect(pair.prior).toBeCloseTo(55.634, 2);

    const monthly = { labels: ['2026-07', '2026-08'], data: [0, 0] };
    const result = computeDelta(monthly, { window: 'same-period', sameWindow: pair, asOf: AS_OF });
    expect(result.deltaPercent).toBeCloseTo(-12.8, 1);
  });
});

// ─────────────────────────────────────────────────────────────
// Fallbacks
// ─────────────────────────────────────────────────────────────

describe('opted-in but no same-window baseline available', () => {
  it('renders no delta when the current month is partial', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10));
    const monthly = { labels: ['2026-07', '2026-08'], data: [78, 21] };
    expect(computeDelta(monthly, { window: 'same-period', sameWindow: null })).toBeNull();
  });

  it('falls back to full-vs-full when the current month is complete', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 31)); // 2026-08-31, last day of August
    const monthly = { labels: ['2026-07', '2026-08'], data: [100, 150] };
    const result = computeDelta(monthly, { window: 'same-period', sameWindow: null });
    expect(result).not.toBeNull();
    expect(result.deltaPercent).toBeCloseTo(50, 6);
    expect(result.basis).toBe('month');
  });

  it('leaves un-opted-in KPIs on the existing full-month behaviour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10));
    const monthly = { labels: ['2026-07', '2026-08'], data: [78, 21] };
    const result = computeDelta(monthly);
    expect(result.deltaPercent).toBeCloseTo(-73.1, 1);
  });
});

describe('complete month passthrough via the windowed path', () => {
  it('windowing on the last day of the month equals full-vs-full', () => {
    const asOf = new Date(2026, 7, 31);
    const daily = dailySeries([
      { month: '2026-07', days: 31, values: spread(31, 31, 78, 78) },
      { month: '2026-08', days: 31, values: spread(31, 31, 60, 60) },
    ]);
    const pair = computeSameWindowPair(daily, asOf);
    expect(pair.current).toBeCloseTo(60, 6);
    expect(pair.prior).toBeCloseTo(78, 6);
    const result = computeDelta({ labels: [], data: [] }, {
      window: 'same-period', sameWindow: pair, asOf,
    });
    expect(result.deltaPercent).toBeCloseTo((60 / 78 - 1) * 100, 6);
    expect(result.basis).toBe('same-period');
  });
});

// ─────────────────────────────────────────────────────────────
// Short prior month
// ─────────────────────────────────────────────────────────────

describe('short prior month clamp (UNVERIFIED convention)', () => {
  it('clamps 30 March to the last day of February', () => {
    const b = sameWindowBounds(new Date(2026, 2, 30)); // 2026-03-30
    expect(b.priorStart).toBe('2026-02-01');
    expect(b.priorEnd).toBe('2026-02-28'); // 2026 is not a leap year
    expect(b.clamped).toBe(true);
  });

  it('uses the real day-of-month when the prior month is long enough', () => {
    const b = sameWindowBounds(new Date(2026, 7, 10));
    expect(b.priorStart).toBe('2026-07-01');
    expect(b.priorEnd).toBe('2026-07-10');
    expect(b.clamped).toBe(false);
  });

  it('handles the leap-year February boundary', () => {
    const b = sameWindowBounds(new Date(2028, 2, 30)); // 2028-03-30
    expect(b.priorEnd).toBe('2028-02-29');
  });

  it('crosses the year boundary', () => {
    const b = sameWindowBounds(new Date(2026, 0, 5)); // 2026-01-05
    expect(b.priorStart).toBe('2025-12-01');
    expect(b.priorEnd).toBe('2025-12-05');
  });

  it('baselines the whole short prior month', () => {
    const daily = dailySeries([
      { month: '2026-02', days: 28, values: spread(28, 28, 56, 56) },
      { month: '2026-03', days: 30, values: spread(30, 30, 30, 30) },
    ]);
    const pair = computeSameWindowPair(daily, new Date(2026, 2, 30));
    expect(pair.prior).toBeCloseTo(56, 6);
    expect(pair.current).toBeCloseTo(30, 6);
    expect(pair.clamped).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

describe('sumDailyWindow', () => {
  it('sums inclusively on both ends', () => {
    const daily = { labels: ['2026-07-01', '2026-07-02', '2026-07-03'], data: [1, 2, 4] };
    expect(sumDailyWindow(daily, '2026-07-01', '2026-07-02')).toBe(3);
    expect(sumDailyWindow(daily, '2026-07-02', '2026-07-03')).toBe(6);
  });

  it('returns 0 for a window with no rows', () => {
    const daily = { labels: ['2026-07-01'], data: [1] };
    expect(sumDailyWindow(daily, '2026-06-01', '2026-06-30')).toBe(0);
  });
});

describe('computeSameWindowPair guards', () => {
  it('rejects a monthly series handed in by mistake', () => {
    expect(computeSameWindowPair({ labels: ['2026-07', '2026-08'], data: [78, 21] }, AS_OF)).toBeNull();
  });

  it('rejects an empty or missing series', () => {
    expect(computeSameWindowPair(null, AS_OF)).toBeNull();
    expect(computeSameWindowPair({ labels: [], data: [] }, AS_OF)).toBeNull();
  });
});

describe('isMonthComplete', () => {
  it('is true only on the last day of the month', () => {
    expect(isMonthComplete(new Date(2026, 7, 31))).toBe(true);
    expect(isMonthComplete(new Date(2026, 7, 30))).toBe(false);
    expect(isMonthComplete(new Date(2026, 1, 28))).toBe(true); // Feb 2026
  });
});

describe('isAdditiveMeasure', () => {
  it('accepts additive measures', () => {
    expect(isAdditiveMeasure('COUNT(*)')).toBe(true);
    expect(isAdditiveMeasure('SUM(SaaSAmount)')).toBe(true);
    expect(isAdditiveMeasure('ROUND(SUM(SaaSAmount), 2)')).toBe(true);
  });

  it('rejects measures that do not sum across days', () => {
    expect(isAdditiveMeasure('COUNT(DISTINCT EntityRecordID)')).toBe(false);
    expect(isAdditiveMeasure('AVG(SaaSAmount)')).toBe(false);
    expect(isAdditiveMeasure('MAX(SaaSAmount)')).toBe(false);
    expect(isAdditiveMeasure(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Which of the seven opted-in Sales metrics actually get a baseline.
// Metric shapes below mirror the live Supabase rows (audited via
// scripts/audit_delta_kpis.py on 2026-08-10).
// ─────────────────────────────────────────────────────────────

describe('Sales metric coverage', () => {
  const METRICS = [
    { id: 55, name: 'Syncs', semantic_table: 'int_syncs', semantic_date_col: 'SyncDate', semantic_measure: 'COUNT(*)' },
    { id: 56, name: 'Conversions', semantic_table: 'int_conversions', semantic_date_col: 'FirstSaaSInvoiceTxnDate', semantic_measure: 'COUNT(*)' },
    { id: 301, name: 'Sync-to-Conversion Rate', formula: 'SAFE_DIVIDE({56},{55}) * 100', depends_on: [56, 55] },
    { id: 329, name: 'Total New DEP Net SaaS', semantic_table: 'v_total_dep_revenue', semantic_date_col: 'TxnDate', semantic_measure: 'SUM(SaaSAmount)' },
    { id: 333, name: 'Total DEP Net SaaS', semantic_table: 'v_total_dep_revenue', semantic_date_col: 'TxnDate', semantic_measure: 'SUM(SaaSAmount)' },
    { id: 337, name: 'Total Net SaaS', formula: '{367} + {368}', depends_on: [367, 368] },
    // 367/368 are opaque chart_sql metrics: month-grain output only.
    { id: 367, name: 'Total Gross SaaS Revenue', chart_sql: "SELECT FORMAT_DATE('%Y-%m', TxnDate) AS period, 1 AS value FROM t" },
    { id: 368, name: 'Total SaaS Expenses', chart_sql: "SELECT FORMAT_DATE('%Y-%m', TxnDate) AS period, 1 AS value FROM t" },
    { id: 357, name: 'Scorecard Conversion Rate', chart_sql: 'SELECT period, value FROM v' },
    { id: 365, name: 'New Net SaaS Revenue', chart_sql: "SELECT FORMAT_DATE('%Y-%m', TxnDate) AS period, 1 AS value FROM t" },
  ];

  const config = {
    id: 'coverage-fixture',
    sections: [{
      title: 'x',
      kpis: [56, 301, 329, 333, 337, 357, 365].map(metricId => ({
        metricId, label: `m${metricId}`, format: 'number',
        showDelta: true, deltaWindow: 'same-period',
      })),
    }],
  };

  it('gives a baseline to the day-grain metrics and withholds it from the rest', async () => {
    const { buildScorecardQueryPlan } = await import('../../src/lib/sql/plan.js');
    const plan = buildScorecardQueryPlan(config, METRICS);
    expect([...plan.sameWindowIds].sort((a, b) => a - b)).toEqual([55, 56, 329, 333]);

    const dataMap = new Map();
    for (const id of [55, 56, 329, 333]) {
      dataMap.set(`${id}:day`, julyAugust({ julTotal: 78, julHead: 29, augMtd: 21 }));
    }
    computeSameWindowValues({
      dataMap, sameWindowIds: plan.sameWindowIds, derived: plan.derived, asOf: AS_OF,
    });

    // Windowable, plus the ratio built from two windowable dependencies.
    for (const id of [56, 329, 333, 301]) {
      expect(dataMap.get(`${id}:samewindow`), `metric ${id}`).toBeTruthy();
    }
    // No day-grain access: #357 (monthly dbt view), #365 (opaque chart_sql),
    // #337 (formula over two opaque chart_sql metrics).
    for (const id of [337, 357, 365]) {
      expect(dataMap.get(`${id}:samewindow`), `metric ${id}`).toBeUndefined();
    }
  });

  it('suppresses the delta mid-month for the metrics with no baseline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(AS_OF);
    const monthly = { labels: ['2026-07', '2026-08'], data: [500000, 120000] };
    for (const _id of [337, 357, 365]) {
      expect(computeDelta(monthly, { window: 'same-period', sameWindow: null })).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Wiring: the Sales scorecard opts in, nobody else does.
// ─────────────────────────────────────────────────────────────

describe('scorecard opt-in', () => {
  it('every Sales KPI with showDelta also sets deltaWindow', async () => {
    const sales = (await import('../../src/config/scorecards/sales-scorecard')).default;
    const kpis = (sales.sections || []).flatMap(s => s.kpis || []).filter(k => k.showDelta);
    expect(kpis.length).toBeGreaterThan(0);
    for (const k of kpis) {
      expect(k.deltaWindow, `metric ${k.metricId} (${k.label})`).toBe('same-period');
    }
  });

  it('no other scorecard opts in', async () => {
    const mods = import.meta.glob('../../src/config/scorecards/*.js');
    for (const [path, load] of Object.entries(mods)) {
      if (path.includes('sales-scorecard')) continue;
      const cfg = (await load()).default;
      if (!cfg?.sections) continue;
      const optedIn = cfg.sections.flatMap(s => s.kpis || []).filter(k => k.deltaWindow);
      expect(optedIn, path).toHaveLength(0);
    }
  });
});
