import { describe, it } from 'node:test';
import assert from 'node:assert';

const SUPABASE_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY';

const METRIC_CONTEXT = `- id:54 name:"Trials" type:primitive view:v_trials
- id:55 name:"Syncs" type:primitive view:v_syncs
- id:56 name:"Conversions" type:primitive view:v_conversions
- id:20 name:"Conversion Rate" type:derived view:none formula:SAFE_DIVIDE({56},{54}) depends_on:[56,54]
- id:25 name:"Sync Rate" type:derived view:none formula:SAFE_DIVIDE({55},{54}) depends_on:[55,54]
- id:46 name:"Churn Rate" type:derived view:none
- id:57 name:"New Net SaaS" type:primitive view:v_new_net_saas
- id:58 name:"Churn" type:primitive view:v_churn
- id:59 name:"BOM Customers" type:primitive view:v_bom_customers`;

const SCHEMA_CONTEXT = `v_trials: SignupDate(DATE), CompanyAccount(STRING), Channel(STRING), SignupCountry(STRING), Vertical(STRING), Att_SEO(INTEGER), Att_Pay_Per_Click(INTEGER), Att_Direct(INTEGER), Att_Social(INTEGER), Att_Email(INTEGER), Att_Referral_Link(INTEGER), Att_Partners(INTEGER), Att_Content(INTEGER), Att_Remarketing(INTEGER), Att_Other(INTEGER), Att_None(INTEGER)
v_syncs: SyncDate(DATE), SignupDate(DATE), CompanyAccount(STRING), EventType(STRING), SyncType(STRING), SyncTypeRegion(STRING), SignupCountry(STRING), Vertical(STRING), Att_SEO(INTEGER), Att_Pay_Per_Click(INTEGER), Att_Direct(INTEGER)
v_conversions: ConversionDate(DATE), SignupDate(DATE), CompanyAccount(STRING), SignupCountry(STRING), Vertical(STRING), Att_SEO(INTEGER), Att_Pay_Per_Click(INTEGER), Att_Direct(INTEGER)`;

const VALID_ECHARTS_TYPES = new Set(['line', 'bar', 'stacked_bar', 'horizontal_bar', 'pie', 'combo', 'funnel', 'heatmap', 'area', 'table', 'kpi', 'yoy']);

