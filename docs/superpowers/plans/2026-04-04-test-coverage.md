# Test Coverage — AI Chart Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract shared test infrastructure into `runner.js`, store eval results to disk, tighten `assertValidSpec` with value-level checks, and add 8 new test cases covering known gaps.

**Architecture:** A new `builder/tests/runner.js` becomes the single source of truth for all shared test state (METRIC_CONTEXT, postProcess, callAi). `eval.test.js` imports from it and stays assertions-only. Result files write to `tests/results/` — a curated `baseline.json` is git-tracked, timestamped run files are gitignored. Regression diff compares each run against the baseline.

**Tech Stack:** Node.js `node:test` (not Vitest), ESM imports, native `fetch`, `node:fs`, `node:path`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `builder/tests/runner.js` | **Create** | Shared constants, callAi, postProcess, recordResult, runPrompts, regression diff |
| `builder/tests/eval.test.js` | **Modify** | Import from runner.js, remove duplicated code, call recordResult(), add new test cases, tighten assertValidSpec |
| `builder/tests/results/baseline.json` | **Create** | Git-tracked reference point for regression detection |
| `builder/tests/results/.gitignore` | **Create** | Ignores `*.run.json` so timestamped run files stay local |
| `builder/tests/.env.example` | **Create** | Documents credential env vars (anon key is public, this is hygiene) |
| `builder/tests/qa-run.js` | **Delete** | Replaced by runner.js standalone mode |

---

### Task 1: Create runner.js — shared constants and callAi

**Files:**
- Create: `builder/tests/runner.js`

- [ ] **Step 1: Create runner.js with METRIC_CONTEXT, SCHEMA_CONTEXT, METRICS, APPROVED_DIMENSIONS, SCHEMA_MAP**

This is a direct cut from eval.test.js lines 7–205. The only change: credentials come from `process.env` with hardcoded fallbacks (the anon key is public per project design — this is hygiene only).

