# dbt-backed Metric Inspector (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any metric/chart open a side panel that traces it back to dbt — description, lineage, compiled SQL, and a GitHub source link — sourced from dbt's `manifest.json`, with the cohort-survival chart as the first consumer.

**Architecture:** A pure projection turns the committed `target/manifest.json` into a slim `dbt-models.json` shipped with the app; a `useDbtModel` resolver looks models up with no BigQuery auth; `MetricInspector` gains a `dbtModel` mode rendering the dbt panel; the cohort chart gets an ⓘ affordance that opens it.

**Tech Stack:** Node (ESM script), React + Vite, Vitest.

## Global Constraints

- Source of truth is dbt `manifest.json`. The registry/components carry only a pointer (a dbt model name); never copy derivation content into the registry.
- Projection is generated, not hand-written. Regenerated on every `npm run build` and `npm run dev` (pre-scripts). Do NOT commit the generated `builder/public/dbt-models.json` (gitignore it).
- The dbt panel must work with NO BigQuery login (unlike the existing `useViewDefinition` DDL panel, which stays as-is).
- Tests in the manifest are best-effort: the committed manifest currently has 0 test nodes (`dbt parse` minimal). The projection must handle their absence; the panel renders a tests section only when non-empty.
- GitHub source link format: `https://github.com/nickperaltab/method-metrics/blob/main/<original_file_path>`.
- Vite base: `process.env.VITE_BASE || '/'`. Fetch the projection at `import.meta.env.BASE_URL + 'dbt-models.json'`.
- Scope: Phase 1 only. No registry mass-migration, no retiring the live-DDL panel, no new dbt models, no BQ changes.
- Freshness rule (documented, not CI-enforced in Phase 1): commit `target/manifest.json` after dbt model changes. Automated `dbt parse` drift-guard is deferred to Phase 2 (the Pages runner has no dbt installed).

---

### Task 1: Manifest projection function + CLI script + prebuild wiring

**Files:**
- Create: `builder/src/lib/dbtProjection.js` (pure function, testable)
- Create: `builder/tests/unit/dbtProjection.test.js`
- Create: `scripts/build_dbt_models_json.mjs` (thin CLI wrapper)
- Modify: `builder/package.json` (add `prebuild` + `predev` scripts)
- Modify: `builder/.gitignore` (ignore `public/dbt-models.json`)

**Interfaces:**
- Produces: `projectManifest(manifest: object): { models: DbtModelEntry[] }` where `DbtModelEntry = { name, alias, relation_name, description, original_file_path, refs: string[], sources: string[], columns: {name, description}[], compiled_sql: string, tests: string[] }`.

- [ ] **Step 1: Write the failing test**

Create `builder/tests/unit/dbtProjection.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { projectManifest } from '../../src/lib/dbtProjection.js';

const MANIFEST = {
  nodes: {
    'model.method_metrics.int_customer_survival': {
      resource_type: 'model', name: 'int_customer_survival', alias: 'int_customer_survival',
      schema: 'revenue', relation_name: '`p`.`revenue`.`int_customer_survival`',
      description: 'Cohort survival by first-pay vintage.',
      original_file_path: 'models/intermediate/int_customer_survival.sql',
      compiled_code: 'SELECT 1', raw_code: 'SELECT 1',
      columns: { vintage: { name: 'vintage', description: 'year' } },
      depends_on: { nodes: ['model.method_metrics.int_customer_mrr', 'source.method_metrics.revenue.Funnel'] },
    },
    'model.method_metrics.int_customer_mrr': {
      resource_type: 'model', name: 'int_customer_mrr', alias: 'int_customer_mrr',
      schema: 'revenue', relation_name: '`p`.`revenue`.`int_customer_mrr`',
      description: 'MRR', original_file_path: 'models/intermediate/int_customer_mrr.sql',
      compiled_code: 'SELECT 2', columns: {}, depends_on: { nodes: [] },
    },
    'model.method_metrics.staging_thing': {
      resource_type: 'model', name: 'staging_thing', alias: 'staging_thing',
      schema: 'analytics_staging', relation_name: '`p`.`analytics_staging`.`staging_thing`',
      description: '', original_file_path: 'models/x.sql', compiled_code: '', columns: {}, depends_on: { nodes: [] },
    },
  },
  sources: { 'source.method_metrics.revenue.Funnel': { name: 'Funnel', schema: 'revenue' } },
};

describe('projectManifest', () => {
  it('keeps only revenue/revenue_metrics models', () => {
    const names = projectManifest(MANIFEST).models.map(m => m.name);
    expect(names).toContain('int_customer_survival');
    expect(names).toContain('int_customer_mrr');
    expect(names).not.toContain('staging_thing');
  });

  it('maps depends_on to bare model refs and source names', () => {
    const m = projectManifest(MANIFEST).models.find(x => x.name === 'int_customer_survival');
    expect(m.refs).toEqual(['int_customer_mrr']);
    expect(m.sources).toEqual(['Funnel']);
    expect(m.compiled_sql).toBe('SELECT 1');
    expect(m.columns).toEqual([{ name: 'vintage', description: 'year' }]);
    expect(m.tests).toEqual([]); // no test nodes in fixture
    expect(m.original_file_path).toBe('models/intermediate/int_customer_survival.sql');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd builder && npx vitest run tests/unit/dbtProjection.test.js`
