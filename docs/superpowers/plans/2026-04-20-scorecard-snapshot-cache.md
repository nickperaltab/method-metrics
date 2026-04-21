# Scorecard Snapshot Cache — Phase 1 (Marketing Scorecard)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marketing Scorecard loads in <1s by reading a nightly snapshot from Supabase instead of live BigQuery. Phase 1 proves the full pipeline on one scorecard; Phase 2 (separate plan) rolls out to the other 12.

**Architecture:** A pure `loadScorecardData({config, metrics, query})` service is the single source of truth for "execute the queries a scorecard needs." The browser hook calls it with a browser `query` (OAuth BQ REST). A nightly GitHub Actions cron calls it with a Node `query` (service-account BigQuery SDK) and publishes the result as an atomic snapshot to Supabase. The React app reads the snapshot first; if >48h stale or missing, it falls back to live BQ (which works for BQ-authed users, i.e. most users).

**Tech Stack:** React 18 + Vite, Node 20 + `@google-cloud/bigquery`, Supabase Postgres + RLS + pg function for atomic publish, GitHub Actions, Vitest.

**Key constraints:**
1. `builder/src/lib/bigquery.js` is browser-only (uses `localStorage`, OAuth). Pure SQL builders + `buildEndDateClause` must move to a browser+Node safe module.
2. One code path. Hook and cron must call the same `loadScorecardData` so their outputs can't drift.
3. Atomic publish must be transactional. Supersede + publish happen in a single Postgres function.
4. `dataMap.get(54)` expects numeric keys. Snapshot storage is text jsonb. Hydrate on read.
5. Current `collectMetricIds` in the hook does not iterate `section.tables` — this preserves current behavior (some table columns silently render empty today). Do NOT expand scope in this plan; file a separate ticket.
6. Phase 1 affects only `marketing-scorecard`; other scorecards keep their existing live path.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| Supabase migration | Create (via MCP) | `scorecard_snapshots` table + RLS + `publish_scorecard_snapshot` RPC |
| `builder/src/lib/sql/builders.js` | Create | `buildBatchSql`, `splitBatchResults`, `wrapChartSql` |
| `builder/src/lib/sql/semantic.js` | Create | `buildSemanticSql`, `buildSemanticGroupedSql`, `buildEndDateClause`, `buildViewAggSql` |
| `builder/src/lib/sql/plan.js` | Create | `collectMetricIds`, `buildScorecardQueryPlan` |
| `builder/src/lib/sql/load.js` | Create | `loadScorecardData({config, metrics, query, onProgress, signal})` — the single loader |
| `builder/src/lib/sql/keys.js` | Create | `hydrateKeys`, `snapshotFreshness` |
| `builder/src/lib/sql/index.js` | Create | Barrel re-exports |
| `builder/src/lib/bigquery.js` | Modify | Re-export moved symbols; delete the bodies |
| `builder/src/lib/snapshots.js` | Create | `fetchSnapshot(scorecardId)` |
| `builder/src/hooks/useScorecardData.js` | Rewrite | Snapshot-first → loadScorecardData fallback |
| `builder/src/pages/Scorecard.jsx` | Modify | Gate BQ-connect behind snapshot check |
| `builder/src/components/StaleIndicator.jsx` | Create | 30–48h stale banner |
| `builder/scripts/refresh-snapshots/bq-client.js` | Create | `createBqClient()`, `runQuery(bq, sql)` |
| `builder/scripts/refresh-snapshots/supabase.js` | Create | Admin client, `beginSnapshot`, `publishSnapshot`, `failSnapshot`, `fetchAllMetrics` |
| `builder/scripts/refresh-snapshots/index.js` | Create | Entry point — loads config+metrics, calls shared `loadScorecardData`, publishes |
| `builder/scripts/verify-snapshot.js` | Create | Compare snapshot vs live for one scorecard |
| `builder/scripts/check-bq-etl-time.js` | Create | Report BQ table last-modified times |
| `builder/package.json` | Modify | Add `@google-cloud/bigquery`, `@supabase/supabase-js` |
| `.github/workflows/refresh-scorecards.yml` | Create | Nightly cron + manual dispatch |
| `builder/tests/unit/sql-builders.test.js` | Create | Tests for moved semantic builders |
| `builder/tests/unit/sql-plan.test.js` | Create | Tests for query plan construction |
| `builder/tests/unit/sql-load.test.js` | Create | Tests for loadScorecardData with a stub query |
| `builder/tests/unit/snapshot-keys.test.js` | Create | Tests for key hydration + freshness |
| `builder/tests/unit/snapshot-contract.test.js` | Create | Tests that dataMap shape matches what Chart/KpiColumn/Table consume |
| `docs/migrations/2026-04-20-scorecard-snapshots.md` | Create | Migration reference note |

---

## Task 1: Supabase schema, RLS, and atomic-publish RPC

**Files:**
- Supabase migration (via `mcp__supabase__apply_migration`)
- Create: `docs/migrations/2026-04-20-scorecard-snapshots.md`

- [ ] **Step 1: Apply migration**

Use `mcp__supabase__apply_migration` with name `scorecard_snapshots` and SQL:

```sql
-- Table
create table if not exists public.scorecard_snapshots (
  id            bigserial primary key,
  scorecard_id  text not null,
  run_id        uuid not null default gen_random_uuid() unique,
  payload       jsonb not null default '{}'::jsonb,
  config_hash   text,
  status        text not null check (status in ('building','published','superseded','failed')),
  refreshed_at  timestamptz not null default now(),
  published_at  timestamptz,
  error_log     jsonb
);

create unique index if not exists scorecard_snapshots_published_uniq
  on public.scorecard_snapshots (scorecard_id)
  where status = 'published';

create index if not exists scorecard_snapshots_scorecard_status_idx
  on public.scorecard_snapshots (scorecard_id, status, published_at desc);

alter table public.scorecard_snapshots enable row level security;

create policy "read_published"
  on public.scorecard_snapshots
  for select
  to anon, authenticated
  using (status = 'published');

-- Atomic publish: single transaction that supersedes the old published row
-- and marks the building row as published. If either step fails, the
-- whole function rolls back.
create or replace function public.publish_scorecard_snapshot(p_run_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scorecard_id text;
begin
  select scorecard_id into v_scorecard_id
  from scorecard_snapshots
  where run_id = p_run_id and status = 'building';

  if v_scorecard_id is null then
    raise exception 'No building snapshot with run_id %', p_run_id;
  end if;

  update scorecard_snapshots
    set status = 'superseded'
    where scorecard_id = v_scorecard_id and status = 'published';

  update scorecard_snapshots
    set status = 'published',
        payload = p_payload,
        published_at = now(),
        refreshed_at = now()
    where run_id = p_run_id;
end;
$$;

-- Only service role can call this (revoke from anon/authenticated)
revoke execute on function public.publish_scorecard_snapshot(uuid, jsonb) from anon, authenticated;
grant execute on function public.publish_scorecard_snapshot(uuid, jsonb) to service_role;
```

- [ ] **Step 2: Verify schema**

Use `mcp__supabase__list_tables` with `schemas: ["public"]`. Confirm `scorecard_snapshots` exists.

Use `mcp__supabase__execute_sql`:
```sql
select polname, polcmd from pg_policy where polrelid = 'public.scorecard_snapshots'::regclass;
select proname from pg_proc where proname = 'publish_scorecard_snapshot';
```
Expected: one `read_published` policy (cmd=`r`); one function row.

- [ ] **Step 3: Smoke-test the RPC**

```sql
-- Insert a test building row
insert into scorecard_snapshots (scorecard_id, status) values ('__test', 'building') returning run_id;
-- (use the returned run_id)
select publish_scorecard_snapshot('<run_id>'::uuid, '{"54":{"labels":["2026-01"],"data":[1]}}'::jsonb);
select run_id, status, payload, published_at from scorecard_snapshots where scorecard_id='__test';
-- cleanup
delete from scorecard_snapshots where scorecard_id='__test';
```
Expected: the row transitions from `building` → `published` with the payload and a populated `published_at`.

- [ ] **Step 4: Commit reference note**

Create `docs/migrations/2026-04-20-scorecard-snapshots.md`:
```markdown
# 2026-04-20 — scorecard_snapshots

Applied via Supabase MCP. SQL lives in `docs/superpowers/plans/2026-04-20-scorecard-snapshot-cache.md` Task 1.

Objects created:
- table: `public.scorecard_snapshots`
- indexes: `scorecard_snapshots_published_uniq`, `scorecard_snapshots_scorecard_status_idx`
- policy: `read_published` (SELECT anon/authenticated where status='published')
- function: `public.publish_scorecard_snapshot(uuid, jsonb)` — atomic supersede+publish

Status lifecycle: `building` → `published` → `superseded`. Failed runs: `building` → `failed`.
```

```bash
git add docs/migrations/2026-04-20-scorecard-snapshots.md
git commit -m "docs: note scorecard_snapshots migration applied"
```

---

## Task 2: Move pure SQL builders to `lib/sql/` — tests

**Files:**
- Create: `builder/tests/unit/sql-builders.test.js`

Ground truth to encode in tests (verified against `builder/src/lib/bigquery.js`):
- `semantic_filters` is always an **array** (code does `[...(metric.semantic_filters || [])]`)
- `buildSemanticGroupedSql` throws if `dimension` is not in `metric.semantic_dimensions`
- Weekly grain uses `WEEK(MONDAY)` (not plain `WEEK`)
- `buildEndDateClause` lives in `bigquery.js` today; it moves to `sql/semantic.js`

- [ ] **Step 1: Write the failing tests**

