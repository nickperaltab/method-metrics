# Customers Primitive Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse metrics 374–377 into metric 373 + `Segment` dimension, backed by a new BQ view `v_customers` at `Month × EntityRecordID` grain, while preserving every number shown on the current `customer-segments-scorecard`.

**Architecture:** One primitive (`Customers` / metric 373) with seven semantic dimensions (`Segment`, `UserTier`, `HasDEP`, plus the four standard dims) on a new view `v_customers`. The scorecard uses `groupByDimension: 'Segment'` for charts and a new per-tile `dimensionFilter` for KPI tiles. Small engine extension to the scorecard query planner and `KpiColumn` to handle dim-filtered KPIs. No GRR/MRR this round — the view shape is designed so GRR drops in as new primitives on the same view later.

**Tech Stack:** BigQuery views (`project-for-method-dw.revenue.*`), Supabase REST (metrics registry), React/Vanilla JS frontend (`builder/src/…`), vitest unit tests (`npm run test:unit`), GitHub Pages auto-deploy on push to `main`.

**Design spec:** `docs/superpowers/specs/2026-04-22-customers-primitive-refactor-design.md`

---

## File Map

**Create:**
- (BigQuery) `project-for-method-dw.revenue.v_customers` — new view
- `builder/tests/unit/kpi-dimension-filter.test.js` — new unit test file

**Modify:**
- `builder/src/lib/sql/plan.js` — extend `collectMetricIds` to pick up KPI `dimensionFilter`
- `builder/src/components/scorecards/KpiColumn.jsx` — read grouped series when `dimensionFilter` set
- `builder/src/config/scorecards/customer-segments-scorecard.js` — rewire all metric references to 373 + `dimensionFilter`
- (Supabase row) `metrics.id=373` — update view/table/filters/dimensions, clear `verified_at`
- (Supabase rows) `metrics.id=374,375,376,377` — status → `queued`, rename suffix
- (BigQuery, final step) `v_customer_segments` — replace definition with `SELECT * FROM v_customers` alias
- `docs/semantic-layer.md` — document the earliest-signup entity-rollup caveat