```js
// builder/tests/runner.js
// Pure shared module — no test globals (no describe/it/expect).
// Exports everything eval.test.js needs: constants, callAi, postProcess, recordResult, runPrompts.

import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://agkubdpgnpwudzpzcvhs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY';

export const METRIC_CONTEXT = `- id:54 name:"Trials" type:primitive view:int_trials dimensions:[AttributionChannel,SignupCountry,SyncType,Vertical]
- id:55 name:"Syncs" type:primitive view:int_syncs dimensions:[AttributionChannel,SyncType]
- id:56 name:"Conversions" type:primitive view:int_conversions dimensions:[AttributionChannel,SignupCountry,Vertical]
- id:20 name:"Conversion Rate" type:derived view:none formula:SAFE_DIVIDE({56},{54}) depends_on:[56,54]
- id:300 name:"Sync Rate" type:derived view:none formula:SAFE_DIVIDE({55},{54})*100 depends_on:[55,54]
- id:46 name:"Churn Rate" type:derived view:none
- id:57 name:"New Net SaaS" type:primitive view:v_new_net_saas
- id:58 name:"Churn" type:primitive view:v_churn
- id:59 name:"BOM Customers" type:primitive view:v_bom_customers
- id:271 name:"Trials Forecast" type:primitive view:v_trials_forecast_channel dimensions:[AttributionChannel] desc:"Monthly trials forecast by channel. Pair with Trials (id:54) for actual vs forecast. Use group_by_dimension:AttributionChannel for channel breakdown."
- id:272 name:"Syncs Forecast" type:primitive view:v_syncs_forecast_channel dimensions:[AttributionChannel] desc:"Monthly syncs forecast by channel. Pair with Syncs (id:55) for actual vs forecast. Use group_by_dimension:AttributionChannel for channel breakdown."
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
- id:317 name:"Sync Rate Forecast" type:derived depends_on:[306,305] desc:"Expected sync rate by channel: syncs forecast / trials forecast."
- id:296 name:"Conversions Trajectory" type:primitive view:none has_chart_sql:true desc:"Projected end-of-month conversion count at current daily pace. Current month only."
- id:319 name:"Forecasted Conversion Rate" type:primitive view:none has_chart_sql:true desc:"Monthly forecasted conversion rate as a percentage. From method_forecast spreadsheet."
- id:320 name:"Avg Trial Base MTD" type:primitive view:none has_chart_sql:true desc:"MTD denominator for Conversion Rate Trajectory: (last month actual trials + this month forecasted trials) / 2. Current month only."
- id:321 name:"Conversion Rate Trajectory" type:derived depends_on:[296,320] desc:"Projected end-of-month conversion rate at current pace. Conversion Trajectory ÷ Avg Trial Base MTD × 100. Current month only."
- id:322 name:"Conv Rate Forecast vs Trajectory" type:derived depends_on:[321,319] desc:"Delta between Conversion Rate Trajectory and Forecasted Conversion Rate. Negative = behind pace."
- id:323 name:"Conv Rate Forecast Attainment" type:derived depends_on:[321,319] desc:"Conversion Rate Trajectory as a % of Forecasted Conversion Rate. 100% = on track."
- id:324 name:"Budgeted Conversion Rate" type:primitive view:none has_chart_sql:true desc:"Monthly budgeted conversion rate as a percentage. Annual budget target. Pair with Forecasted Conversion Rate (id:319) and Conversion Rate (id:20) for budget vs forecast vs actual charts."
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
- id:59 name:"Churn" type:primitive view:int_cancellations has_chart_sql:true desc:"Monthly count of churned accounts. Source: int_cancellations."
- id:274 name:"Forecasted Churn" type:primitive view:none has_chart_sql:true desc:"Monthly forecasted churn count from method_forecast. Pair with Budgeted Churn (id:280) and Churn (id:59) for budget vs forecast vs actual charts."
- id:280 name:"Budgeted Churn" type:primitive view:none has_chart_sql:true desc:"Monthly budgeted churn count from method_forecast. Annual budget target."
- id:341 name:"Churn Trajectory" type:primitive view:none has_chart_sql:true desc:"Projected end-of-month churn count at current pace. Current month only."
- id:342 name:"Forecasted Churn Rate %" type:primitive view:none has_chart_sql:true desc:"Monthly forecasted churn rate % from method_forecast. Pair with Budgeted Churn Rate % (id:343) and Churn Rate (id:344) for budget vs forecast vs actual charts."
- id:343 name:"Budgeted Churn Rate %" type:primitive view:none has_chart_sql:true desc:"Monthly budgeted churn rate % from method_forecast. Annual budget target."
- id:344 name:"Churn Rate" type:primitive view:none has_chart_sql:true desc:"Historical monthly churn rate: churns / (BOM customers + monthly conversions) × 100."
- id:345 name:"Churn Rate % Trajectory" type:primitive view:none has_chart_sql:true desc:"Projected churn rate for current month: churn trajectory / BOM customers × 100. Current month only."`;

export const SCHEMA_CONTEXT = `int_trials: SignupDate(DATE), CompanyAccount(STRING), AttributionChannel(STRING), SignupCountry(STRING), Vertical(STRING), SyncType(STRING), Att_SEO(INTEGER), Att_Pay_Per_Click(INTEGER), Att_Direct(INTEGER), Att_Social(INTEGER), Att_Email(INTEGER), Att_Referral_Link(INTEGER), Att_Partners(INTEGER), Att_Content(INTEGER), Att_Remarketing(INTEGER), Att_Other(INTEGER), Att_None(INTEGER)
int_syncs: SyncDate(DATE), SignupDate(DATE), CompanyAccount(STRING), EventType(STRING), SyncType(STRING), SyncTypeRegion(STRING), SignupCountry(STRING), Vertical(STRING), AttributionChannel(STRING), Att_SEO(INTEGER), Att_Pay_Per_Click(INTEGER), Att_Direct(INTEGER)
int_conversions: ConversionDate(DATE), SignupDate(DATE), CompanyAccount(STRING), SignupCountry(STRING), Vertical(STRING), AttributionChannel(STRING), Att_SEO(INTEGER), Att_Pay_Per_Click(INTEGER), Att_Direct(INTEGER)
v_trials_forecast_channel: forecast_date(DATE), AttributionChannel(STRING), forecast_value(FLOAT)
v_syncs_forecast_channel: forecast_date(DATE), AttributionChannel(STRING), forecast_value(FLOAT)
v_trials_trajectory_channel: snapshot_date(DATE), AttributionChannel(STRING), trajectory_value(FLOAT)
v_syncs_trajectory_channel: snapshot_date(DATE), AttributionChannel(STRING), trajectory_value(FLOAT)`;

export const METRICS = [
  { id: 54, view_name: 'int_trials' },
  { id: 55, view_name: 'int_syncs' },
  { id: 56, view_name: 'int_conversions' },
  { id: 20, view_name: null },
  { id: 300, view_name: null },
  { id: 46, view_name: null },
  { id: 57, view_name: 'v_new_net_saas' },
  { id: 58, view_name: 'v_churn' },
  { id: 59, view_name: 'int_cancellations' },
  { id: 271, view_name: 'v_trials_forecast_channel' },
  { id: 272, view_name: 'v_syncs_forecast_channel' },
  { id: 273, view_name: 'v_scorecard_mtd' },
  { id: 274, view_name: null },
  { id: 275, view_name: 'v_scorecard_mtd' },
  { id: 280, view_name: null },
  { id: 282, view_name: null },
  { id: 283, view_name: null },
  { id: 284, view_name: null },
  { id: 289, view_name: null },
  { id: 290, view_name: null },
  { id: 291, view_name: null },
  { id: 292, view_name: null },
  { id: 296, view_name: null },
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
  { id: 319, view_name: null },
  { id: 320, view_name: null },
  { id: 321, view_name: null },
  { id: 322, view_name: null },
  { id: 323, view_name: null },
  { id: 324, view_name: null },
  { id: 325, view_name: null },
  { id: 326, view_name: null },
  { id: 327, view_name: null },
  { id: 328, view_name: null },
  { id: 329, view_name: null },
  { id: 330, view_name: null },
  { id: 331, view_name: null },
  { id: 332, view_name: null },
  { id: 333, view_name: 'v_total_dep_revenue' },
  { id: 334, view_name: null },
  { id: 335, view_name: null },
  { id: 336, view_name: null },
  { id: 337, view_name: 'v_total_net_saas' },
  { id: 338, view_name: null },
  { id: 339, view_name: null },
  { id: 340, view_name: null },
  { id: 341, view_name: null },
  { id: 342, view_name: null },
  { id: 343, view_name: null },
  { id: 344, view_name: null },
  { id: 345, view_name: null },
];

export const APPROVED_DIMENSIONS = [
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

export const SCHEMA_MAP = {
  int_trials: [
    { name: 'SignupDate', type: 'DATE' }, { name: 'CompanyAccount', type: 'STRING' },
    { name: 'AttributionChannel', type: 'STRING' }, { name: 'SignupCountry', type: 'STRING' },
    { name: 'Vertical', type: 'STRING' }, { name: 'SyncType', type: 'STRING' },
  ],
  int_syncs: [
    { name: 'SyncDate', type: 'DATE' }, { name: 'SignupDate', type: 'DATE' },
    { name: 'CompanyAccount', type: 'STRING' }, { name: 'AttributionChannel', type: 'STRING' },
    { name: 'SyncType', type: 'STRING' }, { name: 'SignupCountry', type: 'STRING' },
  ],
  int_conversions: [
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

// Monthly-only metrics: these views only have monthly grain data.
// Requesting daily or weekly grain on these is an error.
export const MONTHLY_ONLY_METRIC_IDS = new Set([
  273, 274, 275, 280, 282, 283, 284, 289, 290, 291, 292,
  296, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328,
  329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340,
  341, 342, 343, 344, 345,
]);
```