```js
// builder/tests/unit/sql-builders.test.js
import { describe, it, expect } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

const sql = await import('../../src/lib/sql/index.js');

const trialsMetric = {
  id: 54,
  semantic_table: 'v_trials',
  semantic_measure: 'COUNT(*)',
  semantic_date_col: 'SignupDate',
  semantic_filters: [],
  semantic_dimensions: ['Channel'],
};

describe('buildSemanticSql', () => {
  it('builds monthly GROUP BY query over last N months', () => {
    const out = sql.buildSemanticSql(trialsMetric, 'month', 13, null);
    expect(out).toContain('v_trials');
    expect(out).toContain("FORMAT_DATE('%Y-%m'");
    expect(out).toContain('SignupDate');
    expect(out).toContain('INTERVAL 13 MONTH');
    expect(out).toContain('GROUP BY 1');
  });

  it('uses WEEK(MONDAY) for weekly grain', () => {
    const out = sql.buildSemanticSql(trialsMetric, 'week', 3, null);
    expect(out).toContain('WEEK(MONDAY)');
    expect(out).toContain("FORMAT_DATE('%Y-%m-%d'");
  });

  it('ANDs semantic_filters entries into WHERE', () => {
    const m = { ...trialsMetric, semantic_filters: ["Channel = 'Organic'", 'IsActive = TRUE'] };
    const out = sql.buildSemanticSql(m, 'month', 13, null);
    expect(out).toContain("Channel = 'Organic'");
    expect(out).toContain('IsActive = TRUE');
    expect(out).toMatch(/AND/); // joined
  });

  it('applies endDateRule via buildEndDateClause', () => {
    const out = sql.buildSemanticSql(trialsMetric, 'month', 13, 'yesterday');
    expect(out).toContain('DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)');
  });
});

describe('buildSemanticGroupedSql', () => {
  it('groups by allowed dimension + period', () => {
    const out = sql.buildSemanticGroupedSql(trialsMetric, 'Channel', 'month', 13);
    expect(out).toContain('Channel AS dimension');
    expect(out).toContain('GROUP BY 1, 2');
  });

  it('throws when dimension is not in semantic_dimensions', () => {
    expect(() => sql.buildSemanticGroupedSql(trialsMetric, 'CountryCode', 'month', 13)).toThrow(/not an approved dimension/);
  });
});

describe('wrapChartSql', () => {
  it('adds period time-filter for positive lastNMonths', () => {
    const wrapped = sql.wrapChartSql("SELECT '2026-01' AS period, 42 AS value", 13);
    expect(wrapped).toContain('WHERE period >=');
    expect(wrapped).toContain('INTERVAL 13 MONTH');
  });

  it('returns input unchanged when lastNMonths is null', () => {
    const q = "SELECT '2026-01' AS period, 42 AS value";
    expect(sql.wrapChartSql(q, null)).toBe(q);
  });
});

describe('buildEndDateClause', () => {
  it('yesterday', () => {
    expect(sql.buildEndDateClause('dt', 'yesterday')).toContain('DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)');
  });
  it('previous_sunday', () => {
    expect(sql.buildEndDateClause('dt', 'previous_sunday')).toContain('WEEK(MONDAY)');
  });
  it('days_ago_N', () => {
    expect(sql.buildEndDateClause('dt', 'days_ago_7')).toContain('INTERVAL 7 DAY');
  });
  it('null rule returns null', () => {
    expect(sql.buildEndDateClause('dt', null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd builder && npx vitest run tests/unit/sql-builders.test.js
```
Expected: FAIL — `../../src/lib/sql/index.js` does not exist.

- [ ] **Step 3: Commit**

```bash
git add builder/tests/unit/sql-builders.test.js
git commit -m "test: add failing tests for extracted sql builders (semantic, batch, end-date)"
```

---

## Task 3: Extract pure SQL builders — implementation

**Files:**
- Create: `builder/src/lib/sql/builders.js`
- Create: `builder/src/lib/sql/semantic.js`
- Create: `builder/src/lib/sql/index.js`
- Modify: `builder/src/lib/bigquery.js`
- Modify: `builder/tests/unit/batch-queries.test.js`

- [ ] **Step 1: Create `builder/src/lib/sql/builders.js`**

Copy the bodies of `buildBatchSql`, `splitBatchResults`, `wrapChartSql` from `builder/src/lib/bigquery.js` (lines 144–282) verbatim.

```js
// Pure SQL builders — no I/O, no globals. Browser+Node safe.
import { validateInt } from '../sanitize.js';

export function wrapChartSql(sql, lastNMonths) {
  if (lastNMonths == null || lastNMonths < 0) return sql;
  const months = validateInt(lastNMonths, 'lastNMonths');
  const dateExpr = months === 0
    ? `FORMAT_DATE('%Y-%m', DATE_TRUNC(CURRENT_DATE(), MONTH))`
    : `FORMAT_DATE('%Y-%m', DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH), MONTH))`;
  return `SELECT * FROM (${sql}) sub WHERE period >= ${dateExpr}`;
}

export function buildBatchSql(queries) {
  if (queries.length === 0) return '';
  const parts = queries.map(q =>
    `SELECT '${q.key}' AS _key, sub.* FROM (${q.sql}) sub`
  );
  return parts.join('\nUNION ALL\n') + '\nORDER BY _key, period';
}

export function splitBatchResults(rows, keyMap) {
  const map = new Map();
  for (const row of rows) {
    const strKey = row._key;
    const originalKey = keyMap.get(strKey) ?? keyMap.get(Number(strKey)) ?? strKey;
    const clean = { ...row };
    delete clean._key;
    if (!map.has(originalKey)) map.set(originalKey, []);
    map.get(originalKey).push(clean);
  }
  return map;
}
```

- [ ] **Step 2: Create `builder/src/lib/sql/semantic.js`**

Copy `buildSemanticSql`, `buildSemanticGroupedSql`, and `buildEndDateClause` **verbatim** from `builder/src/lib/bigquery.js` (lines 159–243 and 330–346). Also include a new small helper `buildViewAggSql` used when a metric only has `view_name`.

Inline the `BQ_PROJECT` / `BQ_DATASET` constants (or import from a new `../config.js`) — pick whichever keeps the diff minimal.

```js
// Pure semantic + view-aggregation SQL builders.
import { validateIdentifier, validateInt } from '../sanitize.js';

const BQ_PROJECT = 'project-for-method-dw';
const BQ_DATASET = 'revenue';

export function buildEndDateClause(column, rule) {
  if (!rule) return null;
  if (rule === 'yesterday') {
    return `${column} <= DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)`;
  }
  if (rule === 'previous_sunday') {
    return `${column} <= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), WEEK(MONDAY)), INTERVAL 1 DAY)`;
  }
  const match = /^days_ago_(\d+)$/.exec(rule);
  if (match) {
    const days = Number(match[1]);
    if (!Number.isNaN(days)) {
      return `${column} <= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)`;
    }
  }
  return null;
}

function periodExpr(dateCol, bucket) {
  if (bucket === 'week') return `FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(${dateCol}, WEEK(MONDAY)))`;
  if (bucket === 'quarter') return `CONCAT(FORMAT_DATE('%Y', DATE_TRUNC(${dateCol}, QUARTER)), '-Q', CAST(CEIL(EXTRACT(MONTH FROM DATE_TRUNC(${dateCol}, QUARTER)) / 3.0) AS STRING))`;
  if (bucket === 'day') return `FORMAT_DATE('%Y-%m-%d', ${dateCol})`;
  if (bucket === 'year') return `FORMAT_DATE('%Y', DATE_TRUNC(${dateCol}, YEAR))`;
  return `FORMAT_DATE('%Y-%m', DATE_TRUNC(${dateCol}, MONTH))`;
}

export function buildSemanticSql(metric, timeBucket, lastNMonths, endDateRule) {
  validateIdentifier(metric.semantic_table, 'semantic_table');
  validateIdentifier(metric.semantic_date_col, 'semantic_date_col');
  const table = `\`${BQ_PROJECT}.${BQ_DATASET}.${metric.semantic_table}\``;
  const dateCol = metric.semantic_date_col;
  const pexpr = periodExpr(dateCol, timeBucket || 'month');
  const wheres = [...(metric.semantic_filters || [])];
  if (lastNMonths != null && lastNMonths >= 0) {
    const months = validateInt(lastNMonths, 'lastNMonths');
    wheres.push(
      months === 0
        ? `${dateCol} >= DATE_TRUNC(CURRENT_DATE(), MONTH)`
        : `${dateCol} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH), MONTH)`
    );
  }
  const endClause = buildEndDateClause(dateCol, endDateRule);
  if (endClause) wheres.push(endClause);
  const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';
  return `SELECT ${pexpr} AS period, ${metric.semantic_measure} AS value FROM ${table} ${whereClause} GROUP BY 1 ORDER BY 1`;
}

export function buildSemanticGroupedSql(metric, dimension, timeBucket, lastNMonths, endDateRule) {
  const allowed = metric.semantic_dimensions || [];
  if (!allowed.includes(dimension)) {
    throw new Error(`"${dimension}" is not an approved dimension for metric ${metric.id}. Allowed: [${allowed.join(', ')}]`);
  }
  validateIdentifier(metric.semantic_table, 'semantic_table');
  validateIdentifier(metric.semantic_date_col, 'semantic_date_col');
  validateIdentifier(dimension, 'dimension');
  const table = `\`${BQ_PROJECT}.${BQ_DATASET}.${metric.semantic_table}\``;
  const dateCol = metric.semantic_date_col;
  const pexpr = periodExpr(dateCol, timeBucket || 'month');
  const wheres = [...(metric.semantic_filters || [])];
  if (lastNMonths != null && lastNMonths >= 0) {
    const months = validateInt(lastNMonths, 'lastNMonths');
    wheres.push(
      months === 0
        ? `${dateCol} >= DATE_TRUNC(CURRENT_DATE(), MONTH)`
        : `${dateCol} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH), MONTH)`
    );
  }
  const endClause = buildEndDateClause(dateCol, endDateRule);
  if (endClause) wheres.push(endClause);
  const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';
  return `SELECT ${pexpr} AS period, ${dimension} AS dimension, ${metric.semantic_measure} AS value FROM ${table} ${whereClause} GROUP BY 1, 2 ORDER BY 1, 2`;
}

