import { describe, it, expect } from 'vitest';
import { buildMetricContext, buildSchemaContext } from '../../src/lib/ai.js';

describe('buildMetricContext', () => {
  const metrics = [
    { id: 54, name: 'Trials', metric_type: 'primitive', view_name: 'v_trials', status: 'live' },
    { id: 55, name: 'Syncs', metric_type: 'primitive', view_name: 'v_syncs', status: 'live' },
    { id: 20, name: 'Conversion Rate', metric_type: 'derived', view_name: null, status: 'live', formula: 'SAFE_DIVIDE({56},{54}) * 100', depends_on: [56, 54] },
    { id: 63, name: 'Trials Monthly', metric_type: 'breakdown', view_name: null, status: 'live' },
    { id: 99, name: 'Draft Metric', metric_type: 'primitive', view_name: 'v_draft', status: 'review' },
  ];

  it('only includes primitive, foundational, and derived types', () => {
    const ctx = buildMetricContext(metrics);
    expect(ctx).toContain('Trials');
    expect(ctx).toContain('Syncs');
    expect(ctx).toContain('Conversion Rate');
    expect(ctx).not.toContain('Trials Monthly'); // breakdown excluded
  });

  it('only includes live metrics', () => {
    const ctx = buildMetricContext(metrics);
    expect(ctx).not.toContain('Draft Metric'); // review status excluded
  });

  it('includes formula and depends_on for derived metrics', () => {
    const ctx = buildMetricContext(metrics);
    expect(ctx).toContain('formula:SAFE_DIVIDE');
    expect(ctx).toContain('depends_on:[56,54]');
  });

  it('shows view:none for metrics without view_name', () => {
    const ctx = buildMetricContext(metrics);
    expect(ctx).toContain('view:none');
  });

  it('returns empty string for no matching metrics', () => {
    const ctx = buildMetricContext([
      { id: 1, name: 'X', metric_type: 'catalog', status: 'review' },
    ]);
    expect(ctx).toBe('');
  });
});

describe('buildSchemaContext', () => {
  it('formats schema map into readable lines', () => {
    const schemaMap = {
      v_trials: [
        { name: 'SignupDate', type: 'DATE' },
        { name: 'CompanyAccount', type: 'STRING' },
        { name: 'Channel', type: 'STRING' },
      ],
      v_syncs: [
        { name: 'SyncDate', type: 'DATE' },
        { name: 'SyncType', type: 'STRING' },
      ],
    };
    const ctx = buildSchemaContext(schemaMap);
    expect(ctx).toContain('v_trials: SignupDate(DATE), CompanyAccount(STRING), Channel(STRING)');
    expect(ctx).toContain('v_syncs: SyncDate(DATE), SyncType(STRING)');
  });

  it('handles empty schema map', () => {
    const ctx = buildSchemaContext({});
    expect(ctx).toBe('');
  });
});