Expected: FAIL — cannot resolve `../../src/lib/dbtProjection.js`.

- [ ] **Step 3: Write the projection function**

Create `builder/src/lib/dbtProjection.js`:

```javascript
// Pure projection of dbt manifest.json -> slim, app-facing model metadata.
const INCLUDED_SCHEMAS = new Set(['revenue', 'revenue_metrics']);

function bareName(nodeId) {
  // 'model.method_metrics.int_customer_mrr' -> 'int_customer_mrr'
  // 'source.method_metrics.revenue.Funnel' -> 'Funnel'
  return nodeId.split('.').pop();
}

export function projectManifest(manifest) {
  const nodes = manifest?.nodes || {};
  // Gather column tests if any test nodes exist (best-effort; may be empty).
  const testsByModelCol = {}; // `${modelName}` -> [testName]
  for (const node of Object.values(nodes)) {
    if (node.resource_type !== 'test') continue;
    const deps = node.depends_on?.nodes || [];
    for (const dep of deps) {
      if (!dep.startsWith('model.')) continue;
      const mn = bareName(dep);
      (testsByModelCol[mn] ||= []).push(node.test_metadata?.name || node.name);
    }
  }

  const models = [];
  for (const node of Object.values(nodes)) {
    if (node.resource_type !== 'model') continue;
    if (!INCLUDED_SCHEMAS.has(node.schema)) continue;
    const deps = node.depends_on?.nodes || [];
    models.push({
      name: node.name,
      alias: node.alias || node.name,
      relation_name: node.relation_name || null,
      description: node.description || '',
      original_file_path: node.original_file_path || null,
      refs: deps.filter(d => d.startsWith('model.')).map(bareName),
      sources: deps.filter(d => d.startsWith('source.')).map(bareName),
      columns: Object.values(node.columns || {}).map(c => ({ name: c.name, description: c.description || '' })),
      compiled_sql: node.compiled_code || node.raw_code || '',
      tests: testsByModelCol[node.name] || [],
    });
  }
  models.sort((a, b) => a.name.localeCompare(b.name));
  return { models };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd builder && npx vitest run tests/unit/dbtProjection.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the CLI wrapper**

Create `scripts/build_dbt_models_json.mjs`:

```javascript
#!/usr/bin/env node
// Reads the committed dbt manifest and writes the app-facing projection.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectManifest } from '../builder/src/lib/dbtProjection.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const manifestPath = resolve(repoRoot, 'target/manifest.json');
const outPath = resolve(repoRoot, 'builder/public/dbt-models.json');

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  console.warn(`[dbt-models] no manifest at ${manifestPath} (${e.code}); writing empty projection.`);
  manifest = { nodes: {} };
}
const projection = projectManifest(manifest);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(projection));
console.log(`[dbt-models] wrote ${projection.models.length} models -> ${outPath}`);
```

- [ ] **Step 6: Wire prebuild/predev + gitignore**

In `builder/package.json` `scripts`, add (keep existing `build`/`dev`):

```json
"prebuild": "node ../scripts/build_dbt_models_json.mjs",
"predev": "node ../scripts/build_dbt_models_json.mjs"
```

Append to `builder/.gitignore`:

```
public/dbt-models.json
```

- [ ] **Step 7: Verify generation + commit**

Run: `cd builder && node ../scripts/build_dbt_models_json.mjs`
Expected: prints `[dbt-models] wrote N models` (N ≈ 28+); `builder/public/dbt-models.json` exists and `int_customer_survival` is present with `refs: ["int_customer_mrr"]`.

```bash
git add builder/src/lib/dbtProjection.js builder/tests/unit/dbtProjection.test.js scripts/build_dbt_models_json.mjs builder/package.json builder/.gitignore
git commit -m "feat(inspector): dbt manifest projection + prebuild wiring"
```

---

### Task 2: Resolver — `useDbtModel` + `dbtModelLink`

**Files:**
- Create: `builder/src/lib/dbtModels.js`
- Create: `builder/src/lib/useDbtModel.js`
- Create: `builder/tests/unit/dbtModels.test.js`

**Interfaces:**
- Consumes: `dbt-models.json` (Task 1 shape) at runtime.
- Produces:
  - `indexModels(models): Map<string, entry>` — keyed by both `name` and `alias`.
  - `getDbtModel(index, key): entry | null` — exact match on name/alias.
  - `dbtModelLink(originalFilePath): string` — GitHub blob URL.
  - `useDbtModel(key): { model, loading, error }` — React hook (fetch once, cached).

- [ ] **Step 1: Write the failing test**

Create `builder/tests/unit/dbtModels.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { indexModels, getDbtModel, dbtModelLink } from '../../src/lib/dbtModels.js';

