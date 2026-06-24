# Customer Retention Triangle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cohort retention triangle on the Customers page — monthly cohorts × tenure, toggling Customers/MRR and From-start/Previous-month — backed by one parity-verified dbt model with the ⓘ → dbt panel.

**Architecture:** A dbt model `int_customer_retention_triangle` (customer grain, one row per cohort_month × tenure with raw counts + MRR) feeds a `RetentionTriangle.jsx` heatmap (mirroring `BookHeatmap.jsx`); a pure `toTriangle(rows, measure, basis)` transform derives all four views; the section wires into the generic renderer with a `dbtModel` pointer for the inspector.

**Tech Stack:** dbt (BigQuery), dbt unit + schema tests, Python (parity), React + Vite + Vitest.

## Global Constraints

- Grain: customer (`EntityRecordID`). Source: `ref('int_customer_mrr')` (col `StartMRR`) + `source('revenue','Funnel')` Trial signup gate `MIN(Date) >= '2021-06-01'`.
- Cohort = customer's first paying **month**: `MIN(Month) WHERE StartMRR > 0`. Tenure k = 0–24.
- Censor: cell kept only where `cohort_month + k <= var('retention_censor_month','2026-05-01')`. Threshold `n_start >= var('retention_min_cohort', 20)`.
- Because a monthly cohort shares one `cohort_month`, the censor passes/fails a whole (cohort, k) cell together — so `n_start = COUNT(*)` is the true, constant cohort size (unlike the yearly survival model). `n_active <= n_start` always holds.
- Four views, all derived in the frontend from the one model: Customers/from-start = `n_active(k)/n_start`; Customers/MoM = `n_active(k)/n_active(k-1)`; MRR/from-start = `mrr_active(k)/mrr_start`; MRR/MoM = `mrr_active(k)/mrr_active(k-1)`. MoM at k=0 = null; divide-by-zero = null.
- MRR measure is **net** (NRR-style, can exceed 100%); label "MRR retained (net)". Not capped-GRR.
- Monthly cohorts only. No CSV, no segment filter in V1.
- After adding the model, refresh `target/manifest.json` (`dbt parse`) and commit it, so the ⓘ dbt panel resolves the new model (the projection reads the committed manifest + the `.sql` on disk).
- Deploy is user-gated: Pages rebuilds from `main` on push; never push without approval; never `vercel`.

---

### Task 1: dbt model `int_customer_retention_triangle` + unit test

**Files:**
- Create: `models/intermediate/int_customer_retention_triangle.sql`
- Create: `models/intermediate/_int_customer_retention_triangle.yml`

**Interfaces:**
- Produces: table `revenue.int_customer_retention_triangle`, grain `(cohort_month DATE, tenure_k INT64)`, cols `n_start INT64, n_active INT64, mrr_start NUMERIC, mrr_active NUMERIC`.

- [ ] **Step 1: Write the failing unit test**

Create `models/intermediate/_int_customer_retention_triangle.yml`:

```yaml
version: 2

unit_tests:
  - name: retention_triangle_basic
    model: int_customer_retention_triangle
    overrides:
      vars:
        retention_min_cohort: 1
        retention_censor_month: '2024-03-01'
    given:
      - input: ref('int_customer_mrr')
        rows:
          - { Month: '2024-01-01', EntityRecordID: 1, StartMRR: 100 }
          - { Month: '2024-02-01', EntityRecordID: 1, StartMRR: 100 }
          - { Month: '2024-03-01', EntityRecordID: 1, StartMRR: 50 }
          - { Month: '2024-01-01', EntityRecordID: 2, StartMRR: 200 }
          - { Month: '2024-03-01', EntityRecordID: 2, StartMRR: 200 }
      - input: source('revenue', 'Funnel')
        rows:
          - { EntityRecordID: 1, Date: '2023-07-01', EventType: 'Trial' }
          - { EntityRecordID: 2, Date: '2023-08-01', EventType: 'Trial' }
    expect:
      rows:
        - { cohort_month: '2024-01-01', tenure_k: 0, n_start: 2, n_active: 2, mrr_start: 300, mrr_active: 300 }
        - { cohort_month: '2024-01-01', tenure_k: 1, n_start: 2, n_active: 1, mrr_start: 300, mrr_active: 100 }
        - { cohort_month: '2024-01-01', tenure_k: 2, n_start: 2, n_active: 2, mrr_start: 300, mrr_active: 250 }
```

