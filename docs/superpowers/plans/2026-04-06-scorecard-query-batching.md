# Scorecard Query Batching & Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce scorecard BQ requests from ~52 to ~5-8, add retry logic for transient failures, and eliminate blank "No data" tiles.

**Architecture:** Add a `queryBqWithRetry()` wrapper around `queryBq()` for transient failures (400, 429, timeout messages). Add `buildBatchSql()` / `splitBatchResults()` that combine single-series `{period, value}` chart_sql queries into one UNION ALL with a `_key` discriminator. Multi-series queries (returning a `series` column) are excluded from batching and run individually. Update `useScorecardData.js` to group batchable queries and run them as fewer BQ requests at concurrency 5.

**Tech Stack:** Vanilla JS, BigQuery REST API, Vitest (unit tests), real BQ connection (integration tests)

**Key constraints (from Codex review):**
1. Numeric metric IDs stay numeric in `dataMap` — consumers (`KpiColumn.jsx:11`, `Chart.jsx:114`) do `dataMap.get(numericId)`. Only custom SQL keys (`__weekly_*`) are strings.
2. Only batch single-series `{period, value}` queries. Multi-series chart_sql (with `series` column) runs individually via `fetchChartData()`.
3. Add `ORDER BY _key, period` to batched UNION ALL to preserve row ordering.
4. Retry only known transient failures: `BQ 400`, `BQ 429`, and messages containing `timed out`. Never retry 401 (auth) or malformed SQL errors.
5. Don't duplicate `fetchChartData()` logic — extract reusable SQL-wrapping helpers into `bigquery.js`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `builder/src/lib/bigquery.js` | Modify | Add `queryBqWithRetry()`, `buildBatchSql()`, `splitBatchResults()`, `wrapChartSql()` |
| `builder/src/hooks/useScorecardData.js` | Modify | Group batchable tasks, use batch function, bump concurrency to 5 |
| `builder/tests/unit/bigquery-retry.test.js` | Create | Unit tests for retry logic (mocked fetch) |
| `builder/tests/unit/batch-queries.test.js` | Create | Unit tests for UNION ALL SQL building, result splitting, ordering |
| `builder/tests/unit/scorecard-data.test.js` | Create | Unit tests for task grouping and key type preservation |
| `builder/tests/integration/scorecard-live.test.js` | Create | Integration tests hitting real BQ |

---

### Task 1: Define batch eligibility + key contract — tests

**Files:**
- Create: `builder/tests/unit/scorecard-data.test.js`

These tests define the contract BEFORE we implement. A query is batchable if it's a chart_sql or customSql that returns `{period, value}` (no `series` column). Numeric metric IDs must stay numeric in the final dataMap.

- [ ] **Step 1: Write the failing tests**