const MODELS = [
  { name: 'int_customer_survival', alias: 'int_customer_survival', refs: ['int_customer_mrr'] },
  { name: 'metric_new_mrr', alias: 'v_metric__new_mrr', refs: [] },
];

describe('dbtModels', () => {
  it('indexes by name and alias', () => {
    const idx = indexModels(MODELS);
    expect(getDbtModel(idx, 'int_customer_survival').refs).toEqual(['int_customer_mrr']);
    expect(getDbtModel(idx, 'v_metric__new_mrr').name).toBe('metric_new_mrr'); // alias lookup
    expect(getDbtModel(idx, 'nope')).toBeNull();
  });

  it('builds a GitHub blob link', () => {
    expect(dbtModelLink('models/intermediate/int_customer_survival.sql'))
      .toBe('https://github.com/nickperaltab/method-metrics/blob/main/models/intermediate/int_customer_survival.sql');
    expect(dbtModelLink(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd builder && npx vitest run tests/unit/dbtModels.test.js`
Expected: FAIL — cannot resolve `../../src/lib/dbtModels.js`.

- [ ] **Step 3: Write the modules**

Create `builder/src/lib/dbtModels.js`:

```javascript
const REPO = 'https://github.com/nickperaltab/method-metrics/blob/main/';

export function indexModels(models) {
  const idx = new Map();
  for (const m of models || []) {
    if (m.name) idx.set(m.name, m);
    if (m.alias) idx.set(m.alias, m);
  }
  return idx;
}

export function getDbtModel(index, key) {
  if (!index || !key) return null;
  return index.get(key) || null;
}

export function dbtModelLink(originalFilePath) {
  return originalFilePath ? REPO + originalFilePath : null;
}

// Runtime loader (cached singleton + in-flight promise).
let _cache = null;
let _promise = null;
export async function loadDbtModelIndex() {
  if (_cache) return _cache;
  if (!_promise) {
    const url = (import.meta.env?.BASE_URL || '/') + 'dbt-models.json';
    _promise = fetch(url)
      .then(r => (r.ok ? r.json() : { models: [] }))
      .then(j => { _cache = indexModels(j.models || []); return _cache; })
      .catch(() => { _cache = new Map(); return _cache; });
  }
  return _promise;
}
```

Create `builder/src/lib/useDbtModel.js`:

```javascript
import { useState, useEffect } from 'react';
import { loadDbtModelIndex, getDbtModel } from './dbtModels.js';

export function useDbtModel(key) {
  const [state, setState] = useState({ model: null, loading: !!key, error: null });
  useEffect(() => {
    if (!key) { setState({ model: null, loading: false, error: null }); return; }
    let alive = true;
    setState({ model: null, loading: true, error: null });
    loadDbtModelIndex()
      .then(idx => { if (alive) setState({ model: getDbtModel(idx, key), loading: false, error: null }); })
      .catch(e => { if (alive) setState({ model: null, loading: false, error: e.message || 'load failed' }); });
    return () => { alive = false; };
  }, [key]);
  return state;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd builder && npx vitest run tests/unit/dbtModels.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add builder/src/lib/dbtModels.js builder/src/lib/useDbtModel.js builder/tests/unit/dbtModels.test.js
git commit -m "feat(inspector): useDbtModel resolver + GitHub source link"
```

---

### Task 3: MetricInspector dbt panel + `dbtModel` mode

**Files:**
- Modify: `builder/src/components/scorecards/MetricInspector.jsx` (props line 84; open guards lines 89–101, 125; add a render branch)

**Interfaces:**
- Consumes: `useDbtModel`, `dbtModelLink` from Task 2.
- Produces: `MetricInspector` accepts a new `dbtModel` prop (a model name string). When set (and `metricId == null`), the panel opens showing the dbt panel.

- [ ] **Step 1: Add the `dbtModel` prop + open/close handling**

Change the signature (line 84) to add `dbtModel`:

```jsx
export default function MetricInspector({ metricId, dbtModel, currentValue, valueFormat, metricsCache, customInfo, deltaInfo, onClose }) {
```

Change the open guard (the `metricId != null` effect, ~line 94–101) to also open on `dbtModel`:

```jsx
  useEffect(() => {
    if (metricId != null || dbtModel != null) {
      setTrail(metricId != null ? [metricId] : []);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [metricId, dbtModel]);
```

Change the early return (line 125) to:

```jsx
  if (metricId == null && dbtModel == null) return null;
```

- [ ] **Step 2: Render the dbt panel**

Add a `DbtPanel` component at the bottom of the file and render it as the body when `dbtModel` is set (before the existing `isCustomSql`/registry branches). The panel uses `useDbtModel(dbtModel)`:

```jsx
function DbtPanel({ modelName }) {
  const { model, loading, error } = useDbtModel(modelName);
  if (loading) return <div style={{ padding: 16, color: '#6b7280' }}>Loading dbt model…</div>;
  if (error || !model) return <div style={{ padding: 16, color: '#6b7280' }}>No dbt model found for <code>{modelName}</code>.</div>;
  const gh = dbtModelLink(model.original_file_path);
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>{model.name}</div>
      <div style={{ fontSize: 13, color: '#374151', margin: '6px 0 14px' }}>{model.description || 'No description.'}</div>

      {model.refs?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>Built from</div>
          {model.refs.map(r => <span key={r} style={{ fontFamily: 'monospace', fontSize: 12, background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, marginRight: 6 }}>{r}</span>)}
          {model.sources.map(s => <span key={s} style={{ fontFamily: 'monospace', fontSize: 12, background: '#eef2ff', padding: '2px 6px', borderRadius: 4, marginRight: 6 }}>{s} (source)</span>)}
        </div>
      )}

      {model.tests?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>Tests</div>
          <div style={{ fontSize: 12, color: '#374151' }}>{model.tests.join(', ')}</div>
        </div>
      )}

      {model.compiled_sql && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>Compiled SQL</div>
          <pre style={{ fontSize: 11, background: '#0d1117', color: '#c9d1d9', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 320 }}>{model.compiled_sql}</pre>
        </div>
      )}

      {gh && <a href={gh} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#2563eb' }}>View source on GitHub →</a>}
    </div>
  );
}
```

In the main returned JSX, render the body conditionally: when `dbtModel != null && metricId == null`, show `<DbtPanel modelName={dbtModel} />` in place of the metric/custom body (keep the existing scrim, close button, and slide-in wrapper). Match the existing panel's wrapper markup so styling/animation is unchanged.

- [ ] **Step 3: Verify build**

Run: `cd builder && npm run build`
Expected: build succeeds (no JSX/import errors). (Panel render verified live in Task 4.)

- [ ] **Step 4: Commit**

```bash
git add builder/src/components/scorecards/MetricInspector.jsx
git commit -m "feat(inspector): dbt panel + dbtModel mode (lineage, SQL, tests, GitHub)"
```

---

### Task 4: Cohort pilot wiring (ⓘ affordance → inspector)

**Files:**
- Modify: `builder/src/pages/Scorecard.jsx` (customSections render ~line 242; MetricInspector props ~line 240)
- Modify: `builder/src/components/scorecards/CohortSurvivalChart.jsx` (add `onInspect` prop + ⓘ button)

**Interfaces:**
- Consumes: `MetricInspector` `dbtModel` prop (Task 3).
- Produces: clicking the chart's ⓘ opens the inspector with `dbtModel: 'int_customer_survival'`.

- [ ] **Step 1: Thread `onInspect` + `dbtModel` through Scorecard.jsx**

In the `customSections.map` block, pass an inspect handler to the cohort component:

```jsx
          {section.component === 'cohortSurvival' && (
            <CohortSurvivalChart onInspect={() => setInspected({ dbtModel: 'int_customer_survival' })} />
          )}
```

Pass `dbtModel` to the inspector (find the existing `<MetricInspector ... />` render and add the prop):

```jsx
      <MetricInspector
        metricId={inspected?.metricId}
        dbtModel={inspected?.dbtModel}
        currentValue={inspected?.value}
        valueFormat={inspected?.format}
        metricsCache={metricsCache}
        customInfo={inspected?.customInfo}
        deltaInfo={inspected?.deltaInfo}
        onClose={() => setInspected(null)}
      />
```

- [ ] **Step 2: Add the ⓘ affordance to CohortSurvivalChart**

Add `onInspect` to the component signature and render a small button top-right of the chart (not over the plot — above it, by the measure toggle row):

```jsx
export default function CohortSurvivalChart({ onInspect }) {
```

In the toggle row (the `<div>` holding the GRR/Logo buttons), add at the end:

```jsx
        {onInspect && (
          <button
            onClick={onInspect}
            title="How this is derived (dbt)"
            style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, fontSize: 13, cursor: 'pointer', border: '1px solid #d1d5db', background: '#fff', color: '#374151' }}
          >
            ⓘ derivation
          </button>
        )}
```

(If the toggle row is not a flex container, wrap the buttons + this in a `div` with `style={{ display: 'flex', alignItems: 'center', gap: 8 }}` so `marginLeft: 'auto'` pushes ⓘ to the right.)

- [ ] **Step 3: Build + full test suite**

Run: `cd builder && npm run build && npx vitest run`
Expected: build succeeds; all tests pass (4 new across Tasks 1–2 + existing 400).

- [ ] **Step 4: Live verification (controller, not subagent)**

Open the Customers page with BQ connected, click **ⓘ derivation** on the cohort chart, confirm the panel shows the description, `Built from int_customer_mrr` + `Funnel (source)`, the compiled SQL, and a working GitHub link. Capture a screenshot. (Needs an authed browser; the subagent reports build/test green and leaves this to the controller.)

- [ ] **Step 5: Commit**

```bash
git add builder/src/pages/Scorecard.jsx builder/src/components/scorecards/CohortSurvivalChart.jsx
git commit -m "feat(inspector): wire cohort-survival ⓘ derivation to the dbt panel"
```

---

### Task 5: Build artifact + deploy (user-gated)

**Files:** none (build only).

- [ ] **Step 1: Production build + lint**

Run: `cd builder && npm run build && npm run lint`
Expected: build succeeds (prebuild regenerates `dbt-models.json` into `dist/`); lint exits 0.

- [ ] **Step 2: Deploy note**

Pages deploys from `main` via `static.yml` (rebuilds from source, so the projection regenerates server-side). Do NOT push to `main` without explicit user approval. When approved: merge to `main`, push, confirm the Pages run succeeds and the live builder serves a fresh bundle. Never run `vercel`.

---

## Self-Review

**Spec coverage:**
- Projection script from manifest → Task 1. ✓
- Generated, not committed; pre-scripts → Task 1 Steps 6–7 + Global Constraints. ✓
- Resolver `useDbtModel` + GitHub link, no BQ auth → Task 2. ✓
- Inspector dbt panel + `dbtModel` mode (description, lineage, SQL, tests best-effort, GitHub) → Task 3. ✓
- Cohort ⓘ pilot → Task 4. ✓
- Tests best-effort / may be empty → Global Constraints + Task 1 projection (`tests: []`) + Task 3 (renders only when non-empty). ✓
- Freshness documented, CI guard deferred → Global Constraints. ✓
- Registry view_name→model resolution: Phase 1 provides the mechanism (`getDbtModel` matches by alias = `view_name`); wiring registry metrics through it is Phase 2 — not a Phase-1 task, consistent with the spec's scope guard. ✓
- Build/deploy user-gated → Task 5. ✓

**Placeholder scan:** No TBD/TODO. Task 3 Step 2 describes matching the existing wrapper markup rather than pasting the full ~140-line component; the new `DbtPanel` code is complete, and the integration point is named with exact line anchors. Acceptable — the surrounding wrapper is existing code the implementer reads, not new code to invent.

**Type consistency:** `DbtModelEntry` fields (`name, alias, relation_name, description, original_file_path, refs, sources, columns, compiled_sql, tests`) are identical across Task 1 (producer), Task 2 (`getDbtModel` returns them), and Task 3 (`DbtPanel` reads `model.refs/sources/tests/compiled_sql/original_file_path`). `getDbtModel(index, key)`, `dbtModelLink(path)`, `useDbtModel(key)`, and the `dbtModel` prop are consistent across Tasks 2–4.
