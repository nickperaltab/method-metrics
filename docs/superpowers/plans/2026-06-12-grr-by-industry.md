# GRR by Industry Labs Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New Labs scorecard breaking annual GRR down by V7 industry taxonomy (L1→L2→L3 drill) and operating model, with click-through to accounts showing labels + classification reasoning.

**Architecture:** Frontend-only (Approach A from the spec at `docs/superpowers/specs/2026-06-12-grr-by-industry-design.md`). Pure SQL builders join `revenue.int_customer_annual_mrr` to `v7_classification.account_labels` at query time; a custom-renderer drill component (same pattern as `FunnelDrill`) owns fetch orchestration and drill state. No BQ DDL, no dbt changes.

**Tech Stack:** React (no TS), vanilla inline styles, vitest, BQ REST via existing `queryBq` OAuth client.

**Key facts the implementer must know:**
- `int_customer_annual_mrr` columns: `Month` (DATE, first-of-month), `EntityRecordID`, `Company`, `StartMRR`, `Cancellations`, `Downgrades`, `Expansions`, `NewMRR` + dims. **Cancellations/Downgrades are positive magnitudes** — annual GRR = `(SUM(StartMRR) − SUM(Cancellations) − SUM(Downgrades)) / SUM(StartMRR)` (verified against `models/metrics/v_metric__annual_grr.sql`).
- `v7_classification.account_labels` is keyed by `account_record_id` and can hold **multiple rows per `company_account`** — every join MUST dedupe first (highest `confidence`, then latest `classified_at`) or MRR rows fan out.
- Join key: `int_customer_annual_mrr.Company = account_labels.company_account`. ~98.4% of customers labeled; NULL labels become `'Unclassified'`.
- Headline all-up GRR comes from `revenue_metrics.v_metric__annual_grr` via the existing `buildRateSql` in `netSaasSql.js` — never recomputed for the headline. The page ALSO recomputes all-up GRR from its own segment rows and warns visibly if the two diverge (parity gate).
- Tests run with `cd builder && npx vitest run tests/unit/<file>` (the `test:unit` script runs all). Lint: `cd builder && npm run lint`.
- Commit style in this repo: `feat(grr-industry): ...` / `test(...)` / `build: ...`. Deploy is GitHub Pages via push to main — **never vercel**.

**File map:**

| File | Action | Responsibility |
|---|---|---|
| `builder/src/lib/grrIndustrySql.js` | Create | Pure SQL builders, no I/O |
| `builder/tests/unit/grrIndustrySql.test.js` | Create | Unit tests for builders + parity helper |
| `builder/src/lib/grrIndustryData.js` | Create | `queryBq` fetch wrappers + `computeAllUpGrr` |
| `builder/src/components/scorecards/GrrSegmentBars.jsx` | Create | Clickable horizontal GRR bars |
| `builder/src/components/scorecards/GrrAccountTable.jsx` | Create | Account table with expandable reasoning rows |
| `builder/src/components/scorecards/GrrIndustryDrill.jsx` | Create | Page controller: state, fetches, layout |
| `builder/src/config/scorecards/grr-industry-scorecard.js` | Create | `labs: true` config |
| `builder/src/config/scorecards/index.js` | Modify | Register scorecard |
| `builder/src/pages/Scorecard.jsx` | Modify | Renderer branch (2 lines) |

---

### Task 1: SQL builders (`grrIndustrySql.js`) — TDD

**Files:**
- Test: `builder/tests/unit/grrIndustrySql.test.js`
- Create: `builder/src/lib/grrIndustrySql.js`

- [ ] **Step 1: Write the failing tests**

