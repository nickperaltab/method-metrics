/**
 * Haiku vs Sonnet comparison runner.
 *
 * Runs a subset of prompts against both ai-chart (Sonnet) and ai-chart-haiku endpoints,
 * comparing the results. Deploy ai-chart-haiku first with Haiku model.
 *
 * Usage: node builder/tests/eval-haiku-compare.js
 *
 * Set ENDPOINT_HAIKU env var if using a different function name.
 */

const SUPABASE_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY';

const SONNET_URL = `${SUPABASE_URL}/functions/v1/ai-chart`;
const HAIKU_URL = process.env.ENDPOINT_HAIKU || `${SUPABASE_URL}/functions/v1/ai-chart-haiku`;

// Same context as eval.test.js
const METRIC_CONTEXT = `- id:54 name:"Trials" type:primitive view:v_trials dimensions:[AttributionChannel,SignupCountry,SyncType,Vertical]
- id:55 name:"Syncs" type:primitive view:v_syncs dimensions:[AttributionChannel,SyncType]
- id:56 name:"Conversions" type:primitive view:v_conversions dimensions:[AttributionChannel,SignupCountry,Vertical]
- id:20 name:"Conversion Rate" type:derived view:none formula:SAFE_DIVIDE({56},{54}) depends_on:[56,54]
- id:300 name:"Sync Rate" type:derived view:none formula:SAFE_DIVIDE({55},{54})*100 depends_on:[55,54]
- id:46 name:"Churn Rate" type:derived view:none
- id:57 name:"New Net SaaS" type:primitive view:v_new_net_saas
- id:285 name:"Trials Forecast" type:primitive view:none has_chart_sql:true desc:"Total monthly trials forecast."
- id:286 name:"Syncs Forecast" type:primitive view:none has_chart_sql:true desc:"Total monthly syncs forecast."
- id:294 name:"Trials Trajectory" type:primitive view:none has_chart_sql:true desc:"Projected end-of-month trials."
- id:295 name:"Syncs Trajectory" type:primitive view:none has_chart_sql:true desc:"Projected end-of-month syncs."
- id:273 name:"Conversions Forecast" type:primitive view:v_scorecard_mtd has_chart_sql:true desc:"Monthly forecast for conversions."
- id:274 name:"Forecasted Churn" type:primitive view:none has_chart_sql:true desc:"Monthly forecasted churn count."
- id:59 name:"Churn" type:primitive view:v_cancellations has_chart_sql:true desc:"Monthly count of churned accounts."
- id:329 name:"Total New DEP Net SaaS" type:primitive view:none has_chart_sql:true desc:"New DEP revenue per month."
- id:282 name:"Budgeted New DEP Revenue" type:primitive view:none has_chart_sql:true desc:"Monthly budgeted new DEP revenue."
- id:290 name:"Forecasted New DEP Revenue" type:primitive view:none has_chart_sql:true desc:"Monthly forecasted new DEP revenue."
- id:330 name:"New DEP Revenue Trajectory" type:primitive view:none has_chart_sql:true desc:"Projected end-of-month new DEP revenue."
- id:331 name:"New DEP Forecast vs Trajectory" type:derived depends_on:[330,290] desc:"Delta: trajectory minus forecast."
- id:332 name:"New DEP Forecast Attainment" type:derived depends_on:[330,290] desc:"Trajectory as % of forecast."`;

const SCHEMA_CONTEXT = `v_trials: SignupDate(DATE), CompanyAccount(STRING), AttributionChannel(STRING), SignupCountry(STRING), Vertical(STRING), SyncType(STRING)
v_syncs: SyncDate(DATE), SignupDate(DATE), CompanyAccount(STRING), SyncType(STRING), AttributionChannel(STRING)
v_conversions: ConversionDate(DATE), SignupDate(DATE), CompanyAccount(STRING), SignupCountry(STRING), Vertical(STRING), AttributionChannel(STRING)`;

