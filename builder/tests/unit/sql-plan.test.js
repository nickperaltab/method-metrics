import { describe, it, expect } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

const { buildScorecardQueryPlan, collectMetricIds } = await import('../../src/lib/sql/plan.js');

const makeMetric = (id, o = {}) => ({
  id, name: `M${id}`, view_name: null, chart_sql: null,
  semantic_table: null, semantic_measure: null, semantic_date_col: null,
  semantic_filters: null, semantic_dimensions: null,
  formula: null, depends_on: null, ...o,
});

describe('collectMetricIds', () => {
  it('captures KPI metric IDs', () => {
    const out = collectMetricIds({ sections: [{ kpis: [{ metricId: 54 }, { metricId: 55 }] }] });
    expect(out.ids.sort()).toEqual([54, 55]);
  });

  it('captures chart metric IDs', () => {
    const out = collectMetricIds({ sections: [{ charts: [{ metrics: [{ id: 54 }] }] }] });
    expect(out.ids).toContain(54);
  });

  it('does NOT capture table column metric IDs (known behavior)', () => {
    const out = collectMetricIds({ sections: [{ tables: [{ columns: [{ metricId: 354 }] }] }] });
    expect(out.ids).not.toContain(354);
  });

  it('captures weeklyMetrics from charts with timeBucket=week', () => {
    const out = collectMetricIds({ sections: [{ charts: [{ timeBucket: 'week', metrics: [{ id: 54 }] }] }] });
    expect(out.weeklyMetrics).toContain(54);
  });

  it('captures groupedCharts', () => {
    const out = collectMetricIds({ sections: [{ charts: [{ groupByDimension: 'Channel', metrics: [{ id: 54 }], lastNMonths: 6 }] }] });
    expect(out.groupedCharts).toEqual([{ metricId: 54, dimension: 'Channel', lastNMonths: 6 }]);
  });

  it('captures yoyMetrics from charts with yoy=true', () => {
    const out = collectMetricIds({ sections: [{ charts: [{ yoy: true, metrics: [{ id: 54 }] }] }] });
    expect(out.yoyMetrics).toContain(54);
  });

  it('captures rawTableSections', () => {
    const out = collectMetricIds({ sections: [{ type: 'rawTable', metricId: 54, columns: ['A', 'B'] }] });
    expect(out.rawTableSections).toHaveLength(1);
    expect(out.ids).toContain(54);
  });
});

describe('buildScorecardQueryPlan', () => {
  it('creates a primitive query for each semantic metric', () => {
    const metrics = [
      makeMetric(54, {
        semantic_table: 'v_trials',
        semantic_measure: 'COUNT(*)',
        semantic_date_col: 'SignupDate',
        semantic_filters: [],
      }),
    ];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 54 }] }] };
    const plan = buildScorecardQueryPlan(config, metrics);
    const kinds = plan.queries.map(q => q.kind);
    expect(kinds).toContain('primary_month');
    expect(kinds).toContain('daily_90d');
  });

  it('adds weekly entry for a week-bucketed chart', () => {
    const metrics = [
      makeMetric(54, {
        semantic_table: 'v_trials',
        semantic_measure: 'COUNT(*)',
        semantic_date_col: 'SignupDate',
        semantic_filters: [],
      }),
    ];
    const config = { id: 'x', sections: [{ charts: [{ timeBucket: 'week', metrics: [{ id: 54 }] }] }] };
    const plan = buildScorecardQueryPlan(config, metrics);
    expect(plan.queries.map(q => q.data_key)).toContain('54:week');
  });

  it('expands transitive derived deps', () => {
    const metrics = [
      makeMetric(100, { formula: 'SAFE_DIVIDE({54},{55})', depends_on: [54, 55] }),
      makeMetric(54, { chart_sql: "SELECT '2026-01' AS period, 10 AS value" }),
      makeMetric(55, { chart_sql: "SELECT '2026-01' AS period, 20 AS value" }),
    ];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 100 }] }] };
    const plan = buildScorecardQueryPlan(config, metrics);
    const keys = plan.queries.map(q => q.data_key);
    expect(keys).toContain('54');
    expect(keys).toContain('55');
    expect(plan.derived.map(d => d.id)).toEqual([100]);
  });

  it('expectedKeys covers queries + derived', () => {
    const metrics = [
      makeMetric(100, { formula: '{54}*2', depends_on: [54] }),
      makeMetric(54, { chart_sql: "SELECT '2026-01' AS period, 10 AS value" }),
    ];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 100 }] }] };
    const plan = buildScorecardQueryPlan(config, metrics);
    expect(plan.expectedKeys).toEqual(expect.arrayContaining(['54', '100']));
  });
});