Create `builder/tests/unit/grrIndustrySql.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  buildGrrBySegmentSql,
  buildGrrAccountsSql,
  buildLabelFilterClauses,
  GRR_DIMENSIONS,
} from '../../src/lib/grrIndustrySql.js';

describe('GRR_DIMENSIONS', () => {
  it('allows exactly the four label dimensions', () => {
    expect(GRR_DIMENSIONS).toEqual(['l1', 'l2', 'l3', 'operating_model']);
  });
});

describe('buildLabelFilterClauses', () => {
  it('builds COALESCE-to-Unclassified equality clauses on the labels alias', () => {
    const out = buildLabelFilterClauses({ l1: 'Construction & Trades', l2: 'Plumbing' });
    expect(out).toContain("AND COALESCE(lb.l1, 'Unclassified') = 'Construction & Trades'");
    expect(out).toContain("AND COALESCE(lb.l2, 'Unclassified') = 'Plumbing'");
  });

  it('skips null/empty values', () => {
    expect(buildLabelFilterClauses({ l1: null, l2: '' })).toBe('');
  });

  it('escapes single quotes in values (injection guard)', () => {
    const out = buildLabelFilterClauses({ l1: "Bob's Industry" });
    expect(out).toContain("'Bob''s Industry'");
  });

  it('throws on a non-allowlisted dimension key (injection guard)', () => {
    expect(() => buildLabelFilterClauses({ 'l1; DROP TABLE x': 'v' })).toThrow(/dimension/i);
  });
});

describe('buildGrrBySegmentSql', () => {
  it('computes annual GRR per L1 from int_customer_annual_mrr joined to deduped labels', () => {
    const sql = buildGrrBySegmentSql({ month: '2026-05-01', dimension: 'l1' });
    expect(sql).toContain('revenue.int_customer_annual_mrr');
    expect(sql).toContain('v7_classification.account_labels');
    // dedupe: one label row per company_account, best confidence first
    expect(sql).toContain('QUALIFY ROW_NUMBER() OVER');
    expect(sql).toContain('PARTITION BY company_account');
    expect(sql).toContain('ORDER BY confidence DESC, classified_at DESC');
    // join + bucket
    expect(sql).toContain('LEFT JOIN labels lb ON lb.company_account = c.Company');
    expect(sql).toContain("COALESCE(lb.l1, 'Unclassified') AS segment");
    // GRR formula matches v_metric__annual_grr: (start - cancel - downgrade) / start
    expect(sql).toContain(
      'SAFE_DIVIDE(SUM(c.StartMRR) - SUM(c.Cancellations) - SUM(c.Downgrades), SUM(c.StartMRR)) AS grr'
    );
    expect(sql).toContain("c.Month = '2026-05-01'");
    expect(sql).toContain('GROUP BY segment');
    expect(sql).toContain('HAVING SUM(c.StartMRR) > 0');
    expect(sql).toContain('ORDER BY start_mrr DESC');
  });

  it('applies drill-path filters for deeper levels', () => {
    const sql = buildGrrBySegmentSql({
      month: '2026-05-01', dimension: 'l2', filters: { l1: 'Construction & Trades' },
    });
    expect(sql).toContain("COALESCE(lb.l2, 'Unclassified') AS segment");
    expect(sql).toContain("AND COALESCE(lb.l1, 'Unclassified') = 'Construction & Trades'");
  });

  it('supports operating_model as the dimension', () => {
    const sql = buildGrrBySegmentSql({ month: '2026-05-01', dimension: 'operating_model' });
    expect(sql).toContain("COALESCE(lb.operating_model, 'Unclassified') AS segment");
  });

  it('throws on an unknown dimension (injection guard)', () => {
    expect(() => buildGrrBySegmentSql({ month: '2026-05-01', dimension: 'Company; DROP' }))
      .toThrow(/dimension/i);
  });

  it('escapes single quotes in month', () => {
    const sql = buildGrrBySegmentSql({ month: "2026-05-01' OR '1'='1", dimension: 'l1' });
    expect(sql).toContain("'2026-05-01'' OR ''1''=''1'");
  });
});

describe('buildGrrAccountsSql', () => {
  it('lists accounts for a clicked segment with labels, reasoning, sorted by lost $', () => {
    const sql = buildGrrAccountsSql({
      month: '2026-05-01', filters: { l1: 'Construction & Trades' },
    });
    expect(sql).toContain('revenue.int_customer_annual_mrr');
    expect(sql).toContain('QUALIFY ROW_NUMBER() OVER');
    expect(sql).toContain('c.Company');
    expect(sql).toContain('SUM(c.StartMRR)      AS start_mrr');
    expect(sql).toContain('SUM(c.Cancellations) AS churn_mrr');
    expect(sql).toContain('SUM(c.Downgrades)    AS downgrade_mrr');
    expect(sql).toContain('lb.l1, lb.l2, lb.l3, lb.operating_model, lb.confidence');
    expect(sql).toContain('lb.business_description, lb.short_reasoning');
    expect(sql).toContain("AND COALESCE(lb.l1, 'Unclassified') = 'Construction & Trades'");
    expect(sql).toContain('ORDER BY (SUM(c.Cancellations) + SUM(c.Downgrades)) DESC');
    expect(sql).toContain('LIMIT 200');
  });

  it('only includes accounts in the annual GRR base (StartMRR > 0)', () => {
    const sql = buildGrrAccountsSql({ month: '2026-05-01', filters: { operating_model: 'Service_Only' } });
    expect(sql).toContain('HAVING SUM(c.StartMRR) > 0');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd builder && npx vitest run tests/unit/grrIndustrySql.test.js`
Expected: FAIL — `Failed to resolve import "../../src/lib/grrIndustrySql.js"`.

- [ ] **Step 3: Write the implementation**

Create `builder/src/lib/grrIndustrySql.js`:

```js
// builder/src/lib/grrIndustrySql.js
// Pure SQL builders for the GRR by Industry Labs page. No I/O. Unit-tested.
//
// Sources:
//   revenue.int_customer_annual_mrr  — annual MRR movement at customer grain
//   v7_classification.account_labels — current-state V7 labels; multiple rows
//                                      can share a company_account, so every
//                                      join goes through the deduping CTE below
//
// Sign convention (matches v_metric__annual_grr): Cancellations and Downgrades
// are positive magnitudes; GRR = (Start − Cancellations − Downgrades) / Start.

const MRR_VIEW = '`project-for-method-dw.revenue.int_customer_annual_mrr`';
const LABELS_TABLE = '`project-for-method-dw.v7_classification.account_labels`';

export const GRR_DIMENSIONS = ['l1', 'l2', 'l3', 'operating_model'];

// BigQuery string-literal escape: double any single quote.
function sqlStr(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

function assertDim(dim) {
  if (!GRR_DIMENSIONS.includes(dim)) throw new Error(`Unknown GRR dimension: ${dim}`);
}

// One label row per company_account: highest confidence wins, latest
// classified_at breaks ties — a LEFT JOIN against this can never fan out
// MRR rows (account_labels is keyed by account_record_id, not company_account).
function labelsCte() {
  return `WITH labels AS (
  SELECT company_account, l1, l2, l3, operating_model, confidence,
         business_description, short_reasoning
  FROM ${LABELS_TABLE}
  WHERE company_account IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY company_account
    ORDER BY confidence DESC, classified_at DESC
  ) = 1
)`;
}

// "AND COALESCE(lb.<dim>, 'Unclassified') = '<val>'" clauses for the drill
// path + clicked segment. Keys must be allowlisted dimensions; values escaped.
export function buildLabelFilterClauses(filters = {}) {
  return Object.entries(filters)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => {
      assertDim(k);
      return `  AND COALESCE(lb.${k}, 'Unclassified') = ${sqlStr(v)}`;
    })
    .join('\n');
}

// Annual GRR + base per value of `dimension` for one cohort month, scoped to
// the drill path in `filters`. Unlabeled customers bucket as 'Unclassified'.
export function buildGrrBySegmentSql({ month, dimension, filters = {} }) {
  assertDim(dimension);
  return `${labelsCte()}