// For view_name metrics without chart_sql/semantic. Matches the aggregation
// pattern of fetchAggregatedData for COUNT over a date column.
export function buildViewAggSql(viewName, dateCol, timeBucket, lastNMonths) {
  validateIdentifier(viewName, 'viewName');
  validateIdentifier(dateCol, 'dateCol');
  const table = `\`${BQ_PROJECT}.${BQ_DATASET}.${viewName}\``;
  const pexpr = periodExpr(dateCol, timeBucket || 'month');
  const wheres = [];
  if (lastNMonths != null && lastNMonths >= 0) {
    const months = validateInt(lastNMonths, 'lastNMonths');
    wheres.push(
      months === 0
        ? `${dateCol} >= DATE_TRUNC(CURRENT_DATE(), MONTH)`
        : `${dateCol} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH), MONTH)`
    );
  }
  const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';
  return `SELECT ${pexpr} AS period, COUNT(*) AS value FROM ${table} ${whereClause} GROUP BY 1 ORDER BY 1`;
}
```

- [ ] **Step 3: Create `builder/src/lib/sql/index.js`**

```js
export { buildBatchSql, splitBatchResults, wrapChartSql } from './builders.js';
export { buildSemanticSql, buildSemanticGroupedSql, buildEndDateClause, buildViewAggSql } from './semantic.js';
```

- [ ] **Step 4: Slim down `bigquery.js`**

In `builder/src/lib/bigquery.js`:
- Delete the bodies of `wrapChartSql` (lines 144–151), `buildSemanticSql` (159–196), `buildSemanticGroupedSql` (203–243), `buildBatchSql` (254–260), `splitBatchResults` (271–282), `buildEndDateClause` (330–346).
- Add at the top, right after the imports:
  ```js
  export { wrapChartSql, buildBatchSql, splitBatchResults, buildSemanticSql, buildSemanticGroupedSql, buildEndDateClause, buildViewAggSql } from './sql/index.js';
  ```
- Any internal references in `bigquery.js` (e.g. `fetchAggregatedData` uses `buildEndDateClause`) should import from `./sql/index.js` instead of the local definition.

- [ ] **Step 5: Update existing batch-queries test import**

In `builder/tests/unit/batch-queries.test.js`, change:
```js
const { buildBatchSql, splitBatchResults } = await import('../../src/lib/bigquery.js');
```
to:
```js
const { buildBatchSql, splitBatchResults } = await import('../../src/lib/sql/index.js');
```

- [ ] **Step 6: Run all tests and build**

```bash
cd builder && npx vitest run
cd builder && npm run build
```
Expected: All tests PASS (including new `sql-builders.test.js`). Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add builder/src/lib/sql/ builder/src/lib/bigquery.js builder/tests/unit/batch-queries.test.js builder/tests/unit/sql-builders.test.js
git commit -m "refactor: extract pure SQL builders to builder/src/lib/sql/ (browser+Node safe)"
```

---

## Task 4: Query plan — tests and implementation

**Files:**
- Create: `builder/src/lib/sql/plan.js`
- Create: `builder/tests/unit/sql-plan.test.js`

`buildScorecardQueryPlan` is a pure function that returns the list of queries to run for a scorecard. It preserves the current hook's behavior — specifically, `collectMetricIds` does **not** iterate `section.tables`. Filing that as a separate ticket.

- [ ] **Step 1: Write failing tests**

```js
// builder/tests/unit/sql-plan.test.js
import { describe, it, expect } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

const { buildScorecardQueryPlan, collectMetricIds } = await import('../../src/lib/sql/plan.js');

const makeMetric = (id, o = {}) => ({
  id, name: `M${id}`, view_name: null, chart_sql: null,
  semantic_table: null, semantic_measure: null, semantic_date_col: null,
  semantic_filters: null, semantic_dimensions: null,
  formula: null, depends_on: null, ...o,
});

describe('collectMetricIds', () => {
  it('captures KPI metric IDs', () => {
    const out = collectMetricIds({ sections: [{ kpis: [{ metricId: 54 }, { metricId: 55 }] }] });
    expect(out.ids.sort()).toEqual([54, 55]);
  });

  it('captures chart metric IDs', () => {
    const out = collectMetricIds({ sections: [{ charts: [{ metrics: [{ id: 54 }] }] }] });
    expect(out.ids).toContain(54);
  });

  it('does NOT capture table column metric IDs (known behavior)', () => {
    const out = collectMetricIds({ sections: [{ tables: [{ columns: [{ metricId: 354 }] }] }] });
    expect(out.ids).not.toContain(354);
  });

  it('captures weeklyMetrics from charts with timeBucket=week', () => {
    const out = collectMetricIds({ sections: [{ charts: [{ timeBucket: 'week', metrics: [{ id: 54 }] }] }] });
    expect(out.weeklyMetrics).toContain(54);
  });

  it('captures groupedCharts', () => {
    const out = collectMetricIds({ sections: [{ charts: [{ groupByDimension: 'Channel', metrics: [{ id: 54 }], lastNMonths: 6 }] }] });
    expect(out.groupedCharts).toEqual([{ metricId: 54, dimension: 'Channel', lastNMonths: 6 }]);
  });

  it('captures yoyMetrics from charts with yoy=true', () => {
    const out = collectMetricIds({ sections: [{ charts: [{ yoy: true, metrics: [{ id: 54 }] }] }] });
    expect(out.yoyMetrics).toContain(54);
  });

  it('captures rawTableSections', () => {
    const out = collectMetricIds({ sections: [{ type: 'rawTable', metricId: 54, columns: ['A', 'B'] }] });
    expect(out.rawTableSections).toHaveLength(1);
    expect(out.ids).toContain(54);
  });
});

describe('buildScorecardQueryPlan', () => {
  it('creates a primitive query for each semantic metric', () => {
    const metrics = [
      makeMetric(54, {
        semantic_table: 'v_trials',
        semantic_measure: 'COUNT(*)',
        semantic_date_col: 'SignupDate',
        semantic_filters: [],
      }),
    ];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 54 }] }] };
    const plan = buildScorecardQueryPlan(config, metrics);
    const kinds = plan.queries.map(q => q.kind);
    expect(kinds).toContain('primary_month');
    expect(kinds).toContain('daily_90d');
  });

  it('adds weekly entry for a week-bucketed chart', () => {
    const metrics = [
      makeMetric(54, {
        semantic_table: 'v_trials',
        semantic_measure: 'COUNT(*)',
        semantic_date_col: 'SignupDate',
        semantic_filters: [],
      }),
    ];
    const config = { id: 'x', sections: [{ charts: [{ timeBucket: 'week', metrics: [{ id: 54 }] }] }] };
    const plan = buildScorecardQueryPlan(config, metrics);
    expect(plan.queries.map(q => q.data_key)).toContain('54:week');
  });

  it('expands transitive derived deps', () => {
    const metrics = [
      makeMetric(100, { formula: 'SAFE_DIVIDE({54},{55})', depends_on: [54, 55] }),
      makeMetric(54, { chart_sql: "SELECT '2026-01' AS period, 10 AS value" }),
      makeMetric(55, { chart_sql: "SELECT '2026-01' AS period, 20 AS value" }),
    ];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 100 }] }] };
    const plan = buildScorecardQueryPlan(config, metrics);
    const keys = plan.queries.map(q => q.data_key);
    expect(keys).toContain('54');
    expect(keys).toContain('55');
    expect(plan.derived.map(d => d.id)).toEqual([100]);
  });

  it('expectedKeys covers queries + derived', () => {
    const metrics = [
      makeMetric(100, { formula: '{54}*2', depends_on: [54] }),
      makeMetric(54, { chart_sql: "SELECT '2026-01' AS period, 10 AS value" }),
    ];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 100 }] }] };
    const plan = buildScorecardQueryPlan(config, metrics);
    expect(plan.expectedKeys).toEqual(expect.arrayContaining(['54', '100']));
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd builder && npx vitest run tests/unit/sql-plan.test.js
```

- [ ] **Step 3: Implement `builder/src/lib/sql/plan.js`**