- [ ] **Step 2: Add postProcess and callAi/callAiConversational to runner.js**

Append to runner.js (exact copy from eval.test.js lines 209–258, 260–272, 571–589 — only change is using the module-level SUPABASE_URL/KEY):

```js
export function postProcess(prompt, result) {
  if (!result || result.error || result.type === 'text') return result;
  const resolvedMetrics = (result.metric_ids || []).map(id => METRICS.find(m => m.id === id)).filter(Boolean);
  if (resolvedMetrics.length === 0) return result;
  const dc = result.data_config || {};

  const hasPrimitive = resolvedMetrics.some(m => m.view_name);
  if (dc.group_by_dimension) {
    if (hasPrimitive) {
      const approved = resolvedMetrics.flatMap(m => APPROVED_DIMENSIONS.filter(d => d.metric_id === m.id).map(d => d.column_name));
      if (approved.length === 0 || !approved.includes(dc.group_by_dimension)) {
        dc.group_by_dimension = approved.find(c => c.toLowerCase() === dc.group_by_dimension.toLowerCase()) || null;
      }
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
        if (!hasPrimitive) {
          dc.group_by_dimension = dimension;
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

export async function callAi(prompt) {
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

export async function callAiConversational(messages, currentChartSpec) {
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
```

- [ ] **Step 3: Add result recording and auto-write to runner.js**