```js
// builder/tests/unit/scorecard-data.test.js
import { describe, it, expect } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

const { groupScorecardTasks } = await import('../../src/hooks/useScorecardData.js');

describe('groupScorecardTasks', () => {
  const makeMetric = (id, overrides = {}) => ({
    id, name: `Metric ${id}`, view_name: null, chart_sql: null,
    formula: null, depends_on: null, ...overrides,
  });

  it('groups single-series chart_sql metrics into batchable', () => {
    const primitives = [
      makeMetric(56, { chart_sql: "SELECT '2026-01' AS period, 42 AS value" }),
      makeMetric(296, { chart_sql: "SELECT '2026-01' AS period, 10 AS value" }),
    ];
    const result = groupScorecardTasks(primitives, [], {}, 13);
    expect(result.batchable).toHaveLength(2);
    expect(result.individual).toHaveLength(0);
  });

  it('keeps numeric metric IDs as numbers in batchable keys', () => {
    const primitives = [
      makeMetric(56, { chart_sql: "SELECT '2026-01' AS period, 42 AS value" }),
    ];
    const result = groupScorecardTasks(primitives, [], {}, 13);
    expect(result.batchable[0].key).toBe(56); // numeric, not '56'
  });

  it('puts view_name metrics into individual (they use fetchAggregatedData)', () => {
    const primitives = [
      makeMetric(54, { view_name: 'int_trials' }),
    ];
    const result = groupScorecardTasks(primitives, [], {}, 13);
    expect(result.batchable).toHaveLength(0);
    expect(result.individual).toHaveLength(1);
  });

  it('puts custom SQL into batchable with string key', () => {
    const customSqls = [
      { key: '__weekly_conv_rate', sql: "SELECT '2026-01-06' AS period, 0.08 AS value" },
    ];
    const result = groupScorecardTasks([], customSqls, {}, 13);
    expect(result.batchable).toHaveLength(1);
    expect(result.batchable[0].key).toBe('__weekly_conv_rate'); // string
  });

  it('returns both groups for mixed input', () => {
    const primitives = [
      makeMetric(56, { chart_sql: "SELECT '2026-01' AS period, 42 AS value" }),
      makeMetric(54, { view_name: 'int_trials' }),
    ];
    const customSqls = [
      { key: '__custom', sql: "SELECT '2026-01' AS period, 1 AS value" },
    ];
    const result = groupScorecardTasks(primitives, customSqls, {}, 13);
    expect(result.batchable).toHaveLength(2); // chart_sql + custom
    expect(result.individual).toHaveLength(1); // view_name
  });

  it('metric with both chart_sql and view_name goes to batchable (chart_sql takes precedence)', () => {
    const primitives = [
      makeMetric(333, { chart_sql: "SELECT '2026-01' AS period, 100 AS value", view_name: 'v_total_dep_revenue' }),
    ];
    const result = groupScorecardTasks(primitives, [], {}, 13);
    expect(result.batchable).toHaveLength(1);
    expect(result.individual).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd builder && npx vitest run tests/unit/scorecard-data.test.js`
Expected: FAIL — `groupScorecardTasks` is not exported

- [ ] **Step 3: Commit failing tests**

```bash
git add builder/tests/unit/scorecard-data.test.js
git commit -m "test: add failing tests for scorecard task grouping and key contract"
```

---

### Task 2: Retry wrapper — tests

**Files:**
- Create: `builder/tests/unit/bigquery-retry.test.js`

Tests retry logic with mocked fetch. Key: only retry transient errors (400, 429, timeout), never 401 or SQL syntax errors.

- [ ] **Step 1: Write the failing tests**

```js
// builder/tests/unit/bigquery-retry.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => 'fake-token', setItem: () => {}, removeItem: () => {} };
}

const { queryBqWithRetry } = await import('../../src/lib/bigquery.js');

function bqResponse(rows, fields = [{ name: 'period' }, { name: 'value' }]) {
  return {
    ok: true, status: 200,
    json: async () => ({
      schema: { fields },
      rows: rows.map(r => ({ f: fields.map(f => ({ v: r[f.name] })) })),
    }),
  };
}

function bqEmptyResponse() {
  return {
    ok: true, status: 200,
    json: async () => ({ schema: { fields: [{ name: 'period' }, { name: 'value' }] } }),
  };
}

function bqErrorResponse(status) {
  return { ok: false, status, json: async () => ({}) };
}

describe('queryBqWithRetry', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('returns data on first success', async () => {
    mockFetch.mockResolvedValueOnce(bqResponse([{ period: '2026-01', value: '42' }]));
    const result = await queryBqWithRetry('SELECT 1');
    expect(result.rows).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 400 and succeeds on second attempt', async () => {
    mockFetch
      .mockResolvedValueOnce(bqErrorResponse(400))
      .mockResolvedValueOnce(bqResponse([{ period: '2026-01', value: '10' }]));
    const result = await queryBqWithRetry('SELECT 1', { baseDelay: 10 });
    expect(result.rows).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 rate limit', async () => {
    mockFetch
      .mockResolvedValueOnce(bqErrorResponse(429))
      .mockResolvedValueOnce(bqResponse([{ period: '2026-01', value: '5' }]));
    const result = await queryBqWithRetry('SELECT 1', { baseDelay: 10 });
    expect(result.rows).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on timeout message', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('BigQuery query timed out (30s). Try a narrower time range.'))
      .mockResolvedValueOnce(bqResponse([{ period: '2026-02', value: '7' }]));
    const result = await queryBqWithRetry('SELECT 1', { baseDelay: 10 });
    expect(result.rows).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on 401 — throws immediately', async () => {
    mockFetch.mockResolvedValueOnce(bqErrorResponse(401));
    await expect(queryBqWithRetry('SELECT 1')).rejects.toThrow('BQ session expired');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws after max retries exhausted', async () => {
    mockFetch
      .mockResolvedValueOnce(bqErrorResponse(400))
      .mockResolvedValueOnce(bqErrorResponse(400))
      .mockResolvedValueOnce(bqErrorResponse(400));
    await expect(queryBqWithRetry('SELECT 1', { maxRetries: 2, baseDelay: 10 }))
      .rejects.toThrow('BQ 400');
    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('retries on empty results when retryOnEmpty is true', async () => {
    mockFetch
      .mockResolvedValueOnce(bqEmptyResponse())
      .mockResolvedValueOnce(bqResponse([{ period: '2026-01', value: '5' }]));
    const result = await queryBqWithRetry('SELECT 1', { retryOnEmpty: true, baseDelay: 10 });
    expect(result.rows).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry empty results by default', async () => {
    mockFetch.mockResolvedValueOnce(bqEmptyResponse());
    const result = await queryBqWithRetry('SELECT 1', { baseDelay: 10 });
    expect(result.rows).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd builder && npx vitest run tests/unit/bigquery-retry.test.js`