async function callAi(prompt) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chart`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, metricContext: METRIC_CONTEXT, schemaContext: SCHEMA_CONTEXT }),
  });
  if (!res.ok) throw new Error(`AI function failed: ${res.status}`);
  return res.json();
}

function assertValidSpec(result, label) {
  if (result.error) return; // error responses are valid

  // Must have metric_ids array
  assert(Array.isArray(result.metric_ids) && result.metric_ids.length > 0, `${label}: must have metric_ids array`);

  // Must have data_config
  assert(result.data_config, `${label}: must have data_config`);
  assert(result.data_config.x_field, `${label}: data_config must have x_field`);
  assert(Array.isArray(result.data_config.y_fields), `${label}: data_config must have y_fields array`);
  assert(Array.isArray(result.data_config.labels), `${label}: data_config must have labels array`);

  // echarts_type must be valid
  if (result.echarts_type) {
    assert(VALID_ECHARTS_TYPES.has(result.echarts_type), `${label}: invalid echarts_type "${result.echarts_type}"`);
  }

  // x_field must not be "Channel" (common hallucination)
  assert(result.data_config.x_field !== 'Channel', `${label}: x_field should not be "Channel" — no such column exists`);

  // Must have explanation
  assert(result.explanation, `${label}: must have explanation`);
}

describe('AI Chart Builder Evals', () => {
  it('single metric: trials by month', async () => {
    const result = await callAi('show me trials by month');
    assertValidSpec(result, 'trials by month');
    assert(result.metric_ids.includes(54), 'should pick Trials (id 54)');
    assert.strictEqual(result.echarts_type, 'line', 'should be line chart');
  });

  it('multi-metric: trials and syncs by month', async () => {
    const result = await callAi('show me trials and syncs by month');
    assertValidSpec(result, 'trials and syncs');
    assert(result.metric_ids.length >= 2, 'should have at least 2 metric_ids');
    assert(result.data_config.labels.length >= 2, 'should have at least 2 labels');
  });

  it('time bucket: weekly syncs', async () => {
    const result = await callAi('show me weekly syncs');
    assertValidSpec(result, 'weekly syncs');
    assert.strictEqual(result.data_config.time_bucket, 'week', 'should set time_bucket to week');
  });

  it('time bucket: daily trials', async () => {
    const result = await callAi('show me daily trials for the last 2 months');
    assertValidSpec(result, 'daily trials');
    assert.strictEqual(result.data_config.time_bucket, 'day', 'should set time_bucket to day');
    assert.strictEqual(result.data_config.last_n_months, 2, 'should set last_n_months to 2');
  });

  it('channel filter: SEO trials', async () => {
    const result = await callAi('show me SEO trials by month');
    assertValidSpec(result, 'SEO trials');
    assert.strictEqual(result.data_config.channel_filter, 'SEO', 'should set channel_filter to SEO');
  });

  it('by channel: should NOT return Channel column', async () => {
    const result = await callAi('show me syncs by channel');
    assertValidSpec(result, 'syncs by channel');
    assert.notStrictEqual(result.data_config.x_field, 'Channel', 'should not use Channel as x_field');
  });

  it('by country: should use SignupCountry', async () => {
    const result = await callAi('show me trials by country');
    assertValidSpec(result, 'trials by country');
    const usesCountry = result.data_config.x_field === 'SignupCountry';
    assert(usesCountry, `should use SignupCountry as x_field, got x_field=${result.data_config.x_field}`);
  });

  it('derived metric: conversion rate', async () => {
    const result = await callAi('show me conversion rate by month');
    assertValidSpec(result, 'conversion rate');
    assert(result.metric_ids.includes(20), 'should pick Conversion Rate (id 20)');
  });

  it('invalid prompt: should return error or suggestion', async () => {
    const result = await callAi('show me pizza sales');
    assert(result.error || result.suggestion, 'should return error for invalid metric');
  });

  it('time range: last 6 months', async () => {
    const result = await callAi('show me trials for the last 6 months');
    assertValidSpec(result, 'last 6 months');
    assert.strictEqual(result.data_config.last_n_months, 6, 'should set last_n_months to 6');
  });

  // --- Looker Dashboard Replication Tests ---

  it('funnel: trials, syncs, conversions together', async () => {
    const result = await callAi('show me the marketing funnel: trials, syncs, and conversions by month');
    assertValidSpec(result, 'funnel multi-metric');
    assert(result.metric_ids.length >= 3, 'should have 3 metric_ids');
    assert.strictEqual(result.echarts_type, 'line', 'funnel trend should be line');
  });

  it('rates: conversion rate and sync rate together', async () => {
    const result = await callAi('show me conversion rate and sync rate by month');
    assertValidSpec(result, 'rates multi-metric');
    assert(result.metric_ids.length >= 2, 'should have at least 2 rates');
  });

  it('pie chart: trial distribution by country', async () => {
    const result = await callAi('show me trial distribution by country as a pie chart');
    assertValidSpec(result, 'pie by country');
    assert.strictEqual(result.echarts_type, 'pie', 'should be pie chart');
  });

  it('stacked bar: trials by channel over time', async () => {
    const result = await callAi('show me trials stacked by channel over time');
    assertValidSpec(result, 'stacked bar');
    const isStacked = result.echarts_type === 'stacked_bar' || result.echarts_type === 'bar';
    assert(isStacked, `should be stacked_bar or bar, got ${result.echarts_type}`);
  });

  it('horizontal bar: trials by country ranked', async () => {
    const result = await callAi('show me trials by country as a horizontal bar chart');
    assertValidSpec(result, 'horizontal bar');
    assert.strictEqual(result.echarts_type, 'horizontal_bar', 'should be horizontal_bar');
  });

  it('area chart: syncs over time', async () => {
    const result = await callAi('show me syncs over time as an area chart');
    assertValidSpec(result, 'area chart');
    assert.strictEqual(result.echarts_type, 'area', 'should be area chart');
  });

  it('multiple channel filters: PPC conversions', async () => {
    const result = await callAi('show me PPC conversions by month');
    assertValidSpec(result, 'PPC conversions');
    assert.strictEqual(result.data_config.channel_filter, 'PPC', 'should filter by PPC');
    assert(result.metric_ids.includes(56), 'should pick Conversions (id 56)');
  });

  it('combo: trials bar with conversion rate line', async () => {
    const result = await callAi('show me trials as bars with conversion rate as a line overlay by month');
    assertValidSpec(result, 'combo chart');
    assert.strictEqual(result.echarts_type, 'combo', 'should be combo chart');
    assert(result.metric_ids.length >= 2, 'should have at least 2 metrics for combo');
  });

  it('this year scope', async () => {
    const result = await callAi('show me syncs this year');
    assertValidSpec(result, 'this year');
    assert.strictEqual(result.data_config.last_n_months, 12, 'this year should be last 12 months');
  });

  it('weekly time bucket with filter', async () => {
    const result = await callAi('show me weekly SEO trials for the last 3 months');
    assertValidSpec(result, 'weekly SEO');
    assert.strictEqual(result.data_config.time_bucket, 'week', 'should be weekly');
    assert.strictEqual(result.data_config.channel_filter, 'SEO', 'should filter SEO');
    assert.strictEqual(result.data_config.last_n_months, 3, 'should be last 3 months');
  });
});

// --- Conversational AI Tests ---

async function callAiConversational(messages, currentChartSpec) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chart`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      metricContext: METRIC_CONTEXT,
      schemaContext: SCHEMA_CONTEXT,
      currentChartSpec,
    }),
  });
  if (!res.ok) throw new Error(`AI function failed: ${res.status}`);
  return res.json();
}