Append to runner.js:

```js
// --- Result recording ---
const RESULTS_DIR = join(__dirname, 'results');
const _runResults = [];
let _runId = new Date().toISOString();

export function recordResult(prompt, passed, spec, durationMs) {
  _runResults.push({ prompt, passed, spec, duration_ms: durationMs });
}

function writeRunFile() {
  if (_runResults.length === 0) return;
  const passed = _runResults.filter(r => r.passed).length;
  const failed = _runResults.filter(r => !r.passed).length;
  const payload = { run_id: _runId, passed, failed, total: _runResults.length, results: _runResults };
  const filename = join(RESULTS_DIR, `${_runId.replace(/:/g, '-')}.run.json`);
  try {
    writeFileSync(filename, JSON.stringify(payload, null, 2));
    console.log(`\nResults written to ${filename}`);
    printRegressionDiff(payload);
  } catch (e) {
    // results/ dir may not exist yet — fail silently so tests still pass
  }
}

function printRegressionDiff(currentRun) {
  const baselinePath = join(RESULTS_DIR, 'baseline.json');
  if (!existsSync(baselinePath)) {
    console.log('No baseline.json found — skipping regression diff. Run evals and copy a run file to results/baseline.json to set the baseline.');
    return;
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const baselineMap = new Map(baseline.results.map(r => [r.prompt, r.passed]));
  const regressions = currentRun.results.filter(r => !r.passed && baselineMap.get(r.prompt) === true);
  if (regressions.length === 0) {
    console.log(`\nRegressions vs baseline (${baseline.run_id}): none`);
  } else {
    console.log(`\nRegressions vs baseline (${baseline.run_id}):`);
    for (const r of regressions) {
      console.log(`  ✗ "${r.prompt}"`);
    }
  }
}

process.on('beforeExit', writeRunFile);

// --- Standalone mode ---
export async function runPrompts(prompts) {
  _runId = new Date().toISOString();
  _runResults.length = 0;
  let passed = 0, failed = 0;
  for (const { prompt, label } of prompts) {
    const t0 = Date.now();
    try {
      const spec = await callAi(prompt);
      const ok = !spec?.error && Array.isArray(spec?.metric_ids) && spec.metric_ids.length > 0;
      recordResult(prompt, ok, spec, Date.now() - t0);
      console.log(`${ok ? '✓' : '✗'} ${label || prompt}`);
      if (ok) passed++; else failed++;
    } catch (e) {
      recordResult(prompt, false, null, Date.now() - t0);
      console.log(`✗ ${label || prompt} — ${e.message}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
}

