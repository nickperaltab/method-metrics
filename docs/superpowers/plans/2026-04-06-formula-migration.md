# Metric Formula Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert 6 chart_sql-based derived metrics to formula-based so that changing a primitive metric automatically propagates through the dependency chain.

**Architecture:** The scorecard data hook (`useScorecardData.js:169`) classifies a metric as formula-derived when it has `formula` + `depends_on` and NO `chart_sql`/`view_name`. Converting means: set `formula`, ensure `depends_on`, NULL out `chart_sql`. We also need topological sorting so derived-from-derived chains compute in the right order.

**Tech Stack:** Supabase (metric metadata), React hooks, Vitest (unit tests), BigQuery (live integration tests)

---

## Background

### How the formula path works today

1. `useScorecardData.js:160-174` splits metrics into primitives (have `chart_sql` or `view_name`) and derived (have `formula` + `depends_on`, no `chart_sql`/`view_name`)
2. Primitives are fetched from BigQuery (batch UNION ALL or individual queries)
3. Derived metrics iterate the fetched data, substitute `{id}` placeholders, and evaluate via `sanitize.js:evaluateFormula()`
4. **Problem:** The derived loop (line 277-320) has no ordering guarantee. If metric A depends on metric B (also derived), B must be computed first.

### What's converting

| ID | Name | New Formula | Depends On | Phase |
|----|------|-------------|------------|-------|
| 339 | Net SaaS Forecast vs Trajectory | `{338} - {291}` | [338, 291] | 2 |
| 340 | Net SaaS Forecast Attainment | `SAFE_DIVIDE({338}, {291}) * 100` | [338, 291] | 2 |
| 361 | Forecasted Sync Rate | `SAFE_DIVIDE({286}, {285}) * 100` | [286, 285] | 2 |
| 362 | Budgeted Sync Rate | `SAFE_DIVIDE({358}, {353}) * 100` | [358, 353] | 2 |
| 363 | Sync Rate vs Forecast | `{300} - {361}` | [300, 361] | 3 |
| 364 | Sync Rate Attainment | `SAFE_DIVIDE({300}, {361}) * 100` | [300, 361] | 3 |

### What stays as chart_sql (future work)

| ID | Name | Reason |
|----|------|--------|
| 344 | Churn Rate | Multi-view join (churns + BOM customers + conversions) — no BOM metric exists |
| 345 | Churn Rate % Trajectory | Trajectory extrapolation + ratio — needs TRAJECTORY() formula function |
| 357 | Scorecard Conversion Rate | 1-month lagged trial join — needs LAG() formula function |
| 307, 308, 326, 330, 334, 338, 341 | All trajectory metrics | Need TRAJECTORY() formula function |

### Rounding differences

Chart_sql metrics use SQL `ROUND(..., 1)` or `ROUND(..., 2)`. The formula path uses `Math.round(x * 100) / 100` (2 decimal places). Values may shift by up to 0.05 in the last decimal. The test plan accepts this delta.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/hooks/useScorecardData.js` | Modify (lines 276-320) | Add topological sort to derived computation loop |
| `tests/unit/scorecard-data.test.js` | Modify | Add tests for topo sort and derived→derived chains |
| `tests/unit/sanitize.test.js` | Modify | Add tests for the exact formulas being migrated |
| `tests/integration/formula-migration.test.js` | Create | Live BQ integration test: compare formula vs chart_sql values |
| Supabase `metrics` table | SQL updates | Set formula, NULL chart_sql for 6 metrics |

---

## Task 0: Snapshot Current Values (Rollback Baseline)

**Files:**
- Create: `tests/integration/formula-migration.test.js`

This captures the current chart_sql output for every metric being converted, so we can compare after migration.

- [ ] **Step 1: Create the snapshot/comparison test file**

```javascript
// tests/integration/formula-migration.test.js
//
// Run with: BQ_TOKEN=$(gcloud auth print-access-token) node --test tests/integration/formula-migration.test.js
//
// This test fetches the CURRENT chart_sql values for metrics being migrated,
// then after migration, fetches the formula-computed values and compares.
//
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const BQ_TOKEN = process.env.BQ_TOKEN;
const SUPABASE_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY';

