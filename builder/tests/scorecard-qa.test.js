import { describe, it } from 'node:test';
import assert from 'node:assert';

const SUPABASE_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY';

// Full metric context — every live scorecard metric
const METRIC_CONTEXT = `- id:54 name:"Trials" type:primitive view:int_trials dimensions:[AttributionChannel,SignupCountry,SyncType,Vertical]
- id:55 name:"Syncs" type:primitive view:int_syncs dimensions:[AttributionChannel,SyncType]
- id:56 name:"Conversions" type:primitive view:int_conversions dimensions:[AttributionChannel,SignupCountry,Vertical]
- id:57 name:"New Net SaaS" type:primitive view:v_new_net_saas
- id:59 name:"Churn" type:primitive view:int_cancellations has_chart_sql:true
- id:285 name:"Trials Forecast" type:primitive view:none has_chart_sql:true desc:"Total monthly trials forecast. Use for actual vs forecast comparison and KPI tiles."
- id:286 name:"Syncs Forecast" type:primitive view:none has_chart_sql:true desc:"Total monthly syncs forecast."
- id:289 name:"Forecasted New Net SaaS" type:primitive view:none has_chart_sql:true desc:"Monthly forecasted new net SaaS revenue."
- id:273 name:"Conversions Forecast" type:primitive view:none has_chart_sql:true desc:"Monthly forecast for conversions."
- id:274 name:"Forecasted Churn" type:primitive view:none has_chart_sql:true desc:"Monthly forecasted churn count."
- id:275 name:"New Net SaaS Forecast" type:primitive view:none has_chart_sql:true
- id:280 name:"Budgeted Churn" type:primitive view:none has_chart_sql:true
- id:282 name:"Budgeted New DEP Revenue" type:primitive view:none has_chart_sql:true
- id:283 name:"Budgeted Total Net SaaS" type:primitive view:none has_chart_sql:true
- id:284 name:"Budgeted Total DEP Revenue" type:primitive view:none has_chart_sql:true
- id:290 name:"Forecasted New DEP Revenue" type:primitive view:none has_chart_sql:true
- id:291 name:"Forecasted Total Net SaaS" type:primitive view:none has_chart_sql:true
- id:292 name:"Forecasted Total DEP Revenue" type:primitive view:none has_chart_sql:true
- id:294 name:"Trials Trajectory" type:primitive view:none has_chart_sql:true desc:"Projected end-of-month trials at current MTD pace."
- id:295 name:"Syncs Trajectory" type:primitive view:none has_chart_sql:true desc:"Projected end-of-month syncs."
- id:296 name:"Conversions Trajectory" type:primitive view:none has_chart_sql:true
- id:297 name:"Cancellations Trajectory" type:primitive view:none has_chart_sql:true
- id:298 name:"New Net SaaS Trajectory" type:primitive view:none has_chart_sql:true
- id:300 name:"Sync Rate" type:derived view:none formula:SAFE_DIVIDE({55},{54})*100 depends_on:[55,54]
- id:301 name:"Sync to Conversion Rate" type:derived view:none formula:SAFE_DIVIDE({56},{55})*100 depends_on:[56,55]
- id:319 name:"Forecasted Conversion Rate" type:primitive view:none has_chart_sql:true
- id:321 name:"Conversion Rate Trajectory" type:derived view:none depends_on:[296,320]
- id:322 name:"Conv Rate Forecast vs Trajectory" type:derived view:none depends_on:[321,319]
- id:323 name:"Conv Rate Forecast Attainment" type:derived view:none depends_on:[321,319]
- id:324 name:"Budgeted Conversion Rate" type:primitive view:none has_chart_sql:true
- id:325 name:"Budgeted New Net SaaS" type:primitive view:none has_chart_sql:true
- id:326 name:"New Net SaaS Revenue Trajectory" type:primitive view:none has_chart_sql:true
- id:327 name:"New Net SaaS Forecast vs Trajectory" type:derived view:none depends_on:[326,289]
- id:328 name:"New Net SaaS Forecast Attainment" type:derived view:none depends_on:[326,289]
- id:329 name:"Total New DEP Net SaaS" type:primitive view:none has_chart_sql:true
- id:330 name:"New DEP Revenue Trajectory" type:primitive view:none has_chart_sql:true
- id:331 name:"New DEP Forecast vs Trajectory" type:derived view:none depends_on:[330,290]
- id:332 name:"New DEP Forecast Attainment" type:derived view:none depends_on:[330,290]
- id:333 name:"Total DEP Net SaaS" type:primitive view:v_total_dep_revenue has_chart_sql:true
- id:334 name:"Total DEP Net SaaS Trajectory" type:primitive view:none has_chart_sql:true
- id:335 name:"Total DEP Forecast vs Trajectory" type:derived view:none depends_on:[334,292]
- id:336 name:"Total DEP Forecast Attainment" type:derived view:none depends_on:[334,292]
- id:337 name:"Total Net SaaS" type:primitive view:v_total_net_saas has_chart_sql:true
- id:338 name:"Net SaaS Trajectory" type:primitive view:none has_chart_sql:true
- id:339 name:"Net SaaS Forecast vs Trajectory" type:primitive view:none has_chart_sql:true
- id:340 name:"Net SaaS Forecast Attainment" type:primitive view:none has_chart_sql:true
- id:341 name:"Churn Trajectory" type:primitive view:int_cancellations has_chart_sql:true
- id:342 name:"Forecasted Churn Rate %" type:primitive view:none has_chart_sql:true
- id:343 name:"Budgeted Churn Rate %" type:primitive view:none has_chart_sql:true
- id:344 name:"Churn Rate" type:primitive view:int_cancellations has_chart_sql:true
- id:345 name:"Churn Rate % Trajectory" type:primitive view:int_cancellations has_chart_sql:true
- id:346 name:"NRR" type:primitive view:none has_chart_sql:true
- id:347 name:"Forecasted NRR" type:primitive view:none has_chart_sql:true
- id:348 name:"Budgeted NRR" type:primitive view:none has_chart_sql:true
- id:349 name:"Trials Trajectory vs Forecast" type:derived view:none formula:{294}-{285} depends_on:[294,285]
- id:350 name:"Trials Forecast Attainment" type:derived view:none formula:SAFE_DIVIDE({294},{285})*100 depends_on:[294,285]
- id:351 name:"Syncs Trajectory vs Forecast" type:derived view:none formula:{295}-{286} depends_on:[295,286]
- id:352 name:"Syncs Forecast Attainment" type:derived view:none formula:SAFE_DIVIDE({295},{286})*100 depends_on:[295,286]
- id:353 name:"Trials Budget" type:primitive view:none has_chart_sql:true
- id:354 name:"Forecast vs Trials" type:derived view:none formula:{54}-{285} depends_on:[54,285]
- id:355 name:"Budget vs Trials" type:derived view:none formula:{54}-{353} depends_on:[54,353]
- id:357 name:"Scorecard Conversion Rate" type:primitive view:none has_chart_sql:true
- id:358 name:"Syncs Budget" type:primitive view:none has_chart_sql:true
- id:359 name:"Forecast vs Syncs" type:derived view:none formula:{55}-{286} depends_on:[55,286]
- id:360 name:"Budget vs Syncs" type:derived view:none formula:{55}-{358} depends_on:[55,358]
- id:361 name:"Forecasted Sync Rate" type:primitive view:none has_chart_sql:true
- id:362 name:"Budgeted Sync Rate" type:primitive view:none has_chart_sql:true
- id:363 name:"Sync Rate vs Forecast" type:primitive view:none has_chart_sql:true
- id:364 name:"Sync Rate Attainment" type:primitive view:none has_chart_sql:true`;