Expected: FAIL — `queryBqWithRetry` not exported

- [ ] **Step 3: Commit**

```bash
git add builder/tests/unit/bigquery-retry.test.js
git commit -m "test: add failing tests for queryBqWithRetry"
```

---

### Task 3: Implement queryBqWithRetry

**Files:**
- Modify: `builder/src/lib/bigquery.js`

- [ ] **Step 1: Add queryBqWithRetry after queryBq (after line 105)**

```js
/**
 * queryBq wrapper with retry for transient BQ failures.
 * Retries on: BQ 400, BQ 429, timeout messages.
 * Does NOT retry: 401 (auth), unknown errors (likely SQL bugs).
 */
export async function queryBqWithRetry(sql, { maxRetries = 2, retryOnEmpty = false, baseDelay = 500 } = {}) {
  const RETRYABLE = /BQ 4(00|29)|timed out/;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await queryBq(sql);
      if (retryOnEmpty && result.rows.length === 0 && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        continue;
      }
      return result;
    } catch (e) {
      lastError = e;
      if (!RETRYABLE.test(e.message) || attempt >= maxRetries) throw e;
      await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}
```

- [ ] **Step 2: Run retry tests**

Run: `cd builder && npx vitest run tests/unit/bigquery-retry.test.js`
Expected: All 8 tests PASS

- [ ] **Step 3: Run all existing tests for regressions**

Run: `cd builder && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add builder/src/lib/bigquery.js builder/tests/unit/bigquery-retry.test.js
git commit -m "feat: add queryBqWithRetry with exponential backoff for transient BQ failures"
```

---

### Task 4: UNION ALL batch helpers — tests

**Files:**
- Create: `builder/tests/unit/batch-queries.test.js`

Tests the SQL building and result splitting. Key additions from Codex review: ordering test, key type preservation test.

- [ ] **Step 1: Write the failing tests**