describe('Conversational AI Evals', () => {
  it('follow-up: add metric to existing chart', async () => {
    const r1 = await callAi('show me trials by month');
    assertValidSpec(r1, 'initial trials');

    const r2 = await callAiConversational([
      { role: 'user', content: 'show me trials by month' },
      { role: 'assistant', content: JSON.stringify(r1) },
      { role: 'user', content: 'add syncs too' },
    ], r1);
    assertValidSpec(r2, 'add syncs');
    assert(r2.metric_ids.length >= 2, 'should have at least 2 metrics');
    assert(r2.metric_ids.includes(54), 'should keep Trials');
    assert(r2.metric_ids.includes(55), 'should add Syncs');
  });

  it('follow-up: change chart type', async () => {
    const r1 = await callAi('show me trials by month');
    const r2 = await callAiConversational([
      { role: 'user', content: 'show me trials by month' },
      { role: 'assistant', content: JSON.stringify(r1) },
      { role: 'user', content: 'make it a bar chart' },
    ], r1);
    assertValidSpec(r2, 'change to bar');
    assert.strictEqual(r2.echarts_type, 'bar', 'should be bar');
    assert(r2.metric_ids.includes(54), 'should still have Trials');
  });

  it('follow-up: change time range', async () => {
    const r1 = await callAi('show me trials by month');
    const r2 = await callAiConversational([
      { role: 'user', content: 'show me trials by month' },
      { role: 'assistant', content: JSON.stringify(r1) },
      { role: 'user', content: 'just the last 6 months' },
    ], r1);
    assertValidSpec(r2, 'last 6 months follow-up');
    assert.strictEqual(r2.data_config.last_n_months, 6, 'should filter to 6 months');
  });

  it('follow-up: add channel filter', async () => {
    const r1 = await callAi('show me trials by month');
    const r2 = await callAiConversational([
      { role: 'user', content: 'show me trials by month' },
      { role: 'assistant', content: JSON.stringify(r1) },
      { role: 'user', content: 'only SEO' },
    ], r1);
    assertValidSpec(r2, 'SEO filter follow-up');
    assert.strictEqual(r2.data_config.channel_filter, 'SEO', 'should filter by SEO');
  });

  it('follow-up: completely different topic resets', async () => {
    const r1 = await callAi('show me trials by month');
    const r2 = await callAiConversational([
      { role: 'user', content: 'show me trials by month' },
      { role: 'assistant', content: JSON.stringify(r1) },
      { role: 'user', content: 'show me churn rate by month' },
    ], r1);
    assertValidSpec(r2, 'topic change');
    assert(r2.metric_ids.includes(46), 'should pick Churn Rate');
  });

  it('follow-up: "just do march" should preserve time_bucket and not return null lastNMonths', async () => {
    const r1 = await callAi('conversion rate this month');
    const r2 = await callAiConversational([
      { role: 'user', content: 'conversion rate this month' },
      { role: 'assistant', content: JSON.stringify(r1) },
      { role: 'user', content: 'just do march please' },
    ], r1);
    assertValidSpec(r2, 'just do march');
    // Should still have conversion rate metric
    assert(r2.metric_ids.includes(20), 'should keep Conversion Rate');
    // time_bucket should not be null
    assert(r2.data_config.time_bucket, 'time_bucket should be set');
  });

  it('follow-up: "make it monthly" should change time_bucket but keep metric', async () => {
    const r1 = await callAi('show me daily trials for the last 2 months');
    const r2 = await callAiConversational([
      { role: 'user', content: 'show me daily trials for the last 2 months' },
      { role: 'assistant', content: JSON.stringify(r1) },
      { role: 'user', content: 'make it monthly' },
    ], r1);
    assertValidSpec(r2, 'make it monthly');
    assert(r2.metric_ids.includes(54), 'should keep Trials');
    assert.strictEqual(r2.data_config.time_bucket, 'month', 'should change to monthly');
  });
});

