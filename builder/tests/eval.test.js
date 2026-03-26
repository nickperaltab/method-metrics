import { describe, it } from 'node:test';
import assert from 'node:assert';

const SUPABASE_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY';

const METRIC_CONTEXT = `- id:54 name:"Trials" type:primitive view:v_trials
- id:55 name:"Syncs" type:primitive view:v_syncs
- id:56 name:"Conversions" type:primitive view:v_conversions
- id:20 name:"Conversion Rate" type:derived view:none
- id:25 name:"Sync Rate" type:derived view:none
- id:46 name:"Churn Rate" type:derived view:none
- id:57 name:"New Net SaaS" type:primitive view:v_new_net_saas
- id:58 name:"Churn" type:primitive view:v_churn
- id:59 name:"BOM Customers" type:primitive view:v_bom_customers`;

const SCHEMA_CONTEXT = `v_trials: SignupDate(DATE), CompanyAccount(STRING), Channel(STRING), SignupCountry(STRING), Vertical(STRING), Att_SEO(INTEGER), Att_Pay_Per_Click(INTEGER), Att_Direct(INTEGER), Att_Social(INTEGER), Att_Email(INTEGER), Att_Referral_Link(INTEGER), Att_Partners(INTEGER), Att_Content(INTEGER), Att_Remarketing(INTEGER), Att_Other(INTEGER), Att_None(INTEGER)
v_syncs: SyncDate(DATE), SignupDate(DATE), CompanyAccount(STRING), EventType(STRING), SyncType(STRING), SyncTypeRegion(STRING), SignupCountry(STRING), Vertical(STRING), Att_SEO(INTEGER), Att_Pay_Per_Click(INTEGER), Att_Direct(INTEGER)
v_conversions: ConversionDate(DATE), SignupDate(DATE), CompanyAccount(STRING), SignupCountry(STRING), Vertical(STRING), Att_SEO(INTEGER), Att_Pay_Per_Click(INTEGER), Att_Direct(INTEGER)`;

const VALID_CHART_TYPES = new Set(['bar', 'line', 'scatter', 'area', 'horizontal_bar']);

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

  // Must have metrics array or metric_id
  const hasMetrics = Array.isArray(result.metrics) && result.metrics.length > 0;
  const hasMetricId = typeof result.metric_id === 'number';
  assert(hasMetrics || hasMetricId, `${label}: must have metrics array or metric_id`);

  // Chart type must be valid
  if (result.chart_type) {
    assert(VALID_CHART_TYPES.has(result.chart_type), `${label}: invalid chart_type "${result.chart_type}"`);
  }

  // x_field must not be "Channel" (common hallucination)
  assert(result.x_field !== 'Channel', `${label}: x_field should not be "Channel" — no such column exists`);
  assert(result.color_field !== 'Channel', `${label}: color_field should not be "Channel" — no such column exists`);

  // Must have explanation
  assert(result.explanation, `${label}: must have explanation`);
}

describe('AI Chart Builder Evals', () => {
  it('single metric: trials by month', async () => {
    const result = await callAi('show me trials by month');
    assertValidSpec(result, 'trials by month');
    const metricId = result.metrics?.[0]?.metric_id || result.metric_id;
    assert.strictEqual(metricId, 54, 'should pick Trials (id 54)');
    assert.strictEqual(result.chart_type, 'line', 'should be line chart');
  });

  it('multi-metric: trials and syncs by month', async () => {
    const result = await callAi('show me trials and syncs by month');
    assertValidSpec(result, 'trials and syncs');
    assert(Array.isArray(result.metrics), 'should return metrics array');
    assert(result.metrics.length >= 2, 'should have at least 2 metrics');
  });

  it('time bucket: weekly syncs', async () => {
    const result = await callAi('show me weekly syncs');
    assertValidSpec(result, 'weekly syncs');
    assert.strictEqual(result.time_bucket, 'week', 'should set time_bucket to week');
  });

  it('time bucket: daily trials', async () => {
    const result = await callAi('show me daily trials for the last 2 months');
    assertValidSpec(result, 'daily trials');
    assert.strictEqual(result.time_bucket, 'day', 'should set time_bucket to day');
    assert.strictEqual(result.last_n_months, 2, 'should set last_n_months to 2');
  });

  it('channel filter: SEO trials', async () => {
    const result = await callAi('show me SEO trials by month');
    assertValidSpec(result, 'SEO trials');
    assert.strictEqual(result.channel_filter, 'SEO', 'should set channel_filter to SEO');
  });

  it('by channel: should NOT return Channel column', async () => {
    const result = await callAi('show me syncs by channel');
    assertValidSpec(result, 'syncs by channel');
    assert.notStrictEqual(result.color_field, 'Channel', 'should not hallucinate Channel column');
    assert.notStrictEqual(result.x_field, 'Channel', 'should not use Channel as x_field');
  });

  it('by country: should use SignupCountry', async () => {
    const result = await callAi('show me trials by country');
    assertValidSpec(result, 'trials by country');
    const usesCountry = result.color_field === 'SignupCountry' || result.x_field === 'SignupCountry';
    assert(usesCountry, `should use SignupCountry as color_field or x_field, got color_field=${result.color_field}, x_field=${result.x_field}`);
  });

  it('derived metric: conversion rate', async () => {
    const result = await callAi('show me conversion rate by month');
    assertValidSpec(result, 'conversion rate');
    const metricId = result.metrics?.[0]?.metric_id || result.metric_id;
    assert.strictEqual(metricId, 20, 'should pick Conversion Rate (id 20)');
  });

  it('invalid prompt: should return error or suggestion', async () => {
    const result = await callAi('show me pizza sales');
    assert(result.error || result.suggestion, 'should return error for invalid metric');
  });

  it('time range: last 6 months', async () => {
    const result = await callAi('show me trials for the last 6 months');
    assertValidSpec(result, 'last 6 months');
    assert.strictEqual(result.last_n_months, 6, 'should set last_n_months to 6');
  });
});
