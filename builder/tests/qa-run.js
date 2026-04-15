/**
 * QA runner — runs the 20 dashboard prompts and reports what the AI + postProcess pipeline
 * actually produces. No assertions: just documents real behavior so we know what works,
 * what degrades, and what fails outright.
 */

const SUPABASE_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY';

const METRIC_CONTEXT = `- id:54 name:"Trials" type:primitive view:v_trials dimensions:[AttributionChannel,SignupCountry,SyncType,Vertical]
- id:55 name:"Syncs" type:primitive view:v_syncs dimensions:[AttributionChannel,SyncType]
- id:56 name:"Conversions" type:primitive view:v_conversions dimensions:[AttributionChannel,SignupCountry,Vertical]
- id:20 name:"Conversion Rate" type:derived view:none formula:SAFE_DIVIDE({56},{54}) depends_on:[56,54]
- id:25 name:"Sync Rate" type:derived view:none formula:SAFE_DIVIDE({55},{54}) depends_on:[55,54]
- id:46 name:"Churn Rate" type:derived view:none
- id:57 name:"New Net SaaS" type:primitive view:v_new_net_saas
- id:58 name:"Churn" type:primitive view:v_churn
- id:59 name:"BOM Customers" type:primitive view:v_bom_customers
- id:271 name:"Trials Forecast" type:primitive view:v_scorecard_mtd has_chart_sql:true desc:"Monthly forecast/budget for trials. Pair with Trials (id:54) for actual vs forecast comparison. Use same chart type for both — bar for single month, line or bar for multi-month. Never use combo."
- id:272 name:"Syncs Forecast" type:primitive view:v_scorecard_mtd has_chart_sql:true desc:"Monthly forecast/budget for syncs. Pair with Syncs (id:55) for actual vs forecast comparison. Use same chart type for both — bar for single month, line or bar for multi-month. Never use combo."
- id:273 name:"Conversions Forecast" type:primitive view:v_scorecard_mtd has_chart_sql:true desc:"Monthly forecast/budget for conversions. Pair with Conversions (id:56) for actual vs forecast comparison. Use same chart type for both — bar for single month, line or bar for multi-month. Never use combo."
- id:274 name:"Churn Forecast" type:primitive view:v_scorecard_mtd has_chart_sql:true desc:"Monthly forecast/budget for cancellations/churn. Pair with Churn (id:58) for actual vs forecast comparison. Use same chart type for both — bar for single month, line or bar for multi-month. Never use combo."
- id:275 name:"New Net SaaS Forecast" type:primitive view:v_scorecard_mtd has_chart_sql:true desc:"Monthly forecast/budget for new net SaaS revenue. Use same chart type (bar or line), never combo."
- id:305 name:"Trials Forecast by Channel" type:primitive view:v_trials_forecast_channel dimensions:[AttributionChannel] desc:"Monthly trials forecast broken down by channel. Use with Trials (id:54) for channel-level actual vs forecast pivot. Use last_n_months:0 and group_by_dimension:AttributionChannel."
- id:306 name:"Syncs Forecast by Channel" type:primitive view:v_syncs_forecast_channel dimensions:[AttributionChannel] desc:"Monthly syncs forecast broken down by channel. Use with Syncs (id:55) for channel-level actual vs forecast pivot."
- id:307 name:"Trials Trajectory" type:primitive view:v_trials_trajectory_channel dimensions:[AttributionChannel] desc:"Trials MTD extrapolated to end of month by channel: (MTD / days_elapsed) * days_in_month. Always use last_n_months:0 and group_by_dimension:AttributionChannel."
- id:308 name:"Syncs Trajectory" type:primitive view:v_syncs_trajectory_channel dimensions:[AttributionChannel] desc:"Syncs MTD extrapolated to end of month by channel."
- id:309 name:"Trials vs Forecast" type:derived depends_on:[54,305] desc:"Trials MTD minus trials forecast by channel. Negative = below forecast."
- id:310 name:"Trials vs Forecast %" type:derived depends_on:[54,305] desc:"Trials MTD vs monthly forecast as a percentage."
- id:311 name:"Trials Traj vs Forecast" type:derived depends_on:[307,305] desc:"Trials trajectory minus monthly forecast by channel."
- id:312 name:"Trials Traj vs Forecast %" type:derived depends_on:[307,305] desc:"Trials trajectory vs forecast as a percentage."
- id:313 name:"Syncs vs Forecast" type:derived depends_on:[55,306] desc:"Syncs MTD minus syncs forecast by channel."
- id:314 name:"Syncs vs Forecast %" type:derived depends_on:[55,306] desc:"Syncs MTD vs monthly forecast as a percentage."
- id:315 name:"Syncs Traj vs Forecast" type:derived depends_on:[308,306] desc:"Syncs trajectory minus monthly forecast by channel."
- id:316 name:"Syncs Traj vs Forecast %" type:derived depends_on:[308,306] desc:"Syncs trajectory vs forecast as a percentage."
- id:317 name:"Sync Rate Forecast" type:derived depends_on:[306,305] desc:"Expected sync rate by channel: syncs forecast / trials forecast."`;

