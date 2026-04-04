# Test Coverage Design — AI Chart Builder

**Date:** 2026-04-04  
**Status:** Approved

## Context

The AI chart builder converts natural language prompts into JSON chart specs (not SQL). The pipeline is: user prompt → Claude → JSON config → frontend builds SQL → BigQuery → ECharts. The main fragility is in `validateColumns()` and `applyPromptOverrides()` (post-processing), not in metric selection or BQ errors.

Current state:
- `eval.test.js` — 70+ end-to-end tests using `node:test`, calls real Supabase Edge Function, no result storage
- `qa-run.js` — 20 prompts with expected outcomes but zero assertions, stale METRIC_CONTEXT (37 vs 50 metrics), duplicates postProcess/callAi code, console-only output
- `unit/ai.test.js` — ~50 unit tests for pure functions, no change needed

## Architecture

Three files collapse into a cleaner shape:

```
builder/tests/
  runner.js            ← NEW: pure exports — callAi(), postProcess(), METRIC_CONTEXT, runPrompts()
  eval.test.js         ← KEEP: assertions-only, imports from runner.js
  unit/ai.test.js      ← KEEP: unchanged
  results/
    baseline.json      ← git-tracked, manually updated when a run is blessed
    .gitignore         ← ignores *.run.json
```

**`runner.js`** owns:
- `METRIC_CONTEXT` — single source of truth (no more stale copy in qa-run.js)
- `callAi(prompt)` — calls Supabase Edge Function, loads credentials from `.env`
- `postProcess(prompt, result)` — mirrors frontend post-processing
- `runPrompts(prompts)` — executes a list of prompts, writes `<timestamp>.run.json` locally

Rules: no test globals (`describe`/`it`/`expect`), no hardcoded credentials, framework-agnostic.

**`eval.test.js`** becomes assertions-only: imports `callAi` and `postProcess` from runner.js.

**`qa-run.js` is deleted.** Its 20 prompts migrate into eval.test.js as asserted tests.

**Credentials:** Supabase URL + anon key move from hardcoded strings in test files to `.env` (already gitignored), loaded by runner.js at startup.

## Two Run Modes

**`npm test`** — runs eval.test.js via `node --test` as today. Writes a local `<timestamp>.run.json` as a side effect. No behavior change for the developer.

**`node tests/runner.js`** — standalone mode, replaces `node tests/qa-run.js`. Runs all prompts, writes local run file, prints formatted summary. Useful for exploring new prompt behavior before writing a test.

## Result Storage

**Baseline file** (`tests/results/baseline.json`) is git-tracked. Updating it is a deliberate act:
1. Run evals, results look good
2. Copy latest run file to `baseline.json`
3. Commit — this becomes the new reference point

**Run files** (`<timestamp>.run.json`) are local only, gitignored. Never committed.

**Result format:**
```json
{
  "run_id": "2026-04-04T14:22:00Z",
  "passed": 68, "failed": 3, "total": 71,
  "results": [
    { "prompt": "show me trials by month", "passed": true, "spec": {...}, "duration_ms": 1240 },
    { "prompt": "channel breakdown", "passed": false, "expected": "group_by_dimension: channel", "actual": null }
  ]
}
```

## Regression Diff

Two layers on every `npm test` run:

```
Regressions vs baseline (committed 2026-04-03):
  ✗ "channel breakdown" — was passing, now failing
      group_by_dimension: expected 'channel', got null

Local drift vs last run:
  (no changes)
```

- **Baseline diff** is the signal: a committed, intentional reference point. This is what matters for CI.
- **Last-run diff** is local convenience: shows what changed since the previous run during active dev.

## assertValidSpec Tightening

Current checks (existence only) get upgraded to value validation:

| Check | Detail |
|-------|--------|
| `echarts_type` in known values | `['bar','line','scatter','pie','funnel','gauge','table','pivot_table']` |
| `time_bucket` in known values | `['day','week','month','quarter','year']` |
| `group_by_dimension` in APPROVED_DIMENSIONS | same list `validateColumns()` uses |
| `labels` length = `metric_ids` length | if labels present |
| `channel_filter` is array | not a string |
| `metric_ids` all exist in METRICS | catches hallucinated IDs |
| `x_field` exists in metric's view schema | catches wrong field names |
| metric/grain compatibility | e.g. no daily grain on monthly-only metrics |

The hallucinated metric ID check is the highest-value addition — currently the AI can return `metric_ids: [999]` and the test passes.

## New Test Cases

| Gap | Test |
|-----|------|
| Hallucinated metric ID | "show me revenue velocity" → all metric_ids exist in METRICS |
| Wrong time_bucket format | "daily active users" → `time_bucket: 'day'` not `'daily'` |
| labels count mismatch | 2 metrics → exactly 2 labels |
| channel_filter shape | "by channel" → `channel_filter` is array |
| Pivot missing group_by | "pivot table of trials" → has `group_by_dimension` |
| Multi-turn context loss | Turn 1: set channel filter → Turn 2: change time bucket → channel filter preserved |
| Graceful unsupported request | Non-existent metric → `error` field, not hallucinated IDs |
| Metric/grain incompatibility | Daily grain on monthly-only metric → error or fallback, not silent wrong grain |

The multi-turn context loss test asserts on the specific field carried forward, not just that turn 2 returned a valid spec.

## What Does Not Change

- `unit/ai.test.js` — pure function tests, no touch needed
- Test runner (`node --test`) — no change to npm test command
- Vitest is not used (eval.test.js uses `node:test`)
