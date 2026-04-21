import { describe, it, expect, vi } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

const { loadScorecardData } = await import('../../src/lib/sql/load.js');

const makeMetric = (id, o = {}) => ({
  id, name: `M${id}`, view_name: null, chart_sql: null,
  semantic_table: null, semantic_measure: null, semantic_date_col: null,
  semantic_filters: null, semantic_dimensions: null,
  formula: null, depends_on: null, ...o,
});

describe('loadScorecardData', () => {
  it('stores primitive query results under numeric key', async () => {
    const metrics = [makeMetric(54, { chart_sql: "SELECT '2026-01' AS period, 10 AS value" })];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 54 }] }] };
    const query = vi.fn(async (_sql) => ({
      rows: [{ _key: '54', period: '2026-01', value: '10' }],
    }));
    const { dataMap, errors } = await loadScorecardData({ config, metrics, query });
    expect(dataMap.get(54)).toEqual({ labels: ['2026-01'], data: [10] });
    expect(errors).toEqual([]);
  });

  it('computes derived metrics from dependency data', async () => {
    // evaluateFormula uses {id} placeholders — not variable names like `a` or `b`
    const metrics = [
      makeMetric(100, { formula: 'SAFE_DIVIDE({54},{55})*100', depends_on: [54, 55] }),
      makeMetric(54, { chart_sql: "s1" }),
      makeMetric(55, { chart_sql: "s2" }),
    ];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 100 }] }] };
    const query = vi.fn(async (_sql) => ({
      rows: [
        { _key: '54', period: '2026-01', value: '5' },
        { _key: '55', period: '2026-01', value: '10' },
      ],
    }));
    const { dataMap } = await loadScorecardData({ config, metrics, query });
    // 5/10 * 100 = 50
    expect(dataMap.get(100).data[0]).toBe(50);
  });

  it('returns errors for failed queries without aborting the run', async () => {
    const metrics = [
      makeMetric(54, { chart_sql: "ok" }),
      makeMetric(55, { chart_sql: "bad" }),
    ];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 54 }, { metricId: 55 }] }] };
    const query = vi.fn(async (sql) => {
      if (sql.includes('bad')) throw new Error('BQ 400: syntax');
      return { rows: [{ _key: '54', period: '2026-01', value: '1' }] };
    });
    const { dataMap, errors } = await loadScorecardData({ config, metrics, query });
    expect(dataMap.get(54)).toBeTruthy();
    expect(errors.length).toBeGreaterThan(0);
  });

  it('respects abort signal', async () => {
    const metrics = [makeMetric(54, { chart_sql: "s1" })];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 54 }] }] };
    const signal = { aborted: true };
    const query = vi.fn(async () => ({ rows: [] }));
    const { dataMap } = await loadScorecardData({ config, metrics, query, signal });
    expect(dataMap.size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