const SCHEMA_CONTEXT = `v_trials: SignupDate(DATE), CompanyAccount(STRING), AttributionChannel(STRING), SignupCountry(STRING), Vertical(STRING), SyncType(STRING)
v_syncs: SyncDate(DATE), SignupDate(DATE), CompanyAccount(STRING), AttributionChannel(STRING), SyncType(STRING)
v_conversions: ConversionDate(DATE), SignupDate(DATE), CompanyAccount(STRING), AttributionChannel(STRING), SignupCountry(STRING), Vertical(STRING)
v_trials_forecast_channel: forecast_date(DATE), AttributionChannel(STRING), forecast_value(FLOAT)
v_syncs_forecast_channel: forecast_date(DATE), AttributionChannel(STRING), forecast_value(FLOAT)
v_trials_trajectory_channel: snapshot_date(DATE), AttributionChannel(STRING), trajectory_value(FLOAT)
v_syncs_trajectory_channel: snapshot_date(DATE), AttributionChannel(STRING), trajectory_value(FLOAT)`;

const METRICS = [
  { id: 54, view_name: 'v_trials' }, { id: 55, view_name: 'v_syncs' },
  { id: 56, view_name: 'v_conversions' }, { id: 20, view_name: null },
  { id: 25, view_name: null }, { id: 46, view_name: null },
  { id: 57, view_name: 'v_new_net_saas' }, { id: 58, view_name: 'v_churn' },
  { id: 59, view_name: 'v_bom_customers' },
  { id: 271, view_name: 'v_scorecard_mtd' }, { id: 272, view_name: 'v_scorecard_mtd' },
  { id: 273, view_name: 'v_scorecard_mtd' }, { id: 274, view_name: 'v_scorecard_mtd' },
  { id: 275, view_name: 'v_scorecard_mtd' },
  { id: 305, view_name: 'v_trials_forecast_channel' }, { id: 306, view_name: 'v_syncs_forecast_channel' },
  { id: 307, view_name: 'v_trials_trajectory_channel' }, { id: 308, view_name: 'v_syncs_trajectory_channel' },
  { id: 309, view_name: null }, { id: 310, view_name: null }, { id: 311, view_name: null },
  { id: 312, view_name: null }, { id: 313, view_name: null }, { id: 314, view_name: null },
  { id: 315, view_name: null }, { id: 316, view_name: null }, { id: 317, view_name: null },
];
const APPROVED_DIMENSIONS = [
  { metric_id: 54, column_name: 'AttributionChannel' }, { metric_id: 54, column_name: 'SignupCountry' },
  { metric_id: 54, column_name: 'SyncType' }, { metric_id: 54, column_name: 'Vertical' },
  { metric_id: 55, column_name: 'AttributionChannel' }, { metric_id: 55, column_name: 'SyncType' },
  { metric_id: 56, column_name: 'AttributionChannel' }, { metric_id: 56, column_name: 'SignupCountry' },
  { metric_id: 56, column_name: 'Vertical' },
  { metric_id: 305, column_name: 'AttributionChannel' }, { metric_id: 306, column_name: 'AttributionChannel' },
  { metric_id: 307, column_name: 'AttributionChannel' }, { metric_id: 308, column_name: 'AttributionChannel' },
];