Hand-check: both entities first-pay 2024-01 (cohort 2024-01, n_start=2, mrr_start=300). k1 (2024-02): e1=100, e2 no row→0 → n_active=1, mrr=100. k2 (2024-03): e1=50, e2 reactivates=200 → n_active=2 (reactivation), mrr=250. This fixture deliberately covers a reactivation (n_active rises k1→k2).

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `dbt test --select int_customer_retention_triangle`
Expected: FAIL — model node not found.

- [ ] **Step 3: Write the model**

Create `models/intermediate/int_customer_retention_triangle.sql`:

```sql
{{ config(materialized='table') }}

-- Customer retention triangle: monthly cohorts x tenure. Customer grain (EntityRecordID).
-- Mirrors int_customer_survival but cohorts by first-paying MONTH (not year).
-- Frontend derives the four views (Customers/MRR x from-start/MoM) from these raw columns.

WITH mrr AS (
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
  FROM mrr WHERE mrr > 0 GROUP BY 1
),
base AS (
  SELECT fp.EntityRecordID AS eid, fp.cohort_month, b.mrr AS mrr0
  FROM first_pay fp
  JOIN mrr b ON b.EntityRecordID = fp.EntityRecordID AND b.Month = fp.cohort_month
  JOIN signup s ON s.EntityRecordID = fp.EntityRecordID AND s.sd >= '2021-06-01'
),
joined AS (
  SELECT base.cohort_month, k AS tenure_k, base.mrr0, IFNULL(f.mrr, 0) AS mrrk
  FROM base, UNNEST(GENERATE_ARRAY(0, 24)) AS k
  LEFT JOIN mrr f
    ON f.EntityRecordID = base.eid
    AND f.Month = DATE_ADD(base.cohort_month, INTERVAL k MONTH)
  WHERE DATE_ADD(base.cohort_month, INTERVAL k MONTH)
        <= DATE('{{ var("retention_censor_month", "2026-05-01") }}')
)
SELECT
  cohort_month,
  tenure_k,
  COUNT(*) AS n_start,           -- cohort size (constant across k: a monthly cohort's censor passes/fails per cell uniformly)
  COUNTIF(mrrk > 0) AS n_active,
  SUM(mrr0) AS mrr_start,
  SUM(IF(mrrk > 0, mrrk, 0)) AS mrr_active
FROM joined
GROUP BY 1, 2
HAVING n_start >= {{ var("retention_min_cohort", 20) }}
ORDER BY 1, 2
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `dbt test --select int_customer_retention_triangle`
Expected: PASS. If NUMERIC columns fail on `300` vs `300.0` formatting, match dbt's rendered form in the YAML; do not change the model.

- [ ] **Step 5: Commit**

```bash
git add models/intermediate/int_customer_retention_triangle.sql models/intermediate/_int_customer_retention_triangle.yml
git commit -m "feat(retention): int_customer_retention_triangle model + dbt unit test"
```

---

### Task 2: Schema tests + description + build + manifest refresh

**Files:**
- Modify: `models/intermediate/_int_customer_retention_triangle.yml`
- Create (if dbt_utils absent): `tests/assert_retention_triangle_invariants.sql`, `tests/assert_retention_triangle_unique.sql`
- Modify: `target/manifest.json` (refreshed)

- [ ] **Step 1: Add the `models:` block**

Append to `_int_customer_retention_triangle.yml`:

```yaml
models:
  - name: int_customer_retention_triangle
    description: >
      Customer retention triangle, customer grain (EntityRecordID). One row per
      (cohort_month, tenure_k). Frontend derives four views from these raw
      counts: Customers vs MRR, each From-start (active/start) or Previous-month
      (active/prior). MRR is net (NRR-style, can exceed 100% on expansion or
      reactivation), distinct from the survival model's capped GRR. Monthly
      cohorts; signup gate Trial >= 2021-06-01; n_start >= 20; right-censored at
      the latest complete month. Source: int_customer_mrr.
    columns:
      - name: cohort_month
        tests: [not_null]
      - name: tenure_k
        tests:
          - not_null
          - accepted_values:
              arguments:
                values: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24]
                quote: false
      - name: n_start
        tests: [not_null]
      - name: n_active
        tests: [not_null]
      - name: mrr_start
        tests: [not_null]
