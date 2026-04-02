import { describe, it, expect } from 'vitest';
import { buildMetricContext, buildSchemaContext, validateColumns, normalizeStyleRules, applyPromptOverrides } from '../../src/lib/ai.js';

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

  it('preserves group_by_dimension when derived metric is first and primitive is second', () => {
    // Regression: derived metric first would clear dimension because it has no approved_dimensions
    const derivedFirst = { id: 310, view_name: null };
    const approvedDimensions = [{ metric_id: 54, column_name: 'AttributionChannel' }];
    const dc = { group_by_dimension: 'AttributionChannel', x_field: 'SignupDate' };
    validateColumns(dc, [derivedFirst, metric54], schemaMap, approvedDimensions);
    expect(dc.group_by_dimension).toBe('AttributionChannel');
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

describe('normalizeStyleRules', () => {
  it('normalizes standard camelCase fields', () => {
    const rules = [{ target: 'Trials', compareTo: 'Trials Forecast', operator: '<', color: '#ef4444' }];
    const result = normalizeStyleRules(rules);
    expect(result).toHaveLength(1);
    expect(result[0].target).toBe('Trials');
    expect(result[0].compareTo).toBe('Trials Forecast');
    expect(result[0].operator).toBe('<');
    expect(result[0].color).toBe('#ef4444');
  });

  it('normalizes snake_case compare_to field from AI', () => {
    const rules = [{ target: 'Trials', compare_to: 'Trials Forecast', operator: '<', color: '#ef4444' }];
    const result = normalizeStyleRules(rules);
    expect(result[0].compareTo).toBe('Trials Forecast');
  });

  it('normalizes compare_series field variant', () => {
    const rules = [{ target: 'Syncs', compare_series: 'Syncs Forecast', operator: '>', color: '#22c55e' }];
    const result = normalizeStyleRules(rules);
    expect(result[0].compareTo).toBe('Syncs Forecast');
    expect(result[0].operator).toBe('>');
  });

  it('normalizes target_series field variant', () => {
    const rules = [{ target_series: 'Trials', compareTo: 'Trials Forecast', operator: '<', color: '#ef4444' }];
    const result = normalizeStyleRules(rules);
    expect(result[0].target).toBe('Trials');
  });

  it('normalizes threshold from value field', () => {
    const rules = [{ target: 'Conversion Rate', value: 0.15, operator: '<', color: '#ef4444' }];
    const result = normalizeStyleRules(rules);
    expect(result[0].threshold).toBe(0.15);
    expect(result[0].compareTo).toBeUndefined();
  });

  it('parses string threshold to number', () => {
    const rules = [{ target: 'Conversion Rate', threshold: '0.15', operator: '<', color: '#ef4444' }];
    const result = normalizeStyleRules(rules);
    expect(result[0].threshold).toBe(0.15);
  });

  it('filters out rules with no target', () => {
    const rules = [{ compareTo: 'Trials Forecast', operator: '<', color: '#ef4444' }];
    expect(normalizeStyleRules(rules)).toHaveLength(0);
  });

  it('filters out rules with neither compareTo nor threshold', () => {
    const rules = [{ target: 'Trials', operator: '<', color: '#ef4444' }];
    expect(normalizeStyleRules(rules)).toHaveLength(0);
  });

  it('defaults invalid operator to <', () => {
    const rules = [{ target: 'Trials', compareTo: 'Trials Forecast', operator: 'invalid', color: '#ef4444' }];
    expect(normalizeStyleRules(rules)[0].operator).toBe('<');
  });

  it('defaults missing color to #f87171', () => {
    const rules = [{ target: 'Trials', compareTo: 'Trials Forecast', operator: '<' }];
    expect(normalizeStyleRules(rules)[0].color).toBe('#f87171');
  });

  it('handles multiple rules', () => {
    const rules = [
      { target: 'Trials', compareTo: 'Trials Forecast', operator: '<', color: '#ef4444' },
      { target: 'Trials', compareTo: 'Trials Forecast', operator: '>', color: '#22c55e' },
    ];
    expect(normalizeStyleRules(rules)).toHaveLength(2);
  });

  it('returns empty array for non-array input', () => {
    expect(normalizeStyleRules(null)).toEqual([]);
    expect(normalizeStyleRules(undefined)).toEqual([]);
    expect(normalizeStyleRules('bad')).toEqual([]);
  });
});

describe('applyPromptOverrides', () => {
  const approvedDimensions = [
    { metric_id: 54, column_name: 'AttributionChannel' },
    { metric_id: 54, column_name: 'SignupCountry' },
    { metric_id: 54, column_name: 'Vertical' },
    { metric_id: 54, column_name: 'SyncType' },
    { metric_id: 55, column_name: 'AttributionChannel' },
    { metric_id: 55, column_name: 'SyncType' },
  ];
  const metric54 = { id: 54, view_name: 'v_trials' };
  const metric55 = { id: 55, view_name: 'v_syncs' };

  it('sets group_by_dimension for "by channel"', () => {
    const dc = { group_by_dimension: null };
    applyPromptOverrides('trials by channel', dc, 'bar', [metric54], approvedDimensions);
    expect(dc.group_by_dimension).toBe('AttributionChannel');
  });

  it('sets group_by_dimension for "by attribution channel"', () => {
    const dc = { group_by_dimension: null };
    applyPromptOverrides('trials by attribution channel', dc, 'stacked_bar', [metric54], approvedDimensions);
    expect(dc.group_by_dimension).toBe('AttributionChannel');
  });

  it('sets group_by_dimension for "by country"', () => {
    const dc = { group_by_dimension: null };
    applyPromptOverrides('show me trials by country', dc, 'bar', [metric54], approvedDimensions);
    expect(dc.group_by_dimension).toBe('SignupCountry');
  });

  it('sets group_by_dimension for "by vertical"', () => {
    const dc = { group_by_dimension: null };
    applyPromptOverrides('trials by vertical', dc, 'bar', [metric54], approvedDimensions);
    expect(dc.group_by_dimension).toBe('Vertical');
  });

  it('sets group_by_dimension for "by industry"', () => {
    const dc = { group_by_dimension: null };
    applyPromptOverrides('trials by industry', dc, 'bar', [metric54], approvedDimensions);
    expect(dc.group_by_dimension).toBe('Vertical');
  });

  it('sets group_by_dimension for "by sync type"', () => {
    const dc = { group_by_dimension: null };
    applyPromptOverrides('syncs by sync type', dc, 'bar', [metric55], approvedDimensions);
    expect(dc.group_by_dimension).toBe('SyncType');
  });

  it('does not set group_by_dimension if dimension not approved for that metric', () => {
    const dc = { group_by_dimension: null };
    // Syncs doesn't have SignupCountry approved
    applyPromptOverrides('syncs by country', dc, 'bar', [metric55], approvedDimensions);
    expect(dc.group_by_dimension).toBeNull();
  });

  it('does not override group_by_dimension already set by AI', () => {
    const dc = { group_by_dimension: 'SignupCountry' };
    applyPromptOverrides('trials by channel', dc, 'stacked_bar', [metric54], approvedDimensions);
    expect(dc.group_by_dimension).toBe('SignupCountry'); // AI value preserved
  });

  it('sets channel_filter for SEO', () => {
    const dc = { channel_filter: null, group_by_dimension: null };
    applyPromptOverrides('SEO trials by month', dc, 'bar', [metric54], approvedDimensions);
    expect(dc.channel_filter).toBe('SEO');
    expect(dc.group_by_dimension).toBeNull();
  });

  it('sets channel_filter for PPC', () => {
    const dc = { channel_filter: null, group_by_dimension: null };
    applyPromptOverrides('show me PPC conversions', dc, 'bar', [metric54], approvedDimensions);
    expect(dc.channel_filter).toBe('PPC');
  });

  it('does not set channel_filter when group_by_dimension is set', () => {
    const dc = { channel_filter: null, group_by_dimension: 'AttributionChannel' };
    applyPromptOverrides('trials by channel with SEO', dc, 'stacked_bar', [metric54], approvedDimensions);
    expect(dc.channel_filter).toBeNull();
  });

  it('sets time_bucket to week for "weekly"', () => {
    const dc = { time_bucket: 'month' };
    applyPromptOverrides('show me weekly trials', dc, 'bar', [metric54], approvedDimensions);
    expect(dc.time_bucket).toBe('week');
  });

  it('sets time_bucket to day for "daily"', () => {
    const dc = { time_bucket: 'month' };
    applyPromptOverrides('daily syncs this month', dc, 'bar', [metric55], approvedDimensions);
    expect(dc.time_bucket).toBe('day');
  });

  it('sets show_labels for "data labels"', () => {
    const dc = {};
    applyPromptOverrides('show trials with data labels', dc, 'bar', [metric54], approvedDimensions);
    expect(dc.show_labels).toBe(true);
  });

  it('sets show_labels for "show values"', () => {
    const dc = {};
    applyPromptOverrides('show values on the chart', dc, 'bar', [metric54], approvedDimensions);
    expect(dc.show_labels).toBe(true);
  });

  it('downgrades stacked_bar to bar when group_by_dimension is null', () => {
    const dc = { group_by_dimension: null };
    const type = applyPromptOverrides('trials as a stacked bar', dc, 'stacked_bar', [metric54], approvedDimensions);
    expect(type).toBe('bar');
  });

  it('keeps stacked_bar when group_by_dimension is set', () => {
    const dc = { group_by_dimension: null };
    const type = applyPromptOverrides('trials by channel', dc, 'stacked_bar', [metric54], approvedDimensions);
    expect(type).toBe('stacked_bar');
    expect(dc.group_by_dimension).toBe('AttributionChannel');
  });

  it('skips group_by_dimension when no approvedDimensions provided (legacy path)', () => {
    const dc = { group_by_dimension: null };
    applyPromptOverrides('trials by channel', dc, 'bar', [metric54], null);
    expect(dc.group_by_dimension).toBeNull();
  });

  it('sets group_by_dimension when derived metric is first and primitive is second', () => {
    // Regression: derived metric has no view_name/approved_dimensions — must not block dimension
    const derivedFirst = { id: 310, view_name: null, formula: 'SAFE_DIVIDE({54}-{305},{305})*100' };
    const dc = { group_by_dimension: null };
    applyPromptOverrides('trials vs forecast % by channel', dc, 'table', [derivedFirst, metric54], approvedDimensions);
    expect(dc.group_by_dimension).toBe('AttributionChannel');
  });
});
