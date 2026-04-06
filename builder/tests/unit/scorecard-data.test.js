// builder/tests/unit/scorecard-data.test.js
import { describe, it, expect } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

const { groupScorecardTasks } = await import('../../src/hooks/useScorecardData.js');

describe('groupScorecardTasks', () => {
  const makeMetric = (id, overrides = {}) => ({
    id, name: `Metric ${id}`, view_name: null, chart_sql: null,
    formula: null, depends_on: null, ...overrides,
  });

  it('groups single-series chart_sql metrics into batchable', () => {
    const primitives = [
      makeMetric(56, { chart_sql: "SELECT '2026-01' AS period, 42 AS value" }),
      makeMetric(296, { chart_sql: "SELECT '2026-01' AS period, 10 AS value" }),
    ];
    const result = groupScorecardTasks(primitives, [], {}, 13);
    expect(result.batchable).toHaveLength(2);
    expect(result.individual).toHaveLength(0);
  });

  it('keeps numeric metric IDs as numbers in batchable keys', () => {
    const primitives = [
      makeMetric(56, { chart_sql: "SELECT '2026-01' AS period, 42 AS value" }),
    ];
    const result = groupScorecardTasks(primitives, [], {}, 13);
    expect(result.batchable[0].key).toBe(56); // numeric, not '56'
  });

  it('puts view_name metrics into individual (they use fetchAggregatedData)', () => {
    const primitives = [
      makeMetric(54, { view_name: 'v_trials' }),
    ];
    const result = groupScorecardTasks(primitives, [], {}, 13);
    expect(result.batchable).toHaveLength(0);
    expect(result.individual).toHaveLength(1);
  });

  it('puts custom SQL into batchable with string key', () => {
    const customSqls = [
      { key: '__weekly_conv_rate', sql: "SELECT '2026-01-06' AS period, 0.08 AS value" },
    ];
    const result = groupScorecardTasks([], customSqls, {}, 13);
    expect(result.batchable).toHaveLength(1);
    expect(result.batchable[0].key).toBe('__weekly_conv_rate'); // string
  });

  it('returns both groups for mixed input', () => {
    const primitives = [
      makeMetric(56, { chart_sql: "SELECT '2026-01' AS period, 42 AS value" }),
      makeMetric(54, { view_name: 'v_trials' }),
    ];
    const customSqls = [
      { key: '__custom', sql: "SELECT '2026-01' AS period, 1 AS value" },
    ];
    const result = groupScorecardTasks(primitives, customSqls, {}, 13);
    expect(result.batchable).toHaveLength(2); // chart_sql + custom
    expect(result.individual).toHaveLength(1); // view_name
  });

  it('metric with both chart_sql and view_name goes to batchable (chart_sql takes precedence)', () => {
    const primitives = [
      makeMetric(333, { chart_sql: "SELECT '2026-01' AS period, 100 AS value", view_name: 'v_total_dep_revenue' }),
    ];
    const result = groupScorecardTasks(primitives, [], {}, 13);
    expect(result.batchable).toHaveLength(1);
    expect(result.individual).toHaveLength(0);
  });
});