// Test prompts with expected assertions
const TEST_CASES = [
  // Basic metric selection
  { prompt: 'trials by month', check: r => r.metric_ids?.includes(54), name: 'single metric: trials' },
  { prompt: 'show me syncs and trials by month', check: r => r.metric_ids?.includes(54) && r.metric_ids?.includes(55), name: 'multi-metric: trials+syncs' },
  { prompt: 'conversion rate by month', check: r => r.metric_ids?.includes(20), name: 'derived: conversion rate' },
  { prompt: 'sync rate by month', check: r => r.metric_ids?.includes(300), name: 'derived: sync rate' },

  // Chart types
  { prompt: 'trials by month as a bar chart', check: r => r.echarts_type === 'bar', name: 'chart type: bar' },
  { prompt: 'syncs over time as an area chart', check: r => r.echarts_type === 'area', name: 'chart type: area' },
  { prompt: 'trial distribution by country as a pie chart', check: r => r.echarts_type === 'pie', name: 'chart type: pie' },
  { prompt: 'trials by country ranked', check: r => r.echarts_type === 'horizontal_bar', name: 'chart type: horizontal bar' },
  { prompt: 'how many trials this month', check: r => r.echarts_type === 'kpi', name: 'chart type: KPI' },
  { prompt: 'trials and syncs by channel as a table', check: r => r.echarts_type === 'table', name: 'chart type: table' },
  { prompt: 'trials year over year', check: r => r.echarts_type === 'yoy', name: 'chart type: YoY' },

  // Time buckets
  { prompt: 'weekly syncs', check: r => r.data_config?.time_bucket === 'week', name: 'time bucket: week' },
  { prompt: 'daily trials', check: r => r.data_config?.time_bucket === 'day', name: 'time bucket: day' },

  // Time ranges
  { prompt: 'trials this month', check: r => r.data_config?.last_n_months === 0, name: 'range: this month' },
  { prompt: 'syncs last 3 months', check: r => r.data_config?.last_n_months === 3, name: 'range: last 3 months' },
  { prompt: 'trials last 6 months', check: r => r.data_config?.last_n_months === 6, name: 'range: last 6 months' },

  // Dimensions & filters
  { prompt: 'SEO trials by month', check: r => r.data_config?.channel_filter === 'SEO', name: 'channel filter: SEO' },
  { prompt: 'trials by attribution channel', check: r => r.data_config?.group_by_dimension === 'AttributionChannel', name: 'dimension: AttributionChannel' },
  { prompt: 'trials by country', check: r => r.data_config?.group_by_dimension === 'SignupCountry' || r.data_config?.x_field === 'SignupCountry', name: 'dimension: SignupCountry' },

  // Forecast comparison
  { prompt: 'trials vs trials forecast', check: r => r.metric_ids?.includes(54) && r.metric_ids?.includes(285), name: 'forecast: trials vs forecast' },
  { prompt: 'churn vs forecasted churn', check: r => r.metric_ids?.includes(59) && r.metric_ids?.includes(274), name: 'forecast: churn vs forecast' },

  // DEP metrics
  { prompt: 'new DEP revenue by month', check: r => r.metric_ids?.includes(329), name: 'DEP: new DEP revenue' },
  { prompt: 'new DEP revenue trajectory as KPI', check: r => r.metric_ids?.includes(330) && r.echarts_type === 'kpi', name: 'DEP: trajectory KPI' },
  { prompt: 'DEP forecast attainment as KPI', check: r => r.metric_ids?.includes(332) && r.echarts_type === 'kpi', name: 'DEP: attainment KPI' },

  // Style rules
  { prompt: 'sync rate by month, alert when below 60%', check: r => r.style_rules?.length > 0 || r.data_config?.style_rules?.length > 0, name: 'style: threshold alert' },

  // Text response (not a chart)
  { prompt: 'what metrics do we have?', check: r => r.type === 'text', name: 'text: list metrics' },
];

async function callEndpoint(url, prompt) {
  const start = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, metricContext: METRIC_CONTEXT, schemaContext: SCHEMA_CONTEXT }),
  });
  const elapsed = Date.now() - start;
  if (!res.ok) return { error: `HTTP ${res.status}`, elapsed };
  const data = await res.json();
  return { ...data, elapsed };
}

async function run() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('  HAIKU vs SONNET — Eval Comparison');
  console.log(`${'='.repeat(80)}\n`);

  const results = [];
  let sonnetPass = 0, haikuPass = 0, both = 0, neither = 0;

  for (const tc of TEST_CASES) {
    process.stdout.write(`  ${tc.name.padEnd(40)}`);

    const [sonnet, haiku] = await Promise.all([
      callEndpoint(SONNET_URL, tc.prompt),
      callEndpoint(HAIKU_URL, tc.prompt),
    ]);

    const sPass = !sonnet.error && tc.check(sonnet);
    const hPass = !haiku.error && tc.check(haiku);

    if (sPass && hPass) both++;
    else if (sPass && !hPass) sonnetPass++;
    else if (!sPass && hPass) haikuPass++;
    else neither++;

    const status = sPass && hPass ? '✓ BOTH'
      : sPass ? '⚡ SONNET ONLY'
      : hPass ? '🔥 HAIKU ONLY'
      : '✗ NEITHER';

    console.log(`${status.padEnd(20)} S:${sonnet.elapsed}ms  H:${haiku.elapsed}ms`);

    results.push({
      name: tc.name,
      prompt: tc.prompt,
      sonnet: { pass: sPass, elapsed: sonnet.elapsed, response: sonnet },
      haiku: { pass: hPass, elapsed: haiku.elapsed, response: haiku },
    });
  }

  console.log(`\n${'─'.repeat(80)}`);
  console.log(`  SUMMARY`);
  console.log(`  Both pass:       ${both}/${TEST_CASES.length}`);
  console.log(`  Sonnet only:     ${sonnetPass}`);
  console.log(`  Haiku only:      ${haikuPass}`);
  console.log(`  Neither:         ${neither}`);
  console.log(`${'─'.repeat(80)}`);

  const avgSonnet = Math.round(results.reduce((s, r) => s + (r.sonnet.elapsed || 0), 0) / results.length);
  const avgHaiku = Math.round(results.reduce((s, r) => s + (r.haiku.elapsed || 0), 0) / results.length);
  console.log(`  Avg latency:     Sonnet ${avgSonnet}ms  |  Haiku ${avgHaiku}ms`);
  console.log(`${'─'.repeat(80)}\n`);

  // Show failures detail
  const failures = results.filter(r => r.sonnet.pass !== r.haiku.pass);
  if (failures.length > 0) {
    console.log('  DIVERGENCES:\n');
    for (const f of failures) {
      const winner = f.sonnet.pass ? 'Sonnet' : 'Haiku';
      const loser = f.sonnet.pass ? 'Haiku' : 'Sonnet';
      console.log(`  ${f.name}`);
      console.log(`    Prompt: "${f.prompt}"`);
      console.log(`    ${winner} ✓ | ${loser} ✗`);
      const loserResp = f.sonnet.pass ? f.haiku.response : f.sonnet.response;
      console.log(`    ${loser} returned: ${JSON.stringify(loserResp).slice(0, 200)}`);
      console.log('');
    }
  }
}

run().catch(console.error);