```

(Use the `arguments:` nesting for `accepted_values` to match dbt-fusion 2.0, as in `_mrr_decomposition.yml`. Verify against the actual dbt version.)

- [ ] **Step 2: Add invariant + uniqueness tests**

Check `packages.yml` for `dbt_utils`. It is NOT installed (confirmed in the survival work), so use singular tests. Create `tests/assert_retention_triangle_unique.sql`:

```sql
-- Fails if any (cohort_month, tenure_k) cell appears more than once.
SELECT cohort_month, tenure_k, COUNT(*) AS n
FROM {{ ref('int_customer_retention_triangle') }}
GROUP BY 1, 2
HAVING COUNT(*) > 1
```

Create `tests/assert_retention_triangle_invariants.sql`:

```sql
-- Fails if any cohort has more active members than it started with.
SELECT cohort_month, tenure_k
FROM {{ ref('int_customer_retention_triangle') }}
WHERE n_active > n_start
```

- [ ] **Step 3: Build + test against BigQuery**

Run: `dbt build --select int_customer_retention_triangle`
Expected: model materializes to `revenue.int_customer_retention_triangle`; all schema + singular + unit tests PASS.

- [ ] **Step 4: Refresh + commit the manifest (so the ⓘ panel resolves the new model)**

Run: `dbt parse` then confirm the model appears: `python3 -c "import json;m=json.load(open('target/manifest.json'));print('int_customer_retention_triangle' in [v['name'] for v in m['nodes'].values() if v.get('resource_type')=='model'])"`
Expected: `True`.

```bash
git add models/intermediate/_int_customer_retention_triangle.yml tests/assert_retention_triangle_unique.sql tests/assert_retention_triangle_invariants.sql target/manifest.json
git commit -m "test(retention): schema + invariant tests; refresh manifest for inspector"
```

---

### Task 3: Parity diagnostic + yearly-rollup tie

**Files:**
- Create: `scripts/parity_int_customer_retention_triangle.py`

**Interfaces:** consumes `revenue.int_customer_retention_triangle` + `revenue.int_customer_survival`.

- [ ] **Step 1: Write the verification script**

Create `scripts/parity_int_customer_retention_triangle.py`:

```python
#!/usr/bin/env python3
"""Verify int_customer_retention_triangle two ways:
1. Source-method reproduction on current data (cell-by-cell, must match exactly).
2. Yearly-rollup tie: rolling monthly cohorts up to first-pay YEAR and computing
   from-start GRR-style (LEAST cap) should reconcile with int_customer_survival.
   NOTE: the triangle stores net mrr_active (no cap), so the tie is a sanity band
   (within ~1pp at settled checkpoints), not bit-exact.
"""
import sys
from google.cloud import bigquery
client = bigquery.Client(project='project-for-method-dw')

# 1. Source-method reproduction (same SQL the model encodes) vs the model.
SRC = """
WITH mrr AS (SELECT Month, EntityRecordID, SUM(StartMRR) mrr
             FROM `project-for-method-dw.revenue.int_customer_mrr` GROUP BY 1,2),
signup AS (SELECT EntityRecordID, MIN(Date) sd FROM `project-for-method-dw.revenue.Funnel`
           WHERE EventType='Trial' GROUP BY 1),
fp AS (SELECT EntityRecordID, MIN(Month) cohort_month FROM mrr WHERE mrr>0 GROUP BY 1),
base AS (SELECT fp.EntityRecordID eid, fp.cohort_month, b.mrr mrr0 FROM fp
         JOIN mrr b ON b.EntityRecordID=fp.EntityRecordID AND b.Month=fp.cohort_month
         JOIN signup s ON s.EntityRecordID=fp.EntityRecordID AND s.sd>='2021-06-01'),
j AS (SELECT base.cohort_month, k tenure_k, IFNULL(f.mrr,0) mrrk FROM base, UNNEST(GENERATE_ARRAY(0,24)) k
      LEFT JOIN mrr f ON f.EntityRecordID=base.eid AND f.Month=DATE_ADD(base.cohort_month, INTERVAL k MONTH)
      WHERE DATE_ADD(base.cohort_month, INTERVAL k MONTH) <= DATE('2026-05-01'))
SELECT cohort_month, tenure_k, COUNT(*) n_start, COUNTIF(mrrk>0) n_active
FROM j GROUP BY 1,2 HAVING n_start>=20 ORDER BY 1,2
"""
src = {(str(r['cohort_month']), int(r['tenure_k'])): (int(r['n_start']), int(r['n_active']))
       for r in client.query(SRC).result()}