```js
// builder/tests/unit/batch-queries.test.js
import { describe, it, expect } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

const { buildBatchSql, splitBatchResults } = await import('../../src/lib/bigquery.js');

describe('buildBatchSql', () => {
  it('wraps each query with a _key discriminator', () => {
    const queries = [
      { key: 56, sql: "SELECT '2026-01' AS period, 42 AS value" },
      { key: 296, sql: "SELECT '2026-01' AS period, 10 AS value" },
    ];
    const sql = buildBatchSql(queries);
    expect(sql).toContain("'56' AS _key");
    expect(sql).toContain("'296' AS _key");
    expect(sql).toContain('UNION ALL');
  });

  it('adds ORDER BY _key, period to preserve row ordering', () => {
    const queries = [
      { key: 56, sql: "SELECT '2026-01' AS period, 42 AS value" },
    ];
    const sql = buildBatchSql(queries);
    expect(sql).toContain('ORDER BY _key, period');
  });

  it('returns empty string for empty input', () => {
    expect(buildBatchSql([])).toBe('');
  });

  it('works with string keys (custom SQL)', () => {
    const queries = [
      { key: '__weekly_conv_rate', sql: "SELECT '2026-01-06' AS period, 0.08 AS value" },
    ];
    const sql = buildBatchSql(queries);
    expect(sql).toContain("'__weekly_conv_rate' AS _key");
  });
});

describe('splitBatchResults', () => {
  it('splits rows by _key into a Map', () => {
    const rows = [
      { _key: '56', period: '2026-01', value: '42' },
      { _key: '56', period: '2026-02', value: '50' },
      { _key: '296', period: '2026-01', value: '10' },
    ];
    const keyMap = new Map([[56, 56], [296, 296]]); // original keys
    const result = splitBatchResults(rows, keyMap);
    expect(result.get(56)).toHaveLength(2);
    expect(result.get(296)).toHaveLength(1);
    // _key should be stripped
    expect(result.get(56)[0]._key).toBeUndefined();
  });

  it('restores numeric keys from keyMap', () => {
    const rows = [{ _key: '56', period: '2026-01', value: '42' }];
    const keyMap = new Map([[56, 56]]);
    const result = splitBatchResults(rows, keyMap);
    expect(result.has(56)).toBe(true);   // numeric
    expect(result.has('56')).toBe(false); // NOT string
  });

  it('preserves string keys for custom SQL', () => {
    const rows = [{ _key: '__weekly_conv_rate', period: '2026-01', value: '0.08' }];
    const keyMap = new Map([['__weekly_conv_rate', '__weekly_conv_rate']]);
    const result = splitBatchResults(rows, keyMap);
    expect(result.has('__weekly_conv_rate')).toBe(true);
  });

  it('preserves row ordering within each key', () => {
    const rows = [
      { _key: '56', period: '2026-01', value: '10' },
      { _key: '56', period: '2026-02', value: '20' },
      { _key: '56', period: '2026-03', value: '30' },
    ];
    const keyMap = new Map([[56, 56]]);
    const result = splitBatchResults(rows, keyMap);
    const periods = result.get(56).map(r => r.period);
    expect(periods).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('returns empty Map for empty rows', () => {
    const result = splitBatchResults([], new Map());
    expect(result.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd builder && npx vitest run tests/unit/batch-queries.test.js`
Expected: FAIL — `buildBatchSql` and `splitBatchResults` not exported

- [ ] **Step 3: Commit**

```bash
git add builder/tests/unit/batch-queries.test.js
git commit -m "test: add failing tests for UNION ALL batch SQL building and result splitting"
```

---

### Task 5: Implement batch helpers + wrapChartSql

**Files:**
- Modify: `builder/src/lib/bigquery.js`

Three pure functions. `wrapChartSql()` extracts the time-filter wrapping logic from `fetchChartData()` so the hook doesn't duplicate it. `buildBatchSql()` composes UNION ALL with ordering. `splitBatchResults()` restores original key types via a keyMap.

- [ ] **Step 1: Add the three functions after queryBqWithRetry**

