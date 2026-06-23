# Cohort Survival by First-Pay Vintage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dbt-backed cohort-survival-by-first-pay-vintage chart to the Accounts scorecard, with both logo-survival and GRR curves, parity-verified against the published §18 numbers.

**Architecture:** A new dbt intermediate model `int_customer_survival` (entity grain, one row per vintage × tenure-month) built on `int_customer_mrr` + the `Funnel` signup gate, materialized as a table in `revenue`. The frontend reads that table directly, derives the two rate curves, and renders them in a new custom-component section on the existing Accounts scorecard. A parity script gates the numbers against the verified baseline before the chart ships.

**Tech Stack:** dbt (BigQuery), dbt unit tests + schema tests, Python (parity scripts, `google-cloud-bigquery`), React + Vite + ECharts, Vitest.

## Global Constraints

- Grain is **entity** (`EntityRecordID`), never CompanyAccount. Verbatim from spec.
- Source MRR is `ref('int_customer_mrr')`, column `StartMRR`. Signup gate is `source('revenue','Funnel')`, `EventType='Trial'`, `MIN(Date) >= '2021-06-01'`.
- Anchor `t0` = `MIN(Month) WHERE StartMRR > 0`. Vintage = `CAST(EXTRACT(YEAR FROM t0) AS STRING)`. Tenure `k` = 0..24.
- Censor: keep a cell only where `t0 + k <= survival_censor_month` (dbt var, default latest complete month; pinned `'2026-05-01'` for parity). Cell threshold `n_start >= survival_min_n` (dbt var, default `30`).
- Parity baseline (GRR, dollar-weighted): 2022 m12=52.4 m24=39.2 · 2023 m12=49.3 m24=36.8 · 2024 m12=51.3 m24=37.5 · 2025 m12=57.9 m15=50.5.
- The on-page explainer and the metric-definitions entry MUST state that "still paying" describes only the logo line; GRR is dollar-weighted.
- No NRR line on the chart, no help-tier (5a) chart, no auto-injected columns. The viewer toggles GRR vs logo; nothing is appended behind their back.
- dbt commands: use the `dbt:running-dbt-commands` skill to pick the executable. dbt unit tests: use `dbt:adding-dbt-unit-test`.

---

### Task 1: dbt model `int_customer_survival` + unit test

**Files:**
- Create: `models/intermediate/int_customer_survival.sql`
- Create: `models/intermediate/_int_customer_survival.yml`

**Interfaces:**
- Consumes: `ref('int_customer_mrr')` columns `Month` (DATE), `EntityRecordID` (INT64), `StartMRR` (NUMERIC); `source('revenue','Funnel')` columns `EntityRecordID`, `Date` (DATE), `EventType` (STRING).
- Produces: table `revenue.int_customer_survival`, grain `(vintage STRING, tenure_k INT64)`, columns `n_start INT64`, `n_alive INT64`, `base_mrr NUMERIC`, `retained_mrr NUMERIC`, `net_mrr NUMERIC`.

- [ ] **Step 1: Write the failing unit test**

Create `models/intermediate/_int_customer_survival.yml`. The fixture censors at `2024-03-01` so only tenures 0–2 are produced, keeping `expect` small. `survival_min_n` is lowered to 1 so the 2-entity fixture survives the threshold.

```yaml
version: 2

unit_tests:
  - name: survival_triangle_basic
    model: int_customer_survival
    overrides:
      vars:
        survival_min_n: 1
        survival_censor_month: '2024-03-01'
    given:
      - input: ref('int_customer_mrr')
        rows:
          - { Month: '2024-01-01', EntityRecordID: 1, StartMRR: 100 }
          - { Month: '2024-02-01', EntityRecordID: 1, StartMRR: 100 }
          - { Month: '2024-03-01', EntityRecordID: 1, StartMRR: 50 }
          - { Month: '2024-01-01', EntityRecordID: 2, StartMRR: 200 }
      - input: source('revenue', 'Funnel')
        rows:
          - { EntityRecordID: 1, Date: '2023-07-01', EventType: 'Trial' }
          - { EntityRecordID: 2, Date: '2023-08-01', EventType: 'Trial' }
    expect:
      rows:
        - { vintage: '2024', tenure_k: 0, n_start: 2, n_alive: 2, base_mrr: 300, retained_mrr: 300, net_mrr: 300 }
        - { vintage: '2024', tenure_k: 1, n_start: 2, n_alive: 1, base_mrr: 300, retained_mrr: 100, net_mrr: 100 }
        - { vintage: '2024', tenure_k: 2, n_start: 2, n_alive: 1, base_mrr: 300, retained_mrr: 50, net_mrr: 50 }
```

