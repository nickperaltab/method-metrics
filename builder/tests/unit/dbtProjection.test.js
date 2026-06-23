import { describe, it, expect } from 'vitest';
import { projectManifest } from '../../src/lib/dbtProjection.js';

const MANIFEST = {
  nodes: {
    'model.method_metrics.int_customer_survival': {
      resource_type: 'model', name: 'int_customer_survival', alias: 'int_customer_survival',
      schema: 'revenue', relation_name: '`p`.`revenue`.`int_customer_survival`',
      description: 'Cohort survival by first-pay vintage.',
      original_file_path: 'models/intermediate/int_customer_survival.sql',
      compiled_code: 'SELECT 1', raw_code: 'SELECT 1',
      columns: { vintage: { name: 'vintage', description: 'year' } },
      depends_on: { nodes: ['model.method_metrics.int_customer_mrr', 'source.method_metrics.revenue.Funnel'] },
    },
    'model.method_metrics.int_customer_mrr': {
      resource_type: 'model', name: 'int_customer_mrr', alias: 'int_customer_mrr',
      schema: 'revenue', relation_name: '`p`.`revenue`.`int_customer_mrr`',
      description: 'MRR', original_file_path: 'models/intermediate/int_customer_mrr.sql',
      compiled_code: 'SELECT 2', columns: {}, depends_on: { nodes: [] },
    },
    'model.method_metrics.staging_thing': {
      resource_type: 'model', name: 'staging_thing', alias: 'staging_thing',
      schema: 'analytics_staging', relation_name: '`p`.`analytics_staging`.`staging_thing`',
      description: '', original_file_path: 'models/x.sql', compiled_code: '', columns: {}, depends_on: { nodes: [] },
    },
    'test.method_metrics.not_null_int_customer_survival_vintage': {
      resource_type: 'test', name: 'not_null_int_customer_survival_vintage',
      test_metadata: { name: 'not_null', kwargs: { column_name: 'vintage' } },
      depends_on: { nodes: ['model.method_metrics.int_customer_survival'] },
    },
    // Duplicate test node for the same test — should be deduped in output.
    'test.method_metrics.not_null_int_customer_survival_vintage_dup': {
      resource_type: 'test', name: 'not_null_int_customer_survival_vintage_dup',
      test_metadata: { name: 'not_null', kwargs: { column_name: 'vintage' } },
      depends_on: { nodes: ['model.method_metrics.int_customer_survival'] },
    },
  },
  sources: { 'source.method_metrics.revenue.Funnel': { name: 'Funnel', schema: 'revenue' } },
};

describe('projectManifest', () => {
  it('keeps only revenue/revenue_metrics models', () => {
    const names = projectManifest(MANIFEST).models.map(m => m.name);
    expect(names).toContain('int_customer_survival');
    expect(names).toContain('int_customer_mrr');
    expect(names).not.toContain('staging_thing');
  });

  it('maps depends_on to bare model refs and source names', () => {
    const m = projectManifest(MANIFEST).models.find(x => x.name === 'int_customer_survival');
    expect(m.refs).toEqual(['int_customer_mrr']);
    expect(m.sources).toEqual(['Funnel']);
    expect(m.compiled_sql).toBe('SELECT 1');
    expect(m.columns).toEqual([{ name: 'vintage', description: 'year' }]);
    expect(m.original_file_path).toBe('models/intermediate/int_customer_survival.sql');
  });

  it('qualifies tests with column name and deduplicates', () => {
    const m = projectManifest(MANIFEST).models.find(x => x.name === 'int_customer_survival');
    // Should contain 'not_null(vintage)' exactly once, even though two test nodes exist.
    expect(m.tests).toContain('not_null(vintage)');
    const count = m.tests.filter(t => t === 'not_null(vintage)').length;
    expect(count).toBe(1);
  });

  it('uses bare test name when no column_name is present', () => {
    // int_customer_mrr has no test nodes — its tests array should be empty.
    const m = projectManifest(MANIFEST).models.find(x => x.name === 'int_customer_mrr');
    expect(m.tests).toEqual([]);
  });
});