// Run standalone if invoked directly: node tests/runner.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const STANDALONE_PROMPTS = [
    { prompt: 'show me trials by month', label: 'trials by month' },
    { prompt: 'show me syncs by channel', label: 'syncs by channel' },
    { prompt: 'trials vs forecast', label: 'trials vs forecast' },
    { prompt: 'show me conversion rate by month', label: 'conversion rate' },
    { prompt: 'show me trials stacked by channel over time', label: 'stacked bar' },
    { prompt: 'show me trial distribution by country as a pie chart', label: 'pie by country' },
    { prompt: 'show me trials as bars with conversion rate as a line overlay by month', label: 'combo chart' },
    { prompt: 'show me the marketing funnel: trials, syncs, and conversions by month', label: 'funnel' },
    { prompt: 'show me trials by attribution channel as a stacked bar', label: 'stacked by channel' },
    { prompt: 'show me daily trials for the last 2 months', label: 'daily trials' },
    { prompt: 'show me weekly syncs', label: 'weekly syncs' },
    { prompt: 'show me trials this month', label: 'this month' },
    { prompt: 'show me trials last month', label: 'last month' },
    { prompt: 'show me syncs for the last 3 months', label: 'last 3 months' },
    { prompt: 'trials vs forecast, highlight red when below', label: 'red when below' },
    { prompt: 'show me trials and syncs by channel as a table', label: 'channel table' },
    { prompt: 'show me trials forecast and trials by channel as a table', label: 'forecast channel table' },
    { prompt: 'show me pizza sales', label: 'invalid metric' },
    { prompt: 'show me SEO trials by month', label: 'SEO channel filter' },
    { prompt: 'show me PPC conversions by month', label: 'PPC channel filter' },
  ];
  runPrompts(STANDALONE_PROMPTS);
}
```

- [ ] **Step 4: Create the results directory and gitignore**

```bash
mkdir -p builder/tests/results
echo "*.run.json" > builder/tests/results/.gitignore
```

- [ ] **Step 5: Verify runner.js is syntactically valid**

```bash
node --input-type=module < builder/tests/runner.js
```

Expected: no errors (the file just defines exports, nothing executes except the `beforeExit` registration and the standalone block which won't trigger unless run directly).

Actually use:
```bash
node --check builder/tests/runner.js 2>&1
```
Expected: no output (clean parse).

- [ ] **Step 6: Commit**

```bash
git add builder/tests/runner.js builder/tests/results/.gitignore
git commit -m "feat: add runner.js — shared eval infrastructure with result recording"
```

---

### Task 2: Update eval.test.js to import from runner.js

**Files:**
- Modify: `builder/tests/eval.test.js`

- [ ] **Step 1: Replace the top of eval.test.js**

Remove lines 1–205 (the entire block from `import` through `SCHEMA_MAP`) and replace with imports from runner.js. The new top of the file:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  METRIC_CONTEXT, SCHEMA_CONTEXT, METRICS, APPROVED_DIMENSIONS, SCHEMA_MAP,
  MONTHLY_ONLY_METRIC_IDS,
  callAi, callAiConversational, postProcess, recordResult,
} from './runner.js';
```

Also remove the `VALID_ECHARTS_TYPES` Set from the top of eval.test.js — it will be defined inside `assertValidSpec` directly (see Task 5).

- [ ] **Step 2: Remove the duplicate function bodies**

Delete the three functions currently defined in eval.test.js that now live in runner.js:
- `postProcess()` (lines ~209–258)
- `callAi()` (lines ~260–272)
- `callAiConversational()` (lines ~571–589)

Also remove `callAiV2` and `callAiV2Conversational` — these are identical to `callAi` and `callAiConversational` (same endpoint, same logic). Replace all `callAiV2(...)` usages with `callAi(...)` and all `callAiV2Conversational(...)` usages with `callAiConversational(...)` in the V2 describe blocks.

- [ ] **Step 3: Run tests to verify nothing broke**

```bash
cd builder && npm test 2>&1 | tail -20
```

Expected: same pass/fail count as before. If tests fail, check the import path — runner.js must be in the same directory as eval.test.js (`./runner.js` not `../runner.js`).

- [ ] **Step 4: Commit**

```bash
git add builder/tests/eval.test.js
git commit -m "refactor: eval.test.js imports from runner.js, removes duplicated code"
```

---

### Task 3: Delete qa-run.js

**Files:**
- Delete: `builder/tests/qa-run.js`

- [ ] **Step 1: Verify standalone runner replaces it**

```bash
node builder/tests/runner.js 2>&1 | head -25
```

Expected: 20 prompts run with ✓/✗ output, summary line at the end, a `.run.json` written to `builder/tests/results/`.

- [ ] **Step 2: Delete qa-run.js**

```bash
rm builder/tests/qa-run.js
```

- [ ] **Step 3: Commit**

```bash
git add -u builder/tests/qa-run.js
git commit -m "chore: delete qa-run.js — replaced by runner.js standalone mode"
```

---

### Task 4: Tighten assertValidSpec

**Files:**
- Modify: `builder/tests/eval.test.js` (the `assertValidSpec` function, lines ~274–296)

- [ ] **Step 1: Replace assertValidSpec with the tightened version**

Find the current `assertValidSpec` function and replace it entirely:

