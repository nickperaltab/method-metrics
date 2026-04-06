import { describe, it } from 'node:test';
import assert from 'node:assert';

const SUPABASE_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY';

const METRIC_CONTEXT = `- id:54 name:"Trials" type:primitive view:v_trials dimensions:[AttributionChannel,SignupCountry,SyncType,Vertical]
- id:55 name:"Syncs" type:primitive view:v_syncs dimensions:[AttributionChannel,SyncType]
- id:56 name:"Conversions" type:primitive view:v_conversions dimensions:[AttributionChannel,SignupCountry,Vertical]
- id:20 name:"Conversion Rate" type:derived view:none formula:SAFE_DIVIDE({56},{54}) depends_on:[56,54]
- id:300 name:"Sync Rate" type:derived view:none formula:SAFE_DIVIDE({55},{54})*100 depends_on:[55,54]
- id:46 name:"Churn Rate" type:derived view:none
- id:57 name:"New Net SaaS" type:primitive view:v_new_net_saas
- id:285 name:"Trials Forecast" type:primitive view:none has_chart_sql:true desc:"Total monthly trials forecast across all channels. Use for overall actual vs forecast comparison and KPI tiles. Pair with Trials (id:54)."
- id:286 name:"Syncs Forecast" type:primitive view:none has_chart_sql:true desc:"Total monthly syncs forecast across all channels. Use for overall actual vs forecast comparison and KPI tiles. Pair with Syncs (id:55)."
- id:294 name:"Trials Trajectory" type:primitive view:none has_chart_sql:true desc:"Projected end-of-month trials at current MTD pace. Current month only. MTD actual / day-of-month * days-in-month."
- id:295 name:"Syncs Trajectory" type:primitive view:none has_chart_sql:true desc:"Projected end-of-month syncs at current MTD pace. Current month only."
- id:271 name:"Trials Channel Forecast" type:primitive view:v_trials_forecast_channel dimensions:[AttributionChannel] desc:"Monthly trials forecast by channel. Use group_by_dimension:AttributionChannel for channel-level forecast charts over time."
- id:272 name:"Syncs Channel Forecast" type:primitive view:v_syncs_forecast_channel dimensions:[AttributionChannel] desc:"Monthly syncs forecast by channel. Use group_by_dimension:AttributionChannel for channel-level forecast charts."
- id:273 name:"Conversions Forecast" type:primitive view:v_scorecard_mtd has_chart_sql:true desc:"Monthly forecast/budget for conversions. Pair with Conversions (id:56) for actual vs forecast comparison. Use same chart type for both — bar for single month, line or bar for multi-month. Never use combo."
- id:274 name:"Forecasted Churn" type:primitive view:none has_chart_sql:true desc:"Monthly forecasted churn count. Pair with Churn (id:59) for actual vs forecast comparison."
- id:275 name:"New Net SaaS Forecast" type:primitive view:v_scorecard_mtd has_chart_sql:true desc:"Monthly forecast/budget for new net SaaS revenue. Use same chart type (bar or line), never combo."
- id:305 name:"Trials Forecast by Channel" type:primitive view:v_trials_forecast_channel dimensions:[AttributionChannel] desc:"Monthly trials forecast broken down by channel. Use with Trials (id:54) for channel-level actual vs forecast pivot. Use last_n_months:0 and group_by_dimension:AttributionChannel."
- id:306 name:"Syncs Forecast by Channel" type:primitive view:v_syncs_forecast_channel dimensions:[AttributionChannel] desc:"Monthly syncs forecast broken down by channel. Use with Syncs (id:55) for channel-level actual vs forecast pivot."
- id:307 name:"Trials Channel Trajectory" type:primitive view:v_trials_trajectory_channel dimensions:[AttributionChannel] desc:"Trials MTD trajectory by channel. Always use last_n_months:0 and group_by_dimension:AttributionChannel. For total trajectory without channel breakdown, use Trials Trajectory (id:294)."
- id:308 name:"Syncs Channel Trajectory" type:primitive view:v_syncs_trajectory_channel dimensions:[AttributionChannel] desc:"Syncs MTD trajectory by channel. For total trajectory, use Syncs Trajectory (id:295)."
- id:309 name:"Trials vs Forecast" type:derived depends_on:[54,305] desc:"Trials MTD minus trials forecast by channel. Negative = below forecast."
- id:310 name:"Trials vs Forecast %" type:derived depends_on:[54,305] desc:"Trials MTD vs monthly forecast as a percentage."
- id:311 name:"Trials Traj vs Forecast" type:derived depends_on:[307,305] desc:"Trials trajectory minus monthly forecast by channel."
- id:312 name:"Trials Traj vs Forecast %" type:derived depends_on:[307,305] desc:"Trials trajectory vs forecast as a percentage."
- id:313 name:"Syncs vs Forecast" type:derived depends_on:[55,306] desc:"Syncs MTD minus syncs forecast by channel."
- id:314 name:"Syncs vs Forecast %" type:derived depends_on:[55,306] desc:"Syncs MTD vs monthly forecast as a percentage."
- id:315 name:"Syncs Traj vs Forecast" type:derived depends_on:[308,306] desc:"Syncs trajectory minus monthly forecast by channel."
- id:316 name:"Syncs Traj vs Forecast %" type:derived depends_on:[308,306] desc:"Syncs trajectory vs forecast as a percentage."
- id:317 name:"Sync Rate Forecast" type:derived depends_on:[306,305] desc:"Expected sync rate by channel: syncs forecast / trials forecast."
- id:296 name:"Conversions Trajectory" type:primitive view:none has_chart_sql:true desc:"Projected end-of-month conversion count at current daily pace. Current month only."
- id:319 name:"Forecasted Conversion Rate" type:primitive view:none has_chart_sql:true desc:"Monthly forecasted conversion rate as a percentage. From method_forecast spreadsheet."
- id:320 name:"Avg Trial Base MTD" type:primitive view:none has_chart_sql:true desc:"MTD denominator for Conversion Rate Trajectory: (last month actual trials + this month forecasted trials) / 2. Current month only."
- id:321 name:"Conversion Rate Trajectory" type:derived depends_on:[296,320] desc:"Projected end-of-month conversion rate at current pace. Conversion Trajectory ÷ Avg Trial Base MTD × 100. Current month only."
- id:322 name:"Conv Rate Forecast vs Trajectory" type:derived depends_on:[321,319] desc:"Delta between Conversion Rate Trajectory and Forecasted Conversion Rate. Negative = behind pace."
- id:323 name:"Conv Rate Forecast Attainment" type:derived depends_on:[321,319] desc:"Conversion Rate Trajectory as a % of Forecasted Conversion Rate. 100% = on track."
- id:324 name:"Budgeted Conversion Rate" type:primitive view:none has_chart_sql:true desc:"Monthly budgeted conversion rate as a percentage. Annual budget target. Pair with Forecasted Conversion Rate (id:319) and Scorecard Conversion Rate (id:357) for budget vs forecast vs actual charts."
- id:325 name:"Budgeted New Net SaaS" type:primitive view:none has_chart_sql:true desc:"Monthly budgeted new net SaaS revenue. Annual budget target. Pair with Forecasted New Net SaaS (id:289) and Total New Net SaaS (id:57) for budget vs forecast vs actual charts."
- id:289 name:"Forecasted New Net SaaS" type:primitive view:none has_chart_sql:true desc:"Monthly forecasted new net SaaS revenue from method_forecast. Pair with Budgeted New Net SaaS (id:325) and Total New Net SaaS (id:57) for budget vs forecast vs actual charts."
- id:326 name:"New Net SaaS Revenue Trajectory" type:primitive view:none has_chart_sql:true desc:"MTD new net SaaS extrapolated to end-of-month using business-day pace. Current month only."
- id:327 name:"New Net SaaS Forecast vs Trajectory" type:derived depends_on:[326,289] desc:"Single delta value: New Net SaaS Revenue Trajectory minus Forecasted New Net SaaS. Negative = behind pace. Current month only."
- id:328 name:"New Net SaaS Forecast Attainment" type:derived depends_on:[326,289] desc:"New Net SaaS Revenue Trajectory as a % of Forecasted New Net SaaS. 100% = on track. Current month only."
- id:282 name:"Budgeted New DEP Revenue" type:primitive view:none has_chart_sql:true desc:"Monthly budgeted new DEP revenue. Annual budget target. Pair with Forecasted New DEP Revenue (id:290) and Total New DEP Net SaaS (id:329) for budget vs forecast vs actual charts."
- id:290 name:"Forecasted New DEP Revenue" type:primitive view:none has_chart_sql:true desc:"Monthly forecasted new DEP revenue from method_forecast. Pair with Budgeted New DEP Revenue (id:282) and Total New DEP Net SaaS (id:329) for budget vs forecast vs actual charts."
- id:329 name:"Total New DEP Net SaaS" type:primitive view:none has_chart_sql:true desc:"Total new DEP net SaaS revenue per month. New customers only (first DEP transaction in that month). Source: v_new_dep_revenue."
- id:330 name:"New DEP Revenue Trajectory" type:primitive view:none has_chart_sql:true desc:"Projected end-of-month new DEP revenue at current pace. MTD actual + (3-month avg daily rate × remaining calendar days). Current month only."
- id:331 name:"New DEP Forecast vs Trajectory" type:derived depends_on:[330,290] desc:"Single delta value: New DEP Revenue Trajectory minus Forecasted New DEP Revenue. Negative = behind pace. Current month only."
- id:332 name:"New DEP Forecast Attainment" type:derived depends_on:[330,290] desc:"New DEP Revenue Trajectory as a % of Forecasted New DEP Revenue. 100% = on track. Current month only."
- id:283 name:"Budgeted Total Net SaaS" type:primitive view:none has_chart_sql:true desc:"Monthly budgeted total net SaaS revenue. Annual budget target. Pair with Forecasted Total Net SaaS (id:291) and Total Net SaaS (id:337) for budget vs forecast vs actual charts."
- id:284 name:"Budgeted Total DEP Revenue" type:primitive view:none has_chart_sql:true desc:"Monthly budgeted total DEP revenue. Annual budget target. Pair with Forecasted Total DEP Revenue (id:292) and Total DEP Net SaaS (id:333) for budget vs forecast vs actual charts."
- id:291 name:"Forecasted Total Net SaaS" type:primitive view:none has_chart_sql:true desc:"Monthly forecasted total net SaaS revenue from method_forecast. Pair with Budgeted Total Net SaaS (id:283) and Total Net SaaS (id:337) for budget vs forecast vs actual charts."
- id:292 name:"Forecasted Total DEP Revenue" type:primitive view:none has_chart_sql:true desc:"Monthly forecasted total DEP revenue from method_forecast. Pair with Budgeted Total DEP Revenue (id:284) and Total DEP Net SaaS (id:333) for budget vs forecast vs actual charts."
- id:333 name:"Total DEP Net SaaS" type:primitive view:v_total_dep_revenue desc:"Total DEP net SaaS revenue. All DEP customers (new + existing). Source: v_total_dep_revenue."
- id:334 name:"Total DEP Net SaaS Trajectory" type:primitive view:none has_chart_sql:true desc:"Projected end-of-month total DEP revenue. Formula: (MTD this month / MTD same days last month) × last month total. Current month only."
- id:335 name:"Total DEP Forecast vs Trajectory" type:derived depends_on:[334,292] desc:"Single delta value: Total DEP Net SaaS Trajectory minus Forecasted Total DEP Revenue. Negative = behind pace. Current month only."
- id:336 name:"Total DEP Forecast Attainment" type:derived depends_on:[334,292] desc:"Total DEP Net SaaS Trajectory as a % of Forecasted Total DEP Revenue. 100% = on track. Current month only."
- id:337 name:"Total Net SaaS" type:primitive view:v_total_net_saas desc:"Total net SaaS revenue. All customers. Source: v_total_net_saas."
- id:338 name:"Net SaaS Trajectory" type:primitive view:none has_chart_sql:true desc:"Projected end-of-month total net SaaS revenue. Formula: (MTD this month / MTD same days last month) × last month total. Current month only."
- id:339 name:"Net SaaS Forecast vs Trajectory" type:primitive view:none has_chart_sql:true desc:"Delta: Net SaaS Trajectory minus Forecasted Total Net SaaS. Negative = behind pace. Current month only."
- id:340 name:"Net SaaS Forecast Attainment" type:primitive view:none has_chart_sql:true desc:"Net SaaS Trajectory as a % of Forecasted Total Net SaaS. 100% = on track. Current month only."
- id:59 name:"Churn" type:primitive view:v_cancellations has_chart_sql:true desc:"Monthly count of churned accounts. Source: v_cancellations."
- id:280 name:"Budgeted Churn" type:primitive view:none has_chart_sql:true desc:"Monthly budgeted churn count from method_forecast. Annual budget target."
- id:341 name:"Churn Trajectory" type:primitive view:none has_chart_sql:true desc:"Projected end-of-month churn count at current pace. Current month only."
- id:342 name:"Forecasted Churn Rate %" type:primitive view:none has_chart_sql:true desc:"Monthly forecasted churn rate % from method_forecast. Pair with Budgeted Churn Rate % (id:343) and Churn Rate (id:344) for budget vs forecast vs actual charts."
- id:343 name:"Budgeted Churn Rate %" type:primitive view:none has_chart_sql:true desc:"Monthly budgeted churn rate % from method_forecast. Annual budget target."
- id:344 name:"Churn Rate" type:primitive view:none has_chart_sql:true desc:"Historical monthly churn rate: churns / (BOM customers + monthly conversions) × 100."
- id:345 name:"Churn Rate % Trajectory" type:primitive view:none has_chart_sql:true desc:"Projected churn rate for current month: churn trajectory / BOM customers × 100. Current month only."
- id:346 name:"NRR" type:primitive view:none has_chart_sql:true desc:"Monthly Net Revenue Retention rate %. Compares SaaSAmount for existing accounts between current month and same month one year ago. Excludes new accounts."
- id:347 name:"Forecasted NRR" type:primitive view:none has_chart_sql:true desc:"Monthly forecasted NRR percentage from method_forecast. Pair with Budgeted NRR (id:348) and NRR (id:346) for budget vs forecast vs actual charts."
- id:348 name:"Budgeted NRR" type:primitive view:none has_chart_sql:true desc:"Monthly budgeted NRR percentage from method_forecast. Annual budget target."
- id:357 name:"Scorecard Conversion Rate" type:primitive view:none has_chart_sql:true desc:"Looker scorecard conversion rate: conversions (FirstSaaSInvoiceTxnDate) / avg(last month trials, forecasted trials). Use for Sales Scorecard. Pair with Forecasted Conversion Rate (id:319) and Budgeted Conversion Rate (id:324) for budget vs forecast vs actual charts. Different from Trial-to-Close Rate (id:302) which uses same-month trials as denominator."`;