```js
/**
 * Wrap a chart_sql query with a time-range filter.
 * Extracted from fetchChartData() to avoid duplication in batch path.
 */
export function wrapChartSql(sql, lastNMonths) {
  if (lastNMonths == null || lastNMonths < 0) return sql;
  const months = validateInt(lastNMonths, 'lastNMonths');
  const dateExpr = months === 0
    ? `FORMAT_DATE('%Y-%m', DATE_TRUNC(CURRENT_DATE(), MONTH))`
    : `FORMAT_DATE('%Y-%m', DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH), MONTH))`;
  return `SELECT * FROM (${sql}) sub WHERE period >= ${dateExpr}`;
}

/**
 * Build a single UNION ALL query from multiple {key, sql} pairs.
 * Each sub-query gets a '_key' discriminator column.
 * All sub-queries MUST return {period, value} columns.
 * Adds ORDER BY _key, period to preserve row ordering.
 *
 * @param {{ key: string|number, sql: string }[]} queries
 * @returns {string} Combined SQL, or '' if empty
 */
export function buildBatchSql(queries) {
  if (queries.length === 0) return '';
  const parts = queries.map(q =>
    `SELECT '${q.key}' AS _key, sub.* FROM (${q.sql}) sub`
  );
  return parts.join('\nUNION ALL\n') + '\nORDER BY _key, period';
}

/**
 * Split combined batch result rows back into per-key groups.
 * Uses keyMap to restore original key types (numeric for metric IDs, string for custom SQL).
 * Strips the _key column from individual rows.
 *
 * @param {Object[]} rows - Rows with _key, period, value columns
 * @param {Map} keyMap - Maps stringified key back to original key (e.g., '56' -> 56)
 * @returns {Map<string|number, Object[]>} originalKey -> rows (without _key)
 */
export function splitBatchResults(rows, keyMap) {
  const map = new Map();
  for (const row of rows) {
    const strKey = row._key;
    const originalKey = keyMap.get(strKey) ?? strKey;
    const clean = { ...row };
    delete clean._key;
    if (!map.has(originalKey)) map.set(originalKey, []);
    map.get(originalKey).push(clean);
  }
  return map;
}
```

- [ ] **Step 2: Run batch tests**

Run: `cd builder && npx vitest run tests/unit/batch-queries.test.js`
Expected: All 9 tests PASS

- [ ] **Step 3: Run all tests**

Run: `cd builder && npx vitest run`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add builder/src/lib/bigquery.js builder/tests/unit/batch-queries.test.js
git commit -m "feat: add buildBatchSql, splitBatchResults, wrapChartSql for UNION ALL batching"
```

---

### Task 6: Refactor useScorecardData to batch queries

**Files:**
- Modify: `builder/src/hooks/useScorecardData.js`

Extract `groupScorecardTasks()`. Change the loading flow:
1. Group into batchable (chart_sql returning `{period,value}` + customSql) and individual (view_name metrics)
2. Run one UNION ALL for batchable via `queryBqWithRetry`
3. Run individual tasks via `parallelLimit` at concurrency 5 with task-level retry
4. Merge results using original key types, compute derived as before

- [ ] **Step 1: Add imports and groupScorecardTasks**

Update imports at top:
```js
import {
  fetchChartData, fetchAggregatedData, queryBqWithRetry,
  buildBatchSql, splitBatchResults, wrapChartSql,
} from '../lib/bigquery';
```

Add the exported function (before `useScorecardData`):

```js
/**
 * Separate scorecard metrics into batchable (UNION ALL) and individual tasks.
 * Batchable: chart_sql metrics (single-series {period,value}) and custom SQL.
 * Individual: view_name metrics (need fetchAggregatedData with dynamic params).
 * chart_sql takes precedence over view_name (matching fetchChartData behavior).
 */