```js
import { buildSemanticSql, buildSemanticGroupedSql, buildViewAggSql } from './semantic.js';
import { wrapChartSql } from './builders.js';
import schemaCache from '../schemaCache.js';

/**
 * Date-column resolver. Matches the existing hook's precedence:
 *   1. config.views[viewName].dateCol (explicit config override)
 *   2. First DATE/TIMESTAMP/DATETIME column in the shared schemaCache (browser-only)
 *   3. Fallback string ('SignupDate')
 * In Node, schemaCache is empty so we skip level 2 — Phase 1 scorecards (marketing)
 * set all their views in config.views, so this is safe. Phase 2 scorecards that rely
 * on schema-cache inference must set config.views explicitly to work in the cron.
 */
export function resolveDateCol(config, viewName, fallback = 'SignupDate') {
  const fromConfig = config.views?.[viewName]?.dateCol;
  if (fromConfig) return fromConfig;
  const schema = schemaCache[viewName] || [];
  const fromSchema = schema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name;
  return fromSchema || fallback;
}

/**
 * Matches the hook's current collector (builder/src/hooks/useScorecardData.js).
 * Does NOT iterate section.tables — preserving current behavior.
 */
export function collectMetricIds(config) {
  const ids = new Set();
  const customSqls = [];
  const weeklyMetrics = new Set();
  const groupedCharts = [];
  const yoyMetrics = new Set();
  const rawTableSections = [];

  for (const section of config.sections || []) {
    if (section.type === 'rawTable') {
      rawTableSections.push(section);
      if (typeof section.metricId === 'number') ids.add(section.metricId);
      continue;
    }
    for (const kpi of section.kpis || []) {
      if (typeof kpi.metricId === 'number') ids.add(kpi.metricId);
    }
    for (const chart of section.charts || []) {
      for (const m of chart.metrics || []) {
        if (typeof m.id === 'number') ids.add(m.id);
        if (m.customSql) customSqls.push({ key: String(m.id), sql: m.customSql });
      }
      if (chart.timeBucket === 'week') {
        for (const m of chart.metrics || []) {
          if (typeof m.id === 'number') weeklyMetrics.add(m.id);
        }
      }
      if (chart.groupByDimension) {
        for (const m of chart.metrics || []) {
          if (typeof m.id === 'number') {
            groupedCharts.push({
              metricId: m.id,
              dimension: chart.groupByDimension,
              lastNMonths: chart.lastNMonths ?? 13,
            });
          }
        }
      }
      if (chart.yoy) {
        for (const m of chart.metrics || []) {
          if (typeof m.id === 'number') yoyMetrics.add(m.id);
        }
      }
    }
  }
  return {
    ids: [...ids],
    customSqls,
    weeklyMetrics: [...weeklyMetrics],
    groupedCharts,
    yoyMetrics: [...yoyMetrics],
    rawTableSections,
  };
}

function addDerivedDeps(ids, metricsMap) {
  const allIds = new Set(ids);
  const queue = [...ids];
  while (queue.length > 0) {
    const id = queue.pop();
    const m = metricsMap.get(id);
    if (m?.depends_on) {
      for (const depId of m.depends_on) {
        if (!allIds.has(depId)) {
          allIds.add(depId);
          queue.push(depId);
        }
      }
    }
  }
  return [...allIds];
}

/**
 * Build the full query plan for a scorecard. Pure — no I/O.
 * Returns { queries, derived, expectedKeys }.
 *
 * Each query is { data_key, sql, kind, meta }.
 * Kinds: primary_month, primary_view, custom, weekly, grouped, daily_90d, yoy, raw_table
 */
export function buildScorecardQueryPlan(config, metrics) {
  const metricsMap = new Map(metrics.map(m => [m.id, m]));
  const c = collectMetricIds(config);
  const allIds = addDerivedDeps(c.ids, metricsMap);

  const primitives = [];
  const derived = [];
  for (const id of allIds) {
    const m = metricsMap.get(id);
    if (!m) continue;
    if (m.formula && m.depends_on?.length > 0 && !m.chart_sql && !m.view_name && !m.semantic_table) {
      derived.push({ id: m.id, formula: m.formula, depends_on: m.depends_on });
    } else {
      primitives.push(m);
    }
  }

  const queries = [];
  const expectedKeys = new Set();

  // 1. Primary month query per primitive
  for (const metric of primitives) {
    expectedKeys.add(String(metric.id));
    if (metric.semantic_table && metric.semantic_measure && metric.semantic_date_col) {
      queries.push({
        data_key: String(metric.id),
        sql: buildSemanticSql(metric, 'month', 13, null),
        kind: 'primary_month',
        meta: { metric_id: metric.id, mode: 'semantic' },
      });
    } else if (metric.chart_sql) {
      queries.push({
        data_key: String(metric.id),
        sql: wrapChartSql(metric.chart_sql, 13),
        kind: 'primary_month',
        meta: { metric_id: metric.id, mode: 'chart_sql' },
      });
    } else if (metric.view_name) {
      const dateCol = resolveDateCol(config, metric.view_name);
      queries.push({
        data_key: String(metric.id),
        sql: buildViewAggSql(metric.view_name, dateCol, 'month', 13),
        kind: 'primary_view',
        meta: { metric_id: metric.id, mode: 'view', view_name: metric.view_name, dateCol },
      });
    }
  }

  // 2. Custom SQL snippets attached to chart metrics
  for (const cs of c.customSqls) {
    expectedKeys.add(cs.key);
    queries.push({
      data_key: cs.key,
      sql: wrapChartSql(cs.sql, 13),
      kind: 'custom',
    });
  }

  // 3. Weekly (3 weeks) for metrics referenced in week-bucketed charts
  for (const metricId of c.weeklyMetrics) {
    const metric = metricsMap.get(metricId);
    if (!metric) continue;
    const key = `${metricId}:week`;
    expectedKeys.add(key);
    if (metric.semantic_table && metric.semantic_measure && metric.semantic_date_col) {
      queries.push({
        data_key: key,
        sql: buildSemanticSql(metric, 'week', 3, null),
        kind: 'weekly',
        meta: { metric_id: metricId },
      });
    } else if (metric.view_name) {
      const dateCol = resolveDateCol(config, metric.view_name);
      queries.push({
        data_key: key,
        sql: buildViewAggSql(metric.view_name, dateCol, 'week', 3),
        kind: 'weekly',
        meta: { metric_id: metricId, view_name: metric.view_name, dateCol },
      });
    }
  }

  // 4. Grouped breakdowns
  for (const g of c.groupedCharts) {
    const metric = metricsMap.get(g.metricId);
    if (!metric?.semantic_table) continue;
    const key = `${g.metricId}:grouped:${g.dimension}`;
    expectedKeys.add(key);
    queries.push({
      data_key: key,
      sql: buildSemanticGroupedSql(metric, g.dimension, 'month', g.lastNMonths),
      kind: 'grouped',
      meta: { metric_id: g.metricId, dimension: g.dimension },
    });
  }

  // 5. Daily (~90 days) for semantic primitives — for grain switcher
  for (const metric of primitives) {
    if (!metric.semantic_table || !metric.semantic_measure || !metric.semantic_date_col) continue;
    const key = `${metric.id}:day`;
    expectedKeys.add(key);
    queries.push({
      data_key: key,
      sql: buildSemanticSql(metric, 'day', 3, null),
      kind: 'daily_90d',
      meta: { metric_id: metric.id },
    });
  }

  // 6. YoY — 36 months
  for (const metricId of c.yoyMetrics) {
    const metric = metricsMap.get(metricId);
    if (!metric?.semantic_table) continue;
    const key = `${metricId}:yoy`;
    expectedKeys.add(key);
    queries.push({
      data_key: key,
      sql: buildSemanticSql(metric, 'month', 36, null),
      kind: 'yoy',
      meta: { metric_id: metricId },
    });
  }

  // 7. Raw table sections
  for (const section of c.rawTableSections) {
    const metric = metricsMap.get(section.metricId);
    if (!metric?.semantic_table) continue;
    const cols = (section.columns || [metric.semantic_date_col, 'CompanyAccount']).join(', ');
    const table = `\`project-for-method-dw.revenue.${metric.semantic_table}\``;
    const limit = section.limit || 100;
    const orderCol = metric.semantic_date_col;
    const key = `${section.metricId}:raw`;
    expectedKeys.add(key);
    queries.push({
      data_key: key,
      sql: `SELECT ${cols} FROM ${table} ORDER BY ${orderCol} DESC LIMIT ${limit}`,
      kind: 'raw_table',
      meta: { metric_id: section.metricId, columns: section.columns },
    });
  }

  for (const d of derived) expectedKeys.add(String(d.id));

  return { queries, derived, expectedKeys: [...expectedKeys] };
}
```

- [ ] **Step 4: Run tests**

```bash
cd builder && npx vitest run tests/unit/sql-plan.test.js
```
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add builder/src/lib/sql/plan.js builder/tests/unit/sql-plan.test.js
git commit -m "feat: add buildScorecardQueryPlan (pure, browser+Node safe)"
```

---

## Task 5: `loadScorecardData` service — tests and implementation

**Files:**
- Create: `builder/src/lib/sql/load.js`
- Create: `builder/tests/unit/sql-load.test.js`

Single shared loader. Takes an injected `query(sql) => Promise<{rows}>` so both browser and Node use the same code path. Responsibility: execute the query plan with batching + retries, compute derived metrics, return a `Map` keyed the way consumers expect (numeric IDs → object).

- [ ] **Step 1: Write failing tests**

```js
// builder/tests/unit/sql-load.test.js
import { describe, it, expect, vi } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

const { loadScorecardData } = await import('../../src/lib/sql/load.js');

const makeMetric = (id, o = {}) => ({
  id, name: `M${id}`, view_name: null, chart_sql: null,
  semantic_table: null, semantic_measure: null, semantic_date_col: null,
  semantic_filters: null, semantic_dimensions: null,
  formula: null, depends_on: null, ...o,
});

describe('loadScorecardData', () => {
  it('stores primitive query results under numeric key', async () => {
    const metrics = [makeMetric(54, { chart_sql: "SELECT '2026-01' AS period, 10 AS value" })];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 54 }] }] };
    const query = vi.fn(async (_sql) => ({
      rows: [{ _key: '54', period: '2026-01', value: '10' }],
    }));
    const { dataMap, errors } = await loadScorecardData({ config, metrics, query });
    expect(dataMap.get(54)).toEqual({ labels: ['2026-01'], data: [10] });
    expect(errors).toEqual([]);
  });

  it('computes derived metrics from dependency data', async () => {
    // evaluateFormula uses {id} placeholders — not variable names like `a` or `b`
    const metrics = [
      makeMetric(100, { formula: 'SAFE_DIVIDE({54},{55})*100', depends_on: [54, 55] }),
      makeMetric(54, { chart_sql: "s1" }),
      makeMetric(55, { chart_sql: "s2" }),
    ];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 100 }] }] };
    const query = vi.fn(async (_sql) => ({
      rows: [
        { _key: '54', period: '2026-01', value: '5' },
        { _key: '55', period: '2026-01', value: '10' },
      ],
    }));
    const { dataMap } = await loadScorecardData({ config, metrics, query });
    // 5/10 * 100 = 50
    expect(dataMap.get(100).data[0]).toBe(50);
  });

  it('returns errors for failed queries without aborting the run', async () => {
    const metrics = [
      makeMetric(54, { chart_sql: "ok" }),
      makeMetric(55, { chart_sql: "bad" }),
    ];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 54 }, { metricId: 55 }] }] };
    let calls = 0;
    const query = vi.fn(async (sql) => {
      calls++;
      if (sql.includes('bad')) throw new Error('BQ 400: syntax');
      return { rows: [{ _key: '54', period: '2026-01', value: '1' }] };
    });
    const { dataMap, errors } = await loadScorecardData({ config, metrics, query });
    expect(dataMap.get(54)).toBeTruthy();
    expect(errors.length).toBeGreaterThan(0);
  });

  it('respects abort signal', async () => {
    const metrics = [makeMetric(54, { chart_sql: "s1" })];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 54 }] }] };
    const signal = { aborted: true };
    const query = vi.fn(async () => ({ rows: [] }));
    const { dataMap } = await loadScorecardData({ config, metrics, query, signal });
    expect(dataMap.size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd builder && npx vitest run tests/unit/sql-load.test.js
```

- [ ] **Step 3: Implement `builder/src/lib/sql/load.js`**

