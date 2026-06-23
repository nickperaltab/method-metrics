import { describe, it, expect } from 'vitest';
import { indexModels, getDbtModel, dbtModelLink } from '../../src/lib/dbtModels.js';

const MODELS = [
  { name: 'int_customer_survival', alias: 'int_customer_survival', refs: ['int_customer_mrr'] },
  { name: 'metric_new_mrr', alias: 'v_metric__new_mrr', refs: [] },
];

describe('dbtModels', () => {
  it('indexes by name and alias', () => {
    const idx = indexModels(MODELS);
    expect(getDbtModel(idx, 'int_customer_survival').refs).toEqual(['int_customer_mrr']);
    expect(getDbtModel(idx, 'v_metric__new_mrr').name).toBe('metric_new_mrr'); // alias lookup
    expect(getDbtModel(idx, 'nope')).toBeNull();
  });

  it('builds a GitHub blob link', () => {
    expect(dbtModelLink('models/intermediate/int_customer_survival.sql'))
      .toBe('https://github.com/nickperaltab/method-metrics/blob/main/models/intermediate/int_customer_survival.sql');
    expect(dbtModelLink(null)).toBeNull();
  });
});