const SCHEMA_CONTEXT = `v_trials: SignupDate(DATE), CompanyAccount(STRING), AttributionChannel(STRING), SignupCountry(STRING), Vertical(STRING), SyncType(STRING), Att_SEO(INTEGER), Att_Pay_Per_Click(INTEGER), Att_Direct(INTEGER), Att_Social(INTEGER), Att_Email(INTEGER), Att_Referral_Link(INTEGER), Att_Partners(INTEGER), Att_Content(INTEGER), Att_Remarketing(INTEGER), Att_Other(INTEGER), Att_None(INTEGER)
v_syncs: SyncDate(DATE), SignupDate(DATE), CompanyAccount(STRING), EventType(STRING), SyncType(STRING), SyncTypeRegion(STRING), SignupCountry(STRING), Vertical(STRING), AttributionChannel(STRING), Att_SEO(INTEGER), Att_Pay_Per_Click(INTEGER), Att_Direct(INTEGER)
v_conversions: ConversionDate(DATE), SignupDate(DATE), CompanyAccount(STRING), SignupCountry(STRING), Vertical(STRING), AttributionChannel(STRING), Att_SEO(INTEGER), Att_Pay_Per_Click(INTEGER), Att_Direct(INTEGER)
v_trials_forecast_channel: forecast_date(DATE), AttributionChannel(STRING), forecast_value(FLOAT)
v_syncs_forecast_channel: forecast_date(DATE), AttributionChannel(STRING), forecast_value(FLOAT)
v_trials_trajectory_channel: snapshot_date(DATE), AttributionChannel(STRING), trajectory_value(FLOAT)
v_syncs_trajectory_channel: snapshot_date(DATE), AttributionChannel(STRING), trajectory_value(FLOAT)`;

const VALID_ECHARTS_TYPES = new Set(['line', 'bar', 'stacked_bar', 'horizontal_bar', 'pie', 'combo', 'funnel', 'heatmap', 'area', 'table', 'kpi', 'yoy', 'variance', 'drill_table']);

// Structured versions of the metric catalog and schema — used by postProcess to mirror
// the same validateColumns + applyPromptOverrides pipeline the frontend runs after the AI responds.
const METRICS = [
  { id: 54, view_name: 'v_trials' },
  { id: 55, view_name: 'v_syncs' },
  { id: 56, view_name: 'v_conversions' },
  { id: 20, view_name: null },
  { id: 300, view_name: null },
  { id: 46, view_name: null },
  { id: 57, view_name: 'v_new_net_saas' },
  { id: 59, view_name: 'v_cancellations' },
  { id: 271, view_name: 'v_trials_forecast_channel' },
  { id: 272, view_name: 'v_syncs_forecast_channel' },
  { id: 285, view_name: null },
  { id: 286, view_name: null },
  { id: 294, view_name: null },
  { id: 295, view_name: null },
  { id: 273, view_name: 'v_scorecard_mtd' },
  { id: 274, view_name: 'v_scorecard_mtd' },
  { id: 275, view_name: 'v_scorecard_mtd' },
  { id: 305, view_name: 'v_trials_forecast_channel' },
  { id: 306, view_name: 'v_syncs_forecast_channel' },
  { id: 307, view_name: 'v_trials_trajectory_channel' },
  { id: 308, view_name: 'v_syncs_trajectory_channel' },
  { id: 309, view_name: null },
  { id: 310, view_name: null },
  { id: 311, view_name: null },
  { id: 312, view_name: null },
  { id: 313, view_name: null },
  { id: 314, view_name: null },
  { id: 315, view_name: null },
  { id: 316, view_name: null },
  { id: 317, view_name: null },
  { id: 296, view_name: null },
  { id: 319, view_name: null },
  { id: 320, view_name: null },
  { id: 321, view_name: null },
  { id: 322, view_name: null },
  { id: 323, view_name: null },
  { id: 289, view_name: null },
  { id: 324, view_name: null },
  { id: 325, view_name: null },
  { id: 326, view_name: null },
  { id: 327, view_name: null },
  { id: 328, view_name: null },
  { id: 282, view_name: null },
  { id: 290, view_name: null },
  { id: 329, view_name: null },
  { id: 330, view_name: null },
  { id: 331, view_name: null },
  { id: 332, view_name: null },
  { id: 283, view_name: null },
  { id: 284, view_name: null },
  { id: 291, view_name: null },
  { id: 292, view_name: null },
  { id: 333, view_name: 'v_total_dep_revenue' },
  { id: 334, view_name: null },
  { id: 335, view_name: null },
  { id: 336, view_name: null },
  { id: 337, view_name: 'v_total_net_saas' },
  { id: 338, view_name: null },
  { id: 339, view_name: null },
  { id: 340, view_name: null },
  { id: 59, view_name: 'v_cancellations' },
  { id: 274, view_name: null },
  { id: 280, view_name: null },
  { id: 341, view_name: null },
  { id: 342, view_name: null },
  { id: 343, view_name: null },
  { id: 344, view_name: null },
  { id: 345, view_name: null },
  { id: 346, view_name: null },
  { id: 347, view_name: null },
  { id: 348, view_name: null },
  { id: 357, view_name: null },
];

const APPROVED_DIMENSIONS = [
  { metric_id: 54, column_name: 'AttributionChannel' },
  { metric_id: 54, column_name: 'SignupCountry' },
  { metric_id: 54, column_name: 'SyncType' },
  { metric_id: 54, column_name: 'Vertical' },
  { metric_id: 55, column_name: 'AttributionChannel' },
  { metric_id: 55, column_name: 'SyncType' },
  { metric_id: 56, column_name: 'AttributionChannel' },
  { metric_id: 56, column_name: 'SignupCountry' },
  { metric_id: 56, column_name: 'Vertical' },
  { metric_id: 271, column_name: 'AttributionChannel' },
  { metric_id: 272, column_name: 'AttributionChannel' },
  { metric_id: 305, column_name: 'AttributionChannel' },
  { metric_id: 306, column_name: 'AttributionChannel' },
  { metric_id: 307, column_name: 'AttributionChannel' },
  { metric_id: 308, column_name: 'AttributionChannel' },
];

const SCHEMA_MAP = {
  v_trials: [
    { name: 'SignupDate', type: 'DATE' }, { name: 'CompanyAccount', type: 'STRING' },
    { name: 'AttributionChannel', type: 'STRING' }, { name: 'SignupCountry', type: 'STRING' },
    { name: 'Vertical', type: 'STRING' }, { name: 'SyncType', type: 'STRING' },
  ],
  v_syncs: [
    { name: 'SyncDate', type: 'DATE' }, { name: 'SignupDate', type: 'DATE' },
    { name: 'CompanyAccount', type: 'STRING' }, { name: 'AttributionChannel', type: 'STRING' },
    { name: 'SyncType', type: 'STRING' }, { name: 'SignupCountry', type: 'STRING' },
  ],
  v_conversions: [
    { name: 'ConversionDate', type: 'DATE' }, { name: 'SignupDate', type: 'DATE' },
    { name: 'CompanyAccount', type: 'STRING' }, { name: 'AttributionChannel', type: 'STRING' },
    { name: 'SignupCountry', type: 'STRING' }, { name: 'Vertical', type: 'STRING' },
  ],
  v_trials_forecast_channel: [
    { name: 'forecast_date', type: 'DATE' }, { name: 'AttributionChannel', type: 'STRING' },
    { name: 'forecast_value', type: 'FLOAT' },
  ],
  v_syncs_forecast_channel: [
    { name: 'forecast_date', type: 'DATE' }, { name: 'AttributionChannel', type: 'STRING' },
    { name: 'forecast_value', type: 'FLOAT' },
  ],
  v_trials_trajectory_channel: [
    { name: 'snapshot_date', type: 'DATE' }, { name: 'AttributionChannel', type: 'STRING' },
    { name: 'trajectory_value', type: 'FLOAT' },
  ],
  v_syncs_trajectory_channel: [
    { name: 'snapshot_date', type: 'DATE' }, { name: 'AttributionChannel', type: 'STRING' },
    { name: 'trajectory_value', type: 'FLOAT' },
  ],
};

// Mirror the frontend post-processing pipeline (validateColumns + applyPromptOverrides from ai.js).
// Ensures evals fail on bugs in the frontend layer, not just the AI response.
function postProcess(prompt, result) {
  if (!result || result.error || result.type === 'text') return result;
  const resolvedMetrics = (result.metric_ids || []).map(id => METRICS.find(m => m.id === id)).filter(Boolean);
  if (resolvedMetrics.length === 0) return result;
  const dc = result.data_config || {};

  // validateColumns: check group_by_dimension against approved dimensions
  const hasPrimitive = resolvedMetrics.some(m => m.view_name);
  if (dc.group_by_dimension) {
    if (hasPrimitive) {
      const approved = resolvedMetrics.flatMap(m => APPROVED_DIMENSIONS.filter(d => d.metric_id === m.id).map(d => d.column_name));
      if (approved.length === 0 || !approved.includes(dc.group_by_dimension)) {
        dc.group_by_dimension = approved.find(c => c.toLowerCase() === dc.group_by_dimension.toLowerCase()) || null;
      }
    }
    // All derived → pass through (dependencies validate their own dims)
  }

  // applyPromptOverrides: keyword-based fixes
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
        if (!hasPrimitive) {
          dc.group_by_dimension = dimension; // all derived — pass through
        } else {
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
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, metricContext: METRIC_CONTEXT, schemaContext: SCHEMA_CONTEXT }),
  });
  if (!res.ok) throw new Error(`AI function failed: ${res.status}`);
  return postProcess(prompt, await res.json());
}

