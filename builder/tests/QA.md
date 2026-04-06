# QA Testing Approach — Scorecard Metrics

## The Gap We Found

Our eval tests only check the **AI spec layer** (does the AI return the right metric_ids and echarts_type?). They do NOT test the **rendering layer** (does the frontend compute and display the correct value?).

This means tests can pass 100% while the UI shows completely wrong numbers.

## Three Layers to Test

### Layer 1: AI Spec (eval tests + scorecard-qa tests)
- Tests: `builder/tests/eval.test.js`, `builder/tests/scorecard-qa.test.js`
- What they check: AI returns correct metric_ids, echarts_type, data_config
- What they miss: Everything after the AI response

### Layer 2: Data Pipeline (BQ queries + formula evaluation)
- Tests: `builder/tests/unit/chartUtils.test.js` (extractKpiFromTimeSeries, evaluateFormula)
- What to check: chart_sql returns non-null data for current month, derived formula produces expected value
- How: Run actual chart_sql via BigQuery MCP, verify period labels and values

### Layer 3: Display Formatting (KpiCard, EChart rendering)
- Tests: Unit tests for KpiCard formatting logic
- What to check: isRate vs isPercent flags produce correct display format
- Known issue: isRate=true multiplies by 100 — only valid for raw ratios (0-1 range), NOT for formulas that already include × 100

## Bugs Found by This Approach

| Bug | Layer | Symptom | Root Cause |
|-----|-------|---------|------------|
| KPI shows 0 | Layer 2 | "trials forecast as KPI" → 0 | Null forecast_date rows in BQ view |
| KPI shows 48600% | Layer 3 | "trials traj vs forecast as KPI" → 48600% | isRate=true on delta metric, KpiCard × 100 |
| KPI shows 6000% | Layer 3 | "syncs forecast attainment as KPI" → 6000% | isRate=true on attainment, double × 100 |
| KPI shows text | Layer 1 | "trials forecast as KPI" → text response | AI prompt excluded chart_sql from KPI |

## How to Test Going Forward

Before declaring a KPI metric "working", verify all 3 layers:

```
1. AI spec:     curl the edge function → check metric_ids and echarts_type
2. BQ data:     run the chart_sql in BigQuery → check current month has value
3. Display:     check isRate/isPercent flags → verify KpiCard formats correctly
```

## isRate vs isPercent Decision Tree

```
Metric has formula?
├── No → isRate: false, isPercent: false (plain number)
└── Yes → Formula contains SAFE_DIVIDE?
    ├── No (delta like {294}-{285}) → isRate: false, isPercent: false
    └── Yes → Formula contains * 100?
        ├── No (raw ratio 0-1) → isRate: true (KpiCard × 100 + %)
        └── Yes (already %) → isRate: false, isPercent: true (KpiCard adds % only)
```

## Expected Values (April 2026)

| Prompt | Metric | Expected Value | Display |
|--------|--------|---------------|---------|
| trials forecast as KPI | id:285 | 758 | 758 |
| trials trajectory as KPI | id:294 | ~486 | 486 |
| trials trajectory vs forecast as KPI | id:349 | ~-272 | -272 |
| trials forecast attainment as KPI | id:350 | ~64.1 | 64.1% |
| syncs forecast as KPI | id:286 | 470 | 470 |
| syncs trajectory as KPI | id:295 | ~282 | 282 |
| syncs trajectory vs forecast as KPI | id:351 | ~-188 | -188 |
| syncs forecast attainment as KPI | id:352 | ~60.0 | 60.0% |