function postProcess(prompt, result) {
  if (!result || result.error || result.type === 'text') return result;
  const resolvedMetrics = (result.metric_ids || []).map(id => METRICS.find(m => m.id === id)).filter(Boolean);
  if (resolvedMetrics.length === 0) return result;
  const dc = result.data_config || {};
  const hasPrimitive = resolvedMetrics.some(m => m.view_name);
  if (dc.group_by_dimension && hasPrimitive) {
    const approved = resolvedMetrics.flatMap(m => APPROVED_DIMENSIONS.filter(d => d.metric_id === m.id).map(d => d.column_name));
    if (approved.length === 0 || !approved.includes(dc.group_by_dimension)) {
      dc.group_by_dimension = approved.find(c => c.toLowerCase() === dc.group_by_dimension.toLowerCase()) || null;
    }
  }
  const lp = prompt.toLowerCase();
  const GROUP_BY_TRIGGERS = [
    { patterns: ['by channel', 'by attribution channel', 'per channel', 'across channels', 'channel breakdown', 'by source'], dimension: 'AttributionChannel' },
    { patterns: ['by country', 'per country', 'across countries', 'by region'], dimension: 'SignupCountry' },
    { patterns: ['by vertical', 'by industry'], dimension: 'Vertical' },
    { patterns: ['by sync type'], dimension: 'SyncType' },
  ];
  if (!dc.group_by_dimension) {
    for (const { patterns, dimension } of GROUP_BY_TRIGGERS) {
      if (patterns.some(p => lp.includes(p))) {
        if (!hasPrimitive) { dc.group_by_dimension = dimension; }
        else {
          const approved = resolvedMetrics.flatMap(m => APPROVED_DIMENSIONS.filter(d => d.metric_id === m.id).map(d => d.column_name));
          if (approved.includes(dimension)) dc.group_by_dimension = dimension;
        }
        break;
      }
    }
  }
  if (!dc.channel_filter && !dc.group_by_dimension) {
    for (const ch of ['SEO', 'PPC', 'OPN', 'Social', 'Email', 'Referral', 'Direct', 'Partners', 'Content', 'Remarketing']) {
      if (new RegExp(`\\b${ch}\\b`, 'i').test(prompt)) { dc.channel_filter = ch; break; }
    }
  }
  if (/\bby week\b|\bweekly\b/.test(lp)) dc.time_bucket = 'week';
  else if (/\bby day\b|\bdaily\b/.test(lp)) dc.time_bucket = 'day';
  if (result.echarts_type === 'stacked_bar' && !dc.group_by_dimension) result.echarts_type = 'bar';
  return result;
}

