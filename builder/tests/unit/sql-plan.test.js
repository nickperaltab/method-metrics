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

  it('captures grouped fetch need from KPI dimensionFilter', () => {
    const out = collectMetricIds({
      sections: [{
        kpis: [
          { metricId: 373, label: 'Total' },
          { metricId: 373, label: 'Solo', dimensionFilter: { Segment: 'Solo no DEP' } },
          { metricId: 373, label: 'Team AI+', dimensionFilter: { Segment: 'Team AI Plus' } },
        ],
      }],
    });
    // One grouped entry per distinct (metricId, dimension) pair, regardless of how many tiles filter on it
    expect(out.groupedCharts).toContainEqual({ metricId: 373, dimension: 'Segment', lastNMonths: 13 });
    expect(out.groupedCharts.filter(g => g.metricId === 373 && g.dimension === 'Segment')).toHaveLength(1);
  });

  it('captures grouped fetch need from chart-metric dimensionFilter', () => {
    const out = collectMetricIds({
      sections: [{
        charts: [{
          metrics: [
            { id: 373, dimensionFilter: { Segment: 'Solo no DEP' } },
          ],
        }],
      }],
    });
    expect(out.groupedCharts).toContainEqual({ metricId: 373, dimension: 'Segment', lastNMonths: 13 });
  });

  it('dedups KPI and chart-metric dimensionFilter on the same (metric, dim)', () => {
    const out = collectMetricIds({
      sections: [{
        kpis:   [{ metricId: 373, dimensionFilter: { Segment: 'Solo no DEP' } }],
        charts: [{ metrics: [{ id: 373, dimensionFilter: { Segment: 'Team AI Plus' } }] }],
      }],
    });
    expect(out.groupedCharts.filter(g => g.metricId === 373 && g.dimension === 'Segment')).toHaveLength(1);
  });

  it('coalesces KPI dimensionFilter with chart groupByDimension on the same metric+dim', () => {
    // Both a KPI with dimensionFilter and a chart with groupByDimension reference 373/Segment.
    // The result should contain exactly ONE grouped entry (deduped), not two.
    const out = collectMetricIds({
      sections: [
        { kpis: [{ metricId: 373, dimensionFilter: { Segment: 'Solo no DEP' } }] },
        { charts: [{ groupByDimension: 'Segment', metrics: [{ id: 373 }] }] },
      ],
    });
    // Without KPI dimensionFilter support this is 1 (chart only).
    // Once Task 2 adds KPI support without dedup it becomes 2 — this assertion catches that.
    // The correct implementation deduplicates back to 1 AND the KPI contributes the entry.
    // To distinguish "chart-only" from "properly coalesced", assert the entry has lastNMonths: 13
    // (KPIs default to 13 while the chart here has no lastNMonths so also defaults to 13 — same).
    // Real discriminator: with only the KPI section (no chart) we must still get a grouped entry.
    const kpiOnly = collectMetricIds({
      sections: [{ kpis: [{ metricId: 373, dimensionFilter: { Segment: 'Solo no DEP' } }] }],
    });
    expect(kpiOnly.groupedCharts.filter(g => g.metricId === 373 && g.dimension === 'Segment')).toHaveLength(1);
    // And combined, chart + KPI = still exactly 1 (deduped)
    expect(out.groupedCharts.filter(g => g.metricId === 373 && g.dimension === 'Segment')).toHaveLength(1);
  });
});

describe('buildScorecardQueryPlan', () => {
  it('creates a primitive query for each semantic metric', () => {
    const metrics = [
      makeMetric(54, {
        semantic_table: 'int_trials',
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
        semantic_table: 'int_trials',
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