**Untouched (verify during QA, don't edit):**
- `builder/src/components/scorecards/Chart.jsx` — already handles grouped series at line 312
- `builder/src/lib/bigquery.js` `buildSemanticGroupedSql` — no change needed
- `builder/src/components/scorecards/utils.js` `computeDelta` — operates on `{period, value}` pairs, works against the filtered grouped series unchanged
- `customers-scorecard.js` (account-grain, different purpose)

---

## Ordering Rationale

Engine extension (Tasks 1–6) lands **first**, before any BQ or Supabase changes. This keeps the risky data changes behind a fully-tested engine. If the engine work breaks a build, it's a pure-JS revert with zero data impact. Once the engine is green, we do the BQ view + parity gate (7–9), then Supabase updates (10–11), then the scorecard rewrite (12), then QA + deploy (13–15), then alias (16), then semantic-layer doc update (17).

---

## Task 1: Add KPI `dimensionFilter` support to query planner — failing test

**Files:**
- Modify: `builder/tests/unit/sql-plan.test.js`

- [ ] **Step 1: Add failing test case**

Append to `builder/tests/unit/sql-plan.test.js` inside the `describe('collectMetricIds', ...)` block:

```js
  it('captures grouped fetch need from KPI dimensionFilter', () => {
    const out = collectMetricIds({
      sections: [{
        kpis: [
          { metricId: 373, label: 'Total' },
          { metricId: 373, label: 'Solo', dimensionFilter: { Segment: 'Solo no DEP' } },
          { metricId: 373, label: 'Team AI+', dimensionFilter: { Segment: 'Team AI Plus' } },
        ],
      }],
    });
    // One grouped entry per distinct (metricId, dimension) pair, regardless of how many tiles filter on it
    expect(out.groupedCharts).toContainEqual({ metricId: 373, dimension: 'Segment', lastNMonths: 13 });
    expect(out.groupedCharts.filter(g => g.metricId === 373 && g.dimension === 'Segment')).toHaveLength(1);
  });

  it('coalesces KPI dimensionFilter with chart groupByDimension on the same metric+dim', () => {
    const out = collectMetricIds({
      sections: [{
        kpis: [{ metricId: 373, dimensionFilter: { Segment: 'Solo no DEP' } }],
        charts: [{ groupByDimension: 'Segment', metrics: [{ id: 373 }] }],
      }],
    });
    expect(out.groupedCharts.filter(g => g.metricId === 373 && g.dimension === 'Segment')).toHaveLength(1);
  });
```

- [ ] **Step 2: Run test — expect fail**

```bash
cd builder && npm run test:unit -- tests/unit/sql-plan.test.js
```

Expected: two new tests FAIL (the collector doesn't yet look at `kpi.dimensionFilter`).

---

## Task 2: Extend `collectMetricIds` to pick up KPI `dimensionFilter`

**Files:**
- Modify: `builder/src/lib/sql/plan.js:31-67`

- [ ] **Step 1: Patch the KPI loop inside `collectMetricIds`**

In `builder/src/lib/sql/plan.js`, replace the existing KPI-collection loop body so the function adds a grouped-chart entry whenever a KPI has `dimensionFilter`. The relevant section (around line 37) currently reads:

```js
    for (const kpi of section.kpis || []) {
      if (typeof kpi.metricId === 'number') ids.add(kpi.metricId);
    }
```

Replace with:

```js
    for (const kpi of section.kpis || []) {
      if (typeof kpi.metricId !== 'number') continue;
      ids.add(kpi.metricId);
      if (kpi.dimensionFilter && typeof kpi.dimensionFilter === 'object') {
        for (const dim of Object.keys(kpi.dimensionFilter)) {
          groupedCharts.push({
            metricId: kpi.metricId,
            dimension: dim,
            lastNMonths: section.lastNMonths ?? 13,
          });
        }
      }
    }
```

- [ ] **Step 2: Dedupe `groupedCharts` at the end of the function**

The query builder (`buildScorecardQueryPlan`, same file, line ~175) already uses `expectedKeys.add(key)` which naturally dedupes by (`metricId`, `dimension`). But it still emits a duplicate query per entry because the `for (const g of c.groupedCharts)` loop doesn't dedupe. Add a dedupe inside `collectMetricIds` so both consumers see a clean list. Before `return { ids: [...ids], ... };` at line 68, insert:

```js
  const seenGrouped = new Set();
  const dedupedGrouped = [];
  for (const g of groupedCharts) {
    const key = `${g.metricId}:${g.dimension}`;
    if (seenGrouped.has(key)) continue;
    seenGrouped.add(key);
    dedupedGrouped.push(g);
  }
```

Then change the `return` statement so `groupedCharts` is `dedupedGrouped`:

```js
  return {
    ids: [...ids],
    customSqls,
    weeklyMetrics: [...weeklyMetrics],
    groupedCharts: dedupedGrouped,
    yoyMetrics: [...yoyMetrics],
    rawTableSections,
  };
```

- [ ] **Step 3: Run test — expect pass**

```bash
cd builder && npm run test:unit -- tests/unit/sql-plan.test.js
```

Expected: all tests PASS, including the two new ones.

- [ ] **Step 4: Commit**

```bash
git add builder/src/lib/sql/plan.js builder/tests/unit/sql-plan.test.js
git commit -m "feat(scorecard): collect grouped fetch from KPI dimensionFilter

Query planner now emits a single grouped query per (metricId, dimension)
whenever any KPI tile or chart in the scorecard requires that breakdown,
laying the groundwork for dimension-filtered KPI tiles.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Resolve filtered value in `KpiColumn` — failing test

**Files:**
- Create: `builder/tests/unit/kpi-dimension-filter.test.js`

- [ ] **Step 1: Write the failing test**

The payload shape `dataMap.get('${id}:grouped:${dim}')` is produced by `storeGrouped` in `builder/src/lib/sql/load.js:174` as:

```
{ labels: string[], seriesMap: { [dimensionValue]: number[] } }
```

`resolveKpiValue` in `builder/src/components/scorecards/utils.js:47` expects `{ labels, data }`. So `resolveFilteredKpiSeries` bridges the two: it pulls one `seriesMap[value]` and returns `{ labels, data }`.

```js
// builder/tests/unit/kpi-dimension-filter.test.js
import { describe, it, expect } from 'vitest';
import { resolveKpiValue, resolveFilteredKpiSeries } from '../../src/components/scorecards/utils.js';

describe('resolveFilteredKpiSeries', () => {
  const grouped = {
    labels: ['2026-02', '2026-03', '2026-04'],
    seriesMap: {
      'Solo no DEP':  [10, 11, 12],
      '2-3 no DEP':   [20, 22, 24],
      '4+ no DEP':    [30, 33, 36],
      'Team AI Plus': [40, 44, 48],
    },
  };

  it('returns the matching series as {labels, data}', () => {
    const s = resolveFilteredKpiSeries(grouped, { Segment: 'Solo no DEP' });
    expect(s).toEqual({ labels: ['2026-02', '2026-03', '2026-04'], data: [10, 11, 12] });
  });

  it('returns null when the dimension value is absent from the grouped series', () => {
    const s = resolveFilteredKpiSeries(grouped, { Segment: 'NonexistentSegment' });
    expect(s).toBeNull();
  });

  it('returns null when grouped payload is missing', () => {
    expect(resolveFilteredKpiSeries(undefined, { Segment: 'Solo no DEP' })).toBeNull();
    expect(resolveFilteredKpiSeries(null,       { Segment: 'Solo no DEP' })).toBeNull();
  });

  it('integrates with resolveKpiValue — current_or_latest picks last data point of filtered series', () => {
    const s = resolveFilteredKpiSeries(grouped, { Segment: 'Team AI Plus' });
    expect(resolveKpiValue(s, 'current_or_latest')).toBe(48);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
cd builder && npm run test:unit -- tests/unit/kpi-dimension-filter.test.js
```

Expected: FAIL — `resolveFilteredKpiSeries` does not exist in `utils.js`.

---

## Task 4: Implement `resolveFilteredKpiSeries`

**Files:**
- Modify: `builder/src/components/scorecards/utils.js`

- [ ] **Step 1: Add the helper**

Append to `builder/src/components/scorecards/utils.js`:

```js
/**
 * Given the grouped payload stored by storeGrouped (shape:
 * { labels: string[], seriesMap: { [dimensionValue]: number[] } })
 * and a single-key dimensionFilter ({ [dim]: value }), return a plain
 * { labels, data } series filtered to the matching dimensionValue, or
 * null if the grouped payload is missing / the value isn't present.
 */
export function resolveFilteredKpiSeries(grouped, dimensionFilter) {
  if (!grouped || !grouped.seriesMap || !dimensionFilter) return null;
  const value = Object.values(dimensionFilter)[0];
  if (value == null) return null;
  const data = grouped.seriesMap[value];
  if (!data) return null;
  return { labels: grouped.labels || [], data };
}
```

- [ ] **Step 2: Run test — expect pass**

```bash
cd builder && npm run test:unit -- tests/unit/kpi-dimension-filter.test.js
```

Expected: all four tests PASS.

- [ ] **Step 3: Commit**

```bash
git add builder/src/components/scorecards/utils.js builder/tests/unit/kpi-dimension-filter.test.js
git commit -m "feat(scorecard): add resolveFilteredKpiSeries helper

Extracts a single-dimension-value series from the grouped payload produced
by buildSemanticGroupedSql so KPI tiles can show filtered-to-segment values.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire `dimensionFilter` into `KpiColumn.jsx`

**Files:**
- Modify: `builder/src/components/scorecards/KpiColumn.jsx`

- [ ] **Step 1: Inspect the current file to locate the series-lookup line**

Reference: `builder/src/components/scorecards/KpiColumn.jsx:11` reads:

```js
let series = dataMap.get(kpi.metricId);
```

- [ ] **Step 2: Replace with dimensionFilter-aware lookup**

Replace the entire `{kpis.map((kpi) => { ... })}` body (lines 9–53 in the current file) with the version below. The import on line 3 must also add `resolveFilteredKpiSeries`:

```jsx
import React from 'react';
import KpiTile from './KpiTile';
import { resolveKpiValue, computeDelta, resolveFilteredKpiSeries } from './utils';
import { evaluateFormula } from '../../lib/sanitize';

export default function KpiColumn({ kpis, dataMap, onMetricClick }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 200 }}>
      {kpis.map((kpi) => {
        let value;
        let series;

        if (kpi.dimensionFilter) {
          const dim = Object.keys(kpi.dimensionFilter)[0];
          const grouped = dataMap.get(`${kpi.metricId}:grouped:${dim}`);
          series = resolveFilteredKpiSeries(grouped, kpi.dimensionFilter);
        } else {
          series = dataMap.get(kpi.metricId);
        }

        if (kpi.formulaOverride) {
          const depValues = {};
          for (const depId of kpi.depsOverride || []) {
            const depSeries = dataMap.get(depId);
            depValues[depId] = resolveKpiValue(depSeries, kpi.valueSelector || 'current_month') || 0;
          }
          value = Math.round(evaluateFormula(kpi.formulaOverride, depValues) * 100) / 100;
        } else {
          value = resolveKpiValue(series, kpi.valueSelector || 'current_month');
        }

        const noData = value == null;
        if (noData) console.warn(`[KPI] ${kpi.label} (${kpi.metricId}): No data. series=`, series, `selector=${kpi.valueSelector}`, `dimensionFilter=`, kpi.dimensionFilter);

        let deltaPercent = null;
        let deltaInfo = null;
        if (kpi.showDelta && series) {
          const delta = computeDelta(series);
          if (delta) {
            deltaPercent = delta.deltaPercent;
            const cur = resolveKpiValue(series, 'current_month');
            const prior = resolveKpiValue(series, 'prior_month');
            if (cur != null && prior != null) {
              deltaInfo = { current: cur, prior, format: kpi.format };
            }
          }
        }

        return (
          <KpiTile
            key={`${kpi.metricId}-${kpi.label}`}
            label={kpi.label}
            value={value}
            format={kpi.format}
            deltaPercent={deltaPercent}
            noData={noData}
            onClick={() => onMetricClick?.(kpi.metricId, value, kpi.format, null, deltaInfo)}
          />
        );
      })}
    </div>
  );
}
```

Notes:
- `key={kpi.metricId}` → `key={`${kpi.metricId}-${kpi.label}`}` because we now have multiple tiles for the same metric ID. React warns on duplicate keys.
- `computeDelta` is unchanged; it receives the filtered series.

- [ ] **Step 3: Run tests**

```bash
cd builder && npm run test:unit
```

Expected: full suite still PASSES. No KpiColumn-specific render test exists yet; the behavior is covered by the helper test in Task 3 + manual QA in Task 13.

- [ ] **Step 4: Commit**

```bash
git add builder/src/components/scorecards/KpiColumn.jsx
git commit -m "feat(scorecard): KPI tiles read filtered series when dimensionFilter set

When a KPI config includes dimensionFilter ({ Segment: 'Solo no DEP' }),
KpiColumn resolves the tile value from the grouped payload for that
(metricId, dimension) pair and filters to the specified dimension value.
Ungrouped behavior is unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Build and smoke-test the frontend

**Files:** (none modified)

- [ ] **Step 1: Ensure build still passes**

```bash
cd builder && npm run build
```

Expected: clean build. No TypeScript-like errors (this is a JS project; lint/build errors are the signal).

- [ ] **Step 2: Run the full test suite**

```bash
cd builder && npm run test:unit
```

Expected: all tests PASS.

- [ ] **Step 3: Commit a clean checkpoint (no changes — but verify tree)**

```bash
git status
```

Expected: clean. If `dist/` changed, do not commit it — `dist/` is only committed at final deploy (Task 15). Reset any `dist/` changes:

```bash
git checkout -- builder/dist/
```

---

## Task 7: Capture the current `v_customer_segments` definition

**Files:** (read-only — capturing baseline)

- [ ] **Step 1: Pull the cached view definition from Supabase**

```bash
curl -s "https://agkubdpgnpwudzpzcvhs.supabase.co/rest/v1/metrics?id=eq.373&select=view_definition" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY" \
  | python3 -c "import sys, json; print(json.load(sys.stdin)[0].get('view_definition', '[NULL]'))"
```

- [ ] **Step 2: If the cached definition is NULL or stale, pull live from BigQuery**

Use the BigQuery MCP tool:

```
mcp__bigquery__execute_sql with:
  sql: SELECT view_definition
       FROM `project-for-method-dw.revenue.INFORMATION_SCHEMA.VIEWS`
       WHERE table_name = 'v_customer_segments'
```

- [ ] **Step 3: Save the captured SQL as a reference artifact**

Write the current definition to `knowledge/verified-queries/v_customer_segments-baseline-2026-04-22.sql` (do NOT commit; this is a working artifact for the next task).

---

## Task 8: Create `v_customers` in BigQuery

**Files:**
- Create (in BigQuery): `project-for-method-dw.revenue.v_customers`

- [ ] **Step 1: Draft the CREATE VIEW SQL using the baseline as a template**

Start from the captured `v_customer_segments` definition. Keep the same base source query and entity-month rollup logic. Augment with:

1. A `with_tiers` CTE that produces both `UserTier` and `Segment`:
   ```sql
   CASE
     WHEN TotalUsers = 1             THEN 'Solo'
     WHEN TotalUsers BETWEEN 2 AND 3 THEN 'Small Team'
     ELSE                                 'Team'
   END AS UserTier,
   IF(HasDEP, 'Team AI Plus',
      CASE
        WHEN TotalUsers = 1             THEN 'Solo no DEP'
        WHEN TotalUsers BETWEEN 2 AND 3 THEN '2-3 no DEP'
        ELSE                                 '4+ no DEP'
      END) AS Segment
   ```
   Note: `Segment` labels must match today's exactly — `'Solo no DEP' / '2-3 no DEP' / '4+ no DEP' / 'Team AI Plus'` — to keep numbers identical.

2. `AttributionChannel`, `SignupCountry`, `Vertical`, `SyncType` selected via earliest-signup wins. In the entity-month CTE, replace `ANY_VALUE(col)` (if present) with:
   ```sql
   ARRAY_AGG(AttributionChannel ORDER BY SignupDate LIMIT 1)[OFFSET(0)] AS AttributionChannel
   ```
   and same for the other three. If the base source doesn't have `SignupDate` at CompanyAccount grain, join to `v_accounts` on `CompanyAccount` to get it.

3. Flag columns:
   ```sql
   TRUE AS IsActive,
   LAG(TRUE) OVER (PARTITION BY EntityRecordID ORDER BY Month) IS NULL AS IsNew,
   LEAD(TRUE) OVER (PARTITION BY EntityRecordID ORDER BY Month) IS NULL AS IsChurned
   ```

- [ ] **Step 2: Execute CREATE OR REPLACE VIEW**

```
mcp__bigquery__execute_sql with:
  sql: CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_customers` AS
       <full view body from Step 1>
```

- [ ] **Step 3: Smoke-check the view runs**

```
mcp__bigquery__execute_sql with:
  sql: SELECT COUNT(*) FROM `project-for-method-dw.revenue.v_customers`
```

Expected: > 0 rows.

- [ ] **Step 4: Save the final view SQL as a verified artifact**

Write to `knowledge/verified-queries/v_customers.sql` and commit:

```bash
git add knowledge/verified-queries/v_customers.sql
git commit -m "bq: add v_customers view (entity-grain customers primitive)

Replaces the 5-metric Solo/Small/Team/DEP layout with one primitive
(COUNT DISTINCT EntityRecordID) plus Segment/UserTier/HasDEP dimensions.
Ships behind a parity gate vs v_customer_segments (see plan task 9).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Parity gate — `v_customers` must match `v_customer_segments` row-for-row

**Files:** (BigQuery query; no file changes)

- [ ] **Step 1: Run the parity SQL**

```
mcp__bigquery__execute_sql with:
  sql: |
    WITH a AS (SELECT Month, Segment, COUNT(*) AS n FROM `project-for-method-dw.revenue.v_customers`         GROUP BY 1,2),
         b AS (SELECT Month, Segment, COUNT(*) AS n FROM `project-for-method-dw.revenue.v_customer_segments` GROUP BY 1,2)
    SELECT COALESCE(a.Month, b.Month)     AS Month,
           COALESCE(a.Segment, b.Segment) AS Segment,
           a.n AS v_customers_n,
           b.n AS v_customer_segments_n,
           COALESCE(a.n, 0) - COALESCE(b.n, 0) AS delta
    FROM a FULL OUTER JOIN b USING (Month, Segment)
    WHERE a.n IS NULL OR b.n IS NULL OR a.n <> b.n
    ORDER BY Month, Segment
```

Expected: **zero rows**.

- [ ] **Step 2: If non-zero, diagnose before proceeding**

If any rows returned:
- Non-matching `Segment` label spellings → fix `CASE` literals to exactly `'Solo no DEP' / '2-3 no DEP' / '4+ no DEP' / 'Team AI Plus'`.
- Different row counts in a month → probably a base-source or grain issue; compare the entity-month CTE in `v_customers` against the equivalent in `v_customer_segments`.
- Null `Month` → the rollup dropped a month; check that the entity-month CTE's `GROUP BY` includes `Month`.

Iterate on Task 8 Step 1-2 until this query returns empty. **Do not proceed past Task 9 if the parity gate is red.**

- [ ] **Step 3: Confirm additional sanity checks**

```
mcp__bigquery__execute_sql with:
  sql: |
    SELECT
      COUNT(DISTINCT EntityRecordID) AS entities,
      MIN(Month) AS earliest, MAX(Month) AS latest,
      COUNTIF(IsNew) AS new_flags,
      COUNTIF(IsChurned) AS churn_flags,
      COUNT(DISTINCT Segment) AS segment_cardinality,
      COUNT(DISTINCT UserTier) AS usertier_cardinality
    FROM `project-for-method-dw.revenue.v_customers`
```

Expected:
- `segment_cardinality` = 4 (exactly the four labels)
- `usertier_cardinality` = 3 (Solo / Small Team / Team)
- `earliest / latest` match the equivalent on `v_customer_segments` (rerun same query on that view to confirm).

---

## Task 10: Update metric 373 in Supabase

**Files:** (Supabase `metrics` table row; no file changes)

- [ ] **Step 1: Preview current row (sanity)**

```bash
curl -s "https://agkubdpgnpwudzpzcvhs.supabase.co/rest/v1/metrics?id=eq.373&select=id,name,view_name,semantic_table,semantic_measure,semantic_filters,semantic_dimensions,verified_at" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY" \
  | python3 -m json.tool
```

- [ ] **Step 2: PATCH with the new definition**

Use the user-authenticated write path. From the app UI (Registry → metric 373 → edit), or via `mcp__supabase__execute_sql`:

```
mcp__supabase__execute_sql with:
  query: |
    UPDATE metrics SET
      name               = 'Customers',
      view_name          = 'v_customers',
      semantic_table     = 'v_customers',
      semantic_filters   = ARRAY['IsActive = TRUE'],
      semantic_dimensions = ARRAY['Segment','UserTier','HasDEP','AttributionChannel','SignupCountry','Vertical','SyncType'],
      verified_at        = NULL
    WHERE id = 373
    RETURNING id, name, view_name, semantic_table, semantic_filters, semantic_dimensions, verified_at;
```

Expected: one row returned reflecting the new values.

- [ ] **Step 3: Leave `semantic_measure` and `semantic_date_col` unchanged**

They're already correct (`COUNT(DISTINCT EntityRecordID)` / `Month`).

- [ ] **Step 4: Refresh `view_definition` cache**

The Supabase column `view_definition` caches the BQ SQL for offline viewing. Update it to the new `v_customers` body:

```
mcp__supabase__execute_sql with:
  query: |
    UPDATE metrics
    SET view_definition = $1
    WHERE id = 373
```

where `$1` is the SQL body saved in `knowledge/verified-queries/v_customers.sql` (Task 8 Step 4). Or re-pull via `INFORMATION_SCHEMA` and paste.

---

## Task 11: Deprecate metrics 374–377

**Files:** (Supabase rows)

- [ ] **Step 1: Set status=queued and rename**

```
mcp__supabase__execute_sql with:
  query: |
    UPDATE metrics
    SET status = 'queued',
        name = name || ' (deprecated — use metric 373 + Segment dim)'
    WHERE id IN (374, 375, 376, 377)
      AND name NOT LIKE '%(deprecated%'
    RETURNING id, name, status;
```

Expected: 4 rows returned, each with `status='queued'` and name suffixed.

The `AND name NOT LIKE '%(deprecated%'` guard makes this idempotent — rerunning won't double-suffix.

- [ ] **Step 2: Verify the AI catalog shrinks**

Reload the chart builder in the browser, open the metric catalog (or inspect the network call to Supabase). Metrics 374–377 should be absent from the `live` list the AI sees.

---

## Task 12: Rewrite `customer-segments-scorecard.js`

**Files:**
- Modify: `builder/src/config/scorecards/customer-segments-scorecard.js`

- [ ] **Step 1: Replace the file body**

Overwrite `builder/src/config/scorecards/customer-segments-scorecard.js` with:

```js
/**
 * Customers Scorecard (entity grain)
 * Backed by metric 373 "Customers" on v_customers with Segment as a dimension.
 * Per-segment sections filter metric 373 via dimensionFilter; the Overview
 * adds a stacked bar + line grouped by Segment (Justin's Slack asks #1 and #2).
 */

export default {
  id: 'customer-segments',
  title: 'Customers',
  description: 'Customers grouped by billing entity. Franchises with multiple accounts count as one customer.',
  status: 'approved',
  hideGrain: true,
  views: {
    v_customers: { dateCol: 'Month' },
  },
  sections: [
    // ── Overview ────────────────────────────────────────────────
    {
      title: 'Overview',
      description: 'Each customer falls into exactly one segment. DEP customers are always Team AI Plus regardless of user count.',
      kpis: [
        { metricId: 373, label: 'Total Customers', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 373, label: 'Solo no DEP', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true,
          dimensionFilter: { Segment: 'Solo no DEP' } },
        { metricId: 373, label: 'Small Team no DEP', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true,
          dimensionFilter: { Segment: '2-3 no DEP' } },
        { metricId: 373, label: 'Team no DEP', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true,
          dimensionFilter: { Segment: '4+ no DEP' } },
        { metricId: 373, label: 'Team AI Plus', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true,
          dimensionFilter: { Segment: 'Team AI Plus' } },
      ],
      charts: [
        {
          label: 'Customers by Segment',
          chartType: 'bar', valueFormat: 'number',
          stacked: true,
          showLabels: false,
          groupByDimension: 'Segment',
          metrics: [{ id: 373, label: 'Customers' }],
        },
        {
          label: 'Customers by Segment Over Time',
          chartType: 'line', valueFormat: 'number',
          showLabels: true,
          groupByDimension: 'Segment',
          metrics: [{ id: 373, label: 'Customers' }],
        },
      ],
    },

    // ── Solo no DEP ─────────────────────────────────────────────
    {
      title: 'Solo no DEP',
      description: '1 paid user, no DEP. Smallest tier — individual users on base SaaS only.',
      charts: [
        {
          label: 'Solo no DEP by Month',
          chartType: 'bar', valueFormat: 'number',
          showLabels: true,
          metrics: [{ id: 373, label: 'Solo no DEP', color: '#6b7280',
                      dimensionFilter: { Segment: 'Solo no DEP' } }],
        },
      ],
    },

    // ── Small Team no DEP ───────────────────────────────────────
    {
      title: 'Small Team no DEP',
      description: '2–3 paid users, no DEP. Small teams on base SaaS only.',
      charts: [
        {
          label: 'Small Team no DEP by Month',
          chartType: 'bar', valueFormat: 'number',
          showLabels: true,
          metrics: [{ id: 373, label: '2-3 no DEP', color: '#3b82f6',
                      dimensionFilter: { Segment: '2-3 no DEP' } }],
        },
      ],
    },

    // ── Team no DEP ─────────────────────────────────────────────
    {
      title: 'Team no DEP',
      description: '4+ paid users, no DEP. Larger teams on base SaaS only.',
      charts: [
        {
          label: 'Team no DEP by Month',
          chartType: 'bar', valueFormat: 'number',
          showLabels: true,
          metrics: [{ id: 373, label: '4+ no DEP', color: '#7c3aed',
                      dimensionFilter: { Segment: '4+ no DEP' } }],
        },
      ],
    },

    // ── Team AI Plus ────────────────────────────────────────────
    {
      title: 'Team AI Plus',
      description: 'Customers billed for DEP (any user count). DEP is identified by "Enhancement Plan" or "Premium App" billing line items.',
      charts: [
        {
          label: 'Team AI Plus by Month',
          chartType: 'bar', valueFormat: 'number',
          showLabels: true,
          metrics: [{ id: 373, label: 'Team AI Plus', color: '#059669',
                      dimensionFilter: { Segment: 'Team AI Plus' } }],
        },
      ],
    },

    // ── Customer List ───────────────────────────────────────────
    {
      type: 'rawTable',
      title: 'Customer List',
      description: 'All customers for the most recent month. Click column headers to sort. Use search to filter.',
      label: 'All Customers',
      metricId: 373,
      columns: ['EntityFullName', 'AccountCount', 'TotalUsers', 'HasDEP', 'Segment'],
      limit: 4000,
    },
  ],
};
```

- [ ] **Step 2: Extend `collectMetricIds` to pick up chart-metric-level `dimensionFilter`**

The per-segment sections put `dimensionFilter` inside `chart.metrics[i]` (not on the chart itself). `collectMetricIds` currently ignores that. Add to the charts loop in `builder/src/lib/sql/plan.js` (alongside the existing `chart.groupByDimension` handling). Inside the `for (const m of chart.metrics || [])` loop (line ~41):

```js
        if (m.dimensionFilter && typeof m.dimensionFilter === 'object' && typeof m.id === 'number') {
          for (const dim of Object.keys(m.dimensionFilter)) {
            groupedCharts.push({
              metricId: m.id,
              dimension: dim,
              lastNMonths: chart.lastNMonths ?? 13,
            });
          }
        }
```

Dedup is already handled by the block added in Task 2 Step 2.

- [ ] **Step 3: Extend `Chart.jsx` to filter the grouped series when a chart metric has `dimensionFilter`**

Two cases to handle in `builder/src/components/scorecards/Chart.jsx`:

**Case A — `config.groupByDimension` set AND `metric.dimensionFilter` set** (not used in current scorecard but sensible to support for consistency). Existing grouped path (line ~312) renders all series; after the fetch, filter `grouped.seriesMap` to just the matching value.

**Case B — `config.groupByDimension` absent AND `metric.dimensionFilter` set** (this is what the per-segment sections use). The grouped fetch still happens (Task 2 + Step 2 above ensure that). Chart.jsx needs a new render branch that looks up `dataMap.get(`${metric.id}:grouped:${dim}`)`, pulls `seriesMap[value]` into a single `{labels, data}` series, and renders it as if it were a regular single-metric chart.

Add the new branch BEFORE the single-metric line/bar rendering (search for the existing single-series path — typically `const series = config.metrics.map((m) => ...)`). Pseudocode, written in the file's existing style:

```jsx
// New branch — single-metric with dimensionFilter and no groupByDimension
{
  const firstMetric = config.metrics?.[0];
  if (
    firstMetric?.dimensionFilter &&
    !config.groupByDimension &&
    config.metrics.length === 1
  ) {
    const dim = Object.keys(firstMetric.dimensionFilter)[0];
    const dimValue = firstMetric.dimensionFilter[dim];
    const grouped = dataMap.get(`${firstMetric.id}:grouped:${dim}`);
    if (!grouped?.seriesMap?.[dimValue]) return null;
    const labels = grouped.labels;
    const data = grouped.seriesMap[dimValue];
    // Render identically to the non-grouped single-metric path —
    // label is firstMetric.label, color is firstMetric.color, etc.
    // Build the ECharts option object the same way the existing single-series
    // path does, but with {labels, data} sourced from the grouped payload.
  }
}
```

The exact ECharts option construction should mirror the existing single-metric bar path in the file — do not duplicate option-building logic; extract a local helper if it makes the patch cleaner.

- [ ] **Step 4: Unit test for the new plan behavior**

Append to `builder/tests/unit/sql-plan.test.js`:

```js
  it('captures grouped fetch need from chart-metric dimensionFilter', () => {
    const out = collectMetricIds({
      sections: [{
        charts: [{
          metrics: [
            { id: 373, dimensionFilter: { Segment: 'Solo no DEP' } },
          ],
        }],
      }],
    });
    expect(out.groupedCharts).toContainEqual({ metricId: 373, dimension: 'Segment', lastNMonths: 13 });
  });

  it('dedups KPI and chart-metric dimensionFilter on the same (metric, dim)', () => {
    const out = collectMetricIds({
      sections: [{
        kpis:   [{ metricId: 373, dimensionFilter: { Segment: 'Solo no DEP' } }],
        charts: [{ metrics: [{ id: 373, dimensionFilter: { Segment: 'Team AI Plus' } }] }],
      }],
    });
    expect(out.groupedCharts.filter(g => g.metricId === 373 && g.dimension === 'Segment')).toHaveLength(1);
  });
```

- [ ] **Step 5: Run tests and build**

```bash
cd builder && npm run test:unit && npm run build
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add builder/src/config/scorecards/customer-segments-scorecard.js builder/src/components/scorecards/Chart.jsx builder/src/lib/sql/plan.js builder/tests/unit/sql-plan.test.js
git commit -m "feat(scorecard): customer-segments uses metric 373 + Segment dim

Collapses 374-377 into metric 373 + dimensionFilter. Adds Overview stacked
bar + line grouped by Segment (Justin Slack asks). Per-segment sections
each render metric 373 filtered to one Segment value. Zero data change vs
the previous scorecard (same underlying rows via v_customers parity gate).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Local QA against current production

**Files:** (none modified)

- [ ] **Step 1: Start dev server**

```bash
cd builder && npm run dev
```

- [ ] **Step 2: Load the Customers scorecard**

Open the local URL (typically `http://localhost:5173`), connect BQ, navigate to Customers scorecard (id `customer-segments`).

- [ ] **Step 3: Validate each KPI tile**

For the current month, compare each of the 5 Overview KPI tiles against the production value at `https://nickperaltab.github.io/method-metrics/`:

| Tile | Expected behavior |
|---|---|
| Total Customers | matches production "Total Customers" KPI |
| Solo no DEP | matches production "Solo no DEP" KPI |
| Small Team no DEP | matches production "Small Team no DEP" KPI |
| Team no DEP | matches production "Team no DEP" KPI |
| Team AI Plus | matches production "Team AI Plus" KPI |

If any diverges, STOP, re-check parity gate (Task 9) and view definition (Task 8).

- [ ] **Step 4: Validate each per-segment chart renders**

Scroll through the Solo no DEP / Small Team / Team no DEP / Team AI Plus sections. Each bar chart should render the same monthly series as production.

- [ ] **Step 5: Validate Customer List raw table**

Confirm column set unchanged (`EntityFullName`, `AccountCount`, `TotalUsers`, `HasDEP`, `Segment`) and row count in the same ballpark as production.

- [ ] **Step 6: Validate the two new Overview charts**

Stacked bar + line chart grouped by Segment should render with 4 series (the 4 segment labels) and sum to the Total Customers value per month.

- [ ] **Step 7: If everything matches, proceed. If not, diagnose before Task 14.**

---

## Task 14: Build and deploy

**Files:**
- Modify: `builder/dist/*` (build artifacts)

- [ ] **Step 1: Production build**

```bash
cd builder && npm run build
```

- [ ] **Step 2: Commit the dist**

```bash
git add builder/dist
git commit -m "build: customers primitive refactor

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Push to main — GitHub Pages auto-deploys**

```bash
git push origin main
```

- [ ] **Step 4: Verify live deploy**

Wait ~60s, open `https://nickperaltab.github.io/method-metrics/` in an incognito window, navigate to Customers scorecard, re-run the QA checklist from Task 13. If any tile or chart is wrong on production but was right locally, something cache-related is off — check service worker / cache-control headers, do not blame "browser cache" without evidence (per CLAUDE.md).

---

## Task 15: Alias `v_customer_segments`

**Files:** (BigQuery)

- [ ] **Step 1: Confirm nothing in the repo still references `v_customer_segments` except historical docs**

```bash
grep -rn "v_customer_segments" builder/src/ 2>/dev/null
```

Expected: zero hits. (If any remain, fix before proceeding.)

- [ ] **Step 2: Replace the view body with an alias**

```
mcp__bigquery__execute_sql with:
  sql: |
    CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_customer_segments` AS
    SELECT
      Month, EntityRecordID, EntityFullName,
      AccountCount, TotalUsers, HasDEP, Segment
    FROM `project-for-method-dw.revenue.v_customers`
```

(Only columns the previous `v_customer_segments` exposed — this keeps any external consumer working.)

- [ ] **Step 3: Verify aliased view returns the expected row count**

```
mcp__bigquery__execute_sql with:
  sql: SELECT COUNT(*) FROM `project-for-method-dw.revenue.v_customer_segments`
```

Expected: matches Task 9 Step 3 entity-month row count.

- [ ] **Step 4: Post-alias parity recheck**

```
mcp__bigquery__execute_sql with:
  sql: |
    WITH a AS (SELECT Month, Segment, COUNT(*) AS n FROM `project-for-method-dw.revenue.v_customers`         GROUP BY 1,2),
         b AS (SELECT Month, Segment, COUNT(*) AS n FROM `project-for-method-dw.revenue.v_customer_segments` GROUP BY 1,2)
    SELECT * FROM a FULL OUTER JOIN b USING (Month, Segment)
    WHERE a.n IS NULL OR b.n IS NULL OR a.n <> b.n
```

Expected: empty. The two views are now trivially equal by construction.

---

## Task 16: Document the entity-rollup caveat

**Files:**
- Modify: `docs/semantic-layer.md`

- [ ] **Step 1: Append a subsection under "Dimensions vs Attributes"**

Add the following to `docs/semantic-layer.md` immediately after the "Dimensions vs Attributes" section:

```markdown
### Entity-Grain Rollup (`v_customers`)

`v_customers` is at `Month × EntityRecordID` grain. An entity can own multiple `CompanyAccount` rows with different `AttributionChannel`, `SignupCountry`, `Vertical`, or `SyncType` values. When rolling CompanyAccount → EntityRecordID, the **earliest-signup account** wins for those four dimensions. Consequence: entity-grain channel/country/vertical/sync-type counts do **not** reconcile to account-grain counts from `v_accounts`. Segment / UserTier / HasDEP are fully defined at entity grain and are not affected.
```

- [ ] **Step 2: Commit**

```bash
git add docs/semantic-layer.md
git commit -m "docs(semantic-layer): document v_customers entity-rollup caveat

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Task 17: Re-verify metric 373 after deploy

**Files:** (Supabase row)

- [ ] **Step 1: After at least one full QA pass on production, re-stamp `verified_at`**

```
mcp__supabase__execute_sql with:
  query: |
    UPDATE metrics
    SET verified_at = CURRENT_TIMESTAMP
    WHERE id = 373
    RETURNING id, name, verified_at;
```

This closes the loop: the metric registry now reflects an audited, post-refactor customers primitive.

---

## Rollback Quick Reference

If any step goes sideways, these commands revert in order:

- **Frontend regression (Tasks 2–6, 12):** `git revert <commit>` and push.
- **Scorecard shows wrong numbers, but view and metric OK:** revert the scorecard commit (Task 12), leave BQ and Supabase in place.
- **Metric 373 update (Task 10):** `UPDATE metrics SET view_name='v_customer_segments', semantic_table='v_customer_segments', semantic_dimensions=ARRAY['Segment','HasDEP'], semantic_filters=NULL WHERE id=373;`
- **Metrics 374–377 deprecated (Task 11):** `UPDATE metrics SET status='live', name=REGEXP_REPLACE(name, ' \(deprecated.*\)$', '') WHERE id IN (374,375,376,377);`
- **BQ view parity gate fails (Task 9):** stop; do NOT promote. Fix view or drop it with `DROP VIEW project-for-method-dw.revenue.v_customers`.
- **`v_customer_segments` alias wrong (Task 15):** replace with the baseline SQL captured in Task 7.

---

## Out of Scope (Follow-up Project)

See `docs/superpowers/specs/2026-04-22-customers-primitive-refactor-design.md` § "Out of Scope / Deferred to GRR Project" for the full list. Summary:

- Add `MRR`, `MRR_prev_month`, `ChurnAmount`, `DowngradeAmount`, `ExpansionAmount`, `Currency` to `v_customers`
- Register new primitives + GRR derivative (`1 − (Cancellations + Downgrades) / Start MRR`)
- Reconcile to Justin's `method_forecast` model
- Verify via `/metric-solver` against `USD Rates _ Board KPI Deck Preparation 2023+ - Monthly Detail.csv` (col BU Start, col CA Gross MRR Retention)