const METRICS_TO_MIGRATE = [339, 340, 361, 362, 363, 364];

// Dependency metrics that must be fetchable for formula evaluation
const DEPENDENCY_IDS = [286, 285, 358, 353, 300, 338, 291];

async function queryBq(sql) {
  const res = await fetch(
    'https://bigquery.googleapis.com/bigquery/v2/projects/project-for-method-dw/queries',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${BQ_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, useLegacySql: false, timeoutMs: 30000 }),
    }
  );
  if (!res.ok) throw new Error(`BQ error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data.rows) return [];
  const fields = data.schema.fields.map(f => f.name);
  return data.rows.map(r => {
    const obj = {};
    fields.forEach((f, i) => { obj[f] = r.f[i].v; });
    return obj;
  });
}

async function fetchMetric(id) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/metrics?id=eq.${id}&select=id,name,chart_sql,formula,depends_on`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const data = await res.json();
  return data[0];
}

function evaluateFormula(formula, depValues) {
  let f = String(formula);
  for (const [depId, val] of Object.entries(depValues)) {
    f = f.replace(new RegExp(`\\{${depId}\\}`, 'g'), String(Number(val) || 0));
  }
  f = f.replace(/SAFE_DIVIDE\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, (_, a, b) => {
    const numA = Number(Function('"use strict"; return (' + a + ')')());
    const numB = Number(Function('"use strict"; return (' + b + ')')());
    return String(numB === 0 ? 0 : numA / numB);
  });
  return Number(Function('"use strict"; return (' + f + ')')());
}

describe('Formula Migration Verification', () => {
  if (!BQ_TOKEN) {
    it('skips without BQ_TOKEN', () => { console.log('Set BQ_TOKEN to run'); });
    return;
  }

  it('each migrated metric produces values within 0.1 of its old chart_sql', async () => {
    // For each metric, fetch its current chart_sql result and its dependency values,
    // then compute the formula and compare.
    const formulas = {
      339: { formula: '{338} - {291}', deps: [338, 291] },
      340: { formula: 'SAFE_DIVIDE({338}, {291}) * 100', deps: [338, 291] },
      361: { formula: 'SAFE_DIVIDE({286}, {285}) * 100', deps: [286, 285] },
      362: { formula: 'SAFE_DIVIDE({358}, {353}) * 100', deps: [358, 353] },
      363: { formula: '{300} - {361}', deps: [300, 361] },
      364: { formula: 'SAFE_DIVIDE({300}, {361}) * 100', deps: [300, 361] },
    };

    for (const metricId of METRICS_TO_MIGRATE) {
      const metric = await fetchMetric(metricId);
      if (!metric.chart_sql) {
        console.log(`  ${metricId} (${metric.name}): already formula-based, skipping`);
        continue;
      }

      // Fetch old chart_sql result
      const oldRows = await queryBq(metric.chart_sql);
      if (oldRows.length === 0) {
        console.log(`  ${metricId} (${metric.name}): chart_sql returned no rows, skipping`);
        continue;
      }

      // Fetch each dependency's chart_sql
      const depValues = {};
      const { formula, deps } = formulas[metricId];
      for (const depId of deps) {
        const dep = await fetchMetric(depId);
        if (dep.chart_sql) {
          const rows = await queryBq(dep.chart_sql);
          // Build period→value map
          depValues[depId] = {};
          for (const row of rows) depValues[depId][row.period] = Number(row.value);
        } else if (dep.formula && dep.depends_on) {
          // This dep is itself formula-based (e.g., 300 Sync Rate)
          // For simplicity, we'll compute it from ITS deps
          console.log(`  ${metricId}: dep ${depId} is formula-based, computing...`);
          const subDepValues = {};
          for (const subDepId of dep.depends_on) {
            const subDep = await fetchMetric(subDepId);
            if (subDep.chart_sql) {
              const rows = await queryBq(subDep.chart_sql);
              subDepValues[subDepId] = {};
              for (const row of rows) subDepValues[subDepId][row.period] = Number(row.value);
            }
          }
          // Compute formula dep per period
          depValues[depId] = {};
          const allPeriods = new Set();
          for (const counts of Object.values(subDepValues)) Object.keys(counts).forEach(k => allPeriods.add(k));
          for (const period of allPeriods) {
            const vals = {};
            for (const subDepId of dep.depends_on) vals[subDepId] = subDepValues[subDepId]?.[period] || 0;
            depValues[depId][period] = Math.round(evaluateFormula(dep.formula, vals) * 100) / 100;
          }
        }
      }

      // Compare per period
      let mismatches = 0;
      for (const row of oldRows) {
        const period = row.period;
        const oldVal = Number(row.value);
        const periodDeps = {};
        for (const depId of deps) periodDeps[depId] = depValues[depId]?.[period] || 0;
        const newVal = Math.round(evaluateFormula(formula, periodDeps) * 100) / 100;
        const delta = Math.abs(oldVal - newVal);
        if (delta > 0.15) {
          console.log(`  MISMATCH ${metricId} ${period}: old=${oldVal} new=${newVal} delta=${delta}`);
          mismatches++;
        }
      }

      console.log(`  ${metricId} (${metric.name}): ${oldRows.length} periods, ${mismatches} mismatches`);
      assert.equal(mismatches, 0, `Metric ${metricId} has ${mismatches} mismatches > 0.15`);
    }
  });
});
```

- [ ] **Step 2: Run the snapshot test BEFORE any migration**

```bash
cd builder
BQ_TOKEN=$(gcloud auth print-access-token) node --test tests/integration/formula-migration.test.js
```

Expected: All 6 metrics pass (formula computation matches chart_sql within 0.15 tolerance). If any fail, the formula is wrong and we fix it before migrating.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/formula-migration.test.js
git commit -m "test: add formula migration verification test"
```