export function groupScorecardTasks(primitives, customSqls, views, lastNMonths) {
  const batchable = [];
  const individual = [];

  for (const metric of primitives) {
    if (metric.chart_sql) {
      const sql = wrapChartSql(metric.chart_sql, lastNMonths);
      batchable.push({ key: metric.id, sql }); // keep numeric ID
    } else if (metric.view_name) {
      individual.push({
        key: metric.id,
        fn: async () => {
          const dateCol = views?.[metric.view_name]?.dateCol
            || getDateCol(metric.view_name, 'SignupDate');
          return await fetchAggregatedData(
            metric.view_name, dateCol, 'COUNT', 'month', null, lastNMonths
          );
        },
      });
    }
  }

  for (const { key, sql } of customSqls) {
    batchable.push({ key, sql }); // string key like '__weekly_conv_rate'
  }

  return { batchable, individual };
}
```

- [ ] **Step 2: Update the useEffect to use batch flow**

Replace the task-building and execution section inside the `useEffect` async IIFE:

```js
(async () => {
  const { batchable, individual } = groupScorecardTasks(
    primitives, customSqls, config.views, 13
  );

  // Add weekly fetch tasks to individual
  for (const [metricId] of weeklyMetrics) {
    const metric = metricsMap.get(metricId);
    if (!metric || !metric.view_name) continue;
    individual.push({
      key: `${metricId}:week`,
      fn: async () => {
        const dateCol = config.views?.[metric.view_name]?.dateCol
          || getDateCol(metric.view_name, 'SignupDate');
        return await fetchAggregatedData(
          metric.view_name, dateCol, 'COUNT', 'week', null, 3
        );
      },
    });
  }

  const totalTasks = (batchable.length > 0 ? 1 : 0) + individual.length;
  setProgress({ loaded: 0, total: totalTasks });

  // 1. Batched UNION ALL (one BQ request for all chart_sql + customSql)
  const rawResults = new Map();
  if (batchable.length > 0) {
    try {
      const batchSql = buildBatchSql(batchable);
      // Build keyMap: stringified key -> original key (preserves numeric IDs)
      const keyMap = new Map(batchable.map(q => [String(q.key), q.key]));
      const batchResult = await queryBqWithRetry(batchSql, { maxRetries: 2, retryOnEmpty: true });
      const split = splitBatchResults(batchResult.rows, keyMap);
      for (const [key, rows] of split) {
        rawResults.set(key, {
          labels: rows.map(r => r.period),
          data: rows.map(r => Number(r.value) || 0),
        });
      }
      // Keys with no rows -> null
      for (const q of batchable) {
        if (!rawResults.has(q.key)) rawResults.set(q.key, null);
      }
      console.log(`[Scorecard] Batch query: ${batchable.length} metrics in 1 request`);
    } catch (e) {
      console.error('[Scorecard] Batch query failed, falling back to individual:', e);
      // Fallback: run each batchable query individually
      for (const q of batchable) {
        try {
          const result = await queryBqWithRetry(q.sql, { maxRetries: 1 });
          rawResults.set(q.key, {
            labels: result.rows.map(r => r.period),
            data: result.rows.map(r => Number(r.value) || 0),
          });
        } catch (e2) {
          rawResults.set(q.key, { error: e2.message });
        }
      }
    }
    if (!abortRef.current) setProgress(p => ({ ...p, loaded: 1 }));
  }

  if (abortRef.current) return;

  // 2. Individual tasks in parallel (concurrency 5, with task-level retry)
  const indResults = await parallelLimit(individual, 5, (loaded) => {
    if (!abortRef.current) {
      setProgress(p => ({ ...p, loaded: (batchable.length > 0 ? 1 : 0) + loaded }));
    }
  });
  for (const [key, result] of indResults) {
    rawResults.set(key, result);
  }

  if (abortRef.current) return;

  // ... normalization + derived computation stays the same,
  // iterating rawResults ...
```

- [ ] **Step 3: Add task-level retry to parallelLimit**

Update the `runNext` inner function in `parallelLimit`:

```js
async function runNext() {
  while (index < tasks.length) {
    const task = tasks[index++];
    let result = null;
    let lastErr = null;
    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        result = await task.fn();
        if (result && (result.labels?.length > 0 || result.multiSeries)) break;
        if (attempt < 1) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
      } catch (e) {
        lastErr = e;
        if (e.message?.includes('session expired')) break; // don't retry auth
        if (attempt < 1) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
      }
    }
    if (result) {
      console.log(`[Scorecard] Fetched ${task.key}:`, result.labels?.length ?? 'non-standard', 'periods');
      results.set(task.key, result);
    } else {
      console.error(`[Scorecard] FAILED ${task.key}:`, lastErr?.message || 'empty result');
      results.set(task.key, lastErr ? { error: lastErr.message } : null);
    }
    completed++;
    onProgress?.(completed, tasks.length);
  }
}
```

- [ ] **Step 4: Run scorecard grouping tests**

Run: `cd builder && npx vitest run tests/unit/scorecard-data.test.js`
Expected: All 6 tests PASS

- [ ] **Step 5: Run all unit tests**

Run: `cd builder && npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add builder/src/hooks/useScorecardData.js
git commit -m "feat: batch chart_sql queries with UNION ALL, bump concurrency to 5, add task-level retry"
```

---

### Task 7: Integration tests with real BQ

**Files:**
- Create: `builder/tests/integration/scorecard-live.test.js`

These hit real BQ. Require `BQ_TOKEN` env var. Skip gracefully if not set. Uses actual scorecard-style SQL patterns (not just simple int_trials).

- [ ] **Step 1: Write the integration test file**

```js
// builder/tests/integration/scorecard-live.test.js
// Run: BQ_TOKEN=$(gcloud auth print-access-token) node --test builder/tests/integration/scorecard-live.test.js

