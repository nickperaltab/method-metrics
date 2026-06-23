import { describe, it, expect } from 'vitest';
import { toSurvivalSeries, SURVIVAL_CHECKPOINTS } from '../../src/lib/cohortSurvivalSql.js';

const rows = [
  // 2024 vintage: m12 present, m24 missing (censored)
  { vintage: '2024', tenure_k: 12, n_start: 100, n_alive: 60, base_mrr: 1000, retained_mrr: 513, net_mrr: 560 },
  // 2025 vintage: m12 present
  { vintage: '2025', tenure_k: 12, n_start: 200, n_alive: 130, base_mrr: 2000, retained_mrr: 1158, net_mrr: 1300 },
];

describe('toSurvivalSeries', () => {
  it('derives GRR = retained/base at each checkpoint, null when missing', () => {
    const { ks, vintages, series } = toSurvivalSeries(rows, 'grr');
    expect(ks).toEqual(SURVIVAL_CHECKPOINTS);
    expect(vintages).toEqual(['2024', '2025']);
    const i12 = ks.indexOf(12);
    const i24 = ks.indexOf(24);
    expect(series['2024'][i12]).toBe(51.3); // 513/1000
    expect(series['2025'][i12]).toBe(57.9); // 1158/2000
    expect(series['2024'][i24]).toBe(null); // no row
  });

  it('derives logo survival = n_alive/n_start', () => {
    const { series } = toSurvivalSeries(rows, 'logo');
    const i12 = SURVIVAL_CHECKPOINTS.indexOf(12);
    expect(series['2024'][i12]).toBe(60); // 60/100
    expect(series['2025'][i12]).toBe(65); // 130/200
  });
});