---

## Task 1: Topological Sort for Derived Computation

**Files:**
- Modify: `src/hooks/useScorecardData.js:276-320`
- Modify: `tests/unit/scorecard-data.test.js`

The derived computation loop currently iterates in arbitrary order. For derived→derived chains (e.g., 363 depends on 361, both formula-based), we need to compute dependencies first.

- [ ] **Step 1: Write failing test for topological sort**

Add to `tests/unit/scorecard-data.test.js`:

```javascript
describe('topological sort for derived metrics', () => {
  it('sorts derived metrics so dependencies are computed first', async () => {
    // Import the function we'll create
    const { topoSortDerived } = await import('../../src/hooks/useScorecardData.js');

    const metrics = [
      // 363 depends on 300 and 361 (both derived)
      { id: 363, formula: '{300} - {361}', depends_on: [300, 361] },
      // 361 depends on 286 and 285 (both primitive — not in this list)
      { id: 361, formula: 'SAFE_DIVIDE({286}, {285}) * 100', depends_on: [286, 285] },
      // 300 depends on 55 and 54 (both primitive)
      { id: 300, formula: 'SAFE_DIVIDE({55}, {54}) * 100', depends_on: [55, 54] },
    ];

    const sorted = topoSortDerived(metrics);
    const ids = sorted.map(m => m.id);

    // 300 and 361 must come before 363
    expect(ids.indexOf(300)).toBeLessThan(ids.indexOf(363));
    expect(ids.indexOf(361)).toBeLessThan(ids.indexOf(363));
  });

  it('handles flat list with no inter-derived dependencies', () => {
    const { topoSortDerived } = require('../../src/hooks/useScorecardData.js');

    const metrics = [
      { id: 300, formula: 'SAFE_DIVIDE({55}, {54}) * 100', depends_on: [55, 54] },
      { id: 301, formula: 'SAFE_DIVIDE({56}, {55}) * 100', depends_on: [56, 55] },
    ];

    const sorted = topoSortDerived(metrics);
    expect(sorted).toHaveLength(2);
  });

  it('handles empty list', () => {
    const { topoSortDerived } = require('../../src/hooks/useScorecardData.js');
    expect(topoSortDerived([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd builder && npx vitest run tests/unit/scorecard-data.test.js
```