// --- Time Range Precision Tests ---

describe('Time Range Precision', () => {
  it('"this month" should return last_n_months: 0', async () => {
    const r = await callAi('show me trials this month');
    assertValidSpec(r, 'this month');
    assert.strictEqual(r.data_config.last_n_months, 0, '"this month" should be 0 (current month only)');
  });

  it('"last month" should return last_n_months: 1', async () => {
    const r = await callAi('show me trials last month');
    assertValidSpec(r, 'last month');
    assert.strictEqual(r.data_config.last_n_months, 1, '"last month" should be 1');
  });

  it('"just march" should have a time filter set', async () => {
    const r = await callAi('show me trials for march');
    assertValidSpec(r, 'just march');
    assert(r.data_config.last_n_months != null, 'should have a time filter for a specific month');
  });

  it('"this month" with derived metric should use monthly bucket', async () => {
    const r = await callAi('conversion rate this month');
    assertValidSpec(r, 'conversion rate this month');
    assert.strictEqual(r.data_config.time_bucket, 'month', 'derived rates should use monthly bucket');
  });

  it('"last 3 months" should return 3', async () => {
    const r = await callAi('show me syncs for the last 3 months');
    assertValidSpec(r, 'last 3 months');
    assert.strictEqual(r.data_config.last_n_months, 3, 'last 3 months = 3');
  });
});

// --- Multi-Step Conversation Chain Tests ---
// These simulate real user sessions: 3-5 follow-ups building on previous context.

async function runChain(steps, initialSpec = null) {
  const messages = [];
  let currentSpec = initialSpec;
  const results = [];

  for (const step of steps) {
    messages.push({ role: 'user', content: step.prompt });
    const result = await callAiConversational(messages, currentSpec);
    assertValidSpec(result, step.label);
    step.validate(result, results);
    messages.push({ role: 'assistant', content: JSON.stringify(result) });
    currentSpec = result;
    results.push(result);
  }
  return results;
}

function assertHasMetrics(result, ids, label) {
  for (const id of ids) {
    assert(result.metric_ids.includes(id), `${label}: should include metric ${id}`);
  }
}