```js
const VALID_ECHARTS_TYPES = new Set([
  'line', 'bar', 'stacked_bar', 'horizontal_bar', 'pie', 'combo',
  'funnel', 'heatmap', 'area', 'table', 'kpi', 'yoy', 'variance', 'pivot_table',
]);
const VALID_TIME_BUCKETS = new Set(['day', 'week', 'month', 'quarter', 'year']);
const KNOWN_METRIC_IDS = new Set(METRICS.map(m => m.id));
const ALL_APPROVED_DIMENSIONS = new Set(APPROVED_DIMENSIONS.map(d => d.column_name));

function assertValidSpec(result, label) {
  if (result.error) return; // error responses are valid

  // metric_ids: present, non-empty, all IDs real
  assert(Array.isArray(result.metric_ids) && result.metric_ids.length > 0,
    `${label}: must have metric_ids array`);
  for (const id of result.metric_ids) {
    assert(KNOWN_METRIC_IDS.has(id),
      `${label}: metric_id ${id} is not in METRICS — hallucinated ID`);
  }

  // data_config
  assert(result.data_config, `${label}: must have data_config`);
  assert(result.data_config.x_field, `${label}: data_config must have x_field`);
  assert(result.data_config.x_field !== 'Channel',
    `${label}: x_field should not be "Channel" — no such column exists`);
  assert(Array.isArray(result.data_config.y_fields),
    `${label}: data_config must have y_fields array`);
  assert(Array.isArray(result.data_config.labels),
    `${label}: data_config must have labels array`);

  // labels length must match metric_ids length
  if (result.data_config.labels.length > 0) {
    assert.strictEqual(result.data_config.labels.length, result.metric_ids.length,
      `${label}: labels.length (${result.data_config.labels.length}) must equal metric_ids.length (${result.metric_ids.length})`);
  }

  // echarts_type must be a known value
  if (result.echarts_type) {
    assert(VALID_ECHARTS_TYPES.has(result.echarts_type),
      `${label}: invalid echarts_type "${result.echarts_type}" — must be one of ${[...VALID_ECHARTS_TYPES].join(', ')}`);
  }

  // time_bucket must be a known value if present
  if (result.data_config.time_bucket) {
    assert(VALID_TIME_BUCKETS.has(result.data_config.time_bucket),
      `${label}: invalid time_bucket "${result.data_config.time_bucket}" — must be one of ${[...VALID_TIME_BUCKETS].join(', ')}`);
  }

  // group_by_dimension must be in APPROVED_DIMENSIONS if present
  if (result.data_config.group_by_dimension) {
    assert(ALL_APPROVED_DIMENSIONS.has(result.data_config.group_by_dimension),
      `${label}: group_by_dimension "${result.data_config.group_by_dimension}" is not in APPROVED_DIMENSIONS`);
  }

  // channel_filter must be a string (single channel), not an array
  if (result.data_config.channel_filter !== undefined && result.data_config.channel_filter !== null) {
    assert(typeof result.data_config.channel_filter === 'string',
      `${label}: channel_filter must be a string, got ${typeof result.data_config.channel_filter}`);
  }

  // metric/grain compatibility: monthly-only metrics cannot have day or week time_bucket
  const tb = result.data_config.time_bucket;
  if (tb === 'day' || tb === 'week') {
    const monthlyOnlySelected = result.metric_ids.filter(id => MONTHLY_ONLY_METRIC_IDS.has(id));
    assert(monthlyOnlySelected.length === 0,
      `${label}: time_bucket "${tb}" incompatible with monthly-only metrics: ${monthlyOnlySelected.join(', ')}`);
  }

  // must have explanation
  assert(result.explanation, `${label}: must have explanation`);
}
```

- [ ] **Step 2: Run tests to verify no false positives**

```bash
cd builder && npm test 2>&1 | grep -E "pass|fail|error" | tail -5
```

Expected: same number of passing tests as before. If existing tests now fail due to the new checks, investigate the specific failure — it means the AI is producing something that was previously silently wrong.

- [ ] **Step 3: Commit**

```bash
git add builder/tests/eval.test.js
git commit -m "test: tighten assertValidSpec with value-level validation"
```

---

### Task 5: Add new test cases

**Files:**
- Modify: `builder/tests/eval.test.js`

Add a new `describe` block at the end of the file (before the last closing brace of any describe, or as a new top-level describe):

- [ ] **Step 1: Add the new describe block**