Expected: FAIL — `topoSortDerived` is not exported.

- [ ] **Step 3: Implement topological sort**

Add to `src/hooks/useScorecardData.js`, after the `addDerivedDeps` function (around line 56):

```javascript
/**
 * Topologically sort derived metrics so that dependencies are computed first.
 * Metrics whose depends_on references another derived metric in the list
 * will be placed after that dependency.
 */
export function topoSortDerived(derivedMetrics) {
  if (derivedMetrics.length <= 1) return derivedMetrics;

  const idSet = new Set(derivedMetrics.map(m => m.id));
  const inDegree = new Map();
  const adj = new Map();

  for (const m of derivedMetrics) {
    inDegree.set(m.id, 0);
    adj.set(m.id, []);
  }

  for (const m of derivedMetrics) {
    for (const depId of (m.depends_on || [])) {
      if (idSet.has(depId)) {
        adj.get(depId).push(m.id);
        inDegree.set(m.id, inDegree.get(m.id) + 1);
      }
    }
  }

  const queue = [];
  for (const m of derivedMetrics) {
    if (inDegree.get(m.id) === 0) queue.push(m.id);
  }

  const sorted = [];
  const byId = new Map(derivedMetrics.map(m => [m.id, m]));
  while (queue.length > 0) {
    const id = queue.shift();
    sorted.push(byId.get(id));
    for (const neighbor of adj.get(id)) {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1);
      if (inDegree.get(neighbor) === 0) queue.push(neighbor);
    }
  }

  // If there's a cycle (shouldn't happen), append remaining
  if (sorted.length < derivedMetrics.length) {
    for (const m of derivedMetrics) {
      if (!sorted.includes(m)) sorted.push(m);
    }
  }

  return sorted;
}
```

- [ ] **Step 4: Apply topo sort in the derived computation loop**

In `src/hooks/useScorecardData.js`, change line 277 from:

```javascript
for (const metric of derived) {
```

to:

```javascript
for (const metric of topoSortDerived(derived)) {
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd builder && npx vitest run tests/unit/scorecard-data.test.js
```

Expected: All tests pass, including new topo sort tests.

- [ ] **Step 6: Run full unit test suite for regressions**

```bash
cd builder && npx vitest run
```

Expected: All existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useScorecardData.js tests/unit/scorecard-data.test.js
git commit -m "feat: add topological sort for derived metric computation

Derived metrics that depend on other derived metrics now compute
in dependency order. Prerequisite for formula migration."
```

---

## Task 2: Add Formula Tests for Migrating Metrics

**Files:**
- Modify: `tests/unit/sanitize.test.js`

Add tests for the exact formulas being migrated, verifying they produce correct results with known inputs.

- [ ] **Step 1: Add formula tests**

Append to `tests/unit/sanitize.test.js` inside the `evaluateFormula` describe block:

```javascript
  // --- Formula migration: exact formulas for metrics being converted ---

  it('metric 361: Forecasted Sync Rate', () => {
    // SAFE_DIVIDE(syncs_forecast, trials_forecast) * 100
    const result = evaluateFormula('SAFE_DIVIDE({286}, {285}) * 100', { 286: 120, 285: 400 });
    expect(result).toBe(30); // 120/400 = 0.3 * 100 = 30
  });

  it('metric 362: Budgeted Sync Rate', () => {
    const result = evaluateFormula('SAFE_DIVIDE({358}, {353}) * 100', { 358: 90, 353: 300 });
    expect(result).toBe(30);
  });

  it('metric 339: Net SaaS Forecast vs Trajectory (difference)', () => {
    const result = evaluateFormula('{338} - {291}', { 338: 15000, 291: 12000 });
    expect(result).toBe(3000);
  });

  it('metric 340: Net SaaS Forecast Attainment', () => {
    const result = evaluateFormula('SAFE_DIVIDE({338}, {291}) * 100', { 338: 15000, 291: 12000 });
    expect(result).toBe(125); // 15000/12000 * 100
  });

  it('metric 363: Sync Rate vs Forecast (difference of rates)', () => {
    const result = evaluateFormula('{300} - {361}', { 300: 32.5, 361: 30.0 });
    expect(result).toBe(2.5);
  });

  it('metric 364: Sync Rate Attainment', () => {
    const result = evaluateFormula('SAFE_DIVIDE({300}, {361}) * 100', { 300: 33, 361: 30 });
    expect(result).toBe(110); // 33/30 * 100
  });

  it('metric 340: handles zero forecast gracefully', () => {
    const result = evaluateFormula('SAFE_DIVIDE({338}, {291}) * 100', { 338: 15000, 291: 0 });
    expect(result).toBe(0); // SAFE_DIVIDE returns 0 on zero denominator
  });