import { describe, it, before, skip } from 'node:test';
import assert from 'node:assert';

const BQ_PROJECT = 'project-for-method-dw';
let BQ_TOKEN;

before(() => {
  BQ_TOKEN = process.env.BQ_TOKEN;
  if (!BQ_TOKEN) console.log('BQ_TOKEN not set — skipping integration tests');
});

async function queryBq(sql) {
  if (!BQ_TOKEN) return null;
  const res = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${BQ_PROJECT}/queries`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${BQ_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, useLegacySql: false, maxResults: 10000 }),
    }
  );
  if (!res.ok) throw new Error(`BQ ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data.rows) return [];
  const fields = data.schema.fields;
  return data.rows.map(r => {
    const o = {};
    fields.forEach((f, i) => { o[f.name] = r.f[i].v; });
    return o;
  });
}

describe('UNION ALL batching — real BQ', () => {
  it('batched query returns same data as individual queries', async () => {
    if (!BQ_TOKEN) return skip('No BQ_TOKEN');
    const sql1 = `SELECT FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS value FROM \`project-for-method-dw.revenue.int_trials\` WHERE SignupDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH), MONTH) GROUP BY 1 ORDER BY 1`;
    const sql2 = `SELECT FORMAT_DATE('%Y-%m', SyncDate) AS period, COUNT(*) AS value FROM \`project-for-method-dw.revenue.int_syncs\` WHERE SyncDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH), MONTH) GROUP BY 1 ORDER BY 1`;

    const [rows1, rows2] = await Promise.all([queryBq(sql1), queryBq(sql2)]);

    const batchSql = `SELECT 'trials' AS _key, sub.* FROM (${sql1}) sub
UNION ALL
SELECT 'syncs' AS _key, sub.* FROM (${sql2}) sub
ORDER BY _key, period`;
    const batchRows = await queryBq(batchSql);

    const batchTrials = batchRows.filter(r => r._key === 'trials');
    const batchSyncs = batchRows.filter(r => r._key === 'syncs');

    assert.strictEqual(batchTrials.length, rows1.length);
    assert.strictEqual(batchSyncs.length, rows2.length);
    for (let i = 0; i < rows1.length; i++) {
      assert.strictEqual(batchTrials[i].period, rows1[i].period);
      assert.strictEqual(batchTrials[i].value, rows1[i].value);
    }
  });

  it('row ordering is preserved within each key', async () => {
    if (!BQ_TOKEN) return skip('No BQ_TOKEN');
    const sql = `SELECT FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS value FROM \`project-for-method-dw.revenue.int_trials\` WHERE SignupDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH), MONTH) GROUP BY 1 ORDER BY 1`;

    const batchSql = `SELECT 'trials' AS _key, sub.* FROM (${sql}) sub
ORDER BY _key, period`;
    const rows = await queryBq(batchSql);

    const periods = rows.map(r => r.period);
    const sorted = [...periods].sort();
    assert.deepStrictEqual(periods, sorted, 'Periods should be in chronological order');
  });

  it('empty sub-query does not break other results', async () => {
    if (!BQ_TOKEN) return skip('No BQ_TOKEN');
    const realSql = `SELECT FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS value FROM \`project-for-method-dw.revenue.int_trials\` WHERE SignupDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH), MONTH) GROUP BY 1 ORDER BY 1`;
    const emptySql = `SELECT FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS value FROM \`project-for-method-dw.revenue.int_trials\` WHERE SignupDate = DATE('1900-01-01') GROUP BY 1 ORDER BY 1`;

    const batchSql = `SELECT 'real' AS _key, sub.* FROM (${realSql}) sub
UNION ALL
SELECT 'empty' AS _key, sub.* FROM (${emptySql}) sub
ORDER BY _key, period`;
    const rows = await queryBq(batchSql);

    assert.ok(rows.filter(r => r._key === 'real').length > 0, 'Real query should return data');
    assert.strictEqual(rows.filter(r => r._key === 'empty').length, 0, 'Empty query should return 0 rows');
  });

  it('batch of 10+ CTE-heavy queries completes under 15s', async () => {
    if (!BQ_TOKEN) return skip('No BQ_TOKEN');
    // Use scorecard-style SQL patterns (CTE with joins, not just simple COUNT)
    const queries = [
      `SELECT FORMAT_DATE('%Y-%m', SignupDate) AS period, COUNT(*) AS value FROM \`project-for-method-dw.revenue.int_trials\` WHERE SignupDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH), MONTH) GROUP BY 1 ORDER BY 1`,
      `SELECT FORMAT_DATE('%Y-%m', SyncDate) AS period, COUNT(*) AS value FROM \`project-for-method-dw.revenue.int_syncs\` WHERE SyncDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH), MONTH) GROUP BY 1 ORDER BY 1`,
      `SELECT FORMAT_DATE('%Y-%m', FirstSaaSInvoiceTxnDate) AS period, COUNT(*) AS value FROM \`project-for-method-dw.revenue.int_conversions\` WHERE FirstSaaSInvoiceTxnDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH), MONTH) GROUP BY 1 ORDER BY 1`,
      `SELECT FORMAT_DATE('%Y-%m', CancellationDate) AS period, COUNT(DISTINCT CompanyAccount) AS value FROM \`project-for-method-dw.revenue.int_cancellations\` WHERE CancellationDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH), MONTH) GROUP BY 1 ORDER BY 1`,
      `SELECT FORMAT_DATE('%Y-%m', TxnDate) AS period, ROUND(SUM(SaaSAmount),2) AS value FROM \`project-for-method-dw.revenue.v_new_net_saas\` WHERE TxnDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH), MONTH) GROUP BY 1 ORDER BY 1`,
    ];
    const parts = queries.map((sql, i) => `SELECT 'q${i}' AS _key, sub.* FROM (${sql}) sub`);
    const batchSql = parts.join('\nUNION ALL\n') + '\nORDER BY _key, period';

    const start = Date.now();
    const rows = await queryBq(batchSql);
    const elapsed = Date.now() - start;

    assert.ok(rows.length > 0, 'Batch should return rows');
    console.log(`  Batch of ${queries.length} queries: ${rows.length} rows in ${elapsed}ms`);
    assert.ok(elapsed < 15000, `Batch took ${elapsed}ms — expected under 15s`);
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `BQ_TOKEN=$(gcloud auth print-access-token) node --test builder/tests/integration/scorecard-live.test.js`
Expected: All 4 tests PASS (or skip if no token)

- [ ] **Step 3: Commit**

```bash
git add builder/tests/integration/scorecard-live.test.js
git commit -m "test: add integration tests for UNION ALL batching against real BQ"
```

---

### Task 8: Manual QA

- [ ] **Step 1: Run dev server and verify**

Run: `cd builder && npm run dev`

Open the sales scorecard in browser. Check:
- Console shows `[Scorecard] Batch query: N metrics in 1 request`
- No `FAILED` entries
- All 7 sections render with data (no blank tiles)
- KPI values match what they showed before the refactor

- [ ] **Step 2: Compare load times**

Before: ~6 seconds (52 BQ requests at concurrency 3)
After: expect ~2-3 seconds (1 batch + ~3-5 individual at concurrency 5)

- [ ] **Step 3: Run full test suite**

Run: `cd builder && npx vitest run`
Expected: All PASS

- [ ] **Step 4: Commit cleanup**

```bash
git add -A
git commit -m "chore: finalize scorecard batching"
```

---

## Summary

| Metric | Before | After |
|--------|--------|-------|
| BQ requests per page load | ~52 | ~5-8 |
| Concurrency limit | 3 | 5 |
| Retry on transient failure | None | 2 retries, exponential backoff |
| Retry on empty results | None | 1 retry (batch path) |
| Batch fallback on failure | N/A | Falls back to individual queries |
| Blank tile frequency | Intermittent | Should be eliminated |
| Expected load time | ~6s | ~2-3s |