describe('Multi-Step Conversation Chains', () => {
  it('chain: trials → add syncs → stacked bars → SEO filter → last 3 months', async () => {
    await runChain([
      {
        prompt: 'show me trials by month',
        label: 'step 1: initial trials',
        validate: (r) => {
          assertHasMetrics(r, [54], 'step 1');
          assert.strictEqual(r.data_config.time_bucket, 'month');
        },
      },
      {
        prompt: 'add syncs too',
        label: 'step 2: add syncs',
        validate: (r) => {
          assertHasMetrics(r, [54, 55], 'step 2');
          assert.strictEqual(r.data_config.time_bucket, 'month', 'bucket should stay month');
        },
      },
      {
        prompt: 'make it stacked bars',
        label: 'step 3: stacked bars',
        validate: (r) => {
          assert.strictEqual(r.echarts_type, 'stacked_bar', 'should be stacked_bar');
          assert(r.metric_ids.length >= 2, 'should keep both metrics');
        },
      },
      {
        prompt: 'only SEO',
        label: 'step 4: SEO filter',
        validate: (r) => {
          assert.strictEqual(r.data_config.channel_filter, 'SEO', 'should filter by SEO');
          assert(r.metric_ids.length >= 2, 'should keep both metrics');
        },
      },
      {
        prompt: 'just last 3 months',
        label: 'step 5: last 3 months',
        validate: (r) => {
          assert.strictEqual(r.data_config.last_n_months, 3, 'should be 3 months');
          assert.strictEqual(r.data_config.time_bucket, 'month', 'bucket should still be month');
        },
      },
    ]);
  });

  it('chain: conversion rate → add sync rate → weekly → table', async () => {
    await runChain([
      {
        prompt: 'show me conversion rate by month',
        label: 'step 1: conversion rate',
        validate: (r) => {
          assertHasMetrics(r, [20], 'step 1');
        },
      },
      {
        prompt: 'compare to sync rate',
        label: 'step 2: add sync rate',
        validate: (r) => {
          assertHasMetrics(r, [20, 25], 'step 2');
        },
      },
      {
        prompt: 'make it weekly',
        label: 'step 3: weekly',
        validate: (r) => {
          assert.strictEqual(r.data_config.time_bucket, 'week', 'should be weekly');
          assert(r.metric_ids.length >= 2, 'should keep both rates');
        },
      },
      {
        prompt: 'show as table',
        label: 'step 4: table view',
        validate: (r) => {
          assert.strictEqual(r.echarts_type, 'table', 'should be table');
          assert(r.metric_ids.length >= 2, 'should keep both rates');
        },
      },
    ]);
  });

  it('chain: edit saved chart — change range, add metric, change type', async () => {
    const savedSpec = {
      metric_ids: [54, 55],
      echarts_type: 'line',
      data_config: {
        x_field: 'SignupDate',
        y_fields: ['COUNT', 'COUNT'],
        time_bucket: 'month',
        last_n_months: 12,
        channel_filter: null,
        labels: ['Trials', 'Syncs'],
      },
      show_labels: false,
      explanation: 'Trials and Syncs by month',
    };

    await runChain([
      {
        prompt: 'show last 6 months instead',
        label: 'edit step 1: change range',
        validate: (r) => {
          assert.strictEqual(r.data_config.last_n_months, 6, 'should be 6 months');
          assertHasMetrics(r, [54, 55], 'edit step 1');
          assert.strictEqual(r.echarts_type, 'line', 'type should stay line');
        },
      },
      {
        prompt: 'add conversion rate',
        label: 'edit step 2: add derived metric',
        validate: (r) => {
          assertHasMetrics(r, [54, 55, 20], 'edit step 2');
        },
      },
      {
        prompt: 'make it a combo chart',
        label: 'edit step 3: combo',
        validate: (r) => {
          assert.strictEqual(r.echarts_type, 'combo', 'should be combo');
          assert(r.metric_ids.length >= 3, 'should keep all 3 metrics');
        },
      },
    ], savedSpec);
  });

  it('chain: multi-metric chart → complete topic reset', async () => {
    const savedSpec = {
      metric_ids: [54, 55],
      echarts_type: 'line',
      data_config: {
        x_field: 'SignupDate',
        y_fields: ['COUNT', 'COUNT'],
        time_bucket: 'month',
        last_n_months: 12,
        channel_filter: null,
        labels: ['Trials', 'Syncs'],
      },
      explanation: 'Trials and Syncs',
    };

    await runChain([
      {
        prompt: 'now show me churn rate by month',
        label: 'reset: churn rate',
        validate: (r) => {
          assertHasMetrics(r, [46], 'reset');
          assert(!r.metric_ids.includes(54), 'should NOT include Trials');
          assert(!r.metric_ids.includes(55), 'should NOT include Syncs');
        },
      },
    ], savedSpec);
  });

  it('chain: data labels persist across chart type change', async () => {
    await runChain([
      {
        prompt: 'show me trials by month with data labels',
        label: 'step 1: with labels',
        validate: (r) => {
          assertHasMetrics(r, [54], 'step 1');
          assert.strictEqual(r.show_labels, true, 'show_labels should be true');
        },
      },
      {
        prompt: 'make it a bar chart',
        label: 'step 2: bar with labels preserved',
        validate: (r) => {
          assert.strictEqual(r.echarts_type, 'bar', 'should be bar');
          assert.strictEqual(r.show_labels, true, 'show_labels should still be true');
        },
      },
    ]);
  });
});