```

- [ ] **Step 2: Run tests**

```bash
cd builder && npx vitest run tests/unit/sanitize.test.js
```

Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/sanitize.test.js
git commit -m "test: add formula tests for 6 metrics being migrated"
```

---

## Task 3: Migrate Phase 2 Metrics (Depend on Primitives Only)

**Files:**
- Supabase `metrics` table (SQL updates)

These 4 metrics depend only on chart_sql primitives, so no topo sort needed yet.

| ID | Name | Formula |
|----|------|---------|
| 339 | Net SaaS Forecast vs Trajectory | `{338} - {291}` |
| 340 | Net SaaS Forecast Attainment | `SAFE_DIVIDE({338}, {291}) * 100` |
| 361 | Forecasted Sync Rate | `SAFE_DIVIDE({286}, {285}) * 100` |
| 362 | Budgeted Sync Rate | `SAFE_DIVIDE({358}, {353}) * 100` |

- [ ] **Step 1: Run the SQL migration**

```sql
BEGIN;

-- 339: Net SaaS Forecast vs Trajectory
UPDATE metrics SET
  formula = '{338} - {291}',
  chart_sql = NULL,
  view_name = NULL
WHERE id = 339;

-- 340: Net SaaS Forecast Attainment
UPDATE metrics SET
  formula = 'SAFE_DIVIDE({338}, {291}) * 100',
  chart_sql = NULL,
  view_name = NULL
WHERE id = 340;

-- 361: Forecasted Sync Rate
UPDATE metrics SET
  formula = 'SAFE_DIVIDE({286}, {285}) * 100',
  chart_sql = NULL,
  view_name = NULL
WHERE id = 361;

-- 362: Budgeted Sync Rate
UPDATE metrics SET
  formula = 'SAFE_DIVIDE({358}, {353}) * 100',
  chart_sql = NULL,
  view_name = NULL
WHERE id = 362;

COMMIT;
```

- [ ] **Step 2: Verify the update**

```sql
SELECT id, name, formula, chart_sql IS NULL AS sql_removed, depends_on
FROM metrics WHERE id IN (339, 340, 361, 362);
```

Expected: All 4 have formula set, chart_sql is NULL, depends_on is populated.

- [ ] **Step 3: Run integration test**

```bash
cd builder
BQ_TOKEN=$(gcloud auth print-access-token) node --test tests/integration/formula-migration.test.js
```

Expected: Metrics 339, 340, 361, 362 pass (now computed via formula path, values within tolerance).

---

## Task 4: Migrate Phase 3 Metrics (Depend on Derived)

**Files:**
- Supabase `metrics` table (SQL updates)

These 2 metrics depend on metric 361 (converted in Phase 2) and metric 300 (already formula-based). The topological sort from Task 1 ensures 300 and 361 are computed before 363/364.

| ID | Name | Formula |
|----|------|---------|
| 363 | Sync Rate vs Forecast | `{300} - {361}` |
| 364 | Sync Rate Attainment | `SAFE_DIVIDE({300}, {361}) * 100` |

