import { describe, it, expect } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

const { loadScorecardData } = await import('../../src/lib/sql/load.js');
const { hydrateKeys } = await import('../../src/lib/sql/keys.js');

const makeMetric = (id, o = {}) => ({
  id, name: `M${id}`, view_name: null, chart_sql: null,
  semantic_table: null, semantic_measure: null, semantic_date_col: null,
  semantic_filters: null, semantic_dimensions: null,
  formula: null, depends_on: null, ...o,
});

describe('snapshot contract — dataMap entry shapes', () => {
  it('primitive entry: { labels: string[], data: number[] }', async () => {
    const metrics = [makeMetric(54, { chart_sql: "x" })];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 54 }] }] };
    const query = async () => ({ rows: [{ _key: '54', period: '2026-01', value: '10' }] });
    const { dataMap } = await loadScorecardData({ config, metrics, query });
    const entry = dataMap.get(54);
    expect(entry).toBeTruthy();
    expect(Array.isArray(entry.labels)).toBe(true);
    expect(entry.labels.every(l => typeof l === 'string')).toBe(true);
    expect(Array.isArray(entry.data)).toBe(true);
    expect(entry.data.every(d => typeof d === 'number')).toBe(true);
    expect(entry.labels.length).toBe(entry.data.length);
  });

  it('grouped entry: { labels, seriesMap: { [dim]: (number|null)[] } }', async () => {
    const metrics = [makeMetric(54, {
      semantic_table: 'int_trials',
      semantic_measure: 'COUNT(*)',
      semantic_date_col: 'SignupDate',
      semantic_filters: [],
      semantic_dimensions: ['Channel'],
    })];
    const config = {
      id: 'x',
      sections: [{ charts: [{ groupByDimension: 'Channel', metrics: [{ id: 54 }], lastNMonths: 6 }] }],
    };
    const query = async (sql) => {
      if (sql.includes('dimension')) {
        return { rows: [
          { period: '2026-01', dimension: 'SEO', value: '1' },
          { period: '2026-01', dimension: 'PPC', value: '2' },
          { period: '2026-02', dimension: 'SEO', value: '3' },
        ] };
      }
      return { rows: [] };
    };
    const { dataMap } = await loadScorecardData({ config, metrics, query });
    const entry = dataMap.get('54:grouped:Channel');
    expect(entry).toBeTruthy();
    expect(Array.isArray(entry.labels)).toBe(true);
    expect(typeof entry.seriesMap).toBe('object');
    expect(Array.isArray(entry.seriesMap.SEO)).toBe(true);
    expect(entry.seriesMap.SEO.length).toBe(entry.labels.length);
  });

  it('raw_table entry: { rows: Object[], columns: string[] }', async () => {
    const metrics = [makeMetric(54, {
      semantic_table: 'int_trials',
      semantic_measure: 'COUNT(*)',
      semantic_date_col: 'SignupDate',
      semantic_filters: [],
    })];
    const config = {
      id: 'x',
      sections: [{ type: 'rawTable', metricId: 54, columns: ['SignupDate', 'CompanyAccount'], limit: 10 }],
    };
    const query = async (sql) => {
      if (sql.includes('LIMIT')) {
        return { rows: [
          { SignupDate: '2026-04-01', CompanyAccount: 'Acme' },
          { SignupDate: '2026-04-02', CompanyAccount: 'Beta' },
        ] };
      }
      return { rows: [] };
    };
    const { dataMap } = await loadScorecardData({ config, metrics, query });
    const entry = dataMap.get('54:raw');
    expect(entry).toBeTruthy();
    expect(Array.isArray(entry.rows)).toBe(true);
    expect(entry.rows.length).toBe(2);
    expect(entry.columns).toEqual(['SignupDate', 'CompanyAccount']);
  });

  it('round-trip: JSON.stringify → hydrateKeys preserves shape', async () => {
    const metrics = [makeMetric(54, { chart_sql: "x" })];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 54 }] }] };
    const query = async () => ({ rows: [{ _key: '54', period: '2026-01', value: '10' }] });
    const { dataMap } = await loadScorecardData({ config, metrics, query });

    const payload = Object.fromEntries([...dataMap.entries()].map(([k, v]) => [String(k), v]));
    const json = JSON.parse(JSON.stringify(payload));
    const rehydrated = hydrateKeys(json);

    expect(rehydrated.get(54)).toEqual(dataMap.get(54));
  });
});