Hand-check of the expected rows: entity 1 first-pays 2024-01 (mrr0=100), entity 2 first-pays 2024-01 (mrr0=200), both vintage 2024, base_mrr=300. k=0: both alive at full mrr. k=1 (2024-02): e1=100, e2 has no row → 0; retained = LEAST(100,100)+LEAST(0,200)=100. k=2 (2024-03): e1=50, e2=0; retained = LEAST(50,100)+0=50.

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `dbt test --select int_customer_survival` (or `dbt build --select int_customer_survival`)
Expected: FAIL — `Compilation Error ... depends on a node named 'int_customer_survival' which was not found` (model file does not exist yet).

- [ ] **Step 3: Write the model**

Create `models/intermediate/int_customer_survival.sql`:

```sql
{{ config(materialized='table') }}

-- Cohort survival by first-pay vintage. ENTITY grain (EntityRecordID).
-- Mirrors VINTAGE_SQL (build_expanders_doc.py) + §18 of verification-queries.md.
-- See docs/metric-definitions.md and docs/superpowers/specs/2026-06-22-cohort-survival-vintage-design.md.

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
first_pay AS (  -- anchor = each entity's FIRST paying month
  SELECT EntityRecordID, MIN(Month) AS t0
  FROM mrr
  WHERE mrr > 0
  GROUP BY 1
),
base AS (
  SELECT
    fp.EntityRecordID AS eid,
    fp.t0,
    CAST(EXTRACT(YEAR FROM fp.t0) AS STRING) AS vintage,
    b.mrr AS mrr0
  FROM first_pay fp
  JOIN mrr b
    ON b.EntityRecordID = fp.EntityRecordID
    AND b.Month = fp.t0
  JOIN signup s  -- signup gate: first-pay anchor is genuine, not left-censored
    ON s.EntityRecordID = fp.EntityRecordID
    AND s.sd >= '2021-06-01'
),
joined AS (
  SELECT
    base.vintage,
    k AS tenure_k,
    base.mrr0,
    IFNULL(f.mrr, 0) AS mrrk
  FROM base, UNNEST(GENERATE_ARRAY(0, 24)) AS k
  LEFT JOIN mrr f
    ON f.EntityRecordID = base.eid
    AND f.Month = DATE_ADD(base.t0, INTERVAL k MONTH)
  WHERE DATE_ADD(base.t0, INTERVAL k MONTH)
        <= DATE('{{ var("survival_censor_month", "2026-05-01") }}')
)
SELECT
  vintage,
  tenure_k,
  COUNT(*) AS n_start,
  COUNTIF(mrrk > 0) AS n_alive,
  SUM(mrr0) AS base_mrr,
  SUM(LEAST(mrrk, mrr0)) AS retained_mrr,
  SUM(mrrk) AS net_mrr
FROM joined
GROUP BY 1, 2
HAVING n_start >= {{ var("survival_min_n", 30) }}
ORDER BY 1, 2
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `dbt test --select int_customer_survival`
Expected: PASS (1 unit test). If the NUMERIC columns fail equality on formatting (e.g. `300` vs `300.0`), change the three `*_mrr` expected values in the YAML to match dbt's rendered form and re-run — do not change the model.

- [ ] **Step 5: Commit**

```bash
git add models/intermediate/int_customer_survival.sql models/intermediate/_int_customer_survival.yml
git commit -m "feat(survival): int_customer_survival model + dbt unit test"
```

---

### Task 2: Schema tests + model description

**Files:**
- Modify: `models/intermediate/_int_customer_survival.yml`

**Interfaces:**
- Consumes: the model from Task 1.
- Produces: nothing new; adds `models:` block (description + column tests) to the same YAML.

- [ ] **Step 1: Add the model + tests block to the YAML**

Append to `models/intermediate/_int_customer_survival.yml` (keep the `unit_tests:` block already there):

```yaml
models:
  - name: int_customer_survival
    description: >
      Cohort survival by first-pay vintage, entity grain. One row per
      (vintage, tenure_k). Logo survival = n_alive / n_start (count-weighted).
      GRR = retained_mrr / base_mrr (dollar-weighted, expansion capped). The
      two differ; "still paying" describes only the logo line. Anchor = each
      entity's first paying month; signup gate Trial >= 2021-06-01; cells with
      n_start < 30 dropped; right-censored at the latest complete month.
      Parity: VINTAGE_SQL + §18 verification-queries.md (2026-06).
    columns:
      - name: vintage
        description: Calendar year of the entity's first paying month.
        tests: [not_null]
      - name: tenure_k
        description: Months since first paying month (0–24).
        tests:
          - not_null
          - accepted_values:
              values: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24]
              quote: false
      - name: n_start
        tests: [not_null]
      - name: n_alive
        tests: [not_null]
      - name: base_mrr
        tests: [not_null]
    tests:
      - dbt_utils.unique_combination_of_columns:
          combination_of_columns: [vintage, tenure_k]
      - dbt_utils.expression_is_true:
          expression: n_alive <= n_start
      - dbt_utils.expression_is_true:
          expression: retained_mrr <= base_mrr