SELECT
  COALESCE(lb.${dimension}, 'Unclassified') AS segment,
  SUM(c.StartMRR)      AS start_mrr,
  SUM(c.Cancellations) AS churn_mrr,
  SUM(c.Downgrades)    AS downgrade_mrr,
  SAFE_DIVIDE(SUM(c.StartMRR) - SUM(c.Cancellations) - SUM(c.Downgrades), SUM(c.StartMRR)) AS grr,
  COUNT(DISTINCT IF(c.StartMRR > 0, c.Company, NULL)) AS customers
FROM ${MRR_VIEW} c
LEFT JOIN labels lb ON lb.company_account = c.Company
WHERE c.Month = ${sqlStr(month)}
${buildLabelFilterClauses(filters)}
GROUP BY segment
HAVING SUM(c.StartMRR) > 0
ORDER BY start_mrr DESC`.trimEnd();
}

// Account rows for a clicked segment: MRR movement + labels + reasoning,
// sorted by lost $ (churn + downgrade) descending. StartMRR > 0 keeps it to
// the annual GRR base (NewMRR-only customers aren't in the retention math).
export function buildGrrAccountsSql({ month, filters = {} }) {
  return `${labelsCte()}
SELECT
  c.Company,
  SUM(c.StartMRR)      AS start_mrr,
  SUM(c.Cancellations) AS churn_mrr,
  SUM(c.Downgrades)    AS downgrade_mrr,
  lb.l1, lb.l2, lb.l3, lb.operating_model, lb.confidence,
  lb.business_description, lb.short_reasoning
FROM ${MRR_VIEW} c
LEFT JOIN labels lb ON lb.company_account = c.Company
WHERE c.Month = ${sqlStr(month)}
${buildLabelFilterClauses(filters)}
GROUP BY c.Company, lb.l1, lb.l2, lb.l3, lb.operating_model, lb.confidence,
         lb.business_description, lb.short_reasoning