```js
import { buildScorecardQueryPlan } from './plan.js';
import { buildBatchSql, splitBatchResults } from './builders.js';
import { evaluateFormula } from '../sanitize.js';

const BATCH_CHUNK_SIZE = 6;
const BATCHABLE_KINDS = new Set(['primary_month', 'primary_view', 'custom', 'weekly', 'daily_90d', 'yoy']);

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export function topoSortDerived(derived) {
  if (derived.length <= 1) return [...derived];
  const idSet = new Set(derived.map(d => d.id));
  const inDegree = new Map(derived.map(d => [d.id, 0]));
  const adj = new Map(derived.map(d => [d.id, []]));
  for (const d of derived) {
    for (const depId of d.depends_on || []) {
      if (idSet.has(depId)) {
        adj.get(depId).push(d.id);
        inDegree.set(d.id, inDegree.get(d.id) + 1);
      }
    }
  }
  const queue = derived.filter(d => inDegree.get(d.id) === 0).map(d => d.id);
  const byId = new Map(derived.map(d => [d.id, d]));
  const out = [];
  while (queue.length > 0) {
    const id = queue.shift();
    out.push(byId.get(id));
    for (const n of adj.get(id)) {
      inDegree.set(n, inDegree.get(n) - 1);
      if (inDegree.get(n) === 0) queue.push(n);
    }
  }
  return out;
}

/**
 * Execute a scorecard's query plan and return a populated dataMap.
 *
 * @param {Object} params
 * @param {Object} params.config - Scorecard config
 * @param {Object[]} params.metrics - All metrics (from Supabase)
 * @param {(sql: string) => Promise<{rows: Object[]}>} params.query - Query executor
 * @param {(progress: {loaded, total}) => void} [params.onProgress]
 * @param {{aborted: boolean}} [params.signal] - Abort check (.aborted read before each step)
 * @returns {Promise<{ dataMap: Map, errors: Array<{data_key, message}>, plan }>}
 */
export async function loadScorecardData({ config, metrics, query, onProgress, signal }) {
  const aborted = () => signal?.aborted === true;
  const dataMap = new Map();
  const errors = [];

  if (aborted()) return { dataMap, errors, plan: null };

  const plan = buildScorecardQueryPlan(config, metrics);

  // Partition queries
  const batchable = plan.queries.filter(q => BATCHABLE_KINDS.has(q.kind));
  const individual = plan.queries.filter(q => !BATCHABLE_KINDS.has(q.kind));
  const batches = chunk(batchable, BATCH_CHUNK_SIZE);

  const totalSteps = batches.length + individual.length;
  let loaded = 0;
  const bump = () => { loaded++; onProgress?.({ loaded, total: totalSteps }); };

  // Run batches in parallel
  await Promise.all(batches.map(async (batch) => {
    if (aborted()) return;
    const sql = buildBatchSql(batch.map(q => ({ key: q.data_key, sql: q.sql })));
    const keyMap = new Map(batch.map(q => [q.data_key, q.data_key]));
    try {
      const res = await query(sql);
      const split = splitBatchResults(res.rows || [], keyMap);
      for (const [key, rows] of split) {
        storePrimary(dataMap, key, rows);
      }
      for (const q of batch) {
        if (!hasKey(dataMap, q.data_key)) storePrimary(dataMap, q.data_key, []);
      }
    } catch (e) {
      // Fall back: run each individually
      for (const q of batch) {
        if (aborted()) return;
        try {
          const res = await query(q.sql);
          storePrimary(dataMap, q.data_key, res.rows || []);
        } catch (e2) {
          storePrimary(dataMap, q.data_key, []);
          errors.push({ data_key: q.data_key, message: e2.message });
        }
      }
    }
    bump();
  }));

  if (aborted()) return { dataMap, errors, plan };

  // Run individual queries (grouped, raw_table) in parallel
  await Promise.all(individual.map(async (q) => {
    if (aborted()) return;
    try {
      const res = await query(q.sql);
      if (q.kind === 'grouped') {
        storeGrouped(dataMap, q.data_key, res.rows || []);
      } else if (q.kind === 'raw_table') {
        storeRaw(dataMap, q.data_key, res.rows || [], q.meta?.columns);
      } else {
        storePrimary(dataMap, q.data_key, res.rows || []);
      }
    } catch (e) {
      setKey(dataMap, q.data_key, null);
      errors.push({ data_key: q.data_key, message: e.message });
    }
    bump();
  }));

  if (aborted()) return { dataMap, errors, plan };

  // Compute derived metrics
  for (const d of topoSortDerived(plan.derived)) {
    try {
      const depData = {};
      for (const depId of d.depends_on) {
        const entry = dataMap.get(depId);
        const counts = {};
        if (entry && Array.isArray(entry.labels)) {
          entry.labels.forEach((l, i) => { counts[l] = entry.data[i]; });
        }
        depData[depId] = counts;
      }
      const allLabels = new Set();
      for (const counts of Object.values(depData)) Object.keys(counts).forEach(k => allLabels.add(k));
      const sorted = [...allLabels].sort();
      const labels = [];
      const data = [];
      for (const lbl of sorted) {
        const vals = {};
        for (const depId of d.depends_on) vals[depId] = depData[depId]?.[lbl] || 0;
        data.push(Math.round(evaluateFormula(d.formula, vals) * 100) / 100);
        labels.push(lbl);
      }
      dataMap.set(d.id, labels.length > 0 ? { labels, data } : null);
    } catch (e) {
      dataMap.set(d.id, null);
      errors.push({ data_key: String(d.id), message: e.message });
    }
  }

  return { dataMap, errors, plan };
}

// --- helpers ---

function keyOf(dataKey) {
  // Numeric bare keys → number (matches hook consumers)
  return /^\d+$/.test(dataKey) ? Number(dataKey) : dataKey;
}

function setKey(map, dataKey, value) {
  map.set(keyOf(dataKey), value);
}

function hasKey(map, dataKey) {
  return map.has(keyOf(dataKey));
}

function storePrimary(map, dataKey, rows) {
  if (!rows || rows.length === 0) {
    setKey(map, dataKey, null);
    return;
  }
  setKey(map, dataKey, {
    labels: rows.map(r => r.period),
    data: rows.map(r => Number(r.value) || 0),
  });
}

function storeGrouped(map, dataKey, rows) {
  if (!rows || rows.length === 0) {
    setKey(map, dataKey, null);
    return;
  }
  const labels = [...new Set(rows.map(r => r.period))].sort();
  const seriesMap = {};
  for (const row of rows) {
    if (!seriesMap[row.dimension]) seriesMap[row.dimension] = {};
    seriesMap[row.dimension][row.period] = Number(row.value) || 0;
  }
  const aligned = {};
  for (const [dim, byPeriod] of Object.entries(seriesMap)) {
    aligned[dim] = labels.map(l => byPeriod[l] ?? null);
  }
  setKey(map, dataKey, { labels, seriesMap: aligned });
}

function storeRaw(map, dataKey, rows, columns) {
  setKey(map, dataKey, { rows, columns });
}
```

- [ ] **Step 4: Run tests**

```bash
cd builder && npx vitest run tests/unit/sql-load.test.js
```
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add builder/src/lib/sql/load.js builder/tests/unit/sql-load.test.js
git commit -m "feat: add loadScorecardData — shared scorecard query executor for hook and cron"
```

---

## Task 6: Snapshot key hydration + freshness

**Files:**
- Create: `builder/src/lib/sql/keys.js`
- Create: `builder/src/lib/snapshots.js`
- Create: `builder/tests/unit/snapshot-keys.test.js`

- [ ] **Step 1: Failing tests**

```js
// builder/tests/unit/snapshot-keys.test.js
import { describe, it, expect } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

const { hydrateKeys, snapshotFreshness } = await import('../../src/lib/sql/keys.js');

describe('hydrateKeys', () => {
  it('converts numeric string keys to numbers', () => {
    const m = hydrateKeys({ '54': { labels: ['2026-01'], data: [1] } });
    expect(m.get(54)).toEqual({ labels: ['2026-01'], data: [1] });
    expect(m.has('54')).toBe(false);
  });

  it('leaves compound keys as strings', () => {
    const m = hydrateKeys({ '54:week': { labels: ['W1'], data: [2] } });
    expect(m.get('54:week')).toBeTruthy();
  });

  it('returns empty Map for {}', () => {
    expect(hydrateKeys({}).size).toBe(0);
  });

  it('returns empty Map for null', () => {
    expect(hydrateKeys(null).size).toBe(0);
  });
});