```

If `dbt_utils` is not installed (check `packages.yml`), replace the three `tests:` entries at model level with a singular custom test file `tests/assert_survival_invariants.sql` that returns offending rows:

```sql
-- tests/assert_survival_invariants.sql
SELECT vintage, tenure_k
FROM {{ ref('int_customer_survival') }}
WHERE n_alive > n_start OR retained_mrr > base_mrr
GROUP BY 1, 2
HAVING COUNT(*) > 0
```

- [ ] **Step 2: Run build + tests against BigQuery**

Run: `dbt build --select int_customer_survival`
Expected: model materializes to `revenue.int_customer_survival`; all schema tests + the unit test PASS.

- [ ] **Step 3: Commit**

```bash
git add models/intermediate/_int_customer_survival.yml tests/assert_survival_invariants.sql 2>/dev/null; git add models/intermediate/_int_customer_survival.yml
git commit -m "test(survival): schema tests + model description for int_customer_survival"
```

---

### Task 3: Parity script against the verified baseline

**Files:**
- Create: `scripts/parity_int_customer_survival.py`

**Interfaces:**
- Consumes: `revenue.int_customer_survival` (built in Task 2).
- Produces: a pass/fail parity report; non-zero exit on any mismatch.

- [ ] **Step 1: Write the parity script**

Create `scripts/parity_int_customer_survival.py`:

```python
#!/usr/bin/env python3
"""Parity: revenue.int_customer_survival GRR vs the verified §18 baseline.

GRR = retained_mrr / base_mrr * 100, rounded to 1 dp, must match the published
numbers from build_expanders_doc.py (VINTAGE_SQL) + §18 verification-queries.md.
"""
import sys
from google.cloud import bigquery

client = bigquery.Client(project='project-for-method-dw')

# (vintage, tenure_k) -> expected GRR %
EXPECTED = {
    ('2022', 12): 52.4, ('2022', 24): 39.2,
    ('2023', 12): 49.3, ('2023', 24): 36.8,
    ('2024', 12): 51.3, ('2024', 24): 37.5,
    ('2025', 12): 57.9, ('2025', 15): 50.5,
}

rows = client.query("""
  SELECT vintage, tenure_k,
         ROUND(SAFE_DIVIDE(retained_mrr, base_mrr) * 100, 1) AS grr
  FROM `project-for-method-dw.revenue.int_customer_survival`
""").result()
got = {(r['vintage'], int(r['tenure_k'])): float(r['grr']) for r in rows}

fails = []
for key, exp in EXPECTED.items():
    actual = got.get(key)
    status = 'OK' if actual == exp else 'MISMATCH'
    if actual != exp:
        fails.append((key, exp, actual))
    print(f"  {key[0]} m{key[1]:<2}  expected={exp:<5}  actual={actual}  {status}")

