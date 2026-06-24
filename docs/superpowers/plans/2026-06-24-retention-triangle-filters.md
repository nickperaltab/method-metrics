# Retention Triangle Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select filters (Industry L1, Customer type, Country, Channel) to the Customer Retention Triangle by turning its dbt model into a dimension cube and filtering client-side.

**Architecture:** Extend `int_customer_retention_triangle` to grain `(cohort_month, tenure_k, l1, segment, country, channel)` with additive measures; L1 comes from a new `v7_classification.account_labels` dbt source. The frontend fetches the cube once and `toTriangle(rows, measure, basis, filters)` sums the matching slice (AND across filters); a display threshold hides thin filtered cohorts.

**Tech Stack:** dbt (BigQuery), dbt unit/schema tests, Python (parity), React + Vite + Vitest.

## Global Constraints

- Grain: customer (`EntityRecordID`). Dims frozen at cohort start (the customer's `Segment`/`SignupCountry`/`AttributionChannel` in its first paying month; L1 = current classification).
- Dims: `l1` (from `account_labels`, deduped, Multi-client/Unclassified buckets), `segment` (`int_customer_mrr.Segment`), `country` (`SignupCountry`), `channel` (`AttributionChannel`).

> **Superseded:** l1 is sourced from `v_entity_primary_label` on `customer_record_id = EntityRecordID` (customer grain), not `account_labels`/`Company`. The join to `account_labels` via `Company = company_account` described below was replaced in the implementation.
- **Drop the in-model `HAVING n_start >= 20`.** The cube stores every cell so the "All" rollup is exact; the min-cohort threshold (default 20) moves to display-time in the frontend (hide cohorts whose *filtered* n_start < 20).
- Filters multi-select, combined with AND. Empty/absent selection = "All". No-filter rollup must equal today's numbers (regression + parity check).
- Censor logic unchanged (dynamic latest-complete-month default, `retention_censor_month` var override for tests).
- New dbt source: `v7_classification.account_labels` (database `project-for-method-dw`, schema `v7_classification`).
- Deploy user-gated: Pages rebuilds from `main` on push; never push without approval; never `vercel`.
- After model change, `dbt parse` + commit `target/manifest.json` so the ⓘ panel resolves the updated model.

---

### Task 1: Add `account_labels` source + extend the model into a cube + unit test

**Files:**
- Modify: `models/_sources.yml` (add the v7_classification source)
- Modify: `models/intermediate/int_customer_retention_triangle.sql`
- Modify: `models/intermediate/_int_customer_retention_triangle.yml` (unit test fixture)

**Interfaces:**
- Produces: table grain `(cohort_month DATE, tenure_k INT64, l1 STRING, segment STRING, country STRING, channel STRING)` + measures `n_start, n_active, mrr_start, mrr_active`.

- [ ] **Step 1: Declare the new source**

In `models/_sources.yml`, add a second source group after the `revenue` one (same indentation level under `sources:`):

```yaml
  - name: v7_classification
    database: project-for-method-dw
    schema: v7_classification
    description: V7 industry classification enrichment (account_labels). Current-state labels per CompanyAccount.
    tables:
      - name: account_labels
        description: One row per (account_record_id) classification. Keyed to CompanyAccount via company_account. Columns used here, deduped per company_account by confidence then classified_at, l1 + is_multi_client.
```

- [ ] **Step 2: Update the unit test fixture (failing — new grain + inputs)**

Replace the `unit_tests:` block in `_int_customer_retention_triangle.yml` with one that supplies the dim columns + an `account_labels` mock and expects the dim-split grain. Censor to `2024-01-01` so only k=0 rows are produced (small expectation):

```yaml
version: 2

unit_tests:
  - name: retention_triangle_cube_basic
    model: int_customer_retention_triangle
    overrides:
      vars:
        retention_censor_month: '2024-01-01'
    given:
      - input: ref('int_customer_mrr')
        rows:
          - { Month: '2024-01-01', EntityRecordID: 1, StartMRR: 100, Company: 'CoA', Segment: 'Solo no DEP', SignupCountry: 'US', AttributionChannel: 'SEO' }
          - { Month: '2024-01-01', EntityRecordID: 2, StartMRR: 200, Company: 'CoB', Segment: 'Team AI Plus', SignupCountry: 'CA', AttributionChannel: 'PPC' }
      - input: source('revenue', 'Funnel')
        rows:
          - { EntityRecordID: 1, Date: '2023-07-01', EventType: 'Trial' }
          - { EntityRecordID: 2, Date: '2023-08-01', EventType: 'Trial' }
      - input: source('v7_classification', 'account_labels')
        rows:
          - { company_account: 'CoA', l1: 'Manufacturing', confidence: 0.9, classified_at: '2026-01-01', is_multi_client: false }
          - { company_account: 'CoB', l1: 'Retail', confidence: 0.9, classified_at: '2026-01-01', is_multi_client: false }
    expect:
      rows:
        - { cohort_month: '2024-01-01', tenure_k: 0, l1: 'Manufacturing', segment: 'Solo no DEP', country: 'US', channel: 'SEO', n_start: 1, n_active: 1, mrr_start: 100, mrr_active: 100 }
        - { cohort_month: '2024-01-01', tenure_k: 0, l1: 'Retail', segment: 'Team AI Plus', country: 'CA', channel: 'PPC', n_start: 1, n_active: 1, mrr_start: 200, mrr_active: 200 }
```

Run: `dbt test --select int_customer_retention_triangle`
Expected: FAIL (model still has the old grain / no dims).

- [ ] **Step 3: Extend the model**

Rewrite `models/intermediate/int_customer_retention_triangle.sql`:

```sql
{{ config(materialized='table') }}

-- Customer retention CUBE: monthly cohorts x tenure x (l1, segment, country, channel).
-- Customer grain (EntityRecordID). Dims frozen at cohort start; l1 is current classification.
-- Additive measures: the frontend sums the filtered slice and derives the four views.
-- No in-model n_start threshold: the cube is complete so the "All" rollup is exact;
-- the min-cohort threshold is applied at display time in the frontend.

WITH monthly_mrr AS (
  SELECT Month, EntityRecordID, SUM(StartMRR) AS mrr
  FROM {{ ref('int_customer_mrr') }}
  GROUP BY 1, 2
),
signup AS (
  SELECT EntityRecordID, MIN(Date) AS sd
  FROM {{ source('revenue', 'Funnel') }}
  WHERE EventType = 'Trial'
  GROUP BY 1
),
first_pay AS (
  SELECT EntityRecordID, MIN(Month) AS cohort_month
  FROM monthly_mrr WHERE mrr > 0 GROUP BY 1
),
labels AS (  -- one row per company_account, highest-confidence wins
  SELECT
    company_account,
    CASE WHEN is_multi_client THEN 'Multi-client' ELSE COALESCE(l1, 'Unclassified') END AS l1
  FROM {{ source('v7_classification', 'account_labels') }}
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY company_account ORDER BY confidence DESC, classified_at DESC
  ) = 1
),
dims AS (  -- cohort-start attributes, one row per entity at its first paying month
  SELECT
    d.EntityRecordID, d.Company,
    COALESCE(d.Segment, '(unknown)') AS segment,
    COALESCE(d.SignupCountry, '(unknown)') AS country,
    COALESCE(d.AttributionChannel, '(unknown)') AS channel
  FROM {{ ref('int_customer_mrr') }} d
  JOIN first_pay fp ON fp.EntityRecordID = d.EntityRecordID AND d.Month = fp.cohort_month
),
base AS (
  SELECT
    fp.EntityRecordID AS eid, fp.cohort_month, b.mrr AS mrr0,
    dm.segment, dm.country, dm.channel,
    COALESCE(lb.l1, 'Unclassified') AS l1
  FROM first_pay fp
  JOIN monthly_mrr b ON b.EntityRecordID = fp.EntityRecordID AND b.Month = fp.cohort_month
  JOIN signup s ON s.EntityRecordID = fp.EntityRecordID AND s.sd >= '2021-06-01'
  LEFT JOIN dims dm ON dm.EntityRecordID = fp.EntityRecordID
  LEFT JOIN labels lb ON lb.company_account = dm.Company
),
joined AS (
  SELECT
    base.cohort_month, k AS tenure_k, base.mrr0, IFNULL(f.mrr, 0) AS mrrk,
    base.l1, base.segment, base.country, base.channel
  FROM base, UNNEST(GENERATE_ARRAY(0, 24)) AS k
  LEFT JOIN monthly_mrr f
    ON f.EntityRecordID = base.eid
    AND f.Month = DATE_ADD(base.cohort_month, INTERVAL k MONTH)
  WHERE DATE_ADD(base.cohort_month, INTERVAL k MONTH) <=
    {%- if var('retention_censor_month', none) is not none %}
    DATE('{{ var("retention_censor_month") }}')
    {%- else %}
    DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH)
    {%- endif %}
)
SELECT
  cohort_month, tenure_k, l1, segment, country, channel,
  COUNT(*) AS n_start,
  COUNTIF(mrrk > 0) AS n_active,
  SUM(mrr0) AS mrr_start,
  SUM(mrrk) AS mrr_active
FROM joined
GROUP BY 1, 2, 3, 4, 5, 6
ORDER BY 1, 2, 3, 4, 5, 6
```

Run: `dbt test --select int_customer_retention_triangle`
Expected: PASS (cube unit test). Fix NUMERIC formatting in the YAML if needed; do not change model logic.

- [ ] **Step 4: Commit**

```bash
git add models/_sources.yml models/intermediate/int_customer_retention_triangle.sql models/intermediate/_int_customer_retention_triangle.yml
git commit -m "feat(retention): extend triangle into a dimension cube (l1/segment/country/channel)"
```

---

### Task 2: Schema tests + metric-def + build + manifest refresh

**Files:**
- Modify: `models/intermediate/_int_customer_retention_triangle.yml` (models block)
- Modify: `tests/assert_retention_triangle_unique.sql`
- Modify: `docs/metric-definitions.md`
- Modify: `target/manifest.json`

- [ ] **Step 1: Update the schema tests for the new grain**

In the `models:` block of `_int_customer_retention_triangle.yml`, update the description (note the cube grain + display-time threshold) and add `not_null` tests on `l1`, `segment`, `country`, `channel`. Keep the existing `tenure_k` accepted_values and the not_nulls on n_start/n_active/mrr_start.

Update `tests/assert_retention_triangle_unique.sql` to the full grain:

```sql
-- Fails if any (cohort_month, tenure_k, l1, segment, country, channel) cell repeats.
SELECT cohort_month, tenure_k, l1, segment, country, channel, COUNT(*) AS n
FROM {{ ref('int_customer_retention_triangle') }}
GROUP BY 1, 2, 3, 4, 5, 6
HAVING COUNT(*) > 1
```

(`assert_retention_triangle_invariants.sql` — `n_active > n_start` — is unchanged and still valid per cell.)

- [ ] **Step 2: Update the metric-definitions entry**

In `docs/metric-definitions.md`, update the `int_customer_retention_triangle` entry: grain now includes `l1/segment/country/channel`; add that filters are applied in-app (multi-select AND, display-time min-cohort threshold); note L1 source = `account_labels`. Keep the net-MRR + intermediate-not-live caveats.

- [ ] **Step 3: Build + test**

Run: `dbt build --select int_customer_retention_triangle`
Expected: model materializes; all schema + singular + unit tests PASS.

- [ ] **Step 4: Refresh + commit manifest**

Run: `dbt parse`, then commit.

```bash
git add models/intermediate/_int_customer_retention_triangle.yml tests/assert_retention_triangle_unique.sql docs/metric-definitions.md target/manifest.json
git commit -m "test(retention): cube schema tests + metric-def + manifest refresh"
```

---

### Task 3: Parity — cube rolls up to the pre-filter numbers

**Files:** Modify `scripts/parity_int_customer_retention_triangle.py`

- [ ] **Step 1: Update the parity script to roll the cube over dims**

The source query stays dim-free (the original cohort×tenure logic). The model query now sums the cube over all dims to `(cohort_month, tenure_k)`. They must match cell-by-cell — proving the cube rollup equals the pre-filter numbers (and that dropping the HAVING didn't change the aggregate vs the source method).

Change the model-side query in `scripts/parity_int_customer_retention_triangle.py` to:

```python
mdl = {(str(r['cohort_month']), int(r['tenure_k'])): (int(r['n_start']), int(r['n_active']))
       for r in client.query(
         "SELECT cohort_month, tenure_k, SUM(n_start) n_start, SUM(n_active) n_active "
         "FROM `project-for-method-dw.revenue.int_customer_retention_triangle` "
         "GROUP BY 1,2").result()}
```

Keep the source query as-is **except** drop its `HAVING n_start >= 20` (the cube no longer thresholds, so the rollup includes all cohorts; the source must too for an apples-to-apples match). Keep the union-of-keys mismatch check + `sys.exit(1)`.

- [ ] **Step 2: Run**

Run: `python scripts/parity_int_customer_retention_triangle.py`
Expected: `PASS: model == source method on all cells.` If mismatch, STOP and diagnose (likely a dim join fanning out — a customer matching >1 `account_labels` row would inflate counts; the `QUALIFY ... = 1` dedup must prevent it).

- [ ] **Step 3: Commit**

```bash
git add scripts/parity_int_customer_retention_triangle.py
git commit -m "test(retention): parity rolls cube over dims to pre-filter totals (PASS)"
```

---

### Task 4: Frontend transform — filters + filterOptions + filtered n_start

**Files:**
- Modify: `builder/src/lib/retentionTriangleSql.js`
- Modify: `builder/tests/unit/retentionTriangleSql.test.js`

**Interfaces:**
- Produces:
  - `buildRetentionTriangleSql()` selects the four dim columns too.
  - `FILTER_DIMS = [{key:'l1',label:'Industry'},{key:'segment',label:'Customer type'},{key:'country',label:'Country'},{key:'channel',label:'Channel'}]`.
  - `filterOptions(rows): { l1:[], segment:[], country:[], channel:[] }` — sorted distinct values per dim.
  - `toTriangle(rows, measure, basis, filters)` — `filters` optional `{ l1:Set, segment:Set, country:Set, channel:Set }`; a row is included if, for each dim, the filter set is empty/absent OR contains the row's value. `cohorts[].n_start` is the filtered cohort size. Output shape otherwise unchanged.

- [ ] **Step 1: Write failing tests**

Add to `builder/tests/unit/retentionTriangleSql.test.js`:

```javascript
import { toTriangle, filterOptions, buildRetentionTriangleSql, FILTER_DIMS } from '../../src/lib/retentionTriangleSql.js';

const cubeRows = [
  { cohort_month: '2025-01-01', tenure_k: 0, l1: 'Manufacturing', segment: 'Solo no DEP', country: 'US', channel: 'SEO', n_start: 10, n_active: 10, mrr_start: 100, mrr_active: 100 },
  { cohort_month: '2025-01-01', tenure_k: 0, l1: 'Retail', segment: 'Team AI Plus', country: 'CA', channel: 'PPC', n_start: 5, n_active: 5, mrr_start: 200, mrr_active: 200 },
  { cohort_month: '2025-01-01', tenure_k: 1, l1: 'Manufacturing', segment: 'Solo no DEP', country: 'US', channel: 'SEO', n_start: 10, n_active: 8, mrr_start: 100, mrr_active: 80 },
  { cohort_month: '2025-01-01', tenure_k: 1, l1: 'Retail', segment: 'Team AI Plus', country: 'CA', channel: 'PPC', n_start: 5, n_active: 5, mrr_start: 200, mrr_active: 200 },
];

describe('cube filtering', () => {
  it('no filter rolls up all dims (All)', () => {
    const t = toTriangle(cubeRows, 'customers', 'from_start');
    expect(t.cohorts[0].n_start).toBe(15);          // 10 + 5
    expect(t.cells['2025-01-01'][1]).toBe(86.7);     // (8+5)/15
  });
  it('AND filter selects the slice', () => {
    const t = toTriangle(cubeRows, 'customers', 'from_start', { l1: new Set(['Manufacturing']) });
    expect(t.cohorts[0].n_start).toBe(10);
    expect(t.cells['2025-01-01'][1]).toBe(80);       // 8/10
  });
  it('filterOptions returns sorted distinct values per dim', () => {
    const o = filterOptions(cubeRows);
    expect(o.l1).toEqual(['Manufacturing', 'Retail']);
    expect(o.segment).toEqual(['Solo no DEP', 'Team AI Plus']);
  });
  it('SQL selects the dim columns', () => {
    const sql = buildRetentionTriangleSql();
    ['l1', 'segment', 'country', 'channel'].forEach((d) => expect(sql).toContain(d));
  });
});
```

Run: `cd builder && npx vitest run tests/unit/retentionTriangleSql.test.js`
Expected: FAIL (filterOptions/FILTER_DIMS not exported; toTriangle ignores filters/dims).

- [ ] **Step 2: Implement**

In `builder/src/lib/retentionTriangleSql.js`:

- Update the SQL: `SELECT cohort_month, tenure_k, l1, segment, country, channel, n_start, n_active, mrr_start, mrr_active`.
- Add:

```javascript
export const FILTER_DIMS = [
  { key: 'l1', label: 'Industry' },
  { key: 'segment', label: 'Customer type' },
  { key: 'country', label: 'Country' },
  { key: 'channel', label: 'Channel' },
];

export function filterOptions(rows) {
  const out = { l1: new Set(), segment: new Set(), country: new Set(), channel: new Set() };
  for (const r of rows) for (const d of FILTER_DIMS) if (r[d.key] != null) out[d.key].add(r[d.key]);
  return Object.fromEntries(FILTER_DIMS.map((d) => [d.key, [...out[d.key]].sort()]));
}

function rowMatches(r, filters) {
  if (!filters) return true;
  for (const d of FILTER_DIMS) {
    const sel = filters[d.key];
    if (sel && sel.size > 0 && !sel.has(r[d.key])) return false;
  }
  return true;
}
```

- In `toTriangle(rows, measure, basis, filters)`: before indexing, filter+aggregate the cube into per-(cohort, tenure) totals. Replace the row-indexing so each `(cohort_month, tenure_k)` accumulates summed `n_start/n_active/mrr_start/mrr_active` over rows passing `rowMatches`. Then the existing ratio + rolling-average logic runs unchanged on the summed cells. `cohorts[].n_start` = summed n_start at k=0 for the filter.

  Concretely, build `agg = Map(cohort -> Map(k -> {n_start,n_active,mrr_start,mrr_active}))` by summing matching rows, then compute `cells`/`cohorts`/`averages` from `agg` exactly as before (the ratio helpers read the summed fields).

- [ ] **Step 3: Run to pass**

Run: `cd builder && npx vitest run tests/unit/retentionTriangleSql.test.js`
Expected: PASS (existing + 4 new).

- [ ] **Step 4: Commit**

```bash
git add builder/src/lib/retentionTriangleSql.js builder/tests/unit/retentionTriangleSql.test.js
git commit -m "feat(retention): cube filtering in toTriangle + filterOptions (unit-tested)"
```

---

### Task 5: MultiSelect filters in the component + display threshold

**Files:**
- Create: `builder/src/components/scorecards/MultiSelect.jsx`
- Modify: `builder/src/components/scorecards/RetentionTriangle.jsx`

**Interfaces:** Consumes `filterOptions`, `FILTER_DIMS` (Task 4). The component holds a `filters` state ({dimKey: Set}) and passes it to `toTriangle`.

- [ ] **Step 1: Build a small reusable MultiSelect**

First check for an existing multi-select in the app (e.g. the net-saas scorecard filters); if a suitable one exists, reuse it and skip this file. Otherwise create `builder/src/components/scorecards/MultiSelect.jsx`:

```jsx
import { useState, useRef, useEffect } from 'react';

// Compact multi-select: button shows "Label: All" / "Label: N", popover has checkboxes.
export default function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const count = selected.size;
  const toggle = (v) => {
    const next = new Set(selected);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange(next);
  };
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-block', marginRight: 10 }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
        border: '1px solid #d1d5db', background: count ? '#ecfdf5' : '#fff', color: '#374151',
      }}>{label}: {count === 0 ? 'All' : count} ▾</button>
      {open && (
        <div style={{
          position: 'absolute', zIndex: 20, top: '110%', left: 0, minWidth: 160, maxHeight: 260,
          overflowY: 'auto', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: 6,
        }}>
          {count > 0 && (
            <div onClick={() => onChange(new Set())} style={{ fontSize: 12, color: '#2563eb', cursor: 'pointer', padding: '4px 6px' }}>Clear</div>
          )}
          {options.map((v) => (
            <label key={v} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, padding: '3px 6px', cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.has(v)} onChange={() => toggle(v)} />
              {v}
            </label>
          ))}
        </div>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Wire filters + display threshold into RetentionTriangle**

In `RetentionTriangle.jsx`:
- Import `MultiSelect`, and `filterOptions`, `FILTER_DIMS` from the lib.
- Add state: `const [filters, setFilters] = useState({ l1: new Set(), segment: new Set(), country: new Set(), channel: new Set() });`
- Compute `const options = filterOptions(rows);` after `rows` loads.
- Pass `filters` to `toTriangle(rows, measure, basis, filters)`.
- Render a filter row above the Measure/Basis toggles: one `MultiSelect` per `FILTER_DIMS` entry, `options={options[d.key]}`, `selected={filters[d.key]}`, `onChange={(s) => setFilters({ ...filters, [d.key]: s })}`.
- Apply the **display threshold**: `const MIN_COHORT = 20;` and render only `cohorts.filter((c) => c.n_start >= MIN_COHORT)`. (Keeps thin filtered slices out.)
- Auto-scale colors and rolling-6 average already operate on whatever `toTriangle` returns, so they automatically reflect the filtered slice. No change needed there beyond using the filtered cohort list for the min/max flat array.

- [ ] **Step 3: Build + full test suite**

Run: `cd builder && npm run build && npx vitest run`
Expected: build OK; all tests pass.

- [ ] **Step 4: Live verification (controller)**

Open the Customers page with BQ connected: confirm the four filters populate, selecting values narrows the grid (AND), "All"/Clear resets, the rolling row + colors reflect the slice, thin slices drop out, and the ⓘ panel still opens. Screenshot. (Authed browser; subagent stops at build/tests green.)

- [ ] **Step 5: Commit**

```bash
git add builder/src/components/scorecards/MultiSelect.jsx builder/src/components/scorecards/RetentionTriangle.jsx
git commit -m "feat(retention): multi-select filters (industry/customer type/country/channel) + display threshold"
```

---

### Task 6: Build artifact + deploy (user-gated)

- [ ] **Step 1:** `cd builder && npm run build && npm run lint` — both clean.
- [ ] **Step 2:** Deploy is user-gated. When approved: merge to `main`, push, confirm the Pages run + a fresh live bundle, and confirm the served `dbt-models.json` includes the updated model. Never `vercel`.

---

## Self-Review

**Spec coverage:**
- account_labels source + cube model (l1/segment/country/channel), HAVING dropped → Task 1. ✓
- Schema tests on new grain + metric-def + manifest → Task 2. ✓
- Parity rollup == pre-filter numbers → Task 3. ✓
- toTriangle filters (AND) + filterOptions + filtered n_start, no-filter==today → Task 4. ✓
- MultiSelect UI (4 dims) + display threshold → Task 5. ✓
- Dims frozen at cohort start; L1 deduped + Multi-client/Unclassified → Task 1 (dims/labels CTEs). ✓
- Build/deploy gated → Task 6. ✓

**Placeholder scan:** No TBD/TODO; full code in each step. Task 5 Step 1 says "check for an existing multi-select, else create" and ships the full fallback component — a real reuse check, not a placeholder.

**Type consistency:** cube columns `(cohort_month, tenure_k, l1, segment, country, channel, n_start, n_active, mrr_start, mrr_active)` consistent across Tasks 1–4. `toTriangle(rows, measure, basis, filters)`, `filterOptions`, `FILTER_DIMS` consistent across Tasks 4–5. `MIN_COHORT`/display threshold in Task 5 replaces the dropped in-model `HAVING` (Task 1) — single source of the 20 threshold, now frontend.