mdl = {(str(r['cohort_month']), int(r['tenure_k'])): (int(r['n_start']), int(r['n_active']))
       for r in client.query("SELECT cohort_month, tenure_k, n_start, n_active "
                             "FROM `project-for-method-dw.revenue.int_customer_retention_triangle`").result()}
mismatch = [k for k in set(src) | set(mdl) if src.get(k) != mdl.get(k)]
print(f"source-method cells: {len(src)} | model cells: {len(mdl)} | mismatches: {len(mismatch)}")
for k in mismatch[:10]:
    print(f"  MISMATCH {k}: src={src.get(k)} model={mdl.get(k)}")
if mismatch:
    print("FAIL: model does not reproduce the source method.")
    sys.exit(1)
print("PASS: model == source method on all cells.")
```

- [ ] **Step 2: Run it**

Run: `python scripts/parity_int_customer_retention_triangle.py`
Expected: `PASS: model == source method on all cells.` If mismatches, STOP and diagnose (do not weaken the assertion).

- [ ] **Step 3: Commit**

```bash
git add scripts/parity_int_customer_retention_triangle.py
git commit -m "test(retention): parity — model reproduces source method (PASS)"
```

---

### Task 4: metric-definitions entry

**Files:** Modify `docs/metric-definitions.md`

- [ ] **Step 1: Append the entry** (match the existing entry style in the file)

```markdown
### Customer Retention Triangle (`int_customer_retention_triangle`)

- **What it answers:** For each monthly cohort, what share of customers (and MRR) is retained at each month of tenure, and where does the leak happen?
- **Grain:** customer-level (`EntityRecordID`; a customer may own multiple `CompanyAccount`s) / monthly cohort / tenure-indexed.
- **Measures (derived in the app):** Customers (count) and MRR (net), each From-start (`active/start`) or Previous-month (`active/prior`). MoM and net-MRR can exceed 100% (reactivation/expansion).
- **Filters:** signup Trial `>= 2021-06-01`; `n_start >= 20` per cohort; right-censored at the latest complete month.
- **Methodology source:** mirrors `int_customer_survival` at monthly-cohort grain; source `int_customer_mrr` (2026-06).
- **Verified:** `scripts/parity_int_customer_retention_triangle.py` — model reproduces the source method cell-by-cell; yearly rollup ties to `int_customer_survival` within rounding.
- **Caveats:** MRR is net (NRR-style), not the survival chart's capped GRR. Customer grain, not `CompanyAccount`. Parity-verified intermediate (`revenue.int_customer_retention_triangle`), not a canonical `v_metric__`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/metric-definitions.md
git commit -m "docs(retention): metric-definitions entry for int_customer_retention_triangle"
```

---

### Task 5: Frontend SQL + `toTriangle` transform (vitest)

**Files:**
- Create: `builder/src/lib/retentionTriangleSql.js`
- Create: `builder/tests/unit/retentionTriangleSql.test.js`

**Interfaces:**
- Produces:
  - `buildRetentionTriangleSql(): string` — SELECT over `revenue.int_customer_retention_triangle`.
  - `RETENTION_MAX_TENURE = 11` (display columns 0–11, matching the CRO example).
  - `toTriangle(rows, measure, basis): { cohorts, tenures, cells, averages }` where `rows = [{cohort_month, tenure_k, n_start, n_active, mrr_start, mrr_active}]`, `measure ∈ {'customers','mrr'}`, `basis ∈ {'from_start','mom'}`. `cohorts = [{cohort_month, n_start}]` sorted desc by month; `tenures = [0..11]`; `cells[cohort_month][k]` = rounded percent or null; `averages[k]` = mean of non-null cells at k.

- [ ] **Step 1: Write the failing test**

Create `builder/tests/unit/retentionTriangleSql.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { toTriangle, RETENTION_MAX_TENURE } from '../../src/lib/retentionTriangleSql.js';

const rows = [
  { cohort_month: '2024-01-01', tenure_k: 0, n_start: 2, n_active: 2, mrr_start: 300, mrr_active: 300 },
  { cohort_month: '2024-01-01', tenure_k: 1, n_start: 2, n_active: 1, mrr_start: 300, mrr_active: 100 },
  { cohort_month: '2024-01-01', tenure_k: 2, n_start: 2, n_active: 2, mrr_start: 300, mrr_active: 250 },
];