HAVING SUM(c.StartMRR) > 0
ORDER BY (SUM(c.Cancellations) + SUM(c.Downgrades)) DESC, start_mrr DESC
LIMIT 200`.trimEnd();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd builder && npx vitest run tests/unit/grrIndustrySql.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Lint and commit**

```bash
cd builder && npm run lint
cd /Users/nicolas/Desktop/method-metrics
git add builder/src/lib/grrIndustrySql.js builder/tests/unit/grrIndustrySql.test.js
git commit -m "feat(grr-industry): SQL builders for GRR by V7 industry/operating model"
```

---

### Task 2: Data layer (`grrIndustryData.js`) — TDD for the pure helper

**Files:**
- Modify: `builder/tests/unit/grrIndustrySql.test.js` (append a describe block)
- Create: `builder/src/lib/grrIndustryData.js`

- [ ] **Step 1: Write the failing test for `computeAllUpGrr`**

Append to `builder/tests/unit/grrIndustrySql.test.js` (new import at top: `import { computeAllUpGrr } from '../../src/lib/grrIndustryData.js';`):

```js
describe('computeAllUpGrr', () => {
  it('recombines segment rows into the all-up annual GRR (parity-gate input)', () => {
    const segments = [
      { start_mrr: 600, churn_mrr: 60, downgrade_mrr: 20 },
      { start_mrr: 400, churn_mrr: 40, downgrade_mrr: 12 },  // incl. Unclassified
    ];
    // (1000 - 100 - 32) / 1000 = 0.868
    expect(computeAllUpGrr(segments)).toBeCloseTo(0.868, 10);
  });

  it('returns null on an empty or zero base', () => {
    expect(computeAllUpGrr([])).toBeNull();
    expect(computeAllUpGrr([{ start_mrr: 0, churn_mrr: 0, downgrade_mrr: 0 }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd builder && npx vitest run tests/unit/grrIndustrySql.test.js`
Expected: FAIL — cannot resolve `grrIndustryData.js`.

- [ ] **Step 3: Write the data layer**

Create `builder/src/lib/grrIndustryData.js`:

```js
// builder/src/lib/grrIndustryData.js
// Fetch wrappers for the GRR by Industry page. SQL lives in grrIndustrySql.js;
// the headline rate reuses netSaasSql's buildRateSql (canonical metric view).
import { queryBq } from './bigquery.js';
import { buildRateSql } from './netSaasSql.js';
import { buildGrrBySegmentSql, buildGrrAccountsSql } from './grrIndustrySql.js';

const num = (v) => Number(v) || 0;

// Returns [{ segment, start_mrr, churn_mrr, downgrade_mrr, grr, customers }]
export async function fetchGrrSegments({ month, dimension, filters }) {
  const { rows } = await queryBq(buildGrrBySegmentSql({ month, dimension, filters }));
  return rows.map((r) => ({
    segment: r.segment,
    start_mrr: num(r.start_mrr),
    churn_mrr: num(r.churn_mrr),
    downgrade_mrr: num(r.downgrade_mrr),
    grr: r.grr == null ? null : Number(r.grr),
    customers: num(r.customers),
  }));
}

// Returns account rows with labels + reasoning (already sorted by lost $ in SQL).
export async function fetchGrrAccounts({ month, filters }) {
  const { rows } = await queryBq(buildGrrAccountsSql({ month, filters }));
  return rows.map((r) => ({
    ...r,
    start_mrr: num(r.start_mrr),
    churn_mrr: num(r.churn_mrr),
    downgrade_mrr: num(r.downgrade_mrr),
    confidence: r.confidence == null ? null : Number(r.confidence),
  }));
}

// Canonical all-up annual GRR from revenue_metrics — never recomputed here.
export async function fetchAnnualGrrHeadline({ month }) {
  const { rows } = await queryBq(buildRateSql({ metric: 'v_metric__annual_grr', period: month }));
  return rows.length && rows[0].value != null ? Number(rows[0].value) : null;
}

// All-up GRR recombined from the page's own L1 segment rows (Unclassified
// included). The page compares this to fetchAnnualGrrHeadline and surfaces a
// visible warning on divergence — the spec's parity gate.
export function computeAllUpGrr(segments) {
  const start = segments.reduce((s, r) => s + num(r.start_mrr), 0);
  const lost = segments.reduce((s, r) => s + num(r.churn_mrr) + num(r.downgrade_mrr), 0);
  return start > 0 ? (start - lost) / start : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd builder && npx vitest run tests/unit/grrIndustrySql.test.js`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
cd builder && npm run lint
cd /Users/nicolas/Desktop/method-metrics
git add builder/src/lib/grrIndustryData.js builder/tests/unit/grrIndustrySql.test.js
git commit -m "feat(grr-industry): data layer with parity helper computeAllUpGrr"
```

---

### Task 3: Segment bars component (`GrrSegmentBars.jsx`)

Components in this codebase are not unit-tested (tests are lib-level); verification is lint + browser in Task 7.

**Files:**
- Create: `builder/src/components/scorecards/GrrSegmentBars.jsx`

- [ ] **Step 1: Write the component**

```jsx
// builder/src/components/scorecards/GrrSegmentBars.jsx
// Clickable horizontal GRR bars, one per segment value. Bar width ∝ GRR
// (clamped 0–100%), annotated with GRR %, StartMRR base, and customer count
// so a high GRR on a tiny base reads as tiny. Click → onSelect(segment).
import { useState } from 'react';

const fontMono = "'JetBrains Mono', monospace";
const fontSans = "'DM Sans', sans-serif";

function formatUsd(v) {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${Math.round(abs)}`;
}
const pctLabel = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

export default function GrrSegmentBars({ rows, onSelect, selected }) {
  const [hovered, setHovered] = useState(null);
  if (!rows) return null;
  if (rows.length === 0) {
    return <p style={{ color: '#6b7280', fontSize: 13, padding: 16, fontFamily: fontSans }}>No segments in this slice.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0 16px' }}>
      {rows.map((r) => {
        const active = selected === r.segment || hovered === r.segment;
        const w = Math.max(0, Math.min(1, r.grr ?? 0)) * 100;
        const unclassified = r.segment === 'Unclassified';
        return (
          <div
            key={r.segment}
            onClick={() => onSelect?.(r.segment)}
            onMouseEnter={() => setHovered(r.segment)}
            onMouseLeave={() => setHovered(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: onSelect ? 'pointer' : 'default' }}
          >
            <div style={{
              width: 220, fontSize: 13, fontWeight: selected === r.segment ? 700 : 600,
              color: unclassified ? '#9ca3af' : '#374151', fontFamily: fontSans,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right',
            }} title={r.segment}>
              {r.segment}
            </div>
            <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 4, height: 22 }}>
              <div style={{
                width: `${w}%`, height: '100%', borderRadius: 4,
                background: unclassified ? '#9ca3af' : '#059669',
                opacity: active ? 1 : 0.8, transition: 'opacity 120ms',
              }} />
            </div>
            <div style={{ width: 260, fontFamily: fontMono, fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>
              <strong>{pctLabel(r.grr)}</strong>
              <span style={{ color: '#9ca3af' }}>{` · ${formatUsd(r.start_mrr)} base · ${Number(r.customers || 0).toLocaleString()} cust`}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Lint and commit**

```bash
cd builder && npm run lint
cd /Users/nicolas/Desktop/method-metrics
git add builder/src/components/scorecards/GrrSegmentBars.jsx
git commit -m "feat(grr-industry): GrrSegmentBars clickable bar chart"
```

---

### Task 4: Account table with expandable reasoning (`GrrAccountTable.jsx`)

`NetSaasAccountTable` has no row expansion, so this page gets its own table (do NOT modify the shared one — three other dashboards use it).

**Files:**
- Create: `builder/src/components/scorecards/GrrAccountTable.jsx`

- [ ] **Step 1: Write the component**

```jsx
// builder/src/components/scorecards/GrrAccountTable.jsx
// Account drill table for the GRR by Industry page. Rows come from
// fetchGrrAccounts (already sorted by lost $ desc, LIMIT 200). Clicking a row
// toggles an expansion showing business_description + short_reasoning — the
// "why was this account classified here" view. Styles mirror NetSaasAccountTable.
import React, { useState } from 'react';

const fontMono = "'JetBrains Mono', monospace";
const fontSans = "'DM Sans', sans-serif";

function formatUsd(v) {
  if (v == null || v === '' || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${Math.round(abs)}`;
}
const text = (v) => (v == null || v === '' ? '—' : String(v));
const conf = (v) => (v == null || isNaN(v) ? '—' : Number(v).toFixed(2));

const COLUMNS = [
  { key: 'Company', label: 'Company', fmt: text, left: true },
  { key: 'start_mrr', label: 'Start MRR', fmt: formatUsd },
  { key: 'churn_mrr', label: 'Churned $', fmt: formatUsd },
  { key: 'downgrade_mrr', label: 'Downgraded $', fmt: formatUsd },
  { key: 'l1', label: 'L1', fmt: text, left: true },
  { key: 'l2', label: 'L2', fmt: text, left: true },
  { key: 'l3', label: 'L3', fmt: text, left: true },
  { key: 'operating_model', label: 'Op model', fmt: text, left: true },
  { key: 'confidence', label: 'Conf', fmt: conf },
];

const th = { textAlign: 'right', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '2px solid #e2e5e9', whiteSpace: 'nowrap', fontFamily: fontSans };
const td = { textAlign: 'right', padding: '7px 12px', fontFamily: fontMono, fontSize: 13, color: '#374151', borderBottom: '1px solid #f1f3f5', whiteSpace: 'nowrap' };

export default function GrrAccountTable({ rows }) {
  const [expanded, setExpanded] = useState(() => new Set());

  if (!rows || rows.length === 0) {
    return <p style={{ color: '#6b7280', fontSize: 13, padding: 16, fontFamily: fontSans }}>No accounts in this segment.</p>;
  }

  const toggle = (i) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  return (
    <div>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '8px 0 10px', fontFamily: fontSans }}>
        {rows.length} account{rows.length === 1 ? '' : 's'} · sorted by lost $ · click a row for the classification reasoning
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} style={c.left ? { ...th, textAlign: 'left' } : th}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <React.Fragment key={r.Company ?? i}>
                <tr
                  onClick={() => toggle(i)}
                  style={{ cursor: 'pointer', background: expanded.has(i) ? '#f8fafc' : '' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = expanded.has(i) ? '#f8fafc' : ''; }}
                >
                  {COLUMNS.map((c) => (
                    <td key={c.key} style={c.left ? { ...td, textAlign: 'left', fontFamily: fontSans, fontWeight: c.key === 'Company' ? 600 : 400 } : td}>
                      {c.fmt(r[c.key])}
                    </td>
                  ))}
                </tr>
                {expanded.has(i) && (
                  <tr>
                    <td colSpan={COLUMNS.length} style={{ padding: '10px 16px 14px', background: '#f8fafc', borderBottom: '1px solid #f1f3f5', fontFamily: fontSans, fontSize: 13, color: '#374151', whiteSpace: 'normal' }}>
                      <div style={{ marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em' }}>What they do</span>
                        <div>{text(r.business_description)}</div>
                      </div>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em' }}>Why this label</span>
                        <div>{text(r.short_reasoning)}</div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint and commit**

```bash
cd builder && npm run lint
cd /Users/nicolas/Desktop/method-metrics
git add builder/src/components/scorecards/GrrAccountTable.jsx
git commit -m "feat(grr-industry): account table with expandable classification reasoning"
```

---

### Task 5: Page controller (`GrrIndustryDrill.jsx`)

**Files:**
- Create: `builder/src/components/scorecards/GrrIndustryDrill.jsx`

Behavior contract (from the spec):
- Cohort month select, defaulting to the latest complete month.
- Headline KPI: canonical `v_metric__annual_grr` for the month.
- Parity gate: recombine the L1 segment rows via `computeAllUpGrr`; if it differs from the headline by > 0.002, render a visible amber warning (no silent failure).
- Section 1 (industry): bars for the current drill level (`l1` → `l2` → `l3`). Clicking a bar (a) loads its account table AND (b) if not at `l3` and not `Unclassified`, drills one level deeper. Breadcrumb climbs back. Drilling into `Unclassified` is account-table-only (its children are all `Unclassified`).
- Section 2 (operating model): single-level bars, click → its own account table.
- Month change resets all drill + account state. Loading/error states everywhere.

- [ ] **Step 1: Write the component**

```jsx
// builder/src/components/scorecards/GrrIndustryDrill.jsx
// Controller for the "GRR by Industry" Labs scorecard. Owns the cohort-month
// state, the L1→L2→L3 industry drill path, the operating-model section, the
// per-section account tables, and the parity check between recombined segment
// GRR and the canonical v_metric__annual_grr. Mirrors FunnelDrill's structure.
import { useState, useEffect } from 'react';
import { ChartErrorBoundary } from '../EChart';
import GrrSegmentBars from './GrrSegmentBars';
import GrrAccountTable from './GrrAccountTable';
import DrillBreadcrumb from './DrillBreadcrumb';
import {
  fetchGrrSegments, fetchGrrAccounts, fetchAnnualGrrHeadline, computeAllUpGrr,
} from '../../lib/grrIndustryData';

// ── date helpers (same approach as DecompositionDrill) ──────────────────────
function isoMonth(d) { return d.toISOString().slice(0, 10); }
function latestCompleteMonth() {
  const n = new Date();
  return isoMonth(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1)));
}
function recentMonths(n) {
  const base = new Date(latestCompleteMonth() + 'T00:00:00Z');
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(isoMonth(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1))));
  }
  return out;
}
function monthLabel(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const INDUSTRY_DIMS = ['l1', 'l2', 'l3'];
const DIM_LABEL = { l1: 'L1', l2: 'L2', l3: 'L3', operating_model: 'Operating model' };
const PARITY_TOLERANCE = 0.002;

const fontSans = "'DM Sans', sans-serif";
const fontMono = "'JetBrains Mono', monospace";
const sectionLabel = { fontSize: 13, color: '#6b7280', fontFamily: fontSans };
const h2 = { fontSize: 18, fontWeight: 700, color: '#1a1a1a', margin: '32px 0 4px', fontFamily: fontSans };

export default function GrrIndustryDrill({ cfg, bqConnected, onConnect }) {
  const [month, setMonth] = useState(latestCompleteMonth());

  // Industry drill path: [] → L1 bars; [{dim:'l1',value:X}] → L2 bars within X; etc.
  const [path, setPath] = useState([]);
  const chartDim = INDUSTRY_DIMS[Math.min(path.length, 2)];
  const pathFilters = Object.fromEntries(path.map((p) => [p.dim, p.value]));

  const [industryRows, setIndustryRows] = useState(null);
  const [omRows, setOmRows] = useState(null);
  const [headlineGrr, setHeadlineGrr] = useState(null);
  const [l1Rows, setL1Rows] = useState(null); // unfiltered L1 rows, parity input

  // Per-section account drill: { label, filters } + fetched rows.
  const [industrySel, setIndustrySel] = useState(null);
  const [industryAccounts, setIndustryAccounts] = useState(null);
  const [omSel, setOmSel] = useState(null);
  const [omAccounts, setOmAccounts] = useState(null);

  const [chartsLoading, setChartsLoading] = useState(false);
  const [industryAccountsLoading, setIndustryAccountsLoading] = useState(false);
  const [omAccountsLoading, setOmAccountsLoading] = useState(false);
  const [error, setError] = useState(null);

  const clearAccounts = () => {
    setIndustrySel(null); setIndustryAccounts(null);
    setOmSel(null); setOmAccounts(null);
  };

  // ── headline + L1 + operating model: refetch on month change ──────────────
  useEffect(() => {
    if (!bqConnected) return;
    let cancelled = false;
    setChartsLoading(true);
    setError(null);
    setPath([]);
    clearAccounts();
    Promise.all([
      fetchGrrSegments({ month, dimension: 'l1', filters: {} }),
      fetchGrrSegments({ month, dimension: 'operating_model', filters: {} }),
      fetchAnnualGrrHeadline({ month }),
    ])
      .then(([l1, om, headline]) => {
        if (cancelled) return;
        setL1Rows(l1);
        setIndustryRows(l1);
        setOmRows(om);
        setHeadlineGrr(headline);
      })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setChartsLoading(false); });
    return () => { cancelled = true; };
  }, [month, bqConnected]);

  // ── industry bars for deeper drill levels ──────────────────────────────────
  useEffect(() => {
    if (!bqConnected) return;
    if (path.length === 0) { setIndustryRows(l1Rows); return; }
    let cancelled = false;
    setChartsLoading(true);
    fetchGrrSegments({ month, dimension: chartDim, filters: pathFilters })
      .then((rows) => { if (!cancelled) setIndustryRows(rows); })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setChartsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // ── handlers ───────────────────────────────────────────────────────────────
  const loadIndustryAccounts = (filters, label) => {
    setIndustrySel(label);
    setIndustryAccounts(null);
    setIndustryAccountsLoading(true);
    fetchGrrAccounts({ month, filters })
      .then(setIndustryAccounts)
      .catch(setError)
      .finally(() => setIndustryAccountsLoading(false));
  };

  const handleIndustryBarClick = (segment) => {
    const filters = { ...pathFilters, [chartDim]: segment };
    loadIndustryAccounts(filters, `${segment} (${DIM_LABEL[chartDim]})`);
    // Drill deeper unless at L3 or into Unclassified (children are all Unclassified).
    if (chartDim !== 'l3' && segment !== 'Unclassified') {
      setPath([...path, { dim: chartDim, value: segment }]);
    }
  };

  const handleOmBarClick = (segment) => {
    setOmSel(`${segment} (Operating model)`);
    setOmAccounts(null);
    setOmAccountsLoading(true);
    fetchGrrAccounts({ month, filters: { operating_model: segment } })
      .then(setOmAccounts)
      .catch(setError)
      .finally(() => setOmAccountsLoading(false));
  };

  const handleNavigate = (level) => {
    setPath(path.slice(0, level));
    setIndustrySel(null);
    setIndustryAccounts(null);
  };

  const trail = [
    { level: 0, label: 'All industries' },
    ...path.map((p, i) => ({ level: i + 1, label: p.value })),
  ];

  // ── parity gate: recombined L1 GRR vs canonical metric ────────────────────
  const allUp = l1Rows ? computeAllUpGrr(l1Rows) : null;
  const parityBroken = allUp != null && headlineGrr != null
    && Math.abs(allUp - headlineGrr) > PARITY_TOLERANCE;

  if (!bqConnected) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, color: '#1a1a1a', marginBottom: 8 }}>{cfg.title}</h2>
        <p style={{ color: '#6b7280', marginBottom: 16 }}>Connect to BigQuery to load scorecard data.</p>
        <button onClick={onConnect} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Connect BigQuery
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 1400 }}>
      {/* header + Beta pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 4px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a', margin: 0, fontFamily: fontSans }}>{cfg.title}</h1>
        {cfg.status && cfg.status !== 'live' && cfg.status !== 'approved' && (
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#b45309', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 999, padding: '4px 12px', whiteSpace: 'nowrap', fontFamily: fontSans }}>
            {cfg.status}
          </span>
        )}
      </div>
      {cfg.subtitle && (
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px', fontFamily: fontSans, maxWidth: 760 }}>{cfg.subtitle}</p>
      )}

      {/* cohort month + headline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', margin: '8px 0 8px' }}>
        <label style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
          Cohort month
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ padding: '5px 8px', fontSize: 14, fontWeight: 700, borderRadius: 6, border: '1px solid #d1d5db', fontFamily: fontSans, background: '#fff', color: '#1a1a1a' }}
          >
            {recentMonths(12).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
        <div style={{ ...sectionLabel, fontFamily: fontMono }}>
          Annual GRR (all-up):{' '}
          <strong style={{ color: '#1a1a1a', fontSize: 15 }}>
            {headlineGrr == null ? '—' : `${(headlineGrr * 100).toFixed(1)}%`}
          </strong>
        </div>
      </div>
      <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 16px', fontFamily: fontSans, maxWidth: 760 }}>
        Labels are current-state: a reclassified account counts under its current label even for past cohorts.
      </p>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, fontFamily: fontSans }}>
          {`Could not load data: ${error.message}`}
        </div>
      )}
      {parityBroken && (
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', color: '#b45309', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, fontFamily: fontSans }}>
          {`Parity check failed: segment math gives ${(allUp * 100).toFixed(2)}% but v_metric__annual_grr says ${(headlineGrr * 100).toFixed(2)}%. Don't trust the segment numbers until this is resolved.`}
        </div>
      )}

      {/* ── Section 1: GRR by industry ── */}
      <h2 style={h2}>GRR by industry</h2>
      <p style={{ ...sectionLabel, margin: '0 0 8px' }}>
        Click a bar to see its accounts{chartDim !== 'l3' ? ' and drill one level deeper' : ''}.
      </p>
      {path.length > 0 && <DrillBreadcrumb trail={trail} onNavigate={handleNavigate} />}
      {chartsLoading && !industryRows
        ? <p style={{ ...sectionLabel, padding: '24px 0' }}>Loading segments…</p>
        : <ChartErrorBoundary><GrrSegmentBars rows={industryRows} onSelect={handleIndustryBarClick} /></ChartErrorBoundary>}
      {industrySel && (
        <>
          <h3 style={{ ...h2, fontSize: 15, margin: '16px 0 4px' }}>Accounts — {industrySel}</h3>
          {industryAccountsLoading
            ? <p style={{ ...sectionLabel, padding: '12px 0' }}>Loading accounts…</p>
            : <ChartErrorBoundary><GrrAccountTable rows={industryAccounts} /></ChartErrorBoundary>}
        </>
      )}

      {/* ── Section 2: GRR by operating model ── */}
      <h2 style={h2}>GRR by operating model</h2>
      <p style={{ ...sectionLabel, margin: '0 0 8px' }}>How they go to market. Click a bar to see its accounts.</p>
      {chartsLoading && !omRows
        ? <p style={{ ...sectionLabel, padding: '24px 0' }}>Loading segments…</p>
        : <ChartErrorBoundary><GrrSegmentBars rows={omRows} onSelect={handleOmBarClick} selected={omSel ? omSel.replace(' (Operating model)', '') : null} /></ChartErrorBoundary>}
      {omSel && (
        <>
          <h3 style={{ ...h2, fontSize: 15, margin: '16px 0 4px' }}>Accounts — {omSel}</h3>
          {omAccountsLoading
            ? <p style={{ ...sectionLabel, padding: '12px 0' }}>Loading accounts…</p>
            : <ChartErrorBoundary><GrrAccountTable rows={omAccounts} /></ChartErrorBoundary>}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Lint and commit**

```bash
cd builder && npm run lint
cd /Users/nicolas/Desktop/method-metrics
git add builder/src/components/scorecards/GrrIndustryDrill.jsx
git commit -m "feat(grr-industry): drill controller with parity gate and dual sections"
```

---

### Task 6: Register the scorecard

**Files:**
- Create: `builder/src/config/scorecards/grr-industry-scorecard.js`
- Modify: `builder/src/config/scorecards/index.js`
- Modify: `builder/src/pages/Scorecard.jsx:140-145` (renderer branches)

- [ ] **Step 1: Write the config**

Create `builder/src/config/scorecards/grr-industry-scorecard.js`:

```js
// builder/src/config/scorecards/grr-industry-scorecard.js
export const grrIndustryScorecard = {
  id: 'grr-industry',
  title: 'GRR by Industry',
  subtitle: 'Annual gross revenue retention sliced by the V7 industry taxonomy (L1→L2→L3) and operating model, from the enrichment data in v7_classification.account_labels. Click any bar to see the accounts and why they were classified that way.',
  status: 'beta',
  labs: true,
  renderer: 'grrIndustry',
};
export default grrIndustryScorecard;
```

- [ ] **Step 2: Register in the index**

In `builder/src/config/scorecards/index.js`, add after the `funnelAcquisition` import (line 17):

```js
import grrIndustry from './grr-industry-scorecard.js';
```

and in the `SCORECARDS` object after `'acquisition-funnel': funnelAcquisition,` (line 34):

```js
  'grr-industry': grrIndustry,
```

- [ ] **Step 3: Add the renderer branch**

In `builder/src/pages/Scorecard.jsx`, add the import next to the `FunnelDrill` import (line 8):

```js
import GrrIndustryDrill from '../components/scorecards/GrrIndustryDrill';
```

and after the `funnelDrill` branch (line 145):

```js
  if (config.renderer === 'grrIndustry') {
    return <GrrIndustryDrill cfg={config} bqConnected={bqConnected} onConnect={onConnect} />;
  }
```

(The Labs sidebar entry appears automatically — `Sidebar.jsx:178` filters `SCORECARDS` on `sc.labs`.)

- [ ] **Step 4: Run the full unit suite + lint**

Run: `cd builder && npx vitest run && npm run lint`
Expected: all tests PASS (including pre-existing suites), lint clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/nicolas/Desktop/method-metrics
git add builder/src/config/scorecards/grr-industry-scorecard.js builder/src/config/scorecards/index.js builder/src/pages/Scorecard.jsx
git commit -m "feat(grr-industry): register GRR by Industry Labs scorecard"
```

---

### Task 7: Verification (browser + data spot-check)

- [ ] **Step 1: Start the dev server and load the page**

Use the preview tools (`preview_start` in `builder/`, Vite dev server). Navigate to `/scorecards/grr-industry` (hash route if the app uses one — check how the funnel page URL looks in `App.jsx` routing). Connect BQ OAuth if the preview supports it; if OAuth is not possible in the preview browser, verify the unauthed state renders the Connect prompt, then do the authed pass manually in a real browser and capture a screenshot.

- [ ] **Step 2: Verify behavior checklist**

- L1 bars render with GRR %, $ base, customer count; Unclassified is gray.
- Headline GRR shows and **no amber parity warning appears** (if it does, STOP — debug the segment SQL before proceeding; the canonical metric is right by definition).
- Click an L1 bar → account table appears AND L2 bars replace L1 with a breadcrumb.
- Breadcrumb climbs back to All industries.
- Click an account row → expansion shows business description + reasoning.
- Operating-model section clicks fill its own separate table.
- Month select changes data and resets the drill.

- [ ] **Step 3: Data spot-check against BQ**

Pick one L1 segment shown on the page. Run the same numbers directly (Claude can run this via the BQ MCP; this is verification, not a new script):

```sql
WITH labels AS (
  SELECT company_account, l1
  FROM `project-for-method-dw.v7_classification.account_labels`
  WHERE company_account IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY company_account ORDER BY confidence DESC, classified_at DESC) = 1
)
SELECT
  SAFE_DIVIDE(SUM(c.StartMRR) - SUM(c.Cancellations) - SUM(c.Downgrades), SUM(c.StartMRR)) AS grr,
  SUM(c.StartMRR) AS start_mrr
FROM `project-for-method-dw.revenue.int_customer_annual_mrr` c
LEFT JOIN labels lb ON lb.company_account = c.Company
WHERE c.Month = '<month shown on page>'
  AND COALESCE(lb.l1, 'Unclassified') = '<segment name>'
```

Expected: matches the page's bar annotation for that segment.

- [ ] **Step 4: Update TICKETS.md only if a real defect is found and deferred** (otherwise skip).

---

### Task 8: Deploy and verify live

- [ ] **Step 1: Build**

Run: `cd builder && npm run build`
Expected: Vite build succeeds, `builder/dist/` updated.

- [ ] **Step 2: Commit dist + push (GitHub Pages deploys on push to main — never vercel)**

```bash
cd /Users/nicolas/Desktop/method-metrics
git add builder/dist
git commit -m "build: GRR by Industry Labs page"
git push
```

Note: push requires the `nickperaltab` gh account. The repo is PUBLIC — confirm nothing sensitive is in the diff before pushing (this feature adds no data files; the diff should be source + dist only).

- [ ] **Step 3: Verify the deployment is live**

Wait for GitHub Pages to deploy (check `gh run list --limit 3` for the Pages workflow), then load `https://nickperaltab.github.io/method-metrics/builder/dist/` (the builder app's live URL — confirm exact path from how the funnel page is reached in production) and confirm "GRR by Industry" appears under Labs and renders. Only report success after seeing it live.