if fails:
    print(f"\nFAIL: {len(fails)} mismatch(es).")
    sys.exit(1)
print("\nPASS: all checkpoints match the verified baseline.")
```

- [ ] **Step 2: Run parity**

Run: `python scripts/parity_int_customer_survival.py`
Expected: every line `OK`, final `PASS`. If any line is `MISMATCH`, stop — do not proceed to the frontend. Diagnose against VINTAGE_SQL (anchor, signup gate, censor month, threshold) before changing anything.

- [ ] **Step 3: Commit**

```bash
git add scripts/parity_int_customer_survival.py
git commit -m "test(survival): parity script vs verified §18 baseline (PASS)"
```

---

### Task 4: Methodology doc entry

**Files:**
- Modify: `docs/metric-definitions.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Add the definition entry**

Append a new section to `docs/metric-definitions.md` (match the existing entry template in that file's header):

```markdown
## Cohort Survival by First-Pay Vintage (`int_customer_survival`)

- **What it answers:** Do newer customer vintages retain better than older ones, measured at the same account age?
- **Grain:** entity (`EntityRecordID`) / first-pay vintage / tenure-indexed (months since first paying month).
- **Measures:** logo survival = `n_alive / n_start` (count-weighted); GRR = `retained_mrr / base_mrr` (dollar-weighted, expansion capped, churned held at $0).
- **Filters / exclusions:** signup `Funnel` Trial `MIN(Date) >= '2021-06-01'` (so the first-pay anchor is genuine, not left-censored by the data start); `n_start >= 30` per cell (stability); cell kept only where `t0 + k <= latest complete month` (right-censoring; younger vintages have shorter curves).
- **Methodology source:** VINTAGE_SQL in `build_expanders_doc.py` + §18 of `verification-queries.md` (revenue-architecture loop, 2026-06).
- **Parity-verified against:** §18 GRR baseline — 2022 m12=52.4/m24=39.2, 2023 m12=49.3/m24=36.8, 2024 m12=51.3/m24=37.5, 2025 m12=57.9/m15=50.5 — via `scripts/parity_int_customer_survival.py`, 2026-06-22.
- **Known caveats:** GRR is dollar-weighted, logo survival is count-weighted; "still paying" describes only the logo line. Entity grain, not CompanyAccount. Younger vintages right-censored. Association not causation.
```

- [ ] **Step 2: Commit**

```bash
git add docs/metric-definitions.md
git commit -m "docs(survival): metric-definitions entry for int_customer_survival"
```

---

### Task 5: Frontend SQL + series transform (unit-tested)

**Files:**
- Create: `builder/src/lib/cohortSurvivalSql.js`
- Create: `builder/tests/unit/cohortSurvivalSql.test.js`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `buildCohortSurvivalSql(): string` — SELECT over `revenue.int_customer_survival`.
  - `SURVIVAL_CHECKPOINTS: number[]` = `[3,6,9,12,15,18,21,24]`.
  - `toSurvivalSeries(rows, measure): { ks, vintages, series }` where `rows` is `[{vintage, tenure_k, n_start, n_alive, base_mrr, retained_mrr, net_mrr}]`, `measure` is `'grr'|'logo'`, `ks` is `SURVIVAL_CHECKPOINTS`, `vintages` is sorted unique strings, `series[vintage]` is an array aligned to `ks` of rounded percent or `null`.

- [ ] **Step 1: Write the failing test**

Create `builder/tests/unit/cohortSurvivalSql.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { toSurvivalSeries, SURVIVAL_CHECKPOINTS } from '../../src/lib/cohortSurvivalSql.js';

const rows = [
  // 2024 vintage: m12 present, m24 missing (censored)
  { vintage: '2024', tenure_k: 12, n_start: 100, n_alive: 60, base_mrr: 1000, retained_mrr: 513, net_mrr: 560 },
  // 2025 vintage: m12 present
  { vintage: '2025', tenure_k: 12, n_start: 200, n_alive: 130, base_mrr: 2000, retained_mrr: 1158, net_mrr: 1300 },
];

describe('toSurvivalSeries', () => {
  it('derives GRR = retained/base at each checkpoint, null when missing', () => {
    const { ks, vintages, series } = toSurvivalSeries(rows, 'grr');
    expect(ks).toEqual(SURVIVAL_CHECKPOINTS);
    expect(vintages).toEqual(['2024', '2025']);
    const i12 = ks.indexOf(12);
    const i24 = ks.indexOf(24);
    expect(series['2024'][i12]).toBe(51.3); // 513/1000
    expect(series['2025'][i12]).toBe(57.9); // 1158/2000
    expect(series['2024'][i24]).toBe(null); // no row
  });

  it('derives logo survival = n_alive/n_start', () => {
    const { series } = toSurvivalSeries(rows, 'logo');
    const i12 = SURVIVAL_CHECKPOINTS.indexOf(12);
    expect(series['2024'][i12]).toBe(60); // 60/100
    expect(series['2025'][i12]).toBe(65); // 130/200
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd builder && npx vitest run tests/unit/cohortSurvivalSql.test.js`
Expected: FAIL — cannot resolve `../../src/lib/cohortSurvivalSql.js`.

- [ ] **Step 3: Write the module**

Create `builder/src/lib/cohortSurvivalSql.js`:

```javascript
// Cohort survival by first-pay vintage. Reads the dbt model revenue.int_customer_survival.
export const SURVIVAL_CHECKPOINTS = [3, 6, 9, 12, 15, 18, 21, 24];

export function buildCohortSurvivalSql() {
  return `
    SELECT vintage, tenure_k, n_start, n_alive, base_mrr, retained_mrr, net_mrr
    FROM \`project-for-method-dw.revenue.int_customer_survival\`
    ORDER BY vintage, tenure_k
  `;
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

// rows: [{vintage, tenure_k, n_start, n_alive, base_mrr, retained_mrr, net_mrr}]
// measure: 'grr' | 'logo'
export function toSurvivalSeries(rows, measure) {
  const ks = SURVIVAL_CHECKPOINTS;
  const byKey = new Map(); // `${vintage}|${k}` -> row
  const vintageSet = new Set();
  for (const r of rows) {
    byKey.set(`${r.vintage}|${Number(r.tenure_k)}`, r);
    vintageSet.add(r.vintage);
  }
  const vintages = [...vintageSet].sort();
  const series = {};
  for (const v of vintages) {
    series[v] = ks.map((k) => {
      const r = byKey.get(`${v}|${k}`);
      if (!r) return null;
      if (measure === 'logo') {
        return r.n_start > 0 ? round1((r.n_alive / r.n_start) * 100) : null;
      }
      return r.base_mrr > 0 ? round1((r.retained_mrr / r.base_mrr) * 100) : null;
    });
  }
  return { ks, vintages, series };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd builder && npx vitest run tests/unit/cohortSurvivalSql.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add builder/src/lib/cohortSurvivalSql.js builder/tests/unit/cohortSurvivalSql.test.js
git commit -m "feat(survival): cohort-survival SQL + series transform (unit-tested)"
```

---

### Task 6: CohortSurvivalChart component

**Files:**
- Create: `builder/src/components/scorecards/CohortSurvivalChart.jsx`

**Interfaces:**
- Consumes: `buildCohortSurvivalSql`, `toSurvivalSeries`, `SURVIVAL_CHECKPOINTS` from `lib/cohortSurvivalSql.js`; `queryBq` from `lib/bigquery.js`; `EChart` + `ChartErrorBoundary` from `components/EChart`.
- Produces: default-exported React component `<CohortSurvivalChart />` (no required props; fetches its own data).

- [ ] **Step 1: Write the component**

Create `builder/src/components/scorecards/CohortSurvivalChart.jsx`. (Pure-logic is already covered by Task 5's tests; this is presentational, no separate unit test.)

```jsx
import { useState, useEffect } from 'react';
import EChart, { ChartErrorBoundary } from '../EChart';
import { queryBq } from '../../lib/bigquery';
import { buildCohortSurvivalSql, toSurvivalSeries } from '../../lib/cohortSurvivalSql';

const MEASURES = [
  { key: 'grr', label: 'GRR (dollar-weighted)' },
  { key: 'logo', label: 'Logo survival (% still paying)' },
];

export default function CohortSurvivalChart() {
  const [rows, setRows] = useState(null);
  const [measure, setMeasure] = useState('grr');
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    queryBq(buildCohortSurvivalSql())
      .then((res) => { if (alive) setRows(res?.rows ?? res ?? []); })
      .catch((e) => { if (alive) setError(e.message || String(e)); });
    return () => { alive = false; };
  }, []);

  if (error) return <div style={{ color: '#b91c1c', padding: 16 }}>Failed to load survival data: {error}</div>;
  if (!rows) return <div style={{ color: '#6b7280', padding: 16 }}>Loading cohort survival…</div>;

  const { ks, vintages, series } = toSurvivalSeries(rows, measure);
  const option = {
    grid: { left: 46, right: 18, top: 30, bottom: 42 },
    legend: { top: 0 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category', data: ks.map((k) => 'm' + k),
      name: 'months into account life', nameLocation: 'middle', nameGap: 26,
    },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
    series: vintages.map((v) => ({
      name: v + ' cohort', type: 'line', data: series[v], connectNulls: false,
      symbolSize: 6,
      lineStyle: { width: v >= '2025' ? 3.5 : 1.8, type: v >= '2025' ? 'solid' : 'dashed' },
    })),
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {MEASURES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMeasure(m.key)}
            style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              border: '1px solid #d1d5db',
              background: measure === m.key ? '#059669' : '#fff',
              color: measure === m.key ? '#fff' : '#374151',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <ChartErrorBoundary>
        <div style={{ height: 360 }}><EChart option={option} /></div>
      </ChartErrorBoundary>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 10, maxWidth: 760, lineHeight: 1.5 }}>
        <b>What this is.</b> Each line is one first-pay vintage: all entities whose first paying
        month fell in that calendar year, tracked by account age (not the calendar). A vintage's
        curve stops where its youngest members run out of observed months (right-censoring), so
        newer vintages are shorter.
        <br />
        <b>Two measures.</b> <i>GRR</i> is dollar-weighted: the share of the vintage's starting
        MRR still retained (expansion capped, churned held at $0). <i>Logo survival</i> is
        count-weighted: the share of accounts still paying. They diverge when churned accounts
        are larger or smaller than average — "still paying" describes only the logo line.
        Entity grain. Source: <code>revenue.int_customer_survival</code> (dbt), parity-verified
        against the §18 baseline.
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd builder && npm run build`
Expected: build succeeds (no import or JSX errors). Runtime data load is verified after wiring in Task 7.

- [ ] **Step 3: Commit**

```bash
git add builder/src/components/scorecards/CohortSurvivalChart.jsx
git commit -m "feat(survival): CohortSurvivalChart component with GRR/logo toggle + explainer"
```

---

### Task 7: Wire a custom-component section into the Accounts page

**Files:**
- Modify: `builder/src/pages/Scorecard.jsx` (section render loop, ~line 187–238; import near the other scorecard-component imports, ~line 9)
- Modify: `builder/src/config/scorecards/customers-scorecard.js` (add a section)

**Interfaces:**
- Consumes: `CohortSurvivalChart` from `components/scorecards/CohortSurvivalChart`.
- Produces: generic renderer now supports `section.component` — any scorecard section with `component: 'cohortSurvival'` renders the chart after the breakdown tabs.

- [ ] **Step 1: Import the component in Scorecard.jsx**

Add near the existing scorecard-component imports (next to `import GrrIndustryDrill ...`, ~line 9):

```jsx
import CohortSurvivalChart from '../components/scorecards/CohortSurvivalChart';
```

- [ ] **Step 2: Split out custom-component sections and render them last**

In `Scorecard.jsx`, change the section partition (currently ~line 187–188):

```jsx
  const ungrouped = config.sections.filter(s => !s.group);
  const breakdownSections = config.sections.filter(s => s.group === 'breakdowns');
