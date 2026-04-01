import { describe, it, expect } from 'vitest';
import { buildMetricContext, buildSchemaContext, validateColumns } from '../../src/lib/ai.js';

describe('buildMetricContext', () => {
  const metrics = [
    { id: 54, name: 'Trials', metric_type: 'primitive', view_name: 'v_trials', status: 'live' },
    { id: 55, name: 'Syncs', metric_type: 'primitive', view_name: 'v_syncs', status: 'live' },
    { id: 20, name: 'Conversion Rate', metric_type: 'derived', view_name: null, status: 'live', formula: 'SAFE_DIVIDE({56},{54}) * 100', depends_on: [56, 54] },
    { id: 63, name: 'Trials Monthly', metric_type: 'breakdown', view_name: null, status: 'live' },
    { id: 99, name: 'Draft Metric', metric_type: 'primitive', view_name: 'v_draft', status: 'review' },
  ];

  it('only includes primitive and derived types', () => {
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

describe('validateColumns', () => {
  const schemaMap = {
    v_trials: [
      { name: 'SignupDate', type: 'DATE' },
      { name: 'CompanyAccount', type: 'STRING' },
      { name: 'AttributionChannel', type: 'STRING' },
      { name: 'SignupCountry', type: 'STRING' },
    ],
  };
  const metric54 = { id: 54, view_name: 'v_trials' };
  const metric55 = { id: 55, view_name: 'v_syncs' };

  it('nulls out group_by_dimension when approvedDimensions is empty', () => {
    const dc = { group_by_dimension: 'SignupCountry', x_field: 'SignupDate' };
    validateColumns(dc, [metric54], schemaMap, []);
    expect(dc.group_by_dimension).toBeNull();
  });

  it('nulls out group_by_dimension when approved for a different metric', () => {
    const approvedDimensions = [{ metric_id: 55, column_name: 'SignupCountry' }];
    const dc = { group_by_dimension: 'SignupCountry', x_field: 'SignupDate' };
    validateColumns(dc, [metric54], schemaMap, approvedDimensions);
    expect(dc.group_by_dimension).toBeNull();
  });

  it('preserves group_by_dimension when approved for the correct metric', () => {
    const approvedDimensions = [{ metric_id: 54, column_name: 'SignupCountry' }];
    const dc = { group_by_dimension: 'SignupCountry', x_field: 'SignupDate' };
    validateColumns(dc, [metric54], schemaMap, approvedDimensions);
    expect(dc.group_by_dimension).toBe('SignupCountry');
  });

  it('corrects group_by_dimension via case-insensitive match', () => {
    const approvedDimensions = [{ metric_id: 54, column_name: 'SignupCountry' }];
    const dc = { group_by_dimension: 'signupcountry', x_field: 'SignupDate' };
    validateColumns(dc, [metric54], schemaMap, approvedDimensions);
    expect(dc.group_by_dimension).toBe('SignupCountry');
  });

  it('preserves x_field when schema is empty (regression: must not null out on cache miss)', () => {
    const dc = { x_field: 'SignupDate', group_by_dimension: null };
    validateColumns(dc, [metric54], {}, []);
    expect(dc.x_field).toBe('SignupDate');
  });

  it('corrects x_field case-insensitively when schema is loaded and column is wrong', () => {
    const dc = { x_field: 'signupdate', group_by_dimension: null };
    validateColumns(dc, [metric54], schemaMap, []);
    expect(dc.x_field).toBe('SignupDate');
  });
});