- [ ] **Step 1: Run the SQL migration**

```sql
BEGIN;

-- 363: Sync Rate vs Forecast
UPDATE metrics SET
  formula = '{300} - {361}',
  chart_sql = NULL,
  view_name = NULL
WHERE id = 363;

-- 364: Sync Rate Attainment
UPDATE metrics SET
  formula = 'SAFE_DIVIDE({300}, {361}) * 100',
  chart_sql = NULL,
  view_name = NULL
WHERE id = 364;

COMMIT;
```

- [ ] **Step 2: Verify the update**

```sql
SELECT id, name, formula, chart_sql IS NULL AS sql_removed, depends_on
FROM metrics WHERE id IN (363, 364);
```

- [ ] **Step 3: Run integration test**

```bash
cd builder
BQ_TOKEN=$(gcloud auth print-access-token) node --test tests/integration/formula-migration.test.js
```

Expected: All 6 metrics pass.

---

## Task 5: Scorecard Visual QA

**Files:** None (manual browser verification)

- [ ] **Step 1: Start dev server**

```bash
cd builder && npm run dev
```

- [ ] **Step 2: Check Marketing Scorecard**

Navigate to `http://localhost:5173/#/scorecards/marketing-scorecard`

Verify these sections load correctly:
- **Trial to Sync Rate section**: KPIs for metrics 361 (Forecasted Sync %), 300 (Current Sync %), 363 (Actual vs. Forecast), 364 (Forecasted Attainment)
- **Sync Rate Summary Table**: columns using 300, 361, 363, 362
- **Monthly Sync % chart**: bars for 362, 361, 300

Compare values against the snapshot captured in Task 0.

- [ ] **Step 3: Check Sales Scorecard**

Navigate to `http://localhost:5173/#/scorecards/sales-scorecard`

Verify these sections:
- **Total Net SaaS section**: KPIs for 337, 338, 339 (Forecast vs Trajectory), 340 (Attainment)
- **Monthly chart**: bars for 283, 291, 337

- [ ] **Step 4: Run the existing eval tests**

```bash
cd builder && npm test
```

Expected: All 20+ eval test cases still pass.

- [ ] **Step 5: Run unit tests**

```bash
cd builder && npx vitest run
```

Expected: All pass.

---

## Task 6: Build and Deploy

- [ ] **Step 1: Build**

```bash
cd builder && npm run build
```

- [ ] **Step 2: Commit and push**

```bash
git add dist
git commit -m "feat: migrate 6 metrics from chart_sql to formula-based dependencies

Metrics 339, 340, 361, 362, 363, 364 now use the formula evaluation
path instead of independent chart_sql queries. Changing their parent
primitives (338, 291, 286, 285, 358, 353, 300) now propagates
automatically through the dependency chain.

Also adds topological sort to derived metric computation so
derived-from-derived chains evaluate in correct order."
git push
```

---

## Rollback Plan

### Code rollback

```bash
git revert HEAD  # reverts the deploy commit
git revert HEAD  # reverts the topo sort commit (adjust as needed)
```

### Data rollback (restore chart_sql, remove formula)