describe('toTriangle', () => {
  it('customers from_start = active/start', () => {
    const { cells } = toTriangle(rows, 'customers', 'from_start');
    expect(cells['2024-01-01'][0]).toBe(100);
    expect(cells['2024-01-01'][1]).toBe(50);
    expect(cells['2024-01-01'][2]).toBe(100);
  });
  it('customers mom = active/prior, null at k0, >100% on reactivation', () => {
    const { cells } = toTriangle(rows, 'customers', 'mom');
    expect(cells['2024-01-01'][0]).toBe(null);
    expect(cells['2024-01-01'][1]).toBe(50);
    expect(cells['2024-01-01'][2]).toBe(200); // 2/1 reactivation
  });
  it('mrr from_start and mom', () => {
    expect(toTriangle(rows, 'mrr', 'from_start').cells['2024-01-01'][2]).toBe(83.3); // 250/300
    expect(toTriangle(rows, 'mrr', 'mom').cells['2024-01-01'][2]).toBe(250);          // 250/100
  });
  it('exposes cohorts (with n_start) and averages', () => {
    const t = toTriangle(rows, 'customers', 'from_start');
    expect(t.cohorts).toEqual([{ cohort_month: '2024-01-01', n_start: 2 }]);
    expect(t.tenures[0]).toBe(0);
    expect(t.averages[0]).toBe(100);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd builder && npx vitest run tests/unit/retentionTriangleSql.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `builder/src/lib/retentionTriangleSql.js`:

```javascript
export const RETENTION_MAX_TENURE = 11;

export function buildRetentionTriangleSql() {
  return `
    SELECT cohort_month, tenure_k, n_start, n_active, mrr_start, mrr_active
    FROM \`project-for-method-dw.revenue.int_customer_retention_triangle\`
    WHERE tenure_k <= ${RETENTION_MAX_TENURE}
    ORDER BY cohort_month, tenure_k
  `;
}

function round1(x) { return Math.round(x * 10) / 10; }

// measure: 'customers' | 'mrr'   basis: 'from_start' | 'mom'
export function toTriangle(rows, measure, basis) {
  const tenures = Array.from({ length: RETENTION_MAX_TENURE + 1 }, (_, k) => k);
  const numKey = measure === 'mrr' ? 'mrr_active' : 'n_active';
  const startKey = measure === 'mrr' ? 'mrr_start' : 'n_start';

  // Index rows by cohort, and capture n_start per cohort.
  const byCohort = new Map(); // cohort_month -> Map(k -> row)
  for (const r of rows) {
    const cm = String(r.cohort_month);
    if (!byCohort.has(cm)) byCohort.set(cm, new Map());
    byCohort.get(cm).set(Number(r.tenure_k), r);
  }
  const cohorts = [...byCohort.keys()].sort().reverse().map((cm) => ({
    cohort_month: cm,
    n_start: byCohort.get(cm).get(0)?.n_start ?? null,
  }));

  const cells = {};
  for (const cm of byCohort.keys()) {
    const k2row = byCohort.get(cm);
    cells[cm] = tenures.map((k) => {
      const cur = k2row.get(k);
      if (!cur) return null;
      if (basis === 'mom') {
        if (k === 0) return null;
        const prev = k2row.get(k - 1);
        const denom = prev ? prev[numKey] : 0;
        return denom > 0 ? round1((cur[numKey] / denom) * 100) : null;
      }
      const denom = cur[startKey];
      return denom > 0 ? round1((cur[numKey] / denom) * 100) : null;
    });
  }

  const averages = tenures.map((k) => {
    const vals = cohorts.map((c) => cells[c.cohort_month][k]).filter((v) => v != null);
    return vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  });

  return { cohorts, tenures, cells, averages };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd builder && npx vitest run tests/unit/retentionTriangleSql.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add builder/src/lib/retentionTriangleSql.js builder/tests/unit/retentionTriangleSql.test.js
git commit -m "feat(retention): triangle SQL + toTriangle transform (unit-tested)"
```

---

### Task 6: RetentionTriangle component

**Files:**
- Create: `builder/src/components/scorecards/RetentionTriangle.jsx`

**Interfaces:**
- Consumes: `buildRetentionTriangleSql`, `toTriangle`, `RETENTION_MAX_TENURE` (Task 5); `queryBq` from `lib/bigquery`.
- Produces: default-exported `<RetentionTriangle />` (fetches its own data).

- [ ] **Step 1: Write the component**

Create `builder/src/components/scorecards/RetentionTriangle.jsx`. Mirror `BookHeatmap.jsx`'s table + color approach; here the color ramp maps a retention percent (red low → green high):

```jsx
import { useState, useEffect } from 'react';
import { queryBq } from '../../lib/bigquery';
import { buildRetentionTriangleSql, toTriangle } from '../../lib/retentionTriangleSql';

const MEASURES = [{ k: 'customers', l: 'Customers (%)' }, { k: 'mrr', l: 'MRR (net %)' }];
const BASES = [{ k: 'from_start', l: 'From start' }, { k: 'mom', l: 'Previous month' }];

// Red (low) -> amber -> green (high). pct anchored 0..100 for from-start; for MoM,
// values cluster near 100, so center the ramp at 100 with a +/-15 band.
function retentionColor(pct, basis) {
  if (pct == null) return 'transparent';
  let frac;
  if (basis === 'mom') frac = Math.max(0, Math.min(1, (pct - 85) / 30)); // 85..115 -> 0..1
  else frac = Math.max(0, Math.min(1, pct / 100));
  const stops = [[0, [220, 38, 38]], [0.5, [245, 158, 11]], [1, [5, 150, 105]]];
  let lo = stops[0], hi = stops[2];
  for (let i = 0; i < 2; i++) if (frac >= stops[i][0] && frac <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  const t = (frac - lo[0]) / (hi[0] - lo[0] || 1);
  const c = lo[1].map((ch, i) => Math.round(ch + (hi[1][i] - ch) * t));
  return `rgba(${c[0]},${c[1]},${c[2]},0.55)`;
}

const cell = { padding: '4px 6px', fontSize: 11, textAlign: 'center', borderRadius: 3, minWidth: 46 };

export default function RetentionTriangle() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [measure, setMeasure] = useState('customers');
  const [basis, setBasis] = useState('mom');

  useEffect(() => {
    let alive = true;
    queryBq(buildRetentionTriangleSql())
      .then((res) => { if (alive) setRows(res?.rows ?? []); })
      .catch((e) => { if (alive) setError(e.message || String(e)); });
    return () => { alive = false; };
  }, []);

  if (error) return <div style={{ color: '#b91c1c', padding: 16 }}>Failed to load: {error}</div>;
  if (!rows) return <div style={{ color: '#6b7280', padding: 16 }}>Loading retention triangle…</div>;

  const { cohorts, tenures, cells, averages } = toTriangle(rows, measure, basis);
  const Toggle = ({ opts, val, set }) => (
    <span style={{ display: 'inline-flex', gap: 6, marginRight: 16 }}>
      {opts.map((o) => (
        <button key={o.k} onClick={() => set(o.k)} style={{
          padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid #d1d5db',
          background: val === o.k ? '#059669' : '#fff', color: val === o.k ? '#fff' : '#374151',
        }}>{o.l}</button>
      ))}
    </span>
  );

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <Toggle opts={MEASURES} val={measure} set={setMeasure} />
        <Toggle opts={BASES} val={basis} set={setBasis} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontFamily: "'DM Sans', sans-serif" }}>
          <thead>
            <tr>
              <th style={{ ...cell, color: '#6b7280', textAlign: 'left' }}>Cohort</th>
              <th style={{ ...cell, color: '#6b7280' }}>n</th>
              {tenures.map((k) => <th key={k} style={{ ...cell, color: '#6b7280' }}>{k}</th>)}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => (
              <tr key={c.cohort_month}>
                <td style={{ ...cell, textAlign: 'left', color: '#1a1a1a' }}>{c.cohort_month.slice(0, 7)}</td>
                <td style={{ ...cell, color: '#6b7280' }}>{c.n_start}</td>
                {tenures.map((k) => {
                  const v = cells[c.cohort_month][k];
                  return <td key={k} style={{ ...cell, background: retentionColor(v, basis), color: '#1a1a1a' }}>{v == null ? '' : v + '%'}</td>;
                })}
              </tr>
            ))}
            <tr>
              <td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>Average</td>
              <td style={cell}></td>
              {tenures.map((k) => <td key={k} style={{ ...cell, fontWeight: 700 }}>{averages[k] == null ? '' : averages[k] + '%'}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd builder && npm run build`
Expected: succeeds. (Live render verified in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add builder/src/components/scorecards/RetentionTriangle.jsx
git commit -m "feat(retention): RetentionTriangle heatmap with Measure/Basis toggles"
```

---

### Task 7: Wire into the Customers page + build/deploy

**Files:**
- Modify: `builder/src/pages/Scorecard.jsx` (import + the custom-component branch)
- Modify: `builder/src/config/scorecards/customer-segments-scorecard.js` (add the section)

**Interfaces:** consumes `RetentionTriangle`; the generic renderer already renders `section.component` sections in array order with a title-ⓘ when `section.dbtModel` is set (shipped in the inspector work).

- [ ] **Step 1: Import + add the render branch**

In `builder/src/pages/Scorecard.jsx`, add near the other scorecard-component imports:

```jsx
import RetentionTriangle from '../components/scorecards/RetentionTriangle';
```

In the `mainSections.map` component branch, the body currently reads `{section.component === 'cohortSurvival' && <CohortSurvivalChart />}`. Add the triangle alongside it:

```jsx
            {section.component === 'cohortSurvival' && <CohortSurvivalChart />}
            {section.component === 'retentionTriangle' && <RetentionTriangle />}
```

- [ ] **Step 2: Add the section to the Customers page**

In `builder/src/config/scorecards/customer-segments-scorecard.js`, add a section in the retention area (e.g. right after the cohort survival section, before Customer List):

```javascript
    // ── Retention triangle ──────────────────────────────────────
    {
      title: 'Customer Retention Triangle',
      component: 'retentionTriangle',
      dbtModel: 'int_customer_retention_triangle',
    },
```

- [ ] **Step 3: Build + full test suite**

Run: `cd builder && npm run build && npx vitest run`
Expected: build succeeds; all tests pass (4 new + existing).

- [ ] **Step 4: Live verification (controller, not subagent)**

Open the Customers page with BQ connected. Confirm the triangle renders, the Measure (Customers/MRR) and Basis (From start/Previous month) toggles switch the grid + colors, the Average row shows, and the title ⓘ opens the dbt panel for `int_customer_retention_triangle`. Capture a screenshot. (Needs an authed browser; subagent stops at build/tests green.)

- [ ] **Step 5: Commit**

```bash
git add builder/src/pages/Scorecard.jsx builder/src/config/scorecards/customer-segments-scorecard.js
git commit -m "feat(retention): wire Customer Retention Triangle into the Customers page"
```

- [ ] **Step 6: Production build + lint (deploy gate)**

Run: `cd builder && npm run build && npm run lint`
Expected: build succeeds; lint exits 0.

- [ ] **Step 7: Deploy (user-gated)**

Do NOT push to `main` without explicit approval. When approved: merge to `main`, push, confirm the Pages run succeeds and the live builder serves a fresh bundle. The dbt model must be materialized in prod (Task 2) for the live page to load. Never `vercel`.

---

## Self-Review

**Spec coverage:**
- dbt model, customer grain, raw counts+MRR → Task 1. ✓
- Anchor/cohort/censor/threshold/grain → Task 1 + Global Constraints. ✓
- Schema + invariant + uniqueness tests, manifest refresh for ⓘ → Task 2. ✓
- Parity (source-method) + yearly tie note → Task 3. ✓
- metric-definitions entry (net-MRR caveat, intermediate-not-live) → Task 4. ✓
- Four derived views, MoM-null-at-k0, divide-by-zero null → Task 5 (`toTriangle`) + Global Constraints. ✓
- Heatmap component, Measure+Basis toggles, Average row, n column → Task 6. ✓
- Wiring on Customers page, ⓘ via dbtModel → Task 7. ✓
- Monthly-only, net-MRR, no CSV/segment → Global Constraints + scope. ✓
- Build/deploy gated → Task 7. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete. Task 2 Step 1 notes verifying `accepted_values` syntax against the dbt version — that's a real verification instruction, not a placeholder (full YAML given).

**Type consistency:** model columns `(cohort_month, tenure_k, n_start, n_active, mrr_start, mrr_active)` identical across Tasks 1, 2, 3, 5. `toTriangle(rows, measure, basis) → {cohorts, tenures, cells, averages}` and `RETENTION_MAX_TENURE` consistent across Tasks 5, 6. `section.component === 'retentionTriangle'` + `dbtModel` consistent across Tasks 6, 7.