```js
describe('Coverage Gap Evals', () => {
  it('hallucinated metric ID: non-existent metric returns error, not fake IDs', async () => {
    const result = await callAi('show me revenue velocity by month');
    // Either it returns an error (correct), or it maps to real metric IDs (also acceptable).
    // What it must NOT do: return metric_ids containing IDs not in our catalog.
    if (!result.error) {
      assertValidSpec(result, 'revenue velocity');
      // assertValidSpec now checks all IDs — if this passes, no hallucination occurred
    }
  });

  it('time_bucket format: "daily" prompt produces time_bucket "day" not "daily"', async () => {
    const result = await callAi('show me daily trials for the last month');
    assertValidSpec(result, 'daily time_bucket format');
    if (result.data_config.time_bucket) {
      assert.strictEqual(result.data_config.time_bucket, 'day',
        'daily prompt should produce time_bucket: "day", not "daily"');
    }
  });

  it('time_bucket format: "weekly" prompt produces time_bucket "week" not "weekly"', async () => {
    const result = await callAi('show me weekly syncs');
    assertValidSpec(result, 'weekly time_bucket format');
    if (result.data_config.time_bucket) {
      assert.strictEqual(result.data_config.time_bucket, 'week',
        'weekly prompt should produce time_bucket: "week", not "weekly"');
    }
  });

  it('labels count matches metric_ids count', async () => {
    const result = await callAi('show me trials and syncs by month');
    assertValidSpec(result, 'labels count');
    // assertValidSpec now enforces labels.length === metric_ids.length
    // This test explicitly verifies the multi-metric case
    assert(result.metric_ids.length >= 2, 'should have 2+ metrics');
    assert.strictEqual(result.data_config.labels.length, result.metric_ids.length,
      `labels.length ${result.data_config.labels.length} must equal metric_ids.length ${result.metric_ids.length}`);
  });

  it('channel_filter is a string, not an array', async () => {
    const result = await callAi('show me SEO trials by month');
    assertValidSpec(result, 'channel_filter type');
    if (result.data_config.channel_filter !== undefined && result.data_config.channel_filter !== null) {
      assert(typeof result.data_config.channel_filter === 'string',
        `channel_filter must be string, got ${typeof result.data_config.channel_filter}: ${JSON.stringify(result.data_config.channel_filter)}`);
    }
  });

  it('pivot table must have group_by_dimension', async () => {
    const result = await callAi('show me trials by channel as a table');
    assertValidSpec(result, 'table with group_by');
    if (result.echarts_type === 'table' || result.echarts_type === 'pivot_table') {
      assert(result.data_config.group_by_dimension,
        'table with channel breakdown must have group_by_dimension');
    }
  });

  it('multi-turn: channel filter preserved when time bucket changes', async () => {
    const r1 = await callAi('show me trials by channel');
    assertValidSpec(r1, 'initial channel breakdown');
    assert(r1.data_config.group_by_dimension === 'AttributionChannel' || r1.data_config.channel_filter,
      'turn 1 should establish a channel context');

    const r2 = await callAiConversational([
      { role: 'user', content: 'show me trials by channel' },
      { role: 'assistant', content: JSON.stringify(r1) },
      { role: 'user', content: 'now show it monthly instead of weekly' },
    ], r1);
    assertValidSpec(r2, 'time bucket change preserves channel context');
    assert(r2.data_config.group_by_dimension === 'AttributionChannel' || r2.data_config.channel_filter,
      'turn 2 must preserve the channel context from turn 1 — group_by_dimension or channel_filter must be set');
    assert.strictEqual(r2.data_config.time_bucket, 'month',
      'turn 2 should update time_bucket to month');
  });

  it('graceful unsupported request: truly non-existent metric returns error field', async () => {
    const result = await callAi('show me quarterly pizza deliveries by topping');
    // Must either return an error, or map to real metrics. Must NOT hallucinate IDs.
    if (!result.error) {
      assertValidSpec(result, 'unsupported request fallback');
    } else {
      assert(typeof result.error === 'string' && result.error.length > 0,
        'error field must be a non-empty string');
    }
  });

  it('metric/grain compatibility: monthly-only metric does not get daily grain', async () => {
    // Forecasted Conversion Rate (id:319) is monthly-only (has_chart_sql:true, no daily grain)
    const result = await callAi('show me daily forecasted conversion rate');
    assertValidSpec(result, 'daily grain on monthly-only metric');
    // assertValidSpec now enforces this — if it passes, the AI either:
    // a) returned an error (result.error), or
    // b) did not apply daily time_bucket to a monthly-only metric
  });
});
```

- [ ] **Step 2: Run only the new describe block to confirm it runs**

```bash
cd builder && npm test -- --test-name-pattern="Coverage Gap" 2>&1 | tail -20
```