```

to exclude `component` sections from the generic path and capture them separately:

```jsx
  const ungrouped = config.sections.filter(s => !s.group && !s.component);
  const breakdownSections = config.sections.filter(s => s.group === 'breakdowns');
  const customSections = config.sections.filter(s => s.component);
```

Then, immediately after the `{breakdownSections.length > 0 && ( ... )}` block (the `BreakdownTabs`, ~line 238) and before `<MetricInspector ... />`, add:

```jsx
      {customSections.map((section) => (
        <div key={section.title} style={{ marginTop: 32 }}>
          <h2 style={{
            fontSize: 18, fontWeight: 700, color: '#1a1a1a', margin: '0 0 12px',
            fontFamily: "'DM Sans', sans-serif",
          }}>
            {section.title}
          </h2>
          {section.component === 'cohortSurvival' && <CohortSurvivalChart />}
        </div>
      ))}
```

- [ ] **Step 3: Add the section to the Accounts scorecard config**

In `builder/src/config/scorecards/customers-scorecard.js`, add one section to the `sections` array (after the final breakdown section, before the closing `]`):

```javascript
    // ── Cohort survival ─────────────────────────────────────────
    {
      title: 'Cohort Survival by First-Pay Vintage',
      component: 'cohortSurvival',
    },
```

- [ ] **Step 4: Build + run the full frontend test suite**

Run: `cd builder && npm run build && npx vitest run`
Expected: build succeeds; all existing tests plus `cohortSurvivalSql.test.js` PASS.

- [ ] **Step 5: Verify it renders against live BigQuery**

Use the preview workflow: start the dev server (`preview_start` in `builder/`), open the Accounts scorecard with BQ connected, confirm the "Cohort Survival by First-Pay Vintage" section loads, the GRR/logo toggle switches curves, and 2025/2026 lines are solid and stop early (censoring). Capture a screenshot. If the chart is empty, check the browser console + that `revenue.int_customer_survival` exists (Task 2 built it).

- [ ] **Step 6: Commit**

```bash
git add builder/src/pages/Scorecard.jsx builder/src/config/scorecards/customers-scorecard.js
git commit -m "feat(survival): render cohort survival section on the Accounts scorecard"
```

---

### Task 8: Build artifact + deploy note

**Files:**
- Modify: `builder/dist/**` (build output)

- [ ] **Step 1: Production build**

Run: `cd builder && npm run build`
Expected: `dist/` updated, no errors.

- [ ] **Step 2: Commit the build**

```bash
git add builder/dist
git commit -m "build(survival): rebuild Accounts scorecard with cohort survival section"
```

- [ ] **Step 3: Deploy (user-gated)**

GitHub Pages deploys from `main`. This work is on `feat/cohort-survival-vintage`. Do NOT merge or push to `main` without explicit approval. When approved: open a PR (or fast-forward `main`), push, and confirm the page is live at `https://nickperaltab.github.io/method-metrics/`. The dbt model must already be materialized in prod BQ (Task 2) for the live page to load data. Never run `vercel`.

---

## Self-Review

**Spec coverage:**
- dbt intermediate model, entity grain, raw additive columns → Task 1. ✓
- Anchor / vintage / signup gate / tenure / censor / threshold → Task 1 (Global Constraints). ✓
- Schema tests + description → Task 2. ✓
- Parity vs §18 → Task 3. ✓
- Methodology doc (name-vs-math caveat) → Task 4. ✓
- Both measures, derived from raw sums → Task 5. ✓
- Custom chart component + explainer in netsaas style → Task 6. ✓
- New section on Accounts page, custom-component hook → Task 7. ✓
- Build/deploy, GitHub Pages only, user-gated → Task 8. ✓
- Scope guards (no NRR line, no 5a, no CompanyAccount, no auto-injection) → enforced in Global Constraints + Task 6 (only two measures). ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. The only conditional is Task 2 Step 1's dbt_utils fallback, which ships full alternative SQL. ✓

**Type consistency:** `int_customer_survival` columns `(vintage, tenure_k, n_start, n_alive, base_mrr, retained_mrr, net_mrr)` identical across Tasks 1, 2, 3, 5. `toSurvivalSeries(rows, measure) → {ks, vintages, series}` and `SURVIVAL_CHECKPOINTS` consistent across Tasks 5, 6. `section.component === 'cohortSurvival'` consistent across Tasks 6/7. ✓