const SCHEMA_CONTEXT = `int_trials: SignupDate(DATE), CompanyAccount(STRING), AttributionChannel(STRING), SignupCountry(STRING), SyncType(STRING), Vertical(STRING)
int_syncs: SyncDate(DATE), CompanyAccount(STRING), AttributionChannel(STRING), SyncType(STRING)
int_conversions: FirstSaaSInvoiceTxnDate(DATE), CompanyAccount(STRING), AttributionChannel(STRING), SignupCountry(STRING), Vertical(STRING)
int_cancellations: CancellationDate(DATE), CompanyAccount(STRING), Channel(STRING)
v_trials_forecast_channel: forecast_date(DATE), AttributionChannel(STRING), forecast_value(FLOAT)
v_syncs_forecast_channel: forecast_date(DATE), AttributionChannel(STRING), forecast_value(FLOAT)
v_new_net_saas: TxnDate(DATE), SaaSAmount(FLOAT), CompanyAccount(STRING)
v_total_net_saas: TxnDate(DATE), SaaSAmount(FLOAT), SaaSExpense(FLOAT)
v_total_dep_revenue: TxnDate(DATE), SaaSAmount(FLOAT)`;

async function callAi(prompt) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chart`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, metricContext: METRIC_CONTEXT, schemaContext: SCHEMA_CONTEXT }),
  });
  if (!res.ok) throw new Error(`AI function failed: ${res.status}`);
  return res.json();
}

// Helper: assert AI returned a chart spec (not text/error)
function assertChartSpec(result, label) {
  assert.ok(result.metric_ids, `${label}: should return metric_ids, got type:"${result.type}" content:"${(result.content || '').slice(0, 100)}"`);
}

// Helper: require derived metric ID OR all component IDs
function assertDerivedOrComponents(result, derivedId, componentIds, label) {
  if (result.metric_ids.includes(derivedId)) return;
  const hasAll = componentIds.every(id => result.metric_ids.includes(id));
  assert.ok(hasAll, `${label}: need id:${derivedId} or all of [${componentIds}], got ${JSON.stringify(result.metric_ids)}`);
}

// Helper: require ALL expected metric IDs present
function assertAllMetricIds(result, expectedIds, label) {
  for (const id of expectedIds) {
    assert.ok(result.metric_ids.includes(id), `${label}: missing id:${id}, got ${JSON.stringify(result.metric_ids)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE 1: MARKETING SCORECARD
// ═══════════════════════════════════════════════════════════════════════════

describe('P1: Marketing Scorecard — Trials KPIs', () => {
  it('Forecasted Trials → KPI 758', async () => {
    const r = await callAi('trials forecast as KPI for this month');
    assertChartSpec(r, 'Trials Forecast KPI');
    assert.ok(r.metric_ids.includes(285), `should use id:285, got ${r.metric_ids}`);
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Trials To Date → KPI', async () => {
    const r = await callAi('trials as KPI for this month');
    assertChartSpec(r, 'Trials KPI');
    assert.ok(r.metric_ids.includes(54));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Trials Trajectory → KPI', async () => {
    const r = await callAi('trials trajectory as KPI');
    assertChartSpec(r, 'Trials Trajectory KPI');
    assert.ok(r.metric_ids.includes(294));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Trials Trajectory vs Forecast → KPI', async () => {
    const r = await callAi('trials trajectory vs forecast as KPI for this month');
    assertChartSpec(r, 'Trials Traj vs Forecast');
    assertDerivedOrComponents(r, 349, [294, 285], 'Trials Traj vs Forecast');
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Trials Forecast Attainment → KPI', async () => {
    const r = await callAi('trials forecast attainment as KPI for this month');
    assertChartSpec(r, 'Trials Attainment');
    assertDerivedOrComponents(r, 350, [294, 285], 'Trials Attainment');
    assert.strictEqual(r.echarts_type, 'kpi');
  });
});

describe('P1: Marketing Scorecard — Trials Charts', () => {
  it('Trial Summary Table → table with 5 columns', async () => {
    const r = await callAi('trials, trials forecast, forecast vs trials, trials budget, budget vs trials as table');
    assertChartSpec(r, 'Trial Summary Table');
    assert.strictEqual(r.echarts_type, 'table');
    assert.ok(r.metric_ids.length >= 5, `need 5+ metrics for 5-column table, got ${r.metric_ids.length}`);
    assert.ok(r.metric_ids.includes(54), 'should include Trials (54)');
  });

  it('Weekly Trials Actual → bar weekly', async () => {
    const r = await callAi('weekly trials bar last 3 months with labels');
    assertChartSpec(r, 'Weekly Trials');
    assert.strictEqual(r.echarts_type, 'bar');
    assert.ok(r.metric_ids.includes(54));
    assert.strictEqual(r.data_config.time_bucket, 'week');
  });

  it('Monthly Trials to Budget & Forecast → 3-series bar', async () => {
    const r = await callAi('trials budget, trials forecast, trials as bar chart');
    assertChartSpec(r, 'Monthly Trials B&F');
    assert.strictEqual(r.echarts_type, 'bar');
    assertAllMetricIds(r, [353, 285, 54], 'Monthly Trials B&F');
  });
});

describe('P1: Marketing Scorecard — Syncs KPIs', () => {
  it('Syncs Forecast → KPI 470', async () => {
    const r = await callAi('syncs forecast as KPI for this month');
    assertChartSpec(r, 'Syncs Forecast KPI');
    assert.ok(r.metric_ids.includes(286));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Syncs To Date → KPI', async () => {
    const r = await callAi('syncs as KPI for this month');
    assertChartSpec(r, 'Syncs KPI');
    assert.ok(r.metric_ids.includes(55));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Syncs Trajectory → KPI', async () => {
    const r = await callAi('syncs trajectory as KPI');
    assertChartSpec(r, 'Syncs Trajectory KPI');
    assert.ok(r.metric_ids.includes(295));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Syncs Trajectory vs Forecast → KPI', async () => {
    const r = await callAi('syncs trajectory vs forecast as KPI for this month');
    assertChartSpec(r, 'Syncs Traj vs Forecast');
    assertDerivedOrComponents(r, 351, [295, 286], 'Syncs Traj vs Forecast');
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Syncs Forecast Attainment → KPI', async () => {
    const r = await callAi('syncs forecast attainment as KPI for this month');
    assertChartSpec(r, 'Syncs Attainment');
    assertDerivedOrComponents(r, 352, [295, 286], 'Syncs Attainment');
    assert.strictEqual(r.echarts_type, 'kpi');
  });
});

describe('P1: Marketing Scorecard — Syncs Charts', () => {
  it('Sync Summary Table → table with 5 columns', async () => {
    const r = await callAi('syncs, syncs forecast, forecast vs syncs, syncs budget, budget vs syncs as table');
    assertChartSpec(r, 'Sync Summary Table');
    assert.strictEqual(r.echarts_type, 'table');
    assert.ok(r.metric_ids.length >= 5, `need 5+ metrics for 5-column table, got ${r.metric_ids.length}`);
    assert.ok(r.metric_ids.includes(55));
  });

  it('Weekly Actual Syncs → bar weekly', async () => {
    const r = await callAi('weekly syncs bar last 3 months with labels');
    assertChartSpec(r, 'Weekly Syncs');
    assert.strictEqual(r.echarts_type, 'bar');
    assert.ok(r.metric_ids.includes(55));
    assert.strictEqual(r.data_config.time_bucket, 'week');
  });

  it('Monthly Syncs to Budget & Forecast → 3-series bar', async () => {
    const r = await callAi('syncs budget, syncs forecast, syncs as bar chart');
    assertChartSpec(r, 'Monthly Syncs B&F');
    assert.strictEqual(r.echarts_type, 'bar');
    assertAllMetricIds(r, [358, 286, 55], 'Monthly Syncs B&F');
  });
});

describe('P1: Marketing Scorecard — Sync Rate', () => {
  it('Forecasted Sync Rate → KPI ~62%', async () => {
    const r = await callAi('forecasted sync rate as KPI');
    assertChartSpec(r, 'Forecasted Sync Rate KPI');
    assert.ok(r.metric_ids.includes(361));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Current Sync % → KPI', async () => {
    const r = await callAi('sync rate as KPI for this month');
    assertChartSpec(r, 'Sync Rate KPI');
    assert.ok(r.metric_ids.includes(300));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Sync Rate vs Forecast → KPI', async () => {
    const r = await callAi('sync rate vs forecast as KPI');
    assertChartSpec(r, 'Sync Rate vs Forecast KPI');
    assert.ok(r.metric_ids.includes(363));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Sync Rate Attainment → KPI', async () => {
    const r = await callAi('sync rate attainment as KPI');
    assertChartSpec(r, 'Sync Rate Attainment KPI');
    assert.ok(r.metric_ids.includes(364));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Monthly Sync Rate Chart → 3-series bar', async () => {
    const r = await callAi('budgeted sync rate, forecasted sync rate, sync rate as bar chart');
    assertChartSpec(r, 'Sync Rate MoM');
    assert.strictEqual(r.echarts_type, 'bar');
    assertAllMetricIds(r, [362, 361, 300], 'Monthly Sync Rate');
  });

  it('Sync Rate Summary Table → table with 5 columns', async () => {
    const r = await callAi('sync rate, forecasted sync rate, sync rate vs forecast, budgeted sync rate, sync rate attainment as table');
    assertChartSpec(r, 'Sync Rate Table');
    assert.strictEqual(r.echarts_type, 'table');
    assert.ok(r.metric_ids.length >= 5, `need 5+ metrics for 5-column table, got ${r.metric_ids.length}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PAGE 2: SALES SCORECARD
// ═══════════════════════════════════════════════════════════════════════════

describe('P2: Sales Scorecard — Conversion Rate', () => {
  it('Conversion Rate WoW → line weekly', async () => {
    const r = await callAi('budgeted conversion rate, forecasted conversion rate, scorecard conversion rate as line chart weekly last 2 months');
    assertChartSpec(r, 'Conv Rate WoW');
    assertAllMetricIds(r, [324, 319, 357], 'Conv Rate WoW');
  });

  it('Conversion Rate MoM → bar', async () => {
    const r = await callAi('budgeted conversion rate, forecasted conversion rate, scorecard conversion rate as bar chart');
    assertChartSpec(r, 'Conv Rate MoM');
    assert.strictEqual(r.echarts_type, 'bar');
  });

  it('Conversion Rate Trajectory → KPI', async () => {
    const r = await callAi('conversion rate trajectory as KPI');
    assertChartSpec(r, 'Conv Rate Trajectory KPI');
    assert.ok(r.metric_ids.includes(321));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Conv Rate Forecast vs Trajectory → KPI', async () => {
    const r = await callAi('conv rate forecast vs trajectory as KPI');
    assertChartSpec(r, 'Conv Rate F vs T KPI');
    assertDerivedOrComponents(r, 322, [321, 319], 'Conv Rate F vs T');
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Conv Rate Forecast Attainment → KPI', async () => {
    const r = await callAi('conv rate forecast attainment as KPI');
    assertChartSpec(r, 'Conv Rate Attainment KPI');
    assertDerivedOrComponents(r, 323, [321, 319], 'Conv Rate Attainment');
    assert.strictEqual(r.echarts_type, 'kpi');
  });
});

describe('P2: Sales Scorecard — New Net SaaS', () => {
  it('Forecasted New Net SaaS → KPI', async () => {
    const r = await callAi('forecasted new net saas as KPI');
    assertChartSpec(r, 'Forecasted New Net SaaS KPI');
    assert.ok(r.metric_ids.includes(289), `should include id:289, got ${r.metric_ids}`);
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('New Net SaaS (actual) → KPI', async () => {
    const r = await callAi('new net saas as KPI for this month');
    assertChartSpec(r, 'New Net SaaS KPI');
    assert.ok(r.metric_ids.includes(57));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('New Net SaaS Trajectory → KPI', async () => {
    const r = await callAi('new net saas revenue trajectory as KPI');
    assertChartSpec(r, 'New Net SaaS Traj KPI');
    assert.ok(r.metric_ids.includes(326));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('New Net SaaS Forecast vs Trajectory → KPI', async () => {
    const r = await callAi('new net saas forecast vs trajectory as KPI');
    assertChartSpec(r, 'NNS F vs T KPI');
    assertDerivedOrComponents(r, 327, [326, 289], 'NNS F vs T');
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('New Net SaaS Forecast Attainment → KPI', async () => {
    const r = await callAi('new net saas forecast attainment as KPI');
    assertChartSpec(r, 'NNS Attainment KPI');
    assertDerivedOrComponents(r, 328, [326, 289], 'NNS Attainment');
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('New Net SaaS WoW → bar/line weekly', async () => {
    const r = await callAi('budgeted new net saas, forecasted new net saas, new net saas as bar chart weekly last 2 months');
    assertChartSpec(r, 'New Net SaaS WoW');
    assert.ok(r.metric_ids.includes(57), 'should include New Net SaaS actual (57)');
  });

  it('New Net SaaS MoM → bar', async () => {
    const r = await callAi('budgeted new net saas, forecasted new net saas, new net saas as bar chart');
    assertChartSpec(r, 'New Net SaaS MoM');
    assert.strictEqual(r.echarts_type, 'bar');
  });
});

describe('P2: Sales Scorecard — New DEP Revenue', () => {
  it('Forecasted New DEP Revenue → KPI', async () => {
    const r = await callAi('forecasted new dep revenue as KPI');
    assertChartSpec(r, 'Forecasted DEP KPI');
    assert.ok(r.metric_ids.includes(290));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Total New DEP Net SaaS → KPI', async () => {
    const r = await callAi('total new dep net saas as KPI for this month');
    assertChartSpec(r, 'DEP actual KPI');
    assert.ok(r.metric_ids.includes(329));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('New DEP Trajectory → KPI', async () => {
    const r = await callAi('new dep revenue trajectory as KPI');
    assertChartSpec(r, 'DEP Trajectory KPI');
    assert.ok(r.metric_ids.includes(330));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('New DEP Forecast vs Trajectory → KPI', async () => {
    const r = await callAi('new dep forecast vs trajectory as KPI');
    assertChartSpec(r, 'DEP F vs T KPI');
    assertDerivedOrComponents(r, 331, [330, 290], 'DEP F vs T');
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('New DEP Forecast Attainment → KPI', async () => {
    const r = await callAi('new dep forecast attainment as KPI');
    assertChartSpec(r, 'DEP Attainment KPI');
    assertDerivedOrComponents(r, 332, [330, 290], 'DEP Attainment');
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('New DEP Revenue MoM → bar', async () => {
    const r = await callAi('budgeted new dep revenue, forecasted new dep revenue, total new dep net saas as bar chart');
    assertChartSpec(r, 'DEP Revenue MoM');
    assert.strictEqual(r.echarts_type, 'bar');
  });

  it('New DEP Revenue WoW → combo chart weekly', async () => {
    const r = await callAi('budgeted new dep revenue, forecasted new dep revenue, total new dep net saas as combo chart weekly last 2 months');
    assertChartSpec(r, 'DEP Revenue WoW');
    assert.ok(r.metric_ids.length >= 2, `need 2+ metrics, got ${r.metric_ids.length}`);
  });
});

describe('P2: Sales Scorecard — Churn Rate', () => {
  it('Forecasted Churn → KPI', async () => {
    const r = await callAi('forecasted churn as KPI');
    assertChartSpec(r, 'Forecasted Churn KPI');
    assert.ok(r.metric_ids.includes(274));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Churn actual → KPI', async () => {
    const r = await callAi('churn as KPI for this month');
    assertChartSpec(r, 'Churn Actual KPI');
    assert.ok(r.metric_ids.includes(59));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Churn Trajectory → KPI', async () => {
    const r = await callAi('churn trajectory as KPI');
    assertChartSpec(r, 'Churn Trajectory KPI');
    assert.ok(r.metric_ids.includes(341) || r.metric_ids.includes(297), `should include 341 or 297, got ${r.metric_ids}`);
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Churn Rate MoM → 3-series bar', async () => {
    const r = await callAi('budgeted churn rate, forecasted churn rate, churn rate as bar chart');
    assertChartSpec(r, 'Churn Rate MoM');
    assert.strictEqual(r.echarts_type, 'bar');
    assertAllMetricIds(r, [343, 342, 344], 'Churn Rate MoM');
  });

  it('Churn Count WoW → combo chart weekly', async () => {
    const r = await callAi('budgeted churn, forecasted churn, churn as combo chart weekly last 2 months');
    assertChartSpec(r, 'Churn Count WoW');
    assert.ok(r.metric_ids.length >= 2, `need 2+ metrics, got ${r.metric_ids.length}`);
  });

  it('Forecasted Churn Rate % → KPI', async () => {
    const r = await callAi('forecasted churn rate % as KPI');
    assertChartSpec(r, 'Forecasted Churn Rate KPI');
    assert.ok(r.metric_ids.includes(342));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Churn Rate % Trajectory → KPI', async () => {
    const r = await callAi('churn rate % trajectory as KPI');
    assertChartSpec(r, 'Churn Rate Traj KPI');
    assert.ok(r.metric_ids.includes(345));
    assert.strictEqual(r.echarts_type, 'kpi');
  });
});

describe('P2: Sales Scorecard — Total Net SaaS', () => {
  it('Forecasted Total Net SaaS → KPI', async () => {
    const r = await callAi('forecasted total net saas as KPI');
    assertChartSpec(r, 'Forecasted Total Net SaaS KPI');
    assert.ok(r.metric_ids.includes(291));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Total Net SaaS → KPI', async () => {
    const r = await callAi('total net saas as KPI for this month');
    assertChartSpec(r, 'Total Net SaaS KPI');
    assert.ok(r.metric_ids.includes(337));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Net SaaS Trajectory → KPI', async () => {
    const r = await callAi('net saas trajectory as KPI');
    assertChartSpec(r, 'Net SaaS Traj KPI');
    assert.ok(r.metric_ids.includes(338));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Net SaaS Forecast vs Trajectory → KPI', async () => {
    const r = await callAi('net saas forecast vs trajectory as KPI');
    assertChartSpec(r, 'Net SaaS F vs T KPI');
    assert.ok(r.metric_ids.includes(339), `should include id:339, got ${JSON.stringify(r.metric_ids)}`);
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Net SaaS Forecast Attainment → KPI', async () => {
    const r = await callAi('net saas forecast attainment as KPI');
    assertChartSpec(r, 'Net SaaS Attainment KPI');
    assert.ok(r.metric_ids.includes(340), `should include id:340, got ${JSON.stringify(r.metric_ids)}`);
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Total Net SaaS MoM → bar', async () => {
    const r = await callAi('budgeted total net saas, forecasted total net saas, total net saas as bar chart');
    assertChartSpec(r, 'Total Net SaaS MoM');
    assert.strictEqual(r.echarts_type, 'bar');
  });

  it('Total Net SaaS WoW → combo chart weekly', async () => {
    const r = await callAi('budgeted total net saas, forecasted total net saas, total net saas as combo chart weekly last 2 months');
    assertChartSpec(r, 'Total Net SaaS WoW');
    assert.ok(r.metric_ids.length >= 2, `need 2+ metrics, got ${r.metric_ids.length}`);
  });
});

describe('P2: Sales Scorecard — Total DEP Revenue', () => {
  it('Forecasted Total DEP Revenue → KPI', async () => {
    const r = await callAi('forecasted total dep revenue as KPI');
    assertChartSpec(r, 'Forecasted Total DEP KPI');
    assert.ok(r.metric_ids.includes(292));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Total DEP Net SaaS → KPI', async () => {
    const r = await callAi('total dep net saas as KPI for this month');
    assertChartSpec(r, 'Total DEP KPI');
    assert.ok(r.metric_ids.includes(333));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Total DEP Net SaaS Trajectory → KPI', async () => {
    const r = await callAi('total dep net saas trajectory as KPI');
    assertChartSpec(r, 'Total DEP Traj KPI');
    assert.ok(r.metric_ids.includes(334));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Total DEP Forecast vs Trajectory → KPI', async () => {
    const r = await callAi('total dep forecast vs trajectory as KPI');
    assertChartSpec(r, 'Total DEP F vs T KPI');
    assertDerivedOrComponents(r, 335, [334, 292], 'Total DEP F vs T');
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Total DEP Forecast Attainment → KPI', async () => {
    const r = await callAi('total dep forecast attainment as KPI');
    assertChartSpec(r, 'Total DEP Attainment KPI');
    assertDerivedOrComponents(r, 336, [334, 292], 'Total DEP Attainment');
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Total DEP MoM → bar', async () => {
    const r = await callAi('budgeted total dep revenue, forecasted total dep revenue, total dep net saas as bar chart');
    assertChartSpec(r, 'Total DEP MoM');
    assert.strictEqual(r.echarts_type, 'bar');
  });

  it('Total DEP Revenue WoW → combo chart weekly', async () => {
    const r = await callAi('budgeted total dep revenue, forecasted total dep revenue, total dep net saas as combo chart weekly last 2 months');
    assertChartSpec(r, 'Total DEP WoW');
    assert.ok(r.metric_ids.length >= 2, `need 2+ metrics, got ${r.metric_ids.length}`);
  });
});

describe('P2: Sales Scorecard — NRR', () => {
  it('NRR → line chart last 6 months', async () => {
    const r = await callAi('NRR as line chart last 6 months');
    assertChartSpec(r, 'NRR line');
    assert.ok(r.metric_ids.includes(346));
    assert.strictEqual(r.echarts_type, 'line');
  });

  it('Forecasted NRR → KPI', async () => {
    const r = await callAi('forecasted NRR as KPI');
    assertChartSpec(r, 'Forecasted NRR KPI');
    assert.ok(r.metric_ids.includes(347));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('NRR monthly bar chart', async () => {
    const r = await callAi('NRR as bar chart last 6 months');
    assertChartSpec(r, 'NRR monthly bar');
    assert.ok(r.metric_ids.includes(346));
    assert.strictEqual(r.echarts_type, 'bar');
  });

  it('NRR weekly bar chart for this month', async () => {
    const r = await callAi('NRR as bar chart weekly for this month');
    assertChartSpec(r, 'NRR weekly bar');
    assert.ok(r.metric_ids.includes(346));
    assert.strictEqual(r.echarts_type, 'bar');
    assert.strictEqual(r.data_config.time_bucket, 'week');
  });

  it('Average NRR → KPI', async () => {
    const r = await callAi('NRR as KPI');
    assertChartSpec(r, 'Average NRR KPI');
    assert.ok(r.metric_ids.includes(346));
    assert.strictEqual(r.echarts_type, 'kpi');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PAGE 4: METHOD MONDAY
// ═══════════════════════════════════════════════════════════════════════════

describe('P4: Method Monday — MTD Tiles', () => {
  it('Trials Forecast + Trajectory → bar this month', async () => {
    const r = await callAi('trials forecast and trials trajectory as bar for this month');
    assertChartSpec(r, 'Trials F+T bar');
    assertAllMetricIds(r, [285, 294], 'Trials F+T');
  });

  it('Syncs Forecast + Trajectory → bar this month', async () => {
    const r = await callAi('syncs forecast and syncs trajectory as bar for this month');
    assertChartSpec(r, 'Syncs F+T bar');
    assertAllMetricIds(r, [286, 295], 'Syncs F+T');
  });

  it('Conversions Forecast + Actual → bar this month', async () => {
    const r = await callAi('conversions forecast and conversions as bar for this month');
    assertChartSpec(r, 'Conv F+A bar');
    assertAllMetricIds(r, [273, 56], 'Conv F+A');
  });

  it('Churn Forecast + Actual → bar this month', async () => {
    const r = await callAi('forecasted churn and churn as bar for this month');
    assertChartSpec(r, 'Churn F+A bar');
    assertAllMetricIds(r, [274, 59], 'Churn F+A');
  });

  it('Forecasted Conversion Rate + Trajectory → bar', async () => {
    const r = await callAi('forecasted conversion rate and conversion rate trajectory as bar');
    assertChartSpec(r, 'Conv Rate F+T bar');
    assertAllMetricIds(r, [319, 321], 'Conv Rate F+T');
  });

  it('Forecasted Churn Rate + Trajectory → bar', async () => {
    const r = await callAi('forecasted churn rate % and churn rate % trajectory as bar');
    assertChartSpec(r, 'Churn Rate F+T bar');
    assertAllMetricIds(r, [342, 345], 'Churn Rate F+T');
  });

  it('Trials Attainment tile → KPI', async () => {
    const r = await callAi('trials forecast attainment as KPI for this month');
    assertChartSpec(r, 'Trials Attainment Tile');
    assertDerivedOrComponents(r, 350, [294, 285], 'Trials Attainment Tile');
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Syncs Attainment tile → KPI', async () => {
    const r = await callAi('syncs forecast attainment as KPI for this month');
    assertChartSpec(r, 'Syncs Attainment Tile');
    assertDerivedOrComponents(r, 352, [295, 286], 'Syncs Attainment Tile');
    assert.strictEqual(r.echarts_type, 'kpi');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GAP COVERAGE: Missing KPI tiles from QA audit
// ═══════════════════════════════════════════════════════════════════════════

describe('P1: Snapshot — Missing Elements', () => {
  it('Scorecard Conversion Rate → KPI', async () => {
    const r = await callAi('scorecard conversion rate as KPI for this month');
    assertChartSpec(r, 'Scorecard Conv Rate KPI');
    assert.ok(r.metric_ids.includes(357));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Trials Snapshot stacked bar (trajectory + gap)', async () => {
    const r = await callAi('trials forecast and trials trajectory as stacked bar for this month');
    assertChartSpec(r, 'Trials Snapshot stacked');
    assertAllMetricIds(r, [285, 294], 'Trials Snapshot');
  });

  it('Syncs Snapshot stacked bar (trajectory + gap)', async () => {
    const r = await callAi('syncs forecast and syncs trajectory as stacked bar for this month');
    assertChartSpec(r, 'Syncs Snapshot stacked');
    assertAllMetricIds(r, [286, 295], 'Syncs Snapshot');
  });
});

describe('P2: Sales Scorecard — Gap KPI tiles', () => {
  it('Conversions count → KPI', async () => {
    const r = await callAi('conversions as KPI for this month');
    assertChartSpec(r, 'Conversions KPI');
    assert.ok(r.metric_ids.includes(56));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Forecasted Conversion Rate → standalone KPI', async () => {
    const r = await callAi('forecasted conversion rate as KPI');
    assertChartSpec(r, 'Forecasted Conv Rate KPI');
    assert.ok(r.metric_ids.includes(319));
    assert.strictEqual(r.echarts_type, 'kpi');
  });

  it('Scorecard Conversion Rate actual → KPI', async () => {
    const r = await callAi('scorecard conversion rate as KPI for this month');
    assertChartSpec(r, 'Conv Rate Actual KPI');
    assert.ok(r.metric_ids.includes(357));
    assert.strictEqual(r.echarts_type, 'kpi');
  });
});

describe('P3: Detail Tables', () => {
  it('Conversion Rate Details → table', async () => {
    const r = await callAi('budgeted conversion rate, forecasted conversion rate, scorecard conversion rate, conversions, conversions trajectory as table');
    assertChartSpec(r, 'Conv Rate Details');
    assert.strictEqual(r.echarts_type, 'table');
    assert.ok(r.metric_ids.length >= 5, `need 5+ metrics for detail table, got ${r.metric_ids.length}`);
  });

  it('New Net SaaS Details → drill table', async () => {
    const r = await callAi('new net saas as drill table for this month');
    assertChartSpec(r, 'NNS Details');
    assert.ok(r.metric_ids.includes(57), `should include id:57, got ${JSON.stringify(r.metric_ids)}`);
  });

  it('New DEP Revenue Details → drill table', async () => {
    const r = await callAi('total new dep net saas as drill table for this month');
    assertChartSpec(r, 'DEP Details');
    assert.ok(r.metric_ids.includes(329), `should include id:329, got ${JSON.stringify(r.metric_ids)}`);
  });

  it('Churn Count Details → drill table', async () => {
    const r = await callAi('churn as drill table for this month');
    assertChartSpec(r, 'Churn Details');
    assert.ok(r.metric_ids.includes(59), `should include id:59, got ${JSON.stringify(r.metric_ids)}`);
  });

  it('Total Net SaaS Details → drill table', async () => {
    const r = await callAi('total net saas as drill table for this month');
    assertChartSpec(r, 'Total Net SaaS Details');
    assert.ok(r.metric_ids.includes(337), `should include id:337, got ${JSON.stringify(r.metric_ids)}`);
  });

  it('Total DEP Revenue Details → drill table', async () => {
    const r = await callAi('total dep net saas as drill table for this month');
    assertChartSpec(r, 'Total DEP Details');
    assert.ok(r.metric_ids.includes(333), `should include id:333, got ${JSON.stringify(r.metric_ids)}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DATA INTEGRITY: chart_sql null safety + dependencies
// ═══════════════════════════════════════════════════════════════════════════

describe('Data: chart_sql metrics exist and have null safety', () => {
  const chartSqlMetrics = [
    285, 286, 289, 273, 274, 275, 280, 282, 283, 284, 290, 291, 292,
    294, 295, 296, 297, 298, 319, 320, 324, 325, 326, 329, 330, 333,
    334, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348,
    353, 357, 358, 361, 362, 363, 364
  ];

  for (const id of chartSqlMetrics) {
    it(`metric ${id}: exists, live, has chart_sql`, async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/metrics?id=eq.${id}&select=id,name,chart_sql,status`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
      });
      const [metric] = await res.json();
      assert.ok(metric, `metric ${id} should exist`);
      assert.strictEqual(metric.status, 'live', `metric ${id} should be live`);
      assert.ok(metric.chart_sql, `metric ${id} should have chart_sql`);
      if (metric.chart_sql.includes('forecast_channel')) {
        assert.ok(metric.chart_sql.includes('IS NOT NULL'), `metric ${id} (${metric.name}): missing IS NOT NULL filter on forecast_channel view`);
      }
    });
  }
});

describe('Data: derived metric dependencies are valid', () => {
  const derivedMetrics = [
    { id: 300, deps: [55, 54] },
    { id: 301, deps: [56, 55] },
    { id: 321, deps: [296, 320] },
    { id: 322, deps: [321, 319] },
    { id: 323, deps: [321, 319] },
    { id: 327, deps: [326, 289] },
    { id: 328, deps: [326, 289] },
    { id: 331, deps: [330, 290] },
    { id: 332, deps: [330, 290] },
    { id: 335, deps: [334, 292] },
    { id: 336, deps: [334, 292] },
    { id: 349, deps: [294, 285] },
    { id: 350, deps: [294, 285] },
    { id: 351, deps: [295, 286] },
    { id: 352, deps: [295, 286] },
    { id: 354, deps: [54, 285] },
    { id: 355, deps: [54, 353] },
    { id: 359, deps: [55, 286] },
    { id: 360, deps: [55, 358] },
  ];

  for (const { id, deps } of derivedMetrics) {
    it(`metric ${id}: dependencies [${deps}] exist and are live`, async () => {
      for (const depId of deps) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/metrics?id=eq.${depId}&select=id,name,status`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
        });
        const [dep] = await res.json();
        assert.ok(dep, `dep ${depId} for metric ${id} should exist`);
        assert.strictEqual(dep.status, 'live', `dep ${depId} (${dep.name}) should be live`);
      }
    });
  }
});