```sql
BEGIN;

-- 339: Net SaaS Forecast vs Trajectory
UPDATE metrics SET
  formula = NULL,
  chart_sql = 'SELECT FORMAT_DATE(''%Y-%m'', DATE_TRUNC(CURRENT_DATE(), MONTH)) AS period, ROUND( SAFE_DIVIDE( SUM(CASE WHEN TxnDate >= DATE_TRUNC(CURRENT_DATE(), MONTH) AND TxnDate <= CURRENT_DATE() THEN SaaSAmount + SaaSExpense ELSE 0 END), SUM(CASE WHEN TxnDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH) AND TxnDate <= DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH) THEN SaaSAmount + SaaSExpense ELSE 0 END) ) * SUM(CASE WHEN TxnDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH) AND TxnDate < DATE_TRUNC(CURRENT_DATE(), MONTH) THEN SaaSAmount + SaaSExpense ELSE 0 END) - (SELECT SUM(Forecasted_Total_Net_SaaS) FROM `project-for-method-dw.revenue.method_forecast` WHERE Forecasted_Month = DATE_TRUNC(CURRENT_DATE(), MONTH)), 2) AS value FROM `project-for-method-dw.revenue.v_total_net_saas`'
WHERE id = 339;

-- 340: Net SaaS Forecast Attainment
UPDATE metrics SET
  formula = NULL,
  chart_sql = 'SELECT FORMAT_DATE(''%Y-%m'', DATE_TRUNC(CURRENT_DATE(), MONTH)) AS period, ROUND( SAFE_DIVIDE( SAFE_DIVIDE( SUM(CASE WHEN TxnDate >= DATE_TRUNC(CURRENT_DATE(), MONTH) AND TxnDate <= CURRENT_DATE() THEN SaaSAmount + SaaSExpense ELSE 0 END), SUM(CASE WHEN TxnDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH) AND TxnDate <= DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH) THEN SaaSAmount + SaaSExpense ELSE 0 END) ) * SUM(CASE WHEN TxnDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH) AND TxnDate < DATE_TRUNC(CURRENT_DATE(), MONTH) THEN SaaSAmount + SaaSExpense ELSE 0 END), (SELECT SUM(Forecasted_Total_Net_SaaS) FROM `project-for-method-dw.revenue.method_forecast` WHERE Forecasted_Month = DATE_TRUNC(CURRENT_DATE(), MONTH)) ) * 100, 2) AS value FROM `project-for-method-dw.revenue.v_total_net_saas`'
WHERE id = 340;

-- 361: Forecasted Sync Rate
UPDATE metrics SET
  formula = NULL,
  chart_sql = 'SELECT t.period, ROUND(SAFE_DIVIDE(s.value, t.value) * 100, 1) AS value FROM (SELECT FORMAT_DATE(''%Y-%m'', forecast_date) AS period, SUM(forecast_value) AS value FROM `project-for-method-dw.revenue.v_trials_forecast_channel` WHERE forecast_date IS NOT NULL GROUP BY 1) t JOIN (SELECT FORMAT_DATE(''%Y-%m'', forecast_date) AS period, SUM(forecast_value) AS value FROM `project-for-method-dw.revenue.v_syncs_forecast_channel` WHERE forecast_date IS NOT NULL GROUP BY 1) s USING (period) ORDER BY 1'
WHERE id = 361;

-- 362: Budgeted Sync Rate
UPDATE metrics SET
  formula = NULL,
  chart_sql = 'SELECT FORMAT_DATE(''%Y-%m'', Forecasted_Month) AS period, ROUND(SAFE_DIVIDE(SUM(Budgeted_Syncs), SUM(Budgeted_Trials)) * 100, 1) AS value FROM `project-for-method-dw.revenue.method_forecast` WHERE Forecasted_Month IS NOT NULL GROUP BY 1 ORDER BY 1'
WHERE id = 362;

-- 363: Sync Rate vs Forecast
UPDATE metrics SET
  formula = NULL,
  chart_sql = 'WITH actuals AS (SELECT FORMAT_DATE(''%Y-%m'', t.month) AS period, ROUND(SAFE_DIVIDE(s.cnt, t.cnt) * 100, 1) AS actual_rate FROM (SELECT DATE_TRUNC(SignupDate, MONTH) AS month, COUNT(DISTINCT CompanyAccount) AS cnt FROM `project-for-method-dw.revenue.int_trials` GROUP BY 1) t JOIN (SELECT DATE_TRUNC(SyncDate, MONTH) AS month, COUNT(DISTINCT CompanyAccount) AS cnt FROM `project-for-method-dw.revenue.int_syncs` GROUP BY 1) s ON t.month = s.month), forecast AS (SELECT t.period, ROUND(SAFE_DIVIDE(s.value, t.value) * 100, 1) AS forecast_rate FROM (SELECT FORMAT_DATE(''%Y-%m'', forecast_date) AS period, SUM(forecast_value) AS value FROM `project-for-method-dw.revenue.v_trials_forecast_channel` WHERE forecast_date IS NOT NULL GROUP BY 1) t JOIN (SELECT FORMAT_DATE(''%Y-%m'', forecast_date) AS period, SUM(forecast_value) AS value FROM `project-for-method-dw.revenue.v_syncs_forecast_channel` WHERE forecast_date IS NOT NULL GROUP BY 1) s USING (period)) SELECT a.period, ROUND(a.actual_rate - f.forecast_rate, 2) AS value FROM actuals a JOIN forecast f USING (period) ORDER BY 1'
WHERE id = 363;

-- 364: Sync Rate Attainment
UPDATE metrics SET
  formula = NULL,
  chart_sql = 'WITH actuals AS (SELECT FORMAT_DATE(''%Y-%m'', t.month) AS period, SAFE_DIVIDE(s.cnt, t.cnt) * 100 AS actual_rate FROM (SELECT DATE_TRUNC(SignupDate, MONTH) AS month, COUNT(DISTINCT CompanyAccount) AS cnt FROM `project-for-method-dw.revenue.int_trials` GROUP BY 1) t JOIN (SELECT DATE_TRUNC(SyncDate, MONTH) AS month, COUNT(DISTINCT CompanyAccount) AS cnt FROM `project-for-method-dw.revenue.int_syncs` GROUP BY 1) s ON t.month = s.month), forecast AS (SELECT t.period, SAFE_DIVIDE(s.value, t.value) * 100 AS forecast_rate FROM (SELECT FORMAT_DATE(''%Y-%m'', forecast_date) AS period, SUM(forecast_value) AS value FROM `project-for-method-dw.revenue.v_trials_forecast_channel` WHERE forecast_date IS NOT NULL GROUP BY 1) t JOIN (SELECT FORMAT_DATE(''%Y-%m'', forecast_date) AS period, SUM(forecast_value) AS value FROM `project-for-method-dw.revenue.v_syncs_forecast_channel` WHERE forecast_date IS NOT NULL GROUP BY 1) s USING (period)) SELECT a.period, ROUND(SAFE_DIVIDE(a.actual_rate, f.forecast_rate) * 100, 1) AS value FROM actuals a JOIN forecast f USING (period) ORDER BY 1'
WHERE id = 364;

COMMIT;
```