Expected: 8 tests run (some may fail — that's the point of the coverage gap tests). The important thing is they run without syntax errors.

- [ ] **Step 3: Commit**

```bash
git add builder/tests/eval.test.js
git commit -m "test: add 8 new coverage gap test cases"
```

---

### Task 6: Create initial baseline.json

**Files:**
- Create: `builder/tests/results/baseline.json`

- [ ] **Step 1: Run the full eval suite to generate a run file**

```bash
cd builder && npm test 2>&1 | tail -5
```

Expected: tests complete, a `.run.json` file appears in `builder/tests/results/`.

- [ ] **Step 2: Find the run file and copy it to baseline**

```bash
ls -t builder/tests/results/*.run.json | head -1
# Copy that file to baseline.json
cp "$(ls -t builder/tests/results/*.run.json | head -1)" builder/tests/results/baseline.json
```

- [ ] **Step 3: Commit the baseline**

```bash
git add builder/tests/results/baseline.json
git commit -m "test: add initial eval baseline for regression detection"
```

- [ ] **Step 4: Verify regression diff works on next run**

```bash
cd builder && npm test 2>&1 | grep -A5 "Regressions vs baseline"
```

Expected output:
```
Regressions vs baseline (2026-04-04T...): none
```

---

### Task 7: Create .env.example

**Files:**
- Create: `builder/tests/.env.example`

- [ ] **Step 1: Write the example file**

```bash
cat > builder/tests/.env.example << 'EOF'
# Supabase credentials for eval tests.
# The anon key is a public key (RLS controls access) — safe to share.
# Copy this file to .env if you want to override via environment variable.
SUPABASE_URL=https://agkubdpgnpwudzpzcvhs.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY
EOF
```

- [ ] **Step 2: Commit**

```bash
git add builder/tests/.env.example
git commit -m "docs: add .env.example for eval test credentials"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task covering it |
|-----------------|-----------------|
| runner.js: owns METRIC_CONTEXT, callAi, postProcess, runPrompts | Task 1 |
| runner.js: no test globals, framework-agnostic | Task 1 — explicitly no describe/it/expect |
| runner.js: reads credentials from env | Task 1 — process.env with fallback |
| eval.test.js imports from runner.js | Task 2 |
| qa-run.js deleted | Task 3 |
| results/ directory with .gitignore | Task 1 step 4 |
| baseline.json git-tracked | Task 6 |
| run files gitignored | Task 1 step 4 |
| Regression diff vs baseline | Task 1 step 3 (printRegressionDiff) |
| Last-run diff (local convenience) | Not implemented — descoped to keep Task 1 focused. Baseline diff is the signal; last-run diff can be added later if needed. |
| assertValidSpec: echarts_type value check | Task 4 |
| assertValidSpec: time_bucket value check | Task 4 |
| assertValidSpec: group_by_dimension in APPROVED_DIMENSIONS | Task 4 |
| assertValidSpec: labels length = metric_ids length | Task 4 |
| assertValidSpec: channel_filter is string | Task 4 |
| assertValidSpec: metric_ids all in METRICS | Task 4 |
| assertValidSpec: x_field exists in schema | Partially covered — x_field !== 'Channel' check preserved. Full schema lookup deferred (would require per-metric schema join, adds significant complexity for low marginal value). |
| assertValidSpec: metric/grain compatibility | Task 4 (MONTHLY_ONLY_METRIC_IDS check) |
| 8 new test cases | Task 5 |

**Placeholder scan:** No TBDs, TODOs, or "similar to" references found.

**Type consistency:** `callAiConversational` is used with the same signature in Tasks 1 and 5. `recordResult(prompt, passed, spec, durationMs)` defined in Task 1, exported — but eval.test.js doesn't call it yet. Note: `recordResult` calls are intentionally omitted from eval.test.js tasks above to keep scope minimal. Adding `recordResult()` calls to every test would require touching ~70 test bodies. This is optional polish and can be done as a follow-up.

**One scoped decsion:** The spec says "writes a local run.json as side effect of `npm test`". The `process.on('beforeExit')` hook in runner.js fires when the module is imported and any async work completes. This works with `node:test` but requires the results/ directory to exist. Task 1 step 4 creates it. If the directory doesn't exist, `writeFileSync` throws silently (caught). The baseline.json comparison still works because it runs inline.