function assertValidSpec(result, label) {
  if (result.error) return; // error responses are valid

  // Must have metric_ids array
  assert(Array.isArray(result.metric_ids) && result.metric_ids.length > 0, `${label}: must have metric_ids array`);

  // Must have data_config
  assert(result.data_config, `${label}: must have data_config`);
  if (result.echarts_type !== 'kpi') {
    assert(result.data_config.x_field, `${label}: data_config must have x_field`);
  }
  assert(Array.isArray(result.data_config.y_fields), `${label}: data_config must have y_fields array`);
  assert(Array.isArray(result.data_config.labels), `${label}: data_config must have labels array`);

  // echarts_type must be valid
  if (result.echarts_type) {
    assert(VALID_ECHARTS_TYPES.has(result.echarts_type), `${label}: invalid echarts_type "${result.echarts_type}"`);
  }

  // x_field must not be "Channel" (common hallucination) — skip for KPI
  if (result.echarts_type !== 'kpi') {
    assert(result.data_config.x_field !== 'Channel', `${label}: x_field should not be "Channel" — no such column exists`);
  }

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
    const validType = ['line', 'funnel'].includes(result.echarts_type);
    assert(validType, `marketing funnel by month should be line or funnel, got ${result.echarts_type}`);
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
    assert.strictEqual(result.data_config.group_by_dimension, 'SignupCountry', 'should set group_by_dimension to SignupCountry');
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

// --- Forecast / Actual vs Budget Tests ---

describe('Forecast Comparison Evals', () => {
  it('trials vs forecast: should pick Trials + Trials Forecast, not combo', async () => {
    const result = await callAi('trials vs forecast');
    assertValidSpec(result, 'trials vs forecast');
    assert(result.metric_ids.includes(54), 'should pick Trials (id 54)');
    assert(result.metric_ids.includes(285), 'should pick Trials Forecast (id 285)');
    assert.notStrictEqual(result.echarts_type, 'combo', 'should NOT be combo chart');
  });

  it('trials vs forecast this month: should use bar for single month', async () => {
    const result = await callAi('trials vs forecast this month');
    assertValidSpec(result, 'trials vs forecast this month');
    assert(result.metric_ids.includes(54), 'should pick Trials');
    assert(result.metric_ids.includes(285), 'should pick Trials Forecast');
    const validSingleMonthType = ['bar', 'variance'].includes(result.echarts_type);
    assert(validSingleMonthType, `single month comparison should be bar or variance, got ${result.echarts_type}`);
    assert.strictEqual(result.data_config.last_n_months, 0, 'this month = 0');
  });

  it('syncs actual vs budget: should pair Syncs + Syncs Forecast', async () => {
    const result = await callAi('show me syncs actual vs budget');
    assertValidSpec(result, 'syncs vs budget');
    assert(result.metric_ids.includes(55), 'should pick Syncs (id 55)');
    assert(result.metric_ids.includes(286), 'should pick Syncs Forecast (id 286)');
    assert.notStrictEqual(result.echarts_type, 'combo', 'should NOT be combo');
  });

  it('conversions vs forecast over time: should be line or bar, not combo', async () => {
    const result = await callAi('conversions vs forecast over time');
    assertValidSpec(result, 'conversions vs forecast');
    assert(result.metric_ids.includes(56), 'should pick Conversions');
    assert(result.metric_ids.includes(273), 'should pick Conversions Forecast');
    assert.notStrictEqual(result.echarts_type, 'combo', 'should NOT be combo');
    const validType = ['line', 'bar', 'variance'].includes(result.echarts_type);
    assert(validType, `should be line, bar, or variance, got ${result.echarts_type}`);
  });

  it('trials vs forecast with styling: should include style_rules', async () => {
    const result = await callAi('trials vs forecast, highlight red when below');
    assertValidSpec(result, 'trials vs forecast styled');
    assert(result.data_config.style_rules?.length > 0, 'should have style_rules');
    const rule = result.data_config.style_rules[0];
    assert.strictEqual(rule.operator, '<', 'should use < operator');
    assert(rule.color, 'should have a color');
  });

  it('churn vs forecast: should pair Churn + Churn Forecast', async () => {
    const result = await callAi('churn vs forecast');
    assertValidSpec(result, 'churn vs forecast');
    assert(result.metric_ids.includes(59), 'should pick Churn (id:59)');
    assert(result.metric_ids.includes(274), 'should pick Churn Forecast (id 274)');
  });
});

// --- Conditional Styling Evals ---

describe('Conditional Styling Evals', () => {
  it('red when below forecast: style_rules with compareTo and < operator', async () => {
    const result = await callAi('trials vs forecast, highlight red when below');
    assertValidSpec(result, 'red when below');
    const rules = result.data_config?.style_rules || result.style_rules || [];
    assert(rules.length > 0, 'should have at least one style rule');
    const redRule = rules.find(r => r.operator === '<');
    assert(redRule, 'should have a < operator rule for red coloring');
    assert(redRule.color, 'red rule should have a color');
    assert(redRule.target, 'red rule should have a target series');
    assert(redRule.compare_to || redRule.compareTo, 'red rule should compare to forecast series');
  });

  it('green when above forecast: style_rules should include > operator rule', async () => {
    const result = await callAi('trials vs forecast, red when below and green when above');
    assertValidSpec(result, 'red and green rules');
    const rules = result.data_config?.style_rules || result.style_rules || [];
    assert(rules.length >= 2, 'should have at least 2 rules (red and green)');
    const hasLess = rules.some(r => r.operator === '<');
    const hasGreater = rules.some(r => r.operator === '>');
    assert(hasLess, 'should have < rule for red');
    assert(hasGreater, 'should have > rule for green');
  });

  it('threshold styling: conversion rate below 15%', async () => {
    const result = await callAi('show conversion rate, color it red when below 15%');
    assertValidSpec(result, 'threshold styling');
    const rules = result.data_config?.style_rules || result.style_rules || [];
    assert(rules.length > 0, 'should have a style rule');
    const rule = rules[0];
    assert(rule.target, 'should have a target series');
    const threshold = rule.threshold ?? rule.value;
    assert(threshold != null, 'should have a threshold value');
    const numericThreshold = Number(threshold);
    assert(!isNaN(numericThreshold), 'threshold should be numeric');
    assert(numericThreshold > 0 && numericThreshold < 1, 'threshold should be a decimal (0.15), not percentage (15)');
    assert.strictEqual(rule.operator, '<', 'should use < operator');
  });

  it('threshold styling: sync rate alert below 60%', async () => {
    const result = await callAi('show sync rate and alert me when it drops below 60%');
    assertValidSpec(result, 'sync rate threshold');
    const rules = result.data_config?.style_rules || result.style_rules || [];
    assert(rules.length > 0, 'should have a style rule');
    const rule = rules[0];
    const threshold = rule.threshold ?? rule.value;
    assert(threshold != null, 'should set threshold');
    const numericThreshold = Number(threshold);
    assert(!isNaN(numericThreshold) && numericThreshold > 0, 'threshold should be a positive number');
    // Accept either decimal (0.60) or percentage (60) form — sync rate is stored as 0-100
    assert(numericThreshold < 100, 'threshold should be less than 100');
    assert.strictEqual(rule.operator, '<', 'should use < operator for "drops below"');
  });

  it('style_rules target matches a label in the labels array', async () => {
    const result = await callAi('trials vs forecast, color red when below');
    assertValidSpec(result, 'target matches label');
    const rules = result.data_config?.style_rules || result.style_rules || [];
    const labels = result.data_config?.labels || [];
    if (rules.length > 0 && labels.length > 0) {
      const rule = rules[0];
      const targetMatchesLabel = labels.some(l =>
        l.toLowerCase().includes(rule.target?.toLowerCase()) ||
        rule.target?.toLowerCase().includes(l.toLowerCase())
      );
      assert(targetMatchesLabel, `style rule target "${rule.target}" should match one of the labels: ${labels.join(', ')}`);
    }
  });

  it('no style_rules for plain color request', async () => {
    const result = await callAi('show me trials by month in blue');
    assertValidSpec(result, 'plain color no style_rules');
    const rules = result.data_config?.style_rules || result.style_rules || [];
    assert.strictEqual(rules.length, 0, 'plain color request should use colors field, not style_rules');
    assert(result.colors?.length > 0, 'plain color request should set colors field');
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
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  return postProcess(lastUserMsg, await res.json());
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
    assert(r2.metric_ids.includes(46) || r2.metric_ids.includes(344), 'should pick Churn Rate (id:46 or id:344)');
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

// --- Dimension Breakdown Evals ---

describe('Dimension Breakdown Evals', () => {
  it('trials by attribution channel → group_by_dimension, not pre-aggregated metric', async () => {
    const result = await callAi('show me trials by attribution channel as a stacked bar');
    assertValidSpec(result, 'trials by attribution channel');
    assert.strictEqual(result.metric_ids[0], 54, 'should pick Trials (id 54), not a pre-aggregated metric');
    assert.strictEqual(result.data_config.group_by_dimension, 'AttributionChannel', 'should set group_by_dimension to AttributionChannel');
    assert.strictEqual(result.echarts_type, 'stacked_bar', 'should be stacked_bar');
  });

  it('trials by country → group_by_dimension SignupCountry', async () => {
    const result = await callAi('show me trials broken down by country');
    assertValidSpec(result, 'trials by country');
    assert.strictEqual(result.metric_ids[0], 54, 'should pick Trials (id 54)');
    assert.strictEqual(result.data_config.group_by_dimension, 'SignupCountry', 'should set group_by_dimension to SignupCountry');
  });

  it('trial distribution by country (vague phrasing) → group_by_dimension SignupCountry', async () => {
    const result = await callAi('show me trial distribution by country');
    assertValidSpec(result, 'trial distribution by country');
    assert.strictEqual(result.metric_ids[0], 54, 'should pick Trials (id 54)');
    assert.strictEqual(result.data_config.group_by_dimension, 'SignupCountry', 'should set group_by_dimension to SignupCountry');
  });

  it('trials by country horizontal bar → group_by_dimension SignupCountry', async () => {
    const result = await callAi('show me trials by country as a horizontal bar');
    assertValidSpec(result, 'trials by country horizontal bar');
    assert.strictEqual(result.metric_ids[0], 54, 'should pick Trials (id 54)');
    assert.strictEqual(result.data_config.group_by_dimension, 'SignupCountry', 'should set group_by_dimension to SignupCountry');
    assert.strictEqual(result.echarts_type, 'horizontal_bar', 'should be horizontal_bar');
  });

  it('SEO trials by month → channel_filter not group_by_dimension', async () => {
    const result = await callAi('show me SEO trials by month');
    assertValidSpec(result, 'SEO trials filter');
    assert.strictEqual(result.data_config.channel_filter, 'SEO', 'SEO should be a channel_filter');
    assert.strictEqual(result.data_config.group_by_dimension, null, 'SEO is a filter not a dimension — group_by_dimension should be null');
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
    // Skip x_field check — KPI type doesn't need it
    assert(Array.isArray(r.metric_ids) && r.metric_ids.length > 0, 'must have metric_ids');
    assert(r.data_config, 'must have data_config');
    if (r.echarts_type !== 'kpi') {
      assert.strictEqual(r.data_config.time_bucket, 'month', 'derived rates should use monthly bucket');
    }
  });

  it('"last 3 months" should return 3', async () => {
    const r = await callAi('show me syncs for the last 3 months');
    assertValidSpec(r, 'last 3 months');
    assert.strictEqual(r.data_config.last_n_months, 3, 'last 3 months = 3');
  });
});

// --- Pivot Table Evals ---
describe('Pivot Table Evals', () => {
  it('trials and syncs by channel as a table → pivot mode', async () => {
    const r = await callAi('show me trials and syncs by channel as a table');
    assertValidSpec(r, 'trials and syncs by channel as a table');
    assert.strictEqual(r.echarts_type, 'table', 'should be table type');
    assert(r.data_config.group_by_dimension === 'AttributionChannel', 'should group by AttributionChannel');
    assert(r.metric_ids.includes(54), 'should include Trials');
    assert(r.metric_ids.includes(55), 'should include Syncs');
    assert.strictEqual(r.data_config.last_n_months, 0, 'pivot should default to MTD (last_n_months: 0)');
  });

  it('trials by channel table → single metric pivot', async () => {
    const r = await callAi('show trials by channel as a table');
    assertValidSpec(r, 'trials by channel table');
    assert.strictEqual(r.echarts_type, 'table');
    assert(r.data_config.group_by_dimension === 'AttributionChannel');
    assert(r.metric_ids.includes(54));
  });

  it('trials forecast and trials by channel → uses channel-level forecast metric', async () => {
    const r = await callAi('show me trials forecast and trials by channel as a table');
    assertValidSpec(r, 'trials forecast by channel');
    assert.strictEqual(r.echarts_type, 'table');
    assert(r.data_config.group_by_dimension === 'AttributionChannel', 'should group by channel');
    assert(r.metric_ids.includes(305), 'should use Trials Forecast by Channel (id:305), not total forecast');
    assert(r.metric_ids.includes(54), 'should include Trials');
    assert.strictEqual(r.data_config.last_n_months, 0);
  });

  it('syncs forecast by channel → uses channel-level syncs forecast', async () => {
    const r = await callAi('show me syncs forecast and syncs by channel as a table');
    assertValidSpec(r, 'syncs forecast by channel');
    assert.strictEqual(r.echarts_type, 'table');
    assert(r.data_config.group_by_dimension === 'AttributionChannel');
    assert(r.metric_ids.includes(306), 'should use Syncs Forecast by Channel (id:306)');
    assert(r.metric_ids.includes(55), 'should include Syncs');
    assert.strictEqual(r.data_config.last_n_months, 0);
  });

  it('trials trajectory by channel → uses trajectory metric', async () => {
    const r = await callAi('show me trials trajectory by channel as a table');
    assertValidSpec(r, 'trials trajectory by channel');
    assert.strictEqual(r.echarts_type, 'table');
    assert(r.data_config.group_by_dimension === 'AttributionChannel');
    assert(r.metric_ids.includes(307), 'should use Trials Channel Trajectory (id:307)');
    assert.strictEqual(r.data_config.last_n_months, 0);
  });

  it('trials vs forecast % by channel → uses delta derived metric', async () => {
    const r = await callAi('show me trials vs forecast % by channel as a table');
    assertValidSpec(r, 'trials vs forecast % by channel');
    assert.strictEqual(r.echarts_type, 'table');
    assert(r.data_config.group_by_dimension === 'AttributionChannel');
    assert(r.metric_ids.includes(310), 'should use Trials vs Forecast % (id:310)');
    assert.strictEqual(r.data_config.last_n_months, 0);
  });

  it('sync rate forecast by channel → uses derived sync rate forecast', async () => {
    const r = await callAi('show me sync rate forecast by channel as a table');
    assertValidSpec(r, 'sync rate forecast by channel');
    assert.strictEqual(r.echarts_type, 'table');
    assert(r.data_config.group_by_dimension === 'AttributionChannel');
    assert(r.metric_ids.includes(317), 'should use Sync Rate Forecast (id:317)');
    assert.strictEqual(r.data_config.last_n_months, 0);
  });

  it('full channel scorecard → all 10 metrics, pivot by channel', async () => {
    const r = await callAi(
      'show me trials forecast, trials, trials vs forecast %, trials trajectory, syncs forecast, syncs, syncs vs forecast %, syncs trajectory, sync rate, sync rate forecast by channel as a table'
    );
    assertValidSpec(r, 'full channel scorecard');
    assert.strictEqual(r.echarts_type, 'table', 'should be table');
    assert(r.data_config.group_by_dimension === 'AttributionChannel', 'should group by channel');
    assert.strictEqual(r.data_config.last_n_months, 0, 'should be MTD');
    assert(r.metric_ids.includes(305), 'should include Trials Forecast by Channel (305)');
    assert(r.metric_ids.includes(54), 'should include Trials (54)');
    assert(r.metric_ids.includes(310), 'should include Trials vs Forecast % (310)');
    assert(r.metric_ids.includes(307), 'should include Trials Trajectory (307)');
    assert(r.metric_ids.includes(306), 'should include Syncs Forecast by Channel (306)');
    assert(r.metric_ids.includes(55), 'should include Syncs (55)');
    assert(r.metric_ids.includes(314), 'should include Syncs vs Forecast % (314)');
    assert(r.metric_ids.includes(308), 'should include Syncs Trajectory (308)');
    assert(r.metric_ids.includes(300), 'should include Sync Rate (300)');
    assert(r.metric_ids.includes(317), 'should include Sync Rate Forecast (317)');
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
          // stacked_bar without a dimension gets converted to bar by the frontend
          const validType = ['stacked_bar', 'bar'].includes(r.echarts_type);
          assert(validType, `should be stacked_bar or bar, got ${r.echarts_type}`);
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
          assertHasMetrics(r, [20, 300], 'step 2'); // sync rate is id:300, not id:25
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
          assert(r.metric_ids.includes(46) || r.metric_ids.includes(344), 'reset: should pick Churn Rate (id:46 or id:344)');
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

// ═════════════════════════════════════════════════════════════════════════════
// V2 Architecture Evals — 2-call Haiku (intent classifier + spec generator)
// Compare pass rates against V1 on the same representative prompts.
// ═════════════════════════════════════════════════════════════════════════════

async function callAiV2(prompt) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chart-v2`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, metricContext: METRIC_CONTEXT, schemaContext: SCHEMA_CONTEXT }),
  });
  if (!res.ok) throw new Error(`AI V2 function failed: ${res.status}`);
  return postProcess(prompt, await res.json());
}

describe.skip('V2: Dimension Breakdowns', () => {
  it('[V2] trials by attribution channel → group_by_dimension', async () => {
    const result = await callAiV2('show me trials by attribution channel as a stacked bar');
    assertValidSpec(result, '[V2] trials by attribution channel');
    assert.strictEqual(result.metric_ids[0], 54, 'should pick Trials (id 54)');
    assert.strictEqual(result.data_config.group_by_dimension, 'AttributionChannel', 'should set group_by_dimension');
    assert.strictEqual(result.echarts_type, 'stacked_bar', 'should be stacked_bar');
  });

  it('[V2] trials broken down by country → group_by_dimension SignupCountry', async () => {
    const result = await callAiV2('show me trials broken down by country');
    assertValidSpec(result, '[V2] trials broken down by country');
    assert.strictEqual(result.metric_ids[0], 54, 'should pick Trials');
    assert.strictEqual(result.data_config.group_by_dimension, 'SignupCountry', 'should set group_by_dimension to SignupCountry');
  });

  it('[V2] trial distribution by country (vague phrasing) → group_by_dimension', async () => {
    const result = await callAiV2('show me trial distribution by country');
    assertValidSpec(result, '[V2] trial distribution by country');
    assert.strictEqual(result.metric_ids[0], 54, 'should pick Trials');
    assert.strictEqual(result.data_config.group_by_dimension, 'SignupCountry', 'should set group_by_dimension to SignupCountry');
  });

  it('[V2] trials by country horizontal bar → group_by_dimension + correct type', async () => {
    const result = await callAiV2('show me trials by country as a horizontal bar');
    assertValidSpec(result, '[V2] horizontal bar by country');
    assert.strictEqual(result.data_config.group_by_dimension, 'SignupCountry', 'should set group_by_dimension');
    assert.strictEqual(result.echarts_type, 'horizontal_bar', 'should be horizontal_bar');
  });

  it('[V2] SEO trials → channel_filter, NOT group_by_dimension', async () => {
    const result = await callAiV2('show me SEO trials by month');
    assertValidSpec(result, '[V2] SEO channel filter');
    assert.strictEqual(result.data_config.channel_filter, 'SEO', 'SEO should be a channel_filter');
    assert.strictEqual(result.data_config.group_by_dimension, null, 'group_by_dimension should be null for single channel');
  });
});

describe.skip('V2: Channel Filters', () => {
  it('[V2] PPC conversions → channel_filter PPC', async () => {
    const result = await callAiV2('show me PPC conversions by month');
    assertValidSpec(result, '[V2] PPC conversions');
    assert.strictEqual(result.data_config.channel_filter, 'PPC', 'should filter by PPC');
    assert(result.metric_ids.includes(56), 'should pick Conversions');
  });

  it('[V2] weekly SEO trials last 3 months → channel + time combo', async () => {
    const result = await callAiV2('show me weekly SEO trials for the last 3 months');
    assertValidSpec(result, '[V2] weekly SEO');
    assert.strictEqual(result.data_config.time_bucket, 'week', 'should be weekly');
    assert.strictEqual(result.data_config.channel_filter, 'SEO', 'should filter SEO');
    assert.strictEqual(result.data_config.last_n_months, 3, 'should be last 3 months');
  });

  it('[V2] syncs by channel (breakdown not filter)', async () => {
    const result = await callAiV2('show me syncs by channel');
    assertValidSpec(result, '[V2] syncs by channel');
    assert.notStrictEqual(result.data_config.x_field, 'Channel', 'should not use Channel as x_field');
  });
});

describe.skip('V2: Time Range Precision', () => {
  it('[V2] this month → last_n_months: 0', async () => {
    const r = await callAiV2('show me trials this month');
    assertValidSpec(r, '[V2] this month');
    assert.strictEqual(r.data_config.last_n_months, 0, '"this month" should be 0');
  });

  it('[V2] last 6 months → last_n_months: 6', async () => {
    const r = await callAiV2('show me trials for the last 6 months');
    assertValidSpec(r, '[V2] last 6 months');
    assert.strictEqual(r.data_config.last_n_months, 6, 'should set last_n_months to 6');
  });

  it('[V2] weekly time bucket', async () => {
    const r = await callAiV2('show me weekly syncs');
    assertValidSpec(r, '[V2] weekly syncs');
    assert.strictEqual(r.data_config.time_bucket, 'week', 'should be weekly');
  });

  it('[V2] daily trials last 2 months', async () => {
    const r = await callAiV2('show me daily trials for the last 2 months');
    assertValidSpec(r, '[V2] daily trials');
    assert.strictEqual(r.data_config.time_bucket, 'day', 'should be daily');
    assert.strictEqual(r.data_config.last_n_months, 2, 'should be last 2 months');
  });
});

describe.skip('V2: Basic Happy Path', () => {
  it('[V2] trials by month → line chart', async () => {
    const result = await callAiV2('show me trials by month');
    assertValidSpec(result, '[V2] trials by month');
    assert(result.metric_ids.includes(54), 'should pick Trials (id 54)');
    assert.strictEqual(result.echarts_type, 'line', 'should be line chart');
  });

  it('[V2] trials and syncs → multi-metric', async () => {
    const result = await callAiV2('show me trials and syncs by month');
    assertValidSpec(result, '[V2] trials and syncs');
    assert(result.metric_ids.length >= 2, 'should have at least 2 metrics');
    assert(result.data_config.labels.length >= 2, 'should have at least 2 labels');
  });

  it('[V2] pie chart trial distribution by country', async () => {
    const result = await callAiV2('show me trial distribution by country as a pie chart');
    assertValidSpec(result, '[V2] pie by country');
    assert.strictEqual(result.echarts_type, 'pie', 'should be pie chart');
    assert.strictEqual(result.data_config.group_by_dimension, 'SignupCountry', 'should set group_by_dimension to SignupCountry');
  });

  it('[V2] invalid prompt → error or suggestion', async () => {
    const result = await callAiV2('show me pizza sales');
    assert(result.error || result.suggestion, 'should return error for invalid metric');
  });
});

describe.skip('V2: Derived Metrics', () => {
  it('[V2] conversion rate → derived metric id 20', async () => {
    const result = await callAiV2('show me conversion rate by month');
    assertValidSpec(result, '[V2] conversion rate');
    assert(result.metric_ids.includes(20), 'should pick Conversion Rate (id 20)');
  });

  it('[V2] trials vs forecast → variance/bar, not combo', async () => {
    const result = await callAiV2('trials vs forecast');
    assertValidSpec(result, '[V2] trials vs forecast');
    assert(result.metric_ids.includes(54), 'should pick Trials');
    assert(result.metric_ids.includes(285), 'should pick Trials Forecast');
    assert.notStrictEqual(result.echarts_type, 'combo', 'should NOT be combo');
  });
});

describe.skip('V2: Chart Type Variety', () => {
  it('[V2] funnel: trials, syncs, conversions', async () => {
    const result = await callAiV2('show me the marketing funnel: trials, syncs, and conversions by month');
    assertValidSpec(result, '[V2] funnel multi-metric');
    assert(result.metric_ids.length >= 3, 'should have 3 metric_ids');
    const validType = ['line', 'funnel'].includes(result.echarts_type);
    assert(validType, `should be line or funnel, got ${result.echarts_type}`);
  });

  it('[V2] rates: conversion rate and sync rate together', async () => {
    const result = await callAiV2('show me conversion rate and sync rate by month');
    assertValidSpec(result, '[V2] rates multi-metric');
    assert(result.metric_ids.length >= 2, 'should have at least 2 rates');
  });

  it('[V2] stacked bar: trials by channel over time', async () => {
    const result = await callAiV2('show me trials stacked by channel over time');
    assertValidSpec(result, '[V2] stacked bar');
    const isStacked = result.echarts_type === 'stacked_bar' || result.echarts_type === 'bar';
    assert(isStacked, `should be stacked_bar or bar, got ${result.echarts_type}`);
  });

  it('[V2] area chart: syncs over time', async () => {
    const result = await callAiV2('show me syncs over time as an area chart');
    assertValidSpec(result, '[V2] area chart');
    assert.strictEqual(result.echarts_type, 'area', 'should be area chart');
  });

  it('[V2] combo: trials bar with conversion rate line', async () => {
    const result = await callAiV2('show me trials as bars with conversion rate as a line overlay by month');
    assertValidSpec(result, '[V2] combo chart');
    assert.strictEqual(result.echarts_type, 'combo', 'should be combo chart');
    assert(result.metric_ids.length >= 2, 'should have at least 2 metrics for combo');
  });

  it('[V2] this year scope', async () => {
    const result = await callAiV2('show me syncs this year');
    assertValidSpec(result, '[V2] this year');
    assert.strictEqual(result.data_config.last_n_months, 12, 'this year should be last 12 months');
  });
});

describe.skip('V2: Forecast Comparison', () => {
  it('[V2] trials vs forecast this month → bar for single month', async () => {
    const result = await callAiV2('trials vs forecast this month');
    assertValidSpec(result, '[V2] trials vs forecast this month');
    assert(result.metric_ids.includes(54), 'should pick Trials');
    assert(result.metric_ids.includes(285), 'should pick Trials Forecast');
    const validType = ['bar', 'variance'].includes(result.echarts_type);
    assert(validType, `single month comparison should be bar or variance, got ${result.echarts_type}`);
    assert.strictEqual(result.data_config.last_n_months, 0, 'this month = 0');
  });

  it('[V2] syncs actual vs budget', async () => {
    const result = await callAiV2('show me syncs actual vs budget');
    assertValidSpec(result, '[V2] syncs vs budget');
    assert(result.metric_ids.includes(55), 'should pick Syncs');
    assert(result.metric_ids.includes(286), 'should pick Syncs Forecast');
    assert.notStrictEqual(result.echarts_type, 'combo', 'should NOT be combo');
  });

  it('[V2] conversions vs forecast over time', async () => {
    const result = await callAiV2('conversions vs forecast over time');
    assertValidSpec(result, '[V2] conversions vs forecast');
    assert(result.metric_ids.includes(56), 'should pick Conversions');
    assert(result.metric_ids.includes(273), 'should pick Conversions Forecast');
    assert.notStrictEqual(result.echarts_type, 'combo', 'should NOT be combo');
    const validType = ['line', 'bar', 'variance'].includes(result.echarts_type);
    assert(validType, `should be line, bar, or variance, got ${result.echarts_type}`);
  });

  it('[V2] trials vs forecast with styling', async () => {
    const result = await callAiV2('trials vs forecast, highlight red when below');
    assertValidSpec(result, '[V2] trials vs forecast styled');
    assert(result.data_config.style_rules?.length > 0, 'should have style_rules');
    const rule = result.data_config.style_rules[0];
    assert.strictEqual(rule.operator, '<', 'should use < operator');
    assert(rule.color, 'should have a color');
  });

  it('[V2] churn vs forecast', async () => {
    const result = await callAiV2('churn vs forecast');
    assertValidSpec(result, '[V2] churn vs forecast');
    assert(result.metric_ids.includes(59), 'should pick Churn (id:59)');
    assert(result.metric_ids.includes(274), 'should pick Forecasted Churn (id:274)');
  });
});

describe.skip('V2: Conditional Styling', () => {
  it('[V2] red when below forecast', async () => {
    const result = await callAiV2('trials vs forecast, highlight red when below');
    assertValidSpec(result, '[V2] red when below');
    const rules = result.data_config?.style_rules || result.style_rules || [];
    assert(rules.length > 0, 'should have at least one style rule');
    const redRule = rules.find(r => r.operator === '<');
    assert(redRule, 'should have a < operator rule');
    assert(redRule.color, 'red rule should have a color');
    assert(redRule.target, 'red rule should have a target series');
    assert(redRule.compare_to || redRule.compareTo, 'red rule should compare to forecast series');
  });

  it('[V2] red and green when above/below forecast', async () => {
    const result = await callAiV2('trials vs forecast, red when below and green when above');
    assertValidSpec(result, '[V2] red and green rules');
    const rules = result.data_config?.style_rules || result.style_rules || [];
    assert(rules.length >= 2, 'should have at least 2 rules (red and green)');
    assert(rules.some(r => r.operator === '<'), 'should have < rule for red');
    assert(rules.some(r => r.operator === '>'), 'should have > rule for green');
  });

  it('[V2] threshold styling: conversion rate below 15%', async () => {
    const result = await callAiV2('show conversion rate, color it red when below 15%');
    assertValidSpec(result, '[V2] threshold styling');
    const rules = result.data_config?.style_rules || result.style_rules || [];
    assert(rules.length > 0, 'should have a style rule');
    const rule = rules[0];
    const threshold = rule.threshold ?? rule.value;
    assert(threshold != null, 'should have a threshold value');
    const numericThreshold = Number(threshold);
    assert(!isNaN(numericThreshold), 'threshold should be numeric');
    assert(numericThreshold > 0 && numericThreshold < 1, 'threshold should be a decimal (0.15)');
    assert.strictEqual(rule.operator, '<', 'should use < operator');
  });

  it('[V2] threshold styling: sync rate below 60%', async () => {
    const result = await callAiV2('show sync rate and alert me when it drops below 60%');
    assertValidSpec(result, '[V2] sync rate threshold');
    const rules = result.data_config?.style_rules || result.style_rules || [];
    assert(rules.length > 0, 'should have a style rule');
    const rule = rules[0];
    const threshold = rule.threshold ?? rule.value;
    assert(threshold != null, 'should set threshold');
    const numericThreshold = Number(threshold);
    assert(!isNaN(numericThreshold) && numericThreshold > 0, 'threshold should be a positive number');
    assert(numericThreshold < 100, 'threshold should be less than 100');
    assert.strictEqual(rule.operator, '<', 'should use < operator');
  });

  it('[V2] no style_rules for plain color request', async () => {
    const result = await callAiV2('show me trials by month in blue');
    assertValidSpec(result, '[V2] plain color no style_rules');
    const rules = result.data_config?.style_rules || result.style_rules || [];
    assert.strictEqual(rules.length, 0, 'plain color should use colors field, not style_rules');
    assert(result.colors?.length > 0, 'should set colors field');
  });
});

describe.skip('V2: Time Range (full)', () => {
  it('[V2] last month → last_n_months: 1', async () => {
    const r = await callAiV2('show me trials last month');
    assertValidSpec(r, '[V2] last month');
    assert.strictEqual(r.data_config.last_n_months, 1, '"last month" should be 1');
  });

  it('[V2] "just march" should have a time filter', async () => {
    const r = await callAiV2('show me trials for march');
    assertValidSpec(r, '[V2] just march');
    assert(r.data_config.last_n_months != null, 'should have a time filter');
  });

  it('[V2] "this month" with derived metric → monthly bucket', async () => {
    const r = await callAiV2('conversion rate this month');
    assert(Array.isArray(r.metric_ids) && r.metric_ids.length > 0, 'must have metric_ids');
    assert(r.data_config, 'must have data_config');
    if (r.echarts_type !== 'kpi') {
      assert.strictEqual(r.data_config.time_bucket, 'month', 'derived rates should use monthly bucket');
    }
  });

  it('[V2] last 3 months → 3', async () => {
    const r = await callAiV2('show me syncs for the last 3 months');
    assertValidSpec(r, '[V2] last 3 months');
    assert.strictEqual(r.data_config.last_n_months, 3, 'last 3 months = 3');
  });
});

describe.skip('V2: Pivot Tables', () => {
  it('[V2] trials and syncs by channel as table → pivot mode', async () => {
    const r = await callAiV2('show me trials and syncs by channel as a table');
    assertValidSpec(r, '[V2] trials and syncs pivot');
    assert.strictEqual(r.echarts_type, 'table', 'should be table type');
    assert(r.data_config.group_by_dimension === 'AttributionChannel', 'should group by AttributionChannel');
    assert(r.metric_ids.includes(54), 'should include Trials');
    assert(r.metric_ids.includes(55), 'should include Syncs');
    assert.strictEqual(r.data_config.last_n_months, 0, 'pivot should default to MTD');
  });

  it('[V2] trials by channel table → single metric pivot', async () => {
    const r = await callAiV2('show trials by channel as a table');
    assertValidSpec(r, '[V2] trials by channel table');
    assert.strictEqual(r.echarts_type, 'table');
    assert(r.data_config.group_by_dimension === 'AttributionChannel');
    assert(r.metric_ids.includes(54));
  });
});

async function callAiV2Conversational(messages, currentChartSpec) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chart-v2`, {
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
  if (!res.ok) throw new Error(`AI V2 function failed: ${res.status}`);
  return res.json();
}

describe.skip('V2: Conversational', () => {
  it('[V2] follow-up: add metric to existing chart', async () => {
    const r1 = await callAiV2('show me trials by month');
    assertValidSpec(r1, '[V2] initial trials');
    const r2 = await callAiV2Conversational([
      { role: 'user', content: 'show me trials by month' },
      { role: 'assistant', content: JSON.stringify(r1) },
      { role: 'user', content: 'add syncs too' },
    ], r1);
    assertValidSpec(r2, '[V2] add syncs');
    assert(r2.metric_ids.length >= 2, 'should have at least 2 metrics');
    assert(r2.metric_ids.includes(54), 'should keep Trials');
    assert(r2.metric_ids.includes(55), 'should add Syncs');
  });

  it('[V2] follow-up: change chart type', async () => {
    const r1 = await callAiV2('show me trials by month');
    const r2 = await callAiV2Conversational([
      { role: 'user', content: 'show me trials by month' },
      { role: 'assistant', content: JSON.stringify(r1) },
      { role: 'user', content: 'make it a bar chart' },
    ], r1);
    assertValidSpec(r2, '[V2] change to bar');
    assert.strictEqual(r2.echarts_type, 'bar', 'should be bar');
    assert(r2.metric_ids.includes(54), 'should still have Trials');
  });

  it('[V2] follow-up: change time range', async () => {
    const r1 = await callAiV2('show me trials by month');
    const r2 = await callAiV2Conversational([
      { role: 'user', content: 'show me trials by month' },
      { role: 'assistant', content: JSON.stringify(r1) },
      { role: 'user', content: 'just the last 6 months' },
    ], r1);
    assertValidSpec(r2, '[V2] last 6 months follow-up');
    assert.strictEqual(r2.data_config.last_n_months, 6, 'should filter to 6 months');
  });

  it('[V2] follow-up: add channel filter', async () => {
    const r1 = await callAiV2('show me trials by month');
    const r2 = await callAiV2Conversational([
      { role: 'user', content: 'show me trials by month' },
      { role: 'assistant', content: JSON.stringify(r1) },
      { role: 'user', content: 'only SEO' },
    ], r1);
    assertValidSpec(r2, '[V2] SEO filter follow-up');
    assert.strictEqual(r2.data_config.channel_filter, 'SEO', 'should filter by SEO');
  });

  it('[V2] follow-up: completely different topic resets', async () => {
    const r1 = await callAiV2('show me trials by month');
    const r2 = await callAiV2Conversational([
      { role: 'user', content: 'show me trials by month' },
      { role: 'assistant', content: JSON.stringify(r1) },
      { role: 'user', content: 'show me churn rate by month' },
    ], r1);
    assertValidSpec(r2, '[V2] topic change');
    assert(r2.metric_ids.includes(46) || r2.metric_ids.includes(344), 'should pick Churn Rate (id:46 or id:344)');
  });

  it('[V2] follow-up: "just do march" preserves time_bucket', async () => {
    const r1 = await callAiV2('conversion rate this month');
    const r2 = await callAiV2Conversational([
      { role: 'user', content: 'conversion rate this month' },
      { role: 'assistant', content: JSON.stringify(r1) },
      { role: 'user', content: 'just do march please' },
    ], r1);
    assertValidSpec(r2, '[V2] just do march');
    assert(r2.metric_ids.includes(20), 'should keep Conversion Rate');
    assert(r2.data_config.time_bucket, 'time_bucket should be set');
  });

  it('[V2] follow-up: "make it monthly" changes bucket, keeps metric', async () => {
    const r1 = await callAiV2('show me daily trials for the last 2 months');
    const r2 = await callAiV2Conversational([
      { role: 'user', content: 'show me daily trials for the last 2 months' },
      { role: 'assistant', content: JSON.stringify(r1) },
      { role: 'user', content: 'make it monthly' },
    ], r1);
    assertValidSpec(r2, '[V2] make it monthly');
    assert(r2.metric_ids.includes(54), 'should keep Trials');
    assert.strictEqual(r2.data_config.time_bucket, 'month', 'should change to monthly');
  });
});

async function runChainV2(steps, initialSpec = null) {
  const messages = [];
  let currentSpec = initialSpec;
  const results = [];
  for (const step of steps) {
    messages.push({ role: 'user', content: step.prompt });
    const result = await callAiV2Conversational(messages, currentSpec);
    assertValidSpec(result, step.label);
    step.validate(result, results);
    messages.push({ role: 'assistant', content: JSON.stringify(result) });
    currentSpec = result;
    results.push(result);
  }
  return results;
}

describe.skip('V2: Multi-Step Chains', () => {
  it('[V2] chain: trials → add syncs → stacked bars → SEO filter → last 3 months', async () => {
    await runChainV2([
      {
        prompt: 'show me trials by month',
        label: '[V2] step 1: initial trials',
        validate: (r) => {
          assertHasMetrics(r, [54], '[V2] step 1');
          assert.strictEqual(r.data_config.time_bucket, 'month');
        },
      },
      {
        prompt: 'add syncs too',
        label: '[V2] step 2: add syncs',
        validate: (r) => {
          assertHasMetrics(r, [54, 55], '[V2] step 2');
        },
      },
      {
        prompt: 'make it stacked bars',
        label: '[V2] step 3: stacked bars',
        validate: (r) => {
          assert.strictEqual(r.echarts_type, 'stacked_bar', 'should be stacked_bar');
          assert(r.metric_ids.length >= 2, 'should keep both metrics');
        },
      },
      {
        prompt: 'only SEO',
        label: '[V2] step 4: SEO filter',
        validate: (r) => {
          assert.strictEqual(r.data_config.channel_filter, 'SEO', 'should filter by SEO');
        },
      },
      {
        prompt: 'just last 3 months',
        label: '[V2] step 5: last 3 months',
        validate: (r) => {
          assert.strictEqual(r.data_config.last_n_months, 3, 'should be 3 months');
        },
      },
    ]);
  });

  it('[V2] chain: conversion rate → add sync rate → weekly → table', async () => {
    await runChainV2([
      {
        prompt: 'show me conversion rate by month',
        label: '[V2] step 1: conversion rate',
        validate: (r) => { assertHasMetrics(r, [20], '[V2] step 1'); },
      },
      {
        prompt: 'compare to sync rate',
        label: '[V2] step 2: add sync rate',
        validate: (r) => { assertHasMetrics(r, [20, 300], '[V2] step 2'); },
      },
      {
        prompt: 'make it weekly',
        label: '[V2] step 3: weekly',
        validate: (r) => {
          assert.strictEqual(r.data_config.time_bucket, 'week', 'should be weekly');
          assert(r.metric_ids.length >= 2, 'should keep both rates');
        },
      },
      {
        prompt: 'show as table',
        label: '[V2] step 4: table',
        validate: (r) => {
          assert.strictEqual(r.echarts_type, 'table', 'should be table');
        },
      },
    ]);
  });

  it('[V2] chain: edit saved chart — change range, add metric, change type', async () => {
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
    await runChainV2([
      {
        prompt: 'show last 6 months instead',
        label: '[V2] edit step 1: change range',
        validate: (r) => {
          assert.strictEqual(r.data_config.last_n_months, 6, 'should be 6 months');
          assertHasMetrics(r, [54, 55], '[V2] edit step 1');
          assert.strictEqual(r.echarts_type, 'line', 'type should stay line');
        },
      },
      {
        prompt: 'add conversion rate',
        label: '[V2] edit step 2: add derived metric',
        validate: (r) => { assertHasMetrics(r, [54, 55, 20], '[V2] edit step 2'); },
      },
      {
        prompt: 'make it a combo chart',
        label: '[V2] edit step 3: combo',
        validate: (r) => {
          assert.strictEqual(r.echarts_type, 'combo', 'should be combo');
          assert(r.metric_ids.length >= 3, 'should keep all 3 metrics');
        },
      },
    ], savedSpec);
  });

  it('[V2] chain: topic reset from saved chart', async () => {
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
    await runChainV2([
      {
        prompt: 'now show me churn rate by month',
        label: '[V2] reset: churn rate',
        validate: (r) => {
          assert(r.metric_ids.includes(46) || r.metric_ids.includes(344), '[V2] reset: should pick Churn Rate (id:46 or id:344)');
          assert(!r.metric_ids.includes(54), 'should NOT include Trials');
          assert(!r.metric_ids.includes(55), 'should NOT include Syncs');
        },
      },
    ], savedSpec);
  });

  it('[V2] chain: data labels persist across chart type change', async () => {
    await runChainV2([
      {
        prompt: 'show me trials by month with data labels',
        label: '[V2] step 1: with labels',
        validate: (r) => {
          assertHasMetrics(r, [54], '[V2] step 1');
          assert.strictEqual(r.show_labels, true, 'show_labels should be true');
        },
      },
      {
        prompt: 'make it a bar chart',
        label: '[V2] step 2: bar with labels preserved',
        validate: (r) => {
          assert.strictEqual(r.echarts_type, 'bar', 'should be bar');
          assert.strictEqual(r.show_labels, true, 'show_labels should still be true');
        },
      },
    ]);
  });
});

describe('Conversion Rate Scorecard Metrics', () => {
  it('forecasted conversion rate', async () => {
    const result = await callAi('show me forecasted conversion rate by month');
    assertValidSpec(result, 'forecasted conversion rate');
    assert(result.metric_ids.includes(319), 'should pick Forecasted Conversion Rate (id:319)');
  });

  it('conversion rate trajectory for this month', async () => {
    const result = await callAi('show me conversion rate trajectory for this month');
    assertValidSpec(result, 'conversion rate trajectory');
    assert(result.metric_ids.includes(321), 'should pick Conversion Rate Trajectory (id:321)');
  });

  it('conversion rate forecast vs trajectory delta', async () => {
    const result = await callAi('show me conv rate forecast vs trajectory this month');
    assertValidSpec(result, 'conv rate forecast vs trajectory');
    assert(result.metric_ids.includes(322), 'should pick Conv Rate Forecast vs Trajectory (id:322)');
  });

  it('conversion rate forecast attainment', async () => {
    const result = await callAi('show me conversion rate forecast attainment for this month');
    assertValidSpec(result, 'conv rate forecast attainment');
    assert(result.metric_ids.includes(323), 'should pick Conv Rate Forecast Attainment (id:323)');
  });

  it('all 4 scorecard conversion rate metrics as a bar chart', async () => {
    const result = await callAi('show me forecasted conversion rate, conversion rate trajectory, conversion rate forecast vs trajectory, and conversion rate forecast attainment as a bar chart for this month');
    assertValidSpec(result, 'all conversion rate scorecard metrics');
    assert(result.metric_ids.includes(319), 'should include Forecasted Conversion Rate (id:319)');
    assert(result.metric_ids.includes(321), 'should include Conversion Rate Trajectory (id:321)');
    assert(result.metric_ids.includes(322), 'should include Conv Rate Forecast vs Trajectory (id:322)');
    assert(result.metric_ids.includes(323), 'should include Conv Rate Forecast Attainment (id:323)');
    assert.strictEqual(result.echarts_type, 'bar', 'should be bar chart');
  });
});

describe('New Net SaaS Scorecard Metrics', () => {
  it('budgeted conversion rate by month', async () => {
    const result = await callAi('show me budgeted conversion rate by month');
    assertValidSpec(result, 'budgeted conversion rate');
    assert(result.metric_ids.includes(324), 'should pick Budgeted Conversion Rate (id:324)');
  });

  it('budget vs forecast vs actual conversion rate', async () => {
    const result = await callAi('show me budgeted conversion rate, forecasted conversion rate, and conversion rate by month');
    assertValidSpec(result, 'budget vs forecast vs actual conversion rate');
    assert(result.metric_ids.includes(324), 'should include Budgeted Conversion Rate (id:324)');
    assert(result.metric_ids.includes(319), 'should include Forecasted Conversion Rate (id:319)');
    assert(result.metric_ids.includes(20), 'should include Conversion Rate (id:20)');
  });

  it('budgeted new net saas by month', async () => {
    const result = await callAi('show me budgeted new net saas by month');
    assertValidSpec(result, 'budgeted new net saas');
    assert(result.metric_ids.includes(325), 'should pick Budgeted New Net SaaS (id:325)');
  });

  it('budget vs forecast vs actual new net saas', async () => {
    const result = await callAi('show me budgeted new net saas, forecasted new net saas, and total new net saas by month');
    assertValidSpec(result, 'budget vs forecast vs actual new net saas');
    assert(result.metric_ids.includes(325), 'should include Budgeted New Net SaaS (id:325)');
    assert(result.metric_ids.includes(289), 'should include Forecasted New Net SaaS (id:289)');
    assert(result.metric_ids.includes(57), 'should include Total New Net SaaS (id:57)');
  });

  it('new net saas revenue trajectory for this month', async () => {
    const result = await callAi('show me new net saas revenue trajectory for this month');
    assertValidSpec(result, 'new net saas trajectory');
    assert(result.metric_ids.includes(326), 'should pick New Net SaaS Revenue Trajectory (id:326)');
  });

  it('new net saas forecast vs trajectory', async () => {
    const result = await callAi('show me the new net saas forecast vs trajectory delta for this month');
    assertValidSpec(result, 'new net saas forecast vs trajectory');
    assert(result.metric_ids.includes(327), 'should pick New Net SaaS Forecast vs Trajectory (id:327)');
  });

  it('new net saas forecast attainment', async () => {
    const result = await callAi('show me new net saas forecast attainment as a bar chart for this month');
    assertValidSpec(result, 'new net saas forecast attainment');
    assert(result.metric_ids.includes(328), 'should pick New Net SaaS Forecast Attainment (id:328)');
  });
});

describe('New DEP Revenue Scorecard Metrics', () => {
  it('budgeted new dep revenue by month', async () => {
    const result = await callAi('show me budgeted new dep revenue by month');
    assertValidSpec(result, 'budgeted new dep revenue');
    assert(result.metric_ids.includes(282), 'should pick Budgeted New DEP Revenue (id:282)');
  });

  it('budget vs forecast vs actual new dep revenue', async () => {
    const result = await callAi('show me budgeted new dep revenue, forecasted new dep revenue, and total new dep net saas by month as a combo chart');
    assertValidSpec(result, 'budget vs forecast vs actual new dep');
    assert(result.metric_ids.includes(282), 'should include Budgeted New DEP Revenue (id:282)');
    assert(result.metric_ids.includes(290), 'should include Forecasted New DEP Revenue (id:290)');
    assert(result.metric_ids.includes(329), 'should include Total New DEP Net SaaS (id:329)');
  });

  it('total new dep net saas by month', async () => {
    const result = await callAi('show me total new dep net saas revenue by month');
    assertValidSpec(result, 'total new dep net saas');
    assert(result.metric_ids.includes(329), 'should pick Total New DEP Net SaaS (id:329)');
  });

  it('new dep revenue trajectory for this month', async () => {
    const result = await callAi('show me new dep revenue trajectory for this month');
    assertValidSpec(result, 'new dep trajectory');
    assert(result.metric_ids.includes(330), 'should pick New DEP Revenue Trajectory (id:330)');
  });

  it('new dep forecast vs trajectory delta', async () => {
    const result = await callAi('show me the new dep forecast vs trajectory delta for this month');
    assertValidSpec(result, 'new dep forecast vs trajectory');
    assert(result.metric_ids.includes(331), 'should pick New DEP Forecast vs Trajectory (id:331)');
  });

  it('new dep forecast attainment', async () => {
    const result = await callAi('show me new dep forecast attainment as a bar chart for this month');
    assertValidSpec(result, 'new dep forecast attainment');
    assert(result.metric_ids.includes(332), 'should pick New DEP Forecast Attainment (id:332)');
  });
});

describe('Total DEP Revenue Scorecard Metrics', () => {
  it('budgeted total dep revenue by month', async () => {
    const result = await callAi('show me budgeted total dep revenue by month');
    assertValidSpec(result, 'budgeted total dep revenue');
    assert(result.metric_ids.includes(284), 'should pick Budgeted Total DEP Revenue (id:284)');
  });

  it('budget vs forecast vs actual total dep revenue', async () => {
    const result = await callAi('show me budgeted total dep revenue, forecasted total dep revenue, and total dep net saas by month as a combo chart');
    assertValidSpec(result, 'budget vs forecast vs actual total dep');
    assert(result.metric_ids.includes(284), 'should include Budgeted Total DEP Revenue (id:284)');
    assert(result.metric_ids.includes(292), 'should include Forecasted Total DEP Revenue (id:292)');
    assert(result.metric_ids.includes(333), 'should include Total DEP Net SaaS (id:333)');
  });

  it('total dep net saas by month', async () => {
    const result = await callAi('show me total dep net saas revenue by month');
    assertValidSpec(result, 'total dep net saas');
    assert(result.metric_ids.includes(333), 'should pick Total DEP Net SaaS (id:333)');
  });

  it('total dep net saas trajectory for this month', async () => {
    const result = await callAi('show me total dep net saas trajectory for this month');
    assertValidSpec(result, 'total dep trajectory');
    assert(result.metric_ids.includes(334), 'should pick Total DEP Net SaaS Trajectory (id:334)');
  });

  it('total dep forecast vs trajectory delta', async () => {
    const result = await callAi('show me the total dep forecast vs trajectory delta as a bar chart for this month');
    assertValidSpec(result, 'total dep forecast vs trajectory');
    assert(result.metric_ids.includes(335), 'should pick Total DEP Forecast vs Trajectory (id:335)');
  });

  it('total dep forecast attainment', async () => {
    const result = await callAi('show me total dep forecast attainment as a bar chart for this month');
    assertValidSpec(result, 'total dep forecast attainment');
    assert(result.metric_ids.includes(336), 'should pick Total DEP Forecast Attainment (id:336)');
  });
});

describe('Total Net SaaS Scorecard Metrics', () => {
  it('budgeted total net saas by month', async () => {
    const result = await callAi('show me budgeted total net saas by month');
    assertValidSpec(result, 'budgeted total net saas');
    assert(result.metric_ids.includes(283), 'should pick Budgeted Total Net SaaS (id:283)');
  });

  it('budget vs forecast vs actual total net saas', async () => {
    const result = await callAi('show me budgeted total net saas, forecasted total net saas, and total net saas by month as a combo chart');
    assertValidSpec(result, 'budget vs forecast vs actual total net saas');
    assert(result.metric_ids.includes(283), 'should include Budgeted Total Net SaaS (id:283)');
    assert(result.metric_ids.includes(291), 'should include Forecasted Total Net SaaS (id:291)');
    assert(result.metric_ids.includes(337), 'should include Total Net SaaS (id:337)');
  });

  it('total net saas by month', async () => {
    const result = await callAi('show me total net saas revenue by month');
    assertValidSpec(result, 'total net saas');
    assert(result.metric_ids.includes(337), 'should pick Total Net SaaS (id:337)');
  });

  it('net saas trajectory for this month', async () => {
    const result = await callAi('show me net saas trajectory for this month');
    assertValidSpec(result, 'net saas trajectory');
    assert(result.metric_ids.includes(338), 'should pick Net SaaS Trajectory (id:338)');
  });

  it('net saas forecast vs trajectory delta', async () => {
    const result = await callAi('show me the net saas forecast vs trajectory delta as a bar chart for this month');
    assertValidSpec(result, 'net saas forecast vs trajectory');
    assert(result.metric_ids.includes(339), 'should pick Net SaaS Forecast vs Trajectory (id:339)');
  });

  it('net saas forecast attainment', async () => {
    const result = await callAi('show me net saas forecast attainment as a bar chart for this month');
    assertValidSpec(result, 'net saas forecast attainment');
    assert(result.metric_ids.includes(340), 'should pick Net SaaS Forecast Attainment (id:340)');
  });
});

describe('Churn Rate Scorecard Metrics', () => {
  it('budgeted churn by month', async () => {
    const result = await callAi('show me budgeted churn by month');
    assertValidSpec(result, 'budgeted churn');
    assert(result.metric_ids.includes(280), 'should pick Budgeted Churn (id:280)');
  });

  it('budget vs forecast vs actual churn by month', async () => {
    const result = await callAi('show me budgeted churn, forecasted churn, and actual churn by month as a combo chart');
    assertValidSpec(result, 'budget vs forecast vs actual churn');
    assert(result.metric_ids.includes(280), 'should include Budgeted Churn (id:280)');
    assert(result.metric_ids.includes(274), 'should include Forecasted Churn (id:274)');
    assert(result.metric_ids.includes(59), 'should include Churn (id:59)');
  });

  it('churn count by month', async () => {
    const result = await callAi('show me churn count by month');
    assertValidSpec(result, 'churn count');
    assert(result.metric_ids.includes(59), 'should pick Churn (id:59)');
  });

  it('churn trajectory for this month', async () => {
    const result = await callAi('show me churn trajectory for this month');
    assertValidSpec(result, 'churn trajectory');
    assert(result.metric_ids.includes(341), 'should pick Churn Trajectory (id:341)');
  });

  it('churn rate by month', async () => {
    const result = await callAi('show me churn rate by month');
    assertValidSpec(result, 'churn rate');
    assert(result.metric_ids.includes(344), 'should pick Churn Rate (id:344)');
  });

  it('budget vs forecast vs actual churn rate by month', async () => {
    const result = await callAi('show me budgeted churn rate, forecasted churn rate, and churn rate by month');
    assertValidSpec(result, 'budget vs forecast vs actual churn rate');
    assert(result.metric_ids.includes(343), 'should include Budgeted Churn Rate % (id:343)');
    assert(result.metric_ids.includes(342), 'should include Forecasted Churn Rate % (id:342)');
    assert(result.metric_ids.includes(344), 'should include Churn Rate (id:344)');
  });

  it('churn rate trajectory for this month', async () => {
    const result = await callAi('show me churn rate trajectory as a bar chart for this month');
    assertValidSpec(result, 'churn rate trajectory');
    assert(result.metric_ids.includes(345), 'should pick Churn Rate % Trajectory (id:345)');
  });
});

describe('Total DEP Revenue Charts', () => {
  it('total dep month over month grouped bar', async () => {
    const result = await callAi('show me budgeted total dep revenue, forecasted total dep revenue, and total dep net saas by month as a grouped bar chart');
    assertValidSpec(result, 'total dep month over month');
    assert(result.metric_ids.includes(284), 'should include Budgeted Total DEP Revenue (id:284)');
    assert(result.metric_ids.includes(292), 'should include Forecasted Total DEP Revenue (id:292)');
    assert(result.metric_ids.includes(333), 'should include Total DEP Net SaaS (id:333)');
    assert(['bar', 'combo'].includes(result.echarts_type), 'should use bar or combo chart type');
  });

  it('total dep revenue week over week combo chart', async () => {
    const result = await callAi('show me total dep net saas week over week with budget and forecast lines');
    assertValidSpec(result, 'total dep week over week');
    assert(result.metric_ids.includes(284), 'should include Budgeted Total DEP Revenue (id:284)');
    assert(result.metric_ids.includes(292), 'should include Forecasted Total DEP Revenue (id:292)');
    assert(result.metric_ids.includes(333), 'should include Total DEP Net SaaS (id:333)');
    assert(result.data_config.time_bucket === 'week', 'should use weekly time bucket');
  });
});

describe('NRR Scorecard Metrics', () => {
  it('nrr by month', async () => {
    const result = await callAi('show me NRR by month');
    assertValidSpec(result, 'nrr by month');
    assert(result.metric_ids.includes(346), 'should pick NRR (id:346)');
  });

  it('forecasted nrr by month', async () => {
    const result = await callAi('show me forecasted NRR by month');
    assertValidSpec(result, 'forecasted nrr');
    assert(result.metric_ids.includes(347), 'should pick Forecasted NRR (id:347)');
  });

  it('budgeted nrr by month', async () => {
    const result = await callAi('show me budgeted NRR by month');
    assertValidSpec(result, 'budgeted nrr');
    assert(result.metric_ids.includes(348), 'should pick Budgeted NRR (id:348)');
  });

  it('budget vs forecast vs actual nrr by month', async () => {
    const result = await callAi('show me budgeted NRR, forecasted NRR, and actual NRR by month as a combo chart');
    assertValidSpec(result, 'budget vs forecast vs actual nrr');
    assert(result.metric_ids.includes(348), 'should include Budgeted NRR (id:348)');
    assert(result.metric_ids.includes(347), 'should include Forecasted NRR (id:347)');
    assert(result.metric_ids.includes(346), 'should include NRR (id:346)');
  });
});

describe('WoW Chart Evals', () => {
  it('new net saas week over week — picks actuals and monthly budget/forecast', async () => {
    const result = await callAi('show me new net saas week over week with budget and forecast lines');
    assertValidSpec(result, 'new net saas WoW');
    assert(result.metric_ids.includes(57), 'should include Total New Net SaaS (id:57)');
    assert(result.metric_ids.includes(289) || result.metric_ids.includes(325), 'should include Forecasted or Budgeted New Net SaaS');
    assert.strictEqual(result.data_config.time_bucket, 'week', 'should use weekly time bucket');
  });

  it('conversion rate week over week — picks actuals and monthly forecasts', async () => {
    const result = await callAi('show me scorecard conversion rate week over week with budget and forecast lines');
    assertValidSpec(result, 'conversion rate WoW');
    assert.strictEqual(result.data_config.time_bucket, 'week', 'should use weekly time bucket');
    assert(result.metric_ids.includes(324) || result.metric_ids.includes(319), 'should include Budgeted or Forecasted Conversion Rate');
  });

  it('churn week over week — picks churn actuals and budget/forecast', async () => {
    const result = await callAi('show me churn week over week with budget and forecast lines');
    assertValidSpec(result, 'churn WoW');
    assert(result.metric_ids.includes(59), 'should include Churn (id:59)');
    assert(result.metric_ids.includes(274) || result.metric_ids.includes(280), 'should include Forecasted or Budgeted Churn');
    assert.strictEqual(result.data_config.time_bucket, 'week', 'should use weekly time bucket');
  });

  it('total dep revenue week over week — picks actuals and monthly budget/forecast', async () => {
    const result = await callAi('show me total dep net saas week over week with budget and forecast lines');
    assertValidSpec(result, 'total dep WoW');
    assert(result.metric_ids.includes(333), 'should include Total DEP Net SaaS (id:333)');
    assert(result.metric_ids.includes(284) || result.metric_ids.includes(292), 'should include Budgeted or Forecasted Total DEP Revenue');
    assert.strictEqual(result.data_config.time_bucket, 'week', 'should use weekly time bucket');
  });
});

// Gap 3: Scorecard Conversion Rate — skip until metric id:357 is confirmed live and METRIC_CONTEXT updated
describe('Scorecard Conversion Rate Evals', () => {
  it('scorecard conversion rate — picks id:357, not id:302 or id:20', async () => {
    const result = await callAi('show me scorecard conversion rate by month');
    assertValidSpec(result, 'scorecard conversion rate');
    assert(result.metric_ids.includes(357), 'should pick Scorecard Conversion Rate (id:357)');
    assert(!result.metric_ids.includes(302), 'should NOT pick Trial-to-Close Rate (id:302)');
  });

  it('budget vs forecast vs scorecard conversion rate — picks all three', async () => {
    const result = await callAi('show me budgeted conversion rate, forecasted conversion rate, and scorecard conversion rate by month');
    assertValidSpec(result, 'budget vs forecast vs scorecard conversion rate');
    assert(result.metric_ids.includes(324), 'should include Budgeted Conversion Rate (id:324)');
    assert(result.metric_ids.includes(319), 'should include Forecasted Conversion Rate (id:319)');
    assert(result.metric_ids.includes(357), 'should include Scorecard Conversion Rate (id:357)');
    assert.strictEqual(result.data_config.time_bucket, 'month', 'should use monthly time bucket');
  });

  it('scorecard conversion rate week over week — picks id:357 + monthly forecasts', async () => {
    const result = await callAi('show me scorecard conversion rate week over week with budget and forecast lines');
    assertValidSpec(result, 'scorecard conversion rate WoW');
    assert(result.metric_ids.includes(357), 'should include Scorecard Conversion Rate (id:357)');
    assert(result.metric_ids.includes(324) || result.metric_ids.includes(319), 'should include budget or forecast line');
    assert.strictEqual(result.data_config.time_bucket, 'week', 'should use weekly time bucket');
  });

  it('plain "conversion rate" does not pick id:357 — uses existing funnel metrics', async () => {
    const result = await callAi('show me conversion rate by month');
    assertValidSpec(result, 'plain conversion rate');
    assert(!result.metric_ids.includes(357), 'plain "conversion rate" should NOT pick Scorecard Conversion Rate (id:357)');
  });
});

describe('NRR Charts', () => {
  it('1 year NRR by month bar with forecasted NRR line', async () => {
    const result = await callAi('show me 1 year NRR by month as a bar chart with forecasted NRR as a line');
    assertValidSpec(result, '1 year nrr by month');
    assert(result.metric_ids.includes(346), 'should include NRR (id:346)');
    assert(result.metric_ids.includes(347), 'should include Forecasted NRR (id:347)');
    assert(['bar', 'combo'].includes(result.echarts_type), 'should use bar or combo chart type');
  });

  it('nrr month over month grouped bar', async () => {
    const result = await callAi('show me budgeted NRR, forecasted NRR, and NRR by month as a grouped bar chart');
    assertValidSpec(result, 'nrr month over month');
    assert(result.metric_ids.includes(348), 'should include Budgeted NRR (id:348)');
    assert(result.metric_ids.includes(347), 'should include Forecasted NRR (id:347)');
    assert(result.metric_ids.includes(346), 'should include NRR (id:346)');
    assert(['bar', 'combo'].includes(result.echarts_type), 'should use bar or combo chart type');
  });
});

describe('Total Net SaaS Charts', () => {
  it('total net saas month over month grouped bar', async () => {
    const result = await callAi('show me budgeted total net saas, forecasted total net saas, and total net saas by month as a grouped bar chart');
    assertValidSpec(result, 'total net saas month over month');
    assert(result.metric_ids.includes(283), 'should include Budgeted Total Net SaaS (id:283)');
    assert(result.metric_ids.includes(291), 'should include Forecasted Total Net SaaS (id:291)');
    assert(result.metric_ids.includes(337), 'should include Total Net SaaS (id:337)');
    assert(['bar', 'combo'].includes(result.echarts_type), 'should use bar or combo chart type');
  });

  it('total net saas week over week combo chart', async () => {
    const result = await callAi('show me total net saas week over week with budget and forecast lines');
    assertValidSpec(result, 'total net saas week over week');
    assert(result.metric_ids.includes(283), 'should include Budgeted Total Net SaaS (id:283)');
    assert(result.metric_ids.includes(291), 'should include Forecasted Total Net SaaS (id:291)');
    assert(result.metric_ids.includes(337), 'should include Total Net SaaS (id:337)');
    assert(result.data_config.time_bucket === 'week', 'should use weekly time bucket');
  });
});

describe('Churn Charts', () => {
  it('churn month over month grouped bar', async () => {
    const result = await callAi('show me budgeted churn, forecasted churn, and actual churn by month as a grouped bar chart');
    assertValidSpec(result, 'churn month over month');
    assert(result.metric_ids.includes(280), 'should include Budgeted Churn (id:280)');
    assert(result.metric_ids.includes(274), 'should include Forecasted Churn (id:274)');
    assert(result.metric_ids.includes(59), 'should include Churn (id:59)');
    assert(['bar', 'combo'].includes(result.echarts_type), 'should use bar or combo chart type');
  });

  it('churn week over week combo chart', async () => {
    const result = await callAi('show me churn week over week with budget and forecast lines');
    assertValidSpec(result, 'churn week over week');
    assert(result.metric_ids.includes(280), 'should include Budgeted Churn (id:280)');
    assert(result.metric_ids.includes(274), 'should include Forecasted Churn (id:274)');
    assert(result.metric_ids.includes(59), 'should include Churn (id:59)');
    assert(result.data_config.time_bucket === 'week', 'should use weekly time bucket');
  });

  it('churn rate month over month', async () => {
    const result = await callAi('show me budgeted churn rate, forecasted churn rate, and churn rate by month as a grouped bar chart');
    assertValidSpec(result, 'churn rate month over month');
    assert(result.metric_ids.includes(343), 'should include Budgeted Churn Rate % (id:343)');
    assert(result.metric_ids.includes(342), 'should include Forecasted Churn Rate % (id:342)');
    assert(result.metric_ids.includes(344), 'should include Churn Rate (id:344)');
  });
});

describe('Marketing Scorecard Snapshot', () => {
  it('trials forecast this month (total)', async () => {
    const result = await callAi('show me trials forecast this month');
    assertValidSpec(result, 'trials forecast this month');
    assert(result.metric_ids.includes(285), 'should pick Trials Forecast (id:285)');
  });

  it('trials trajectory this month', async () => {
    const result = await callAi('show me trials trajectory for this month');
    assertValidSpec(result, 'trials trajectory this month');
    assert(result.metric_ids.includes(294), 'should pick Trials Trajectory (id:294)');
  });

  it('syncs forecast this month (total)', async () => {
    const result = await callAi('show me syncs forecast this month');
    assertValidSpec(result, 'syncs forecast this month');
    assert(result.metric_ids.includes(286), 'should pick Syncs Forecast (id:286)');
  });

  it('syncs trajectory this month', async () => {
    const result = await callAi('show me syncs trajectory for this month');
    assertValidSpec(result, 'syncs trajectory this month');
    assert(result.metric_ids.includes(295), 'should pick Syncs Trajectory (id:295)');
  });

  it('sync rate this month', async () => {
    const result = await callAi('show me sync rate this month');
    assertValidSpec(result, 'sync rate this month');
    assert(result.metric_ids.includes(300), 'should pick Sync Rate (id:300)');
  });

  it('sync rate forecast this month', async () => {
    const result = await callAi('show me sync rate forecast for this month');
    assertValidSpec(result, 'sync rate forecast');
    assert(result.metric_ids.includes(317), 'should pick Sync Rate Forecast (id:317)');
  });

  it('trials snapshot: actual, forecast, trajectory together', async () => {
    const result = await callAi('show me trials, trials forecast, and trials trajectory for this month as a bar chart');
    assertValidSpec(result, 'trials snapshot');
    assert(result.metric_ids.includes(54), 'should include Trials (id:54)');
    assert(result.metric_ids.includes(285), 'should include Trials Forecast (id:285)');
    assert(result.metric_ids.includes(294), 'should include Trials Trajectory (id:294)');
    assert.strictEqual(result.data_config.last_n_months, 0, 'should be current month');
  });

  it('syncs snapshot: actual, forecast, trajectory together', async () => {
    const result = await callAi('show me syncs, syncs forecast, and syncs trajectory for this month as a bar chart');
    assertValidSpec(result, 'syncs snapshot');
    assert(result.metric_ids.includes(55), 'should include Syncs (id:55)');
    assert(result.metric_ids.includes(286), 'should include Syncs Forecast (id:286)');
    assert(result.metric_ids.includes(295), 'should include Syncs Trajectory (id:295)');
    assert.strictEqual(result.data_config.last_n_months, 0, 'should be current month');
  });

  it('full marketing snapshot: all 8 metrics', async () => {
    const result = await callAi(
      'show me trials, trials forecast, trials trajectory, syncs, syncs forecast, syncs trajectory, sync rate, and sync rate forecast for this month'
    );
    assertValidSpec(result, 'full marketing snapshot');
    assert(result.metric_ids.includes(54), 'should include Trials (id:54)');
    assert(result.metric_ids.includes(285), 'should include Trials Forecast (id:285)');
    assert(result.metric_ids.includes(294), 'should include Trials Trajectory (id:294)');
    assert(result.metric_ids.includes(55), 'should include Syncs (id:55)');
    assert(result.metric_ids.includes(286), 'should include Syncs Forecast (id:286)');
    assert(result.metric_ids.includes(295), 'should include Syncs Trajectory (id:295)');
    assert(result.metric_ids.includes(300), 'should include Sync Rate (id:300)');
    assert(result.metric_ids.includes(317), 'should include Sync Rate Forecast (id:317)');
    assert.strictEqual(result.data_config.last_n_months, 0, 'should be current month');
  });
});

describe('Drill Table Evals', () => {
  it('individual new net saas transactions → drill_table, metric id:57', async () => {
    const result = await callAi('show me individual new net saas transactions for the last 3 months');
    assert(result, 'should return a result');
    assert.strictEqual(result.echarts_type, 'drill_table', 'should return drill_table type');
    assert(result.metric_ids.includes(57), 'should pick New Net SaaS (id:57)');
    assert.strictEqual(result.data_config.last_n_months, 3, 'should use last 3 months');
  });

  it('raw cancellation records this month → drill_table, metric id:59', async () => {
    const result = await callAi('show me raw cancellation records this month');
    assert(result, 'should return a result');
    assert.strictEqual(result.echarts_type, 'drill_table', 'should return drill_table type');
    assert(result.metric_ids.includes(59), 'should pick Cancellations (id:59)');
  });

  it('new net saas detail table — not plain aggregated chart', async () => {
    const result = await callAi('show me the detail table for new net saas transactions');
    assert(result, 'should return a result');
    assert.strictEqual(result.echarts_type, 'drill_table', 'detail table request should use drill_table not bar');
    assert(result.metric_ids.includes(57), 'should pick New Net SaaS (id:57)');
  });
});