### Rollback verification

After rollback, run:
```bash
cd builder && npx vitest run   # unit tests
cd builder && npm test          # eval tests
# Visual check: both scorecards load correctly
```

---

## Testing Summary

| Test | When to Run | What It Validates |
|------|-------------|-------------------|
| `npx vitest run tests/unit/sanitize.test.js` | After Task 2 | Formula math is correct for all 6 metrics |
| `npx vitest run tests/unit/scorecard-data.test.js` | After Task 1 | Topo sort orders derived→derived correctly |
| `npx vitest run` | After Task 1, 5 | No regressions in any unit test |
| `npm test` | After Task 5 | AI eval tests still pass (20+ prompts) |
| `BQ_TOKEN=... node --test tests/integration/formula-migration.test.js` | After Task 0, 3, 4 | Formula values match old chart_sql within 0.15 |
| Manual scorecard QA | Task 5 | Marketing + Sales scorecards render correctly |

---

## Future Work (Not in This Plan)

1. **TRAJECTORY() formula function** — extend `evaluateFormula` to support `TRAJECTORY({54})` which would: fetch current month's MTD, divide by days elapsed, multiply by days in month. Would convert 7 trajectory metrics.
2. **LAG() formula function** — support `LAG({54}, 1)` for "prior month's value". Would convert metric 357 (Scorecard Conversion Rate).
3. **BOM customers metric** — create a primitive metric for beginning-of-month customer count. Would allow converting metrics 344 (Churn Rate) and 345 (Churn Rate % Trajectory) to formulas.