describe('snapshotFreshness', () => {
  it('fresh for <=30h', () => {
    const ts = new Date(Date.now() - 20 * 3600e3).toISOString();
    expect(snapshotFreshness(ts)).toBe('fresh');
  });
  it('stale for 30-48h', () => {
    const ts = new Date(Date.now() - 40 * 3600e3).toISOString();
    expect(snapshotFreshness(ts)).toBe('stale');
  });
  it('expired for >48h', () => {
    const ts = new Date(Date.now() - 60 * 3600e3).toISOString();
    expect(snapshotFreshness(ts)).toBe('expired');
  });
  it('expired for null', () => {
    expect(snapshotFreshness(null)).toBe('expired');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd builder && npx vitest run tests/unit/snapshot-keys.test.js
```

- [ ] **Step 3: Implement `builder/src/lib/sql/keys.js`**

```js
export function hydrateKeys(payload) {
  const map = new Map();
  if (!payload || typeof payload !== 'object') return map;
  for (const [k, v] of Object.entries(payload)) {
    if (/^\d+$/.test(k)) map.set(Number(k), v);
    else map.set(k, v);
  }
  return map;
}

export function snapshotFreshness(refreshedAt, now = Date.now()) {
  if (!refreshedAt) return 'expired';
  const ageHours = (now - new Date(refreshedAt).getTime()) / 3600000;
  if (ageHours <= 30) return 'fresh';
  if (ageHours <= 48) return 'stale';
  return 'expired';
}
```

- [ ] **Step 4: Implement `builder/src/lib/snapshots.js`**

```js
import { SUPABASE_URL, headers } from './supabase.js';
import { hydrateKeys, snapshotFreshness } from './sql/keys.js';

export async function fetchSnapshot(scorecardId) {
  const url = `${SUPABASE_URL}/rest/v1/scorecard_snapshots`
    + `?scorecard_id=eq.${encodeURIComponent(scorecardId)}`
    + `&status=eq.published`
    + `&select=payload,refreshed_at`
    + `&limit=1`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.warn(`[snapshots] fetch failed: ${res.status}`);
    return null;
  }
  const rows = await res.json();
  if (!rows.length) return null;
  const row = rows[0];
  return {
    dataMap: hydrateKeys(row.payload),
    refreshedAt: row.refreshed_at,
    freshness: snapshotFreshness(row.refreshed_at),
  };
}
```

- [ ] **Step 5: Run tests and commit**

```bash
cd builder && npx vitest run tests/unit/snapshot-keys.test.js
git add builder/src/lib/sql/keys.js builder/src/lib/snapshots.js builder/tests/unit/snapshot-keys.test.js
git commit -m "feat: add snapshot fetch helper, key hydration, and freshness classifier"
```

---

## Task 7: Snapshot contract test (guards against shape drift)

**Files:**
- Create: `builder/tests/unit/snapshot-contract.test.js`

This is the most important test in the plan. It pins the shape of dataMap entries against what the rendering components actually consume. If anything in `loadScorecardData`'s output shape drifts, this test breaks loudly.

- [ ] **Step 1: Identify consumer expectations**

Read:
- `builder/src/components/scorecards/KpiColumn.jsx` — confirms `dataMap.get(<numericId>)` → `{labels, data}`
- `builder/src/components/scorecards/Chart.jsx` — confirms multi-series grouped entries use `{labels, seriesMap}`
- `builder/src/components/scorecards/ScorecardSection.jsx` — confirms raw-table entries use `{rows, columns}`

Capture the exact property access shape in code comments in the test.

- [ ] **Step 2: Write the contract test**

```js
// builder/tests/unit/snapshot-contract.test.js
import { describe, it, expect } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

const { loadScorecardData } = await import('../../src/lib/sql/load.js');
const { hydrateKeys } = await import('../../src/lib/sql/keys.js');

const makeMetric = (id, o = {}) => ({
  id, name: `M${id}`, view_name: null, chart_sql: null,
  semantic_table: null, semantic_measure: null, semantic_date_col: null,
  semantic_filters: null, semantic_dimensions: null,
  formula: null, depends_on: null, ...o,
});

describe('snapshot contract — dataMap entry shapes', () => {
  it('primitive entry: { labels: string[], data: number[] }', async () => {
    const metrics = [makeMetric(54, { chart_sql: "x" })];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 54 }] }] };
    const query = async () => ({ rows: [{ _key: '54', period: '2026-01', value: '10' }] });
    const { dataMap } = await loadScorecardData({ config, metrics, query });
    const entry = dataMap.get(54);
    expect(entry).toBeTruthy();
    expect(Array.isArray(entry.labels)).toBe(true);
    expect(entry.labels.every(l => typeof l === 'string')).toBe(true);
    expect(Array.isArray(entry.data)).toBe(true);
    expect(entry.data.every(d => typeof d === 'number')).toBe(true);
    expect(entry.labels.length).toBe(entry.data.length);
  });

  it('grouped entry: { labels, seriesMap: { [dim]: (number|null)[] } }', async () => {
    const metrics = [makeMetric(54, {
      semantic_table: 'v_trials',
      semantic_measure: 'COUNT(*)',
      semantic_date_col: 'SignupDate',
      semantic_filters: [],
      semantic_dimensions: ['Channel'],
    })];
    const config = {
      id: 'x',
      sections: [{ charts: [{ groupByDimension: 'Channel', metrics: [{ id: 54 }], lastNMonths: 6 }] }],
    };
    let calls = 0;
    const query = async (sql) => {
      calls++;
      if (sql.includes('dimension')) {
        return { rows: [
          { period: '2026-01', dimension: 'SEO', value: '1' },
          { period: '2026-01', dimension: 'PPC', value: '2' },
          { period: '2026-02', dimension: 'SEO', value: '3' },
        ] };
      }
      return { rows: [] };
    };
    const { dataMap } = await loadScorecardData({ config, metrics, query });
    const entry = dataMap.get('54:grouped:Channel');
    expect(entry).toBeTruthy();
    expect(Array.isArray(entry.labels)).toBe(true);
    expect(typeof entry.seriesMap).toBe('object');
    expect(Array.isArray(entry.seriesMap.SEO)).toBe(true);
    expect(entry.seriesMap.SEO.length).toBe(entry.labels.length);
  });

  it('raw_table entry: { rows: Object[], columns: string[] }', async () => {
    const metrics = [makeMetric(54, {
      semantic_table: 'v_trials',
      semantic_measure: 'COUNT(*)',
      semantic_date_col: 'SignupDate',
      semantic_filters: [],
    })];
    const config = {
      id: 'x',
      sections: [{ type: 'rawTable', metricId: 54, columns: ['SignupDate', 'CompanyAccount'], limit: 10 }],
    };
    const query = async (sql) => {
      if (sql.includes('LIMIT')) {
        return { rows: [
          { SignupDate: '2026-04-01', CompanyAccount: 'Acme' },
          { SignupDate: '2026-04-02', CompanyAccount: 'Beta' },
        ] };
      }
      return { rows: [] };
    };
    const { dataMap } = await loadScorecardData({ config, metrics, query });
    const entry = dataMap.get('54:raw');
    expect(entry).toBeTruthy();
    expect(Array.isArray(entry.rows)).toBe(true);
    expect(entry.rows.length).toBe(2);
    expect(entry.columns).toEqual(['SignupDate', 'CompanyAccount']);
  });

  it('round-trip: JSON.stringify → hydrateKeys preserves shape', async () => {
    const metrics = [makeMetric(54, { chart_sql: "x" })];
    const config = { id: 'x', sections: [{ kpis: [{ metricId: 54 }] }] };
    const query = async () => ({ rows: [{ _key: '54', period: '2026-01', value: '10' }] });
    const { dataMap } = await loadScorecardData({ config, metrics, query });

    // Simulate serialization into Supabase and back
    const payload = Object.fromEntries([...dataMap.entries()].map(([k, v]) => [String(k), v]));
    const json = JSON.parse(JSON.stringify(payload));
    const rehydrated = hydrateKeys(json);

    expect(rehydrated.get(54)).toEqual(dataMap.get(54));
  });
});
```

- [ ] **Step 3: Run, expect PASS**

```bash
cd builder && npx vitest run tests/unit/snapshot-contract.test.js
```
Expected: All PASS. If not, `loadScorecardData`'s output shape is wrong — go back and fix.

- [ ] **Step 4: Commit**

```bash
git add builder/tests/unit/snapshot-contract.test.js
git commit -m "test: contract test for dataMap entry shapes (primitive, grouped, round-trip)"
```

---

## Task 8: Rewrite `useScorecardData` hook

**Files:**
- Modify: `builder/src/hooks/useScorecardData.js`

Full rewrite, preserving external API but switching internal flow to: snapshot-first → `loadScorecardData`. Removes all inline query-building logic (moved to `loadScorecardData`). Adds state for `freshness`, `refreshedAt`, `needsBq` and resets them when config changes.

- [ ] **Step 1: Rewrite `builder/src/hooks/useScorecardData.js`**

Replace the entire file content with:

```js
import { useState, useEffect, useRef } from 'react';
import { loadScorecardData } from '../lib/sql/load.js';
import { queryBqWithRetry } from '../lib/bigquery.js';
import { fetchSnapshot } from '../lib/snapshots.js';

// Phase 1: snapshot only wired up for marketing-scorecard.
const SNAPSHOT_ENABLED = new Set(['marketing-scorecard']);

const BQ_TOKEN_DELAY_MS = 500;