async function callAi(prompt) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chart`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, metricContext: METRIC_CONTEXT, schemaContext: SCHEMA_CONTEXT }),
  });
  if (!res.ok) throw new Error(`AI function failed: ${res.status}`);
  return postProcess(prompt, await res.json());
}

const METRIC_NAMES = Object.fromEntries([
  [54,'Trials'],[55,'Syncs'],[56,'Conversions'],[20,'Conversion Rate'],[25,'Sync Rate'],
  [46,'Churn Rate'],[57,'New Net SaaS'],[58,'Churn'],[59,'BOM Customers'],
  [271,'Trials Forecast'],[272,'Syncs Forecast'],[273,'Conversions Forecast'],
  [274,'Churn Forecast'],[275,'New Net SaaS Forecast'],
  [305,'Trials Forecast by Channel'],[306,'Syncs Forecast by Channel'],
  [307,'Trials Trajectory'],[308,'Syncs Trajectory'],
  [309,'Trials vs Forecast'],[310,'Trials vs Forecast %'],
  [311,'Trials Traj vs Forecast'],[312,'Trials Traj vs Forecast %'],
  [313,'Syncs vs Forecast'],[314,'Syncs vs Forecast %'],
  [315,'Syncs Traj vs Forecast'],[316,'Syncs Traj vs Forecast %'],
  [317,'Sync Rate Forecast'],
]);

const QA_PROMPTS = [
  { n: 1,  expected: '✅', prompt: 'show me trials, syncs, and conversions by month for the last 12 months' },
  { n: 2,  expected: '⚠️ missing trial-to-conversion rate', prompt: 'show me sync rate and conversion rate by month' },
  { n: 3,  expected: '✅', prompt: 'show me trials year over year' },
  { n: 4,  expected: '✅', prompt: 'show me syncs year over year' },
  { n: 5,  expected: '✅', prompt: 'show me conversions year over year' },
  { n: 6,  expected: '✅', prompt: 'show me churn year over year' },
  { n: 7,  expected: '❌ derived YoY unsupported', prompt: 'show me sync rate year over year' },
  { n: 8,  expected: '✅', prompt: 'show me trials MTD as a KPI' },
  { n: 9,  expected: '✅', prompt: 'show me syncs MTD as a KPI' },
  { n: 10, expected: '✅', prompt: 'show me conversions MTD as a KPI' },
  { n: 11, expected: '✅', prompt: 'show me trials by industry as a pie chart' },
  { n: 12, expected: '✅', prompt: 'show me trials by industry as a stacked bar for the last 12 months' },
  { n: 13, expected: '❌ no accounting software dimension', prompt: 'show me trials by accounting software as a stacked bar' },
  { n: 14, expected: '✅ full channel scorecard', prompt: 'show me trials forecast, trials, trials vs forecast %, trials trajectory, syncs forecast, syncs, syncs vs forecast %, syncs trajectory, sync rate, sync rate forecast by channel as a table' },
  { n: 15, expected: '⚠️ variance chart total-level', prompt: 'show me trials and trials forecast as a variance chart for this month' },
  { n: 16, expected: '✅', prompt: 'show me conversions forecast and conversions as a bar chart for this month' },
  { n: 17, expected: '✅', prompt: 'show me churn forecast and churn as a bar chart for this month' },
  { n: 18, expected: '✅', prompt: 'show me conversion rate by month as a line chart' },
  { n: 19, expected: '✅', prompt: 'show me new net saas revenue by month' },
  { n: 20, expected: '⚠️ derived → no KPI', prompt: 'show me sync rate as a KPI' },
];

function fmt(r) {
  if (!r) return '  ERROR: null result';
  if (r.error) return `  ERROR: ${r.error}`;
  if (r.type === 'text') return `  TEXT RESPONSE: "${r.content?.slice(0,80)}..."`;
  const dc = r.data_config || {};
  const ids = (r.metric_ids || []).map(id => `${id}(${METRIC_NAMES[id] || '?'})`).join(', ');
  const parts = [
    `  type=${r.echarts_type}`,
    `  metrics=[${ids}]`,
    `  bucket=${dc.time_bucket}  last_n=${dc.last_n_months ?? 'null'}`,
    dc.group_by_dimension ? `  group_by=${dc.group_by_dimension}` : null,
    dc.channel_filter     ? `  channel_filter=${dc.channel_filter}` : null,
  ].filter(Boolean);
  return parts.join('\n');
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  CHART BUILDER QA RUN — ' + new Date().toLocaleString());
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const { n, prompt, expected } of QA_PROMPTS) {
    process.stdout.write(`[${String(n).padStart(2)}] ${prompt}\n     Expected: ${expected}\n`);
    try {
      const r = await callAi(prompt);
      console.log('     Got:');
      console.log(fmt(r));
    } catch (e) {
      console.log(`     THREW: ${e.message}`);
    }
    console.log();
  }
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Done.');
}

run();