export default function useScorecardData(config, metrics, bqConnected) {
  const [dataMap, setDataMap] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [errors, setErrors] = useState([]);
  const [freshness, setFreshness] = useState(null);   // 'fresh' | 'stale' | 'expired' | null
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [needsBq, setNeedsBq] = useState(false);
  const abortRef = useRef(false);

  useEffect(() => {
    if (!config || !metrics?.length) {
      setLoading(false);
      return;
    }

    // Reset state on scorecard change
    abortRef.current = false;
    setLoading(true);
    setProgress({ loaded: 0, total: 0 });
    setErrors([]);
    setDataMap(new Map());
    setFreshness(null);
    setRefreshedAt(null);
    setNeedsBq(false);

    let delayTimer = null;

    (async () => {
      // 1. Try snapshot first (if enabled for this scorecard)
      if (SNAPSHOT_ENABLED.has(config.id)) {
        try {
          const snap = await fetchSnapshot(config.id);
          if (abortRef.current) return;
          if (snap && (snap.freshness === 'fresh' || snap.freshness === 'stale')) {
            setDataMap(snap.dataMap);
            setFreshness(snap.freshness);
            setRefreshedAt(snap.refreshedAt);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn('[Scorecard] Snapshot read failed, falling back to live:', e);
        }
      }

      // 2. Snapshot missing/expired → need live BQ
      if (!bqConnected) {
        if (abortRef.current) return;
        setNeedsBq(true);
        setLoading(false);
        return;
      }

      // 3. Wait for token, then run via loadScorecardData
      delayTimer = setTimeout(async () => {
        if (abortRef.current) return;
        const signal = { get aborted() { return abortRef.current; } };
        try {
          const { dataMap: liveData, errors: liveErrors } = await loadScorecardData({
            config,
            metrics,
            query: queryBqWithRetry,
            onProgress: (p) => { if (!abortRef.current) setProgress(p); },
            signal,
          });
          if (abortRef.current) return;
          setDataMap(liveData);
          setErrors(liveErrors);
          setLoading(false);
        } catch (e) {
          if (abortRef.current) return;
          console.error('[Scorecard] Live load failed:', e);
          setErrors([{ data_key: null, message: e.message }]);
          setLoading(false);
        }
      }, BQ_TOKEN_DELAY_MS);
    })();

    return () => {
      abortRef.current = true;
      if (delayTimer) clearTimeout(delayTimer);
    };
  }, [config, metrics, bqConnected]);

  return { dataMap, loading, progress, errors, freshness, refreshedAt, needsBq };
}

// Re-exports preserved for existing test imports
export { collectMetricIds } from '../lib/sql/plan.js';
export { topoSortDerived } from '../lib/sql/load.js';
```

- [ ] **Step 2: Run all tests**

```bash
cd builder && npx vitest run
```
Expected: All PASS. The old `scorecard-data.test.js` may have tests that relied on now-removed internal helpers; update or remove those tests (they'll error with a clear message if so).

- [ ] **Step 3: Build**

```bash
cd builder && npm run build
```

- [ ] **Step 4: Manual verification on a non-cached scorecard**

```bash
cd builder && npm run dev
```

Open sales-scorecard (NOT in SNAPSHOT_ENABLED). Verify:
- Connects to BigQuery flow works unchanged
- All sections render with data
- KPI/chart values identical to before the refactor

Marketing-scorecard at this point will try to load snapshot (fail, none exists yet), then fall back to live BQ. That fallback should still render normally. Manual-check this too.

- [ ] **Step 5: Commit**

```bash
git add builder/src/hooks/useScorecardData.js
git commit -m "refactor: useScorecardData uses loadScorecardData; adds snapshot-first path for marketing"
```

---

## Task 9: Move `bqConnected` gate in Scorecard.jsx + stale indicator

**Files:**
- Modify: `builder/src/pages/Scorecard.jsx`
- Create: `builder/src/components/StaleIndicator.jsx`

- [ ] **Step 1: Create `builder/src/components/StaleIndicator.jsx`**

```jsx
import React from 'react';

function formatAge(refreshedAt) {
  if (!refreshedAt) return '';
  const ageHours = Math.round((Date.now() - new Date(refreshedAt).getTime()) / 3600000);
  if (ageHours < 1) return 'just now';
  if (ageHours < 2) return '1 hour ago';
  return `${ageHours} hours ago`;
}

export default function StaleIndicator({ freshness, refreshedAt }) {
  if (freshness !== 'stale') return null;
  return (
    <div
      role="status"
      style={{
        fontSize: 12,
        color: '#92400e',
        background: '#fef3c7',
        border: '1px solid #fde68a',
        borderRadius: 6,
        padding: '6px 12px',
        marginBottom: 16,
        display: 'inline-block',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      Data refreshed {formatAge(refreshedAt)} — may be slightly stale
    </div>
  );
}
```

- [ ] **Step 2: Modify `builder/src/pages/Scorecard.jsx`**

Change the hook destructure (line 111) to pick up the new return values:
```jsx
const { dataMap, loading, freshness, refreshedAt, needsBq } = useScorecardData(config, metrics, bqConnected);
```

Add import:
```jsx
import StaleIndicator from '../components/StaleIndicator';
```

Replace the current early-return block (lines 130–146) that checks `!bqConnected`. The new precedence is:
1. `loading` → loading state
2. `needsBq && dataMap.size === 0` → Connect BQ CTA
3. Otherwise render scorecard (optionally with StaleIndicator)

Replace:
```jsx
if (!bqConnected) {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <h2 style={{ fontSize: 20, color: '#1a1a1a', marginBottom: 8 }}>{config.title}</h2>
      <p style={{ color: '#6b7280', marginBottom: 16 }}>Connect to BigQuery to load scorecard data.</p>
      <button onClick={onConnect} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        Connect BigQuery
      </button>
    </div>
  );
}
```

With:
```jsx
if (needsBq && dataMap.size === 0) {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <h2 style={{ fontSize: 20, color: '#1a1a1a', marginBottom: 8 }}>{config.title}</h2>
      <p style={{ color: '#6b7280', marginBottom: 16 }}>Connect to BigQuery to load scorecard data.</p>
      <button onClick={onConnect} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        Connect BigQuery
      </button>
    </div>
  );
}
```

Inside the main render's returned JSX, place `<StaleIndicator freshness={freshness} refreshedAt={refreshedAt} />` just above the `{ungrouped.map(...)}` loop.

- [ ] **Step 3: Run tests, build, manual verify**

```bash
cd builder && npx vitest run
cd builder && npm run build
cd builder && npm run dev
```

Manual: load a non-snapshot scorecard while NOT BQ-connected. Expect connect CTA. Connect BQ → data loads. No regression.

- [ ] **Step 4: Commit**

```bash
git add builder/src/pages/Scorecard.jsx builder/src/components/StaleIndicator.jsx
git commit -m "feat: Scorecard.jsx gates BQ-connect behind snapshot; add stale indicator"
```

---

## Task 10: Node BQ client

**Files:**
- Create: `builder/scripts/refresh-snapshots/bq-client.js`
- Modify: `builder/package.json`

- [ ] **Step 1: Install dependency**

```bash
cd builder && npm install --save-dev @google-cloud/bigquery
```

- [ ] **Step 2: Create `builder/scripts/refresh-snapshots/bq-client.js`**

```js
import { BigQuery } from '@google-cloud/bigquery';

export function createBqClient() {
  const keyJson = process.env.GCP_SA_KEY;
  if (!keyJson) throw new Error('GCP_SA_KEY env var not set');
  let creds;
  try { creds = JSON.parse(keyJson); }
  catch { throw new Error('GCP_SA_KEY is not valid JSON'); }
  return new BigQuery({ projectId: creds.project_id, credentials: creds });
}

/**
 * Adapter to match the { rows } contract that loadScorecardData expects.
 */
export function makeQuery(bq) {
  return async (sql) => {
    const [rows] = await bq.query({ query: sql, useLegacySql: false });
    const plain = rows.map(r => {
      const out = {};
      for (const [k, v] of Object.entries(r)) {
        out[k] = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
      }
      return out;
    });
    return { rows: plain };
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add builder/scripts/refresh-snapshots/bq-client.js builder/package.json builder/package-lock.json
git commit -m "feat: Node BigQuery client for cron script"
```

---

## Task 11: Supabase admin writer + refresh entrypoint

**Files:**
- Create: `builder/scripts/refresh-snapshots/supabase.js`
- Create: `builder/scripts/refresh-snapshots/index.js`

- [ ] **Step 1: Install dependency**

```bash
cd builder && npm install --save-dev @supabase/supabase-js
```

- [ ] **Step 2: Create `builder/scripts/refresh-snapshots/supabase.js`**

```js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co';

export function createSupabaseAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY env var not set');
  return createClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function fetchAllMetrics(supabase) {
  const { data, error } = await supabase.from('metrics').select('*').order('id');
  if (error) throw error;
  return data;
}

export async function beginSnapshot(supabase, scorecardId, configHash) {
  const { data, error } = await supabase
    .from('scorecard_snapshots')
    .insert({ scorecard_id: scorecardId, config_hash: configHash, status: 'building', payload: {} })
    .select('run_id')
    .single();
  if (error) throw error;
  return data.run_id;
}

/**
 * Atomic publish via Postgres RPC. Supersedes old + publishes new in one tx.
 */
export async function publishSnapshot(supabase, runId, payload) {
  const { error } = await supabase.rpc('publish_scorecard_snapshot', {
    p_run_id: runId,
    p_payload: payload,
  });
  if (error) throw error;
}

export async function failSnapshot(supabase, runId, errorLog) {
  await supabase
    .from('scorecard_snapshots')
    .update({ status: 'failed', error_log: errorLog })
    .eq('run_id', runId);
}
```

- [ ] **Step 3: Create `builder/scripts/refresh-snapshots/index.js`**

```js
#!/usr/bin/env node
import crypto from 'node:crypto';
import { SCORECARDS } from '../../src/config/scorecards/index.js';
import { loadScorecardData } from '../../src/lib/sql/load.js';
import { createBqClient, makeQuery } from './bq-client.js';
import {
  createSupabaseAdminClient,
  fetchAllMetrics,
  beginSnapshot,
  publishSnapshot,
  failSnapshot,
} from './supabase.js';

const ONLY_ID = process.env.ONLY_SCORECARD || 'marketing-scorecard';

function hashConfig(config) {
  return crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 16);
}

function dataMapToPayload(map) {
  const out = {};
  for (const [k, v] of map) out[String(k)] = v;
  return out;
}

async function refreshOne(scorecardId, supabase, query, metrics) {
  const config = SCORECARDS[scorecardId];
  if (!config) throw new Error(`Scorecard "${scorecardId}" not found`);

  console.log(`[refresh] Starting ${scorecardId}`);
  const runId = await beginSnapshot(supabase, scorecardId, hashConfig(config));
  console.log(`[refresh] run_id=${runId}`);

  try {
    const t0 = Date.now();
    const { dataMap, errors, plan } = await loadScorecardData({ config, metrics, query });
    const elapsed = Date.now() - t0;

    const populated = [...dataMap.values()].filter(v => v != null).length;
    console.log(`[refresh] ${populated}/${plan.expectedKeys.length} keys populated in ${elapsed}ms (${errors.length} errors)`);

    if (populated === 0) {
      throw new Error('All queries returned null — refusing to publish empty snapshot');
    }

    // Threshold gate: refuse to publish if too many keys failed
    const populatedRatio = populated / plan.expectedKeys.length;
    if (populatedRatio < 0.8) {
      throw new Error(`Only ${populated}/${plan.expectedKeys.length} keys populated (${Math.round(populatedRatio*100)}%) — below 80% threshold. Refusing to publish.`);
    }

    const payload = dataMapToPayload(dataMap);
    await publishSnapshot(supabase, runId, payload);
    console.log(`[refresh] Published ${scorecardId}`);

    if (errors.length > 0) console.warn('[refresh] Non-fatal errors:', errors);
    return { ok: true, scorecardId, populated, total: plan.expectedKeys.length, errors };
  } catch (e) {
    console.error(`[refresh] FAILED ${scorecardId}:`, e.message);
    await failSnapshot(supabase, runId, { message: e.message, stack: e.stack });
    return { ok: false, scorecardId, error: e.message };
  }
}

async function main() {
  const supabase = createSupabaseAdminClient();
  const bq = createBqClient();
  const query = makeQuery(bq);
  const metrics = await fetchAllMetrics(supabase);
  console.log(`[refresh] Fetched ${metrics.length} metrics`);

  const ids = ONLY_ID === 'ALL' ? Object.keys(SCORECARDS) : [ONLY_ID];
  console.log(`[refresh] Targets: ${ids.join(', ')}`);

  const results = [];
  for (const id of ids) {
    results.push(await refreshOne(id, supabase, query, metrics));
  }

  console.log('[refresh] Summary:', JSON.stringify(results, null, 2));
  if (results.some(r => !r.ok)) process.exit(1);
}

main().catch(e => {
  console.error('[refresh] Fatal:', e);
  process.exit(1);
});
```

- [ ] **Step 4: Smoke test end-to-end**

```bash
# Generate an ephemeral key for local testing
gcloud iam service-accounts keys create /tmp/refresh-key.json \
  --iam-account=bigquery-api-access@project-for-method-dw.iam.gserviceaccount.com \
  --project=project-for-method-dw

export GCP_SA_KEY="$(cat /tmp/refresh-key.json)"
export SUPABASE_SERVICE_ROLE_KEY='<paste service role key>'
export ONLY_SCORECARD=marketing-scorecard

cd builder && node scripts/refresh-snapshots/index.js
```

Expected: `[refresh] Published marketing-scorecard` at end. Verify in Supabase:

```sql
select status, published_at, jsonb_object_keys(payload) as k
from scorecard_snapshots
where scorecard_id = 'marketing-scorecard' and status = 'published';
```
Expected: one row; payload keys include `54`, `55`, `285`, `286`, etc.

- [ ] **Step 5: Cleanup**

```bash
rm /tmp/refresh-key.json
# Delete the key from GCP
gcloud iam service-accounts keys list --iam-account=bigquery-api-access@project-for-method-dw.iam.gserviceaccount.com --project=project-for-method-dw
# find the key ID that matches the one you just created (it will be the most recent)
gcloud iam service-accounts keys delete <KEY_ID> --iam-account=bigquery-api-access@project-for-method-dw.iam.gserviceaccount.com --project=project-for-method-dw
unset GCP_SA_KEY SUPABASE_SERVICE_ROLE_KEY ONLY_SCORECARD
```

- [ ] **Step 6: Verify frontend reads the snapshot**

```bash
cd builder && npm run dev
```
**Disconnect BigQuery in the app.** Navigate to Marketing Scorecard. Page should render from snapshot.

- [ ] **Step 7: Commit**

```bash
git add builder/scripts/refresh-snapshots/supabase.js builder/scripts/refresh-snapshots/index.js builder/package.json builder/package-lock.json
git commit -m "feat: Supabase admin writer + refresh entrypoint using loadScorecardData"
```

---

## Task 12: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/refresh-scorecards.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: Refresh Scorecard Snapshots

on:
  schedule:
    - cron: '0 10 * * *'  # 10:00 UTC — refine after checking BQ ETL completion time
  workflow_dispatch:
    inputs:
      scorecard:
        description: 'Scorecard ID (or ALL)'
        required: false
        default: 'marketing-scorecard'

jobs:
  refresh:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: builder/package-lock.json
      - name: Install
        run: cd builder && npm ci
      - name: Check BQ ETL freshness
        env:
          GCP_SA_KEY: ${{ secrets.GCP_SA_KEY }}
        run: |
          cd builder
          # Abort if key upstream tables haven't been modified in the last 18h —
          # indicates the nightly ETL hasn't finished yet.
          node -e "
            import('./scripts/refresh-snapshots/bq-client.js').then(async ({createBqClient, makeQuery}) => {
              const q = makeQuery(createBqClient());
              const { rows } = await q(\`
                SELECT table_id, TIMESTAMP_MILLIS(last_modified_time) AS lm
                FROM \\\`project-for-method-dw.revenue.__TABLES__\\\`
                WHERE table_id IN ('v_trials','v_syncs')
              \`);
              const cutoff = new Date(Date.now() - 18*3600*1000);
              const stale = rows.filter(r => new Date(r.lm) < cutoff);
              if (stale.length) {
                console.error('ETL freshness check FAILED. Stale tables:', stale);
                process.exit(1);
              }
              console.log('ETL freshness OK. Latest updates:', rows);
            });
          "
      - name: Refresh
        env:
          GCP_SA_KEY: ${{ secrets.GCP_SA_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          ONLY_SCORECARD: ${{ github.event.inputs.scorecard || 'marketing-scorecard' }}
        run: cd builder && node scripts/refresh-snapshots/index.js
```

- [ ] **Step 2: Commit, push, trigger**

```bash
git add .github/workflows/refresh-scorecards.yml
git commit -m "ci: nightly scorecard snapshot refresh workflow"
git push

gh workflow run refresh-scorecards.yml -f scorecard=marketing-scorecard
gh run list --workflow=refresh-scorecards.yml --limit=1
```

- [ ] **Step 3: Verify success**

Watch the run log:
```bash
gh run view --log  # use the run ID from the list
```
Expected: `[refresh] Published marketing-scorecard`. Exit code 0.

Verify snapshot in Supabase:
```sql
select status, published_at from scorecard_snapshots
where scorecard_id = 'marketing-scorecard' and status = 'published';
```
Expected: `published_at` within the last few minutes.

---

## Task 13: Verification script + BQ ETL checker

**Files:**
- Create: `builder/scripts/check-bq-etl-time.js`
- Create: `builder/scripts/verify-snapshot.js`

- [ ] **Step 1: Create `builder/scripts/check-bq-etl-time.js`**

```js
#!/usr/bin/env node
import { createBqClient, makeQuery } from './refresh-snapshots/bq-client.js';

const bq = createBqClient();
const query = makeQuery(bq);

const { rows } = await query(`
  SELECT table_id AS table_name,
         TIMESTAMP_MILLIS(last_modified_time) AS last_modified
  FROM \`project-for-method-dw.revenue.__TABLES__\`
  WHERE type IN (1, 3)
  ORDER BY last_modified DESC
  LIMIT 30
`);
console.table(rows);
```

Run it (same env setup as the refresh smoke test). Note the latest `last_modified` — this should inform the cron schedule. If all tables are refreshed before 10:00 UTC, the default is fine. If not, adjust and push.

- [ ] **Step 2: Create `builder/scripts/verify-snapshot.js`**

```js
#!/usr/bin/env node
import { SCORECARDS } from '../src/config/scorecards/index.js';
import { loadScorecardData } from '../src/lib/sql/load.js';
import { createBqClient, makeQuery } from './refresh-snapshots/bq-client.js';
import { createSupabaseAdminClient, fetchAllMetrics } from './refresh-snapshots/supabase.js';

const ONLY = process.env.ONLY_SCORECARD || 'marketing-scorecard';

const supabase = createSupabaseAdminClient();
const bq = createBqClient();
const query = makeQuery(bq);
const metrics = await fetchAllMetrics(supabase);
const config = SCORECARDS[ONLY];

const { data: snap, error } = await supabase
  .from('scorecard_snapshots')
  .select('payload,published_at')
  .eq('scorecard_id', ONLY)
  .eq('status', 'published')
  .single();
if (error || !snap) { console.error('No published snapshot:', error); process.exit(1); }

console.log(`Snapshot published at ${snap.published_at}`);

const { dataMap: live } = await loadScorecardData({ config, metrics, query });
const livePayload = Object.fromEntries([...live.entries()].map(([k, v]) => [String(k), v]));

const allKeys = [...new Set([...Object.keys(snap.payload), ...Object.keys(livePayload)])].sort();
let drift = 0;
for (const k of allKeys) {
  const a = JSON.stringify(snap.payload[k]);
  const b = JSON.stringify(livePayload[k]);
  if (a !== b) {
    drift++;
    console.log(`DRIFT ${k}:`);
    console.log(`  snap: ${a?.slice(0, 160)}`);
    console.log(`  live: ${b?.slice(0, 160)}`);
  }
}
console.log(`\n${drift}/${allKeys.length} keys differ`);
```

- [ ] **Step 3: Run it**

Same env setup as before. Expected: `0/N keys differ` or only tiny numeric drift from new rows added between snapshot and now.

- [ ] **Step 4: Commit**

```bash
git add builder/scripts/check-bq-etl-time.js builder/scripts/verify-snapshot.js
git commit -m "feat: BQ ETL time checker and snapshot-vs-live verifier"
```

---

## Task 14: Final QA and rollout

- [ ] **Step 1: Deploy**

```bash
cd builder && npm run build
git add builder/dist && git commit -m "build: snapshot cache phase 1" && git push
```

Wait ~2 min for GitHub Pages deploy. Open production URL:
`https://nickperaltab.github.io/method-metrics/builder/#/scorecard/marketing-scorecard`

- [ ] **Step 2: Verify fast-load**

With BQ **disconnected**: page should render with data in <1s.
With BQ connected: page should still render fast (snapshot wins over live path).

- [ ] **Step 3: Test stale banner**

```sql
update scorecard_snapshots set refreshed_at = now() - interval '40 hours'
where scorecard_id = 'marketing-scorecard' and status = 'published';
```
Reload page — expect yellow "Data refreshed 40 hours ago" banner.

```sql
update scorecard_snapshots set refreshed_at = now()
where scorecard_id = 'marketing-scorecard' and status = 'published';
```

- [ ] **Step 4: Test expired-snapshot live fallback**

```sql
update scorecard_snapshots set refreshed_at = now() - interval '72 hours'
where scorecard_id = 'marketing-scorecard' and status = 'published';
```
Reload with BQ connected: live BQ load (slower but works).
Reload with BQ disconnected: "Connect BigQuery" CTA.

Restore:
```sql
update scorecard_snapshots set refreshed_at = now()
where scorecard_id = 'marketing-scorecard' and status = 'published';
```

- [ ] **Step 5: Enable failure notifications**

Confirm GitHub settings → Notifications → Actions → "Send notifications for failed workflows only" is on. This is Phase 1's failure signal.

- [ ] **Step 6: Update TICKETS.md**

Add to the "Shipped" section:
```
- 2026-04-20 — Scorecard snapshot cache, Phase 1 (marketing-scorecard). Nightly refresh via GitHub Actions; frontend reads snapshot first, falls back to live BQ if >48h stale.
```

```bash
git add TICKETS.md
git commit -m "docs: mark scorecard snapshot cache Phase 1 shipped"
git push
```

---

## Rollback

If Phase 1 causes problems in production, use the tier that matches the symptom. Tiers are fastest-first.

### Tier 1 — Kill switch (~10 seconds, no deploy)

**Use when:** snapshot shows wrong data but the frontend/live path is healthy.

Run in Supabase SQL editor:
```sql
update scorecard_snapshots
set status = 'superseded'
where scorecard_id = 'marketing-scorecard' and status = 'published';
```

The frontend sees no published snapshot → `freshness = 'expired'` → falls back to live BQ automatically. No redeploy needed. This path is exercised by Task 14 Step 4's manual test.

### Tier 2 — Disable snapshot for marketing (~3 minutes)

**Use when:** the snapshot read path itself is buggy (e.g. hydration, Scorecard.jsx gate, stale indicator).

Edit `builder/src/hooks/useScorecardData.js`:
```js
const SNAPSHOT_ENABLED = new Set([]);  // was: ['marketing-scorecard']
```

Then:
```bash
cd builder && npm run build
git add builder/dist builder/src/hooks/useScorecardData.js
git commit -m "ops: temporarily disable snapshot for marketing-scorecard"
git push
```

GitHub Pages redeploys in ~2 minutes. Marketing now behaves exactly as before Phase 1 (live BQ only).

### Tier 3 — Revert the refactor (~5 minutes)

**Use when:** other scorecards (sales, trials-breakdown, etc.) break after Phase 1 deploys — indicates the `loadScorecardData` refactor regressed the live path for everyone.

```bash
git log --oneline | head -20   # find the refactor commits
git revert <sha-of-useScorecardData-rewrite> <sha-of-loadScorecardData-creation>
git push
```

All scorecards go back to pre-Phase-1 state. The `scorecard_snapshots` table and cron workflow remain but are dormant — harmless.

### Tier 4 — Kill the cron (~10 seconds)

**Use when:** the nightly job itself is misbehaving (wrong writes, cost spike, unexpected behavior).

```bash
gh workflow disable refresh-scorecards.yml
```

Writes stop immediately. Existing published snapshots remain valid until 48h, then frontend auto-falls-back to live. Re-enable with `gh workflow enable refresh-scorecards.yml`.

### Tier 5 — Drop the migration (rarely needed)

**Use when:** migration itself is broken or schema needs complete removal.

```sql
drop table public.scorecard_snapshots cascade;
drop function public.publish_scorecard_snapshot(uuid, jsonb);
```

Combine with Tier 2 (remove marketing from `SNAPSHOT_ENABLED`) so the frontend doesn't query a missing table. Only needed if the table or function design is fundamentally flawed.

### Rollback decision table

| Symptom | Tier |
|---|---|
| Marketing shows wrong numbers | 1 |
| Marketing page crashes / renders blank | 2 |
| Other scorecards (sales, etc.) broken after deploy | 3 |
| Cron misbehaving or too expensive | 4 |
| Schema needs full removal | 5 |

---

## Phase 2 preview (separate plan)

When Phase 1 is stable for 1+ week:
- Expand `SNAPSHOT_ENABLED` to all 13 scorecards
- Add Slack failure alerting
- Add coverage dashboard (populated keys / expected keys)
- Tighten `scorecard_snapshots` retention (keep last 7 runs per scorecard, prune older)

---

## Open risks / followups

1. **`collectMetricIds` does not iterate `section.tables`.** Preserves current behavior; some table columns in Marketing Scorecard render empty today (e.g. metric 354 in Trial Summary Table). File separate ticket — not in scope.
2. **Config hash mismatch.** `config_hash` is stored but not currently enforced. If a config changes mid-day, frontend sees stale shape vs new config. Phase 2 should warn on hash mismatch.
3. **Derived formula evaluation runs in two places (hook + cron via `loadScorecardData`).** They share code (`evaluateFormula`) so drift risk is low, but a change to the formula sanitizer would affect both.
4. **Supabase service role key is in chat history from the planning session.** Rotate in Supabase dashboard once Phase 1 is live.
