# AI Chart Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI-powered chart explorer at `/builder/` where users describe charts in plain English, Claude picks from pre-defined metrics, and Graphic Walker renders + allows drag-and-drop refinement.

**Architecture:** React + Vite app in `/builder/` subfolder. Supabase for metric catalog + saved charts. BigQuery via OAuth for data. Supabase Edge Function proxies Claude API calls. Graphic Walker for chart rendering/editing.

**Tech Stack:** React 18, Vite, @kanaries/graphic-walker, Supabase (REST + Edge Functions), BigQuery REST API, Google OAuth, Claude API (claude-haiku-4-5)

**Spec:** `docs/specs/2026-03-25-ai-chart-explorer-design.md`

---

## File Map

```
builder/                          # New Vite+React app (subfolder of repo)
├── index.html                    # Vite HTML entry point
├── package.json                  # Dependencies
├── vite.config.js                # Vite config (base: /method-metrics/builder/)
└── src/
    ├── main.jsx                  # React DOM render entry
    ├── App.jsx                   # Router: top bar + Explorer page
    ├── lib/
    │   ├── supabase.js           # Supabase client, fetchMetrics, saveChart, loadCharts
    │   ├── bigquery.js           # BQ OAuth, queryBq, fetchViewData, cache
    │   ├── fieldMapper.js        # BQ schema → GW IMutField[]
    │   └── ai.js                 # Build system prompt, call Edge Function, validate + translate to GW spec
    ├── hooks/
    │   ├── useMetrics.js         # Load metric catalog on mount
    │   ├── useBqAuth.js          # BQ OAuth state + connect/disconnect
    │   └── useBqData.js          # Fetch + cache BQ view data
    └── components/
        ├── TopBar.jsx            # Nav links + BQ status
        ├── Explorer.jsx          # Main page: AI input + sidebar + GW
        ├── AiPrompt.jsx          # Text input + loading state + error display
        └── MetricPicker.jsx      # Sidebar: metrics grouped by type

supabase/                         # Supabase Edge Function
└── functions/
    └── ai-chart/
        └── index.ts              # Receives prompt+context, calls Claude, returns chart spec

.github/workflows/static.yml     # Modified: add npm build step for /builder/
```

---

## Task 1: Vite + React scaffold

**Files:**
- Create: `builder/package.json`
- Create: `builder/vite.config.js`
- Create: `builder/index.html`
- Create: `builder/src/main.jsx`
- Create: `builder/src/App.jsx`

- [ ] **Step 1: Create `builder/package.json`**

```json
{
  "name": "method-metrics-builder",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@kanaries/graphic-walker": "^0.4.75"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.3.0"
  }
}
```

- [ ] **Step 2: Create `builder/vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/method-metrics/builder/',
  build: {
    outDir: 'dist',
  },
});
```

- [ ] **Step 3: Create `builder/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Method — Explorer</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script src="https://accounts.google.com/gsi/client" async defer></script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

- [ ] **Step 4: Create `builder/src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 5: Create `builder/src/App.jsx`** (minimal shell)

```jsx
import React from 'react';

export default function App() {
  return (
    <div style={{ background: '#06080a', color: '#c8cdd3', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ padding: 32, color: '#edf0f3' }}>Method Explorer</h1>
      <p style={{ padding: '0 32px', color: '#5a6370' }}>Loading...</p>
    </div>
  );
}
```

- [ ] **Step 6: Install dependencies and verify dev server**

```bash
cd builder && npm install
```

```bash
cd builder && npm run dev
```

Expected: Vite starts at `http://localhost:5173/method-metrics/builder/`, shows "Method Explorer" heading.

- [ ] **Step 7: Verify build works**

```bash
cd builder && npm run build
```

Expected: `builder/dist/` created with `index.html` + JS/CSS assets.

- [ ] **Step 8: Commit**

```bash
git add builder/
git commit -m "feat: scaffold Vite+React app in /builder/"
```

---

## Task 2: Supabase client + metrics hook

**Files:**
- Create: `builder/src/lib/supabase.js`
- Create: `builder/src/hooks/useMetrics.js`

**Reference:** Existing Supabase pattern in `charts.html:102-116`

- [ ] **Step 1: Create `builder/src/lib/supabase.js`**

```js
const SUPABASE_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY';

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

export async function fetchMetrics() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/metrics?select=*&order=id`, { headers });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

export function groupMetrics(metrics) {
  return {
    primitives: metrics.filter(m => m.metric_type === 'primitive'),
    foundational: metrics.filter(m => m.metric_type === 'foundational'),
    derived: metrics.filter(m => m.metric_type === 'derived' && m.formula),
    dimensions: metrics.filter(m => m.metric_type === 'dimension'),
  };
}

export async function saveChart({ name, createdBy, metricIds, gwSpec }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/saved_charts`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      name,
      created_by: createdBy,
      metric_ids: metricIds,
      gw_spec: gwSpec,
    }),
  });
  if (!res.ok) throw new Error(`Save failed: ${res.status}`);
  return res.json();
}

export async function loadCharts(userEmail) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/saved_charts?created_by=eq.${encodeURIComponent(userEmail)}&order=created_at.desc`,
    { headers }
  );
  if (!res.ok) throw new Error(`Load failed: ${res.status}`);
  return res.json();
}

export async function invokeAiChart(body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chart`, {
    method: 'POST',
    headers: {
      ...headers,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI function failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Create `builder/src/hooks/useMetrics.js`**

```js
import { useState, useEffect } from 'react';
import { fetchMetrics, groupMetrics } from '../lib/supabase';

export function useMetrics() {
  const [metrics, setMetrics] = useState([]);
  const [grouped, setGrouped] = useState({ primitives: [], foundational: [], derived: [], dimensions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMetrics()
      .then(data => {
        setMetrics(data);
        setGrouped(groupMetrics(data));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { metrics, grouped, loading, error };
}
```

- [ ] **Step 3: Wire into App.jsx to verify**

Update `builder/src/App.jsx`:

```jsx
import React from 'react';
import { useMetrics } from './hooks/useMetrics';

export default function App() {
  const { metrics, grouped, loading, error } = useMetrics();

  return (
    <div style={{ background: '#06080a', color: '#c8cdd3', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ padding: 32, color: '#edf0f3' }}>Method Explorer</h1>
      <p style={{ padding: '0 32px', color: '#5a6370' }}>
        {loading ? 'Loading metrics...' : error ? `Error: ${error}` : `Loaded ${metrics.length} metrics (${grouped.primitives.length} primitives, ${grouped.derived.length} derived)`}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Verify in browser**

Run `cd builder && npm run dev`, open browser. Expected: "Loaded 218 metrics (9 primitives, 5 derived)" (numbers approximate).

- [ ] **Step 5: Commit**

```bash
git add builder/src/lib/supabase.js builder/src/hooks/useMetrics.js builder/src/App.jsx
git commit -m "feat: add Supabase client and useMetrics hook"
```

---

## Task 3: BigQuery OAuth + data fetching

**Files:**
- Create: `builder/src/lib/bigquery.js`
- Create: `builder/src/hooks/useBqAuth.js`
- Create: `builder/src/hooks/useBqData.js`

**Reference:** Existing BQ pattern in `charts.html:118-160`

- [ ] **Step 1: Create `builder/src/lib/bigquery.js`**

```js
const BQ_CLIENT_ID = '546732685010-nojjfak7esmun2taour8r5pakrsrg3aq.apps.googleusercontent.com';
const BQ_PROJECT = 'project-for-method-dw';
const BQ_DATASET = 'revenue';

let bqToken = localStorage.getItem('bq_access_token');

export function getBqToken() {
  return bqToken;
}

export function initBqAuth(onSuccess) {
  const stored = localStorage.getItem('bq_access_token');
  if (stored) {
    bqToken = stored;
    onSuccess?.(stored);
  }
}

export function connectBq(onSuccess) {
  if (!window.google?.accounts?.oauth2) return;
  google.accounts.oauth2.initTokenClient({
    client_id: BQ_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/bigquery https://www.googleapis.com/auth/userinfo.email',
    callback: (r) => {
      if (r.access_token) {
        bqToken = r.access_token;
        localStorage.setItem('bq_access_token', bqToken);
        onSuccess?.(bqToken);
      }
    },
  }).requestAccessToken();
}

export function disconnectBq() {
  bqToken = null;
  localStorage.removeItem('bq_access_token');
}

function cleanSql(sql) {
  return sql
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2260/g, '!=')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=');
}

export async function queryBq(sql) {
  if (!bqToken) throw new Error('Not connected to BigQuery');
  const res = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${BQ_PROJECT}/queries`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${bqToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: cleanSql(sql), useLegacySql: false, maxResults: 10000 }),
    }
  );
  if (!res.ok) {
    if (res.status === 401) {
      disconnectBq();
      throw new Error('BQ session expired — please reconnect');
    }
    throw new Error(`BQ ${res.status}`);
  }
  const data = await res.json();
  if (!data.rows) return { rows: [], schema: data.schema?.fields || [] };
  const fields = data.schema.fields;
  const rows = data.rows.map(r => {
    const o = {};
    fields.forEach((f, i) => { o[f.name] = r.f[i].v; });
    return o;
  });
  return { rows, schema: fields };
}

// Cache: viewName → { rows, schema }
const viewCache = {};

export async function fetchViewData(viewName) {
  if (viewCache[viewName]) return viewCache[viewName];
  const sql = `SELECT * FROM \`${BQ_PROJECT}.${BQ_DATASET}.${viewName}\` LIMIT 10000`;
  const result = await queryBq(sql);
  viewCache[viewName] = result;
  return result;
}

export function clearViewCache() {
  Object.keys(viewCache).forEach(k => delete viewCache[k]);
}
```

- [ ] **Step 2: Create `builder/src/hooks/useBqAuth.js`**

```js
import { useState, useEffect, useCallback } from 'react';
import { initBqAuth, connectBq, disconnectBq, getBqToken } from '../lib/bigquery';

export function useBqAuth() {
  const [connected, setConnected] = useState(false);
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    initBqAuth((token) => {
      setConnected(true);
      fetchEmail(token);
    });
  }, []);

  async function fetchEmail(token) {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUserEmail(data.email);
      }
    } catch { /* ignore */ }
  }

  const connect = useCallback(() => {
    connectBq((token) => {
      setConnected(true);
      fetchEmail(token);
    });
  }, []);

  const disconnect = useCallback(() => {
    disconnectBq();
    setConnected(false);
    setUserEmail(null);
  }, []);

  return { connected, userEmail, connect, disconnect };
}
```

- [ ] **Step 3: Create `builder/src/hooks/useBqData.js`**

```js
import { useState, useCallback } from 'react';
import { fetchViewData } from '../lib/bigquery';

export function useBqData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadView = useCallback(async (viewName) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchViewData(viewName);
      setData(result);
      return result;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, loadView };
}
```

- [ ] **Step 4: Verify BQ auth in App.jsx**

Update `builder/src/App.jsx`:

```jsx
import React from 'react';
import { useMetrics } from './hooks/useMetrics';
import { useBqAuth } from './hooks/useBqAuth';

export default function App() {
  const { metrics, grouped, loading: metricsLoading } = useMetrics();
  const { connected, userEmail, connect } = useBqAuth();

  return (
    <div style={{ background: '#06080a', color: '#c8cdd3', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ padding: 16, borderBottom: '1px solid #1a1e24', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: '#34d399', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700 }}>METHOD EXPLORER</span>
        {connected
          ? <span style={{ color: '#34d399', fontSize: 11 }}>&#9679; BQ Connected {userEmail && `(${userEmail})`}</span>
          : <button onClick={connect} style={{ background: '#0a1f17', border: '1px solid #34d399', color: '#34d399', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Connect BigQuery</button>
        }
      </div>
      <p style={{ padding: 32, color: '#5a6370' }}>
        {metricsLoading ? 'Loading metrics...' : `${metrics.length} metrics loaded`}
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Test in browser**

Run dev server, click "Connect BigQuery", complete OAuth flow. Expected: status shows "BQ Connected (email@domain.com)".

- [ ] **Step 6: Commit**

```bash
git add builder/src/lib/bigquery.js builder/src/hooks/useBqAuth.js builder/src/hooks/useBqData.js builder/src/App.jsx
git commit -m "feat: add BigQuery OAuth and data fetching layer"
```

---

## Task 4: Field mapper (BQ schema → GW fields)

**Files:**
- Create: `builder/src/lib/fieldMapper.js`

- [ ] **Step 1: Create `builder/src/lib/fieldMapper.js`**

```js
/**
 * Maps BigQuery schema fields to Graphic Walker IMutField format.
 *
 * BQ types → GW semantic/analytic types:
 *   DATE, TIMESTAMP, DATETIME → temporal / dimension
 *   STRING, BOOL              → nominal / dimension
 *   INTEGER, INT64, FLOAT, FLOAT64, NUMERIC, BIGNUMERIC → quantitative / measure
 */

const TEMPORAL_TYPES = new Set(['DATE', 'TIMESTAMP', 'DATETIME']);
const NUMERIC_TYPES = new Set(['INTEGER', 'INT64', 'FLOAT', 'FLOAT64', 'NUMERIC', 'BIGNUMERIC']);

export function mapBqSchemaToGwFields(schemaFields) {
  return schemaFields.map(field => {
    const type = field.type?.toUpperCase() || 'STRING';

    if (TEMPORAL_TYPES.has(type)) {
      return {
        fid: field.name,
        name: formatFieldName(field.name),
        semanticType: 'temporal',
        analyticType: 'dimension',
      };
    }

    if (NUMERIC_TYPES.has(type)) {
      return {
        fid: field.name,
        name: formatFieldName(field.name),
        semanticType: 'quantitative',
        analyticType: 'measure',
      };
    }

    // STRING, BOOL, and everything else → nominal dimension
    return {
      fid: field.name,
      name: formatFieldName(field.name),
      semanticType: 'nominal',
      analyticType: 'dimension',
    };
  });
}

/** Convert "SignupDate" or "Att_Pay_Per_Click" to "Signup Date" or "Att Pay Per Click" */
function formatFieldName(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
}
```

- [ ] **Step 2: Commit**

```bash
git add builder/src/lib/fieldMapper.js
git commit -m "feat: add BQ schema to Graphic Walker field mapper"
```

---

## Task 5: TopBar + MetricPicker components

**Files:**
- Create: `builder/src/components/TopBar.jsx`
- Create: `builder/src/components/MetricPicker.jsx`

- [ ] **Step 1: Create `builder/src/components/TopBar.jsx`**

```jsx
import React from 'react';

const styles = {
  bar: {
    padding: '12px 24px',
    borderBottom: '1px solid #1a1e24',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#0c0f12',
  },
  left: { display: 'flex', alignItems: 'center', gap: 16 },
  logo: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '.12em',
    textTransform: 'uppercase',
    color: '#34d399',
    background: '#0a1f17',
    padding: '5px 10px',
    borderRadius: 4,
    border: '1px solid #1a3d2e',
  },
  navLink: {
    color: '#5a6370',
    textDecoration: 'none',
    fontSize: 13,
    padding: '4px 12px',
    borderRadius: 4,
  },
  activeLink: {
    background: '#0a1f17',
    color: '#34d399',
  },
  connected: { color: '#34d399', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
  connectBtn: {
    background: '#0a1f17',
    border: '1px solid #34d399',
    color: '#34d399',
    padding: '4px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
  },
};

export default function TopBar({ connected, userEmail, onConnect }) {
  return (
    <div style={styles.bar}>
      <div style={styles.left}>
        <span style={styles.logo}>Method</span>
        <a href="../index.html" style={styles.navLink}>Home</a>
        <a href="../tracker.html" style={styles.navLink}>Tracker</a>
        <a href="../charts.html" style={styles.navLink}>Charts</a>
        <span style={{ ...styles.navLink, ...styles.activeLink }}>Explorer</span>
      </div>
      <div>
        {connected
          ? <span style={styles.connected}>&#9679; BQ Connected{userEmail ? ` (${userEmail})` : ''}</span>
          : <button onClick={onConnect} style={styles.connectBtn}>Connect BigQuery</button>
        }
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `builder/src/components/MetricPicker.jsx`**

```jsx
import React, { useState } from 'react';

const styles = {
  sidebar: {
    background: '#06080a',
    border: '1px solid #1a1e24',
    borderRadius: 8,
    padding: 16,
    overflowY: 'auto',
    minWidth: 240,
    maxWidth: 280,
  },
  heading: {
    fontSize: 13,
    fontWeight: 600,
    color: '#5a6370',
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    marginBottom: 8,
    cursor: 'pointer',
    userSelect: 'none',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
    color: '#c8cdd3',
    transition: 'background .1s',
  },
  badge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    padding: '1px 6px',
    borderRadius: 3,
    marginLeft: 'auto',
  },
  section: { marginBottom: 12 },
};

const TYPE_COLORS = {
  primitive: '#34d399',
  foundational: '#38bdf8',
  derived: '#fbbf24',
};

export default function MetricPicker({ grouped, selectedMetricId, onSelect }) {
  const [expanded, setExpanded] = useState({ primitives: true, foundational: true, derived: true });

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const renderSection = (label, key, metrics) => {
    const color = TYPE_COLORS[key === 'primitives' ? 'primitive' : key] || '#5a6370';
    return (
      <div style={styles.section} key={key}>
        <div style={styles.heading} onClick={() => toggle(key)}>
          {expanded[key] ? '▾' : '▸'} {label}
        </div>
        {expanded[key] && metrics.map(m => (
          <div
            key={m.id}
            style={{
              ...styles.item,
              background: selectedMetricId === m.id ? '#0c0f12' : 'transparent',
              borderLeft: selectedMetricId === m.id ? `2px solid ${color}` : '2px solid transparent',
            }}
            onClick={() => onSelect(m)}
          >
            <span>{m.name}</span>
            <span style={{ ...styles.badge, color, border: `1px solid ${color}30`, background: `${color}10` }}>
              {m.metric_type}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={styles.sidebar}>
      {renderSection('Primitives', 'primitives', grouped.primitives)}
      {renderSection('Foundational', 'foundational', grouped.foundational)}
      {renderSection('Derived', 'derived', grouped.derived)}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add builder/src/components/TopBar.jsx builder/src/components/MetricPicker.jsx
git commit -m "feat: add TopBar and MetricPicker components"
```

---

## Task 6: Explorer page with Graphic Walker

**Files:**
- Create: `builder/src/components/Explorer.jsx`
- Modify: `builder/src/App.jsx`

- [ ] **Step 1: Create `builder/src/components/Explorer.jsx`**

```jsx
import React, { useState, useRef, useCallback } from 'react';
import { GraphicWalker } from '@kanaries/graphic-walker';
import MetricPicker from './MetricPicker';
import { useBqData } from '../hooks/useBqData';
import { mapBqSchemaToGwFields } from '../lib/fieldMapper';

const styles = {
  layout: {
    display: 'grid',
    gridTemplateColumns: '260px 1fr',
    gap: 20,
    padding: 24,
    minHeight: 'calc(100vh - 52px)',
  },
  main: { display: 'flex', flexDirection: 'column', gap: 16 },
  status: {
    color: '#5a6370',
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    padding: 20,
    textAlign: 'center',
  },
  error: { color: '#f87171', fontSize: 12, padding: '8px 12px' },
  gwContainer: {
    flex: 1,
    background: '#0c0f12',
    border: '1px solid #1a1e24',
    borderRadius: 8,
    overflow: 'hidden',
    minHeight: 500,
  },
};

export default function Explorer({ grouped, bqConnected }) {
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [gwData, setGwData] = useState(null);
  const [gwFields, setGwFields] = useState(null);
  const storeRef = useRef(null);
  const { loading, error, loadView } = useBqData();

  const handleSelectMetric = useCallback(async (metric) => {
    setSelectedMetric(metric);
    if (!metric.view_name) return;

    const result = await loadView(metric.view_name);
    if (!result) return;

    const fields = mapBqSchemaToGwFields(result.schema);
    // Cast numeric strings from BQ to actual numbers for GW
    const rows = result.rows.map(row => {
      const out = {};
      for (const f of fields) {
        const val = row[f.fid];
        if (f.semanticType === 'quantitative') {
          out[f.fid] = val != null ? Number(val) : null;
        } else {
          out[f.fid] = val;
        }
      }
      return out;
    });

    setGwData(rows);
    setGwFields(fields);
  }, [loadView]);

  return (
    <div style={styles.layout}>
      <MetricPicker
        grouped={grouped}
        selectedMetricId={selectedMetric?.id}
        onSelect={handleSelectMetric}
      />
      <div style={styles.main}>
        {error && <div style={styles.error}>{error}</div>}

        {!bqConnected && (
          <div style={styles.status}>Connect BigQuery to start exploring</div>
        )}

        {bqConnected && !selectedMetric && (
          <div style={styles.status}>Select a metric from the sidebar</div>
        )}

        {loading && <div style={styles.status}>Loading data...</div>}

        {gwData && gwFields && (
          <div style={styles.gwContainer}>
            <GraphicWalker
              data={gwData}
              rawFields={gwFields}
              dark="dark"
              storeRef={storeRef}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `builder/src/App.jsx`** to use Explorer + TopBar

```jsx
import React from 'react';
import TopBar from './components/TopBar';
import Explorer from './components/Explorer';
import { useMetrics } from './hooks/useMetrics';
import { useBqAuth } from './hooks/useBqAuth';

export default function App() {
  const { grouped, loading: metricsLoading } = useMetrics();
  const { connected, userEmail, connect } = useBqAuth();

  return (
    <div style={{ background: '#06080a', color: '#c8cdd3', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
      <TopBar connected={connected} userEmail={userEmail} onConnect={connect} />
      {metricsLoading
        ? <p style={{ padding: 32, color: '#5a6370', textAlign: 'center' }}>Loading metrics...</p>
        : <Explorer grouped={grouped} bqConnected={connected} />
      }
    </div>
  );
}
```

- [ ] **Step 3: Test the full flow in browser**

1. Run `cd builder && npm run dev`
2. Open browser → see TopBar + MetricPicker sidebar
3. Click "Connect BigQuery" → OAuth flow
4. Click "Trials" in sidebar → data loads → Graphic Walker editor appears
5. Drag `SignupDate` to X axis, see chart render

Expected: a working Graphic Walker instance showing BQ data with draggable fields.

- [ ] **Step 4: Commit**

```bash
git add builder/src/components/Explorer.jsx builder/src/App.jsx
git commit -m "feat: wire up Explorer page with Graphic Walker + BQ data"
```

---

## Task 7: AI prompt component + Edge Function

**Files:**
- Create: `builder/src/components/AiPrompt.jsx`
- Create: `builder/src/lib/ai.js`
- Create: `supabase/functions/ai-chart/index.ts`
- Modify: `builder/src/components/Explorer.jsx`

- [ ] **Step 1: Create `builder/src/lib/ai.js`**

```js
import { invokeAiChart } from './supabase';

const VALID_CHART_TYPES = new Set(['bar', 'line', 'scatter', 'area', 'point', 'arc']);

/**
 * Build the metric catalog context string for the AI system prompt.
 */
export function buildMetricContext(metrics) {
  const chartable = metrics.filter(m =>
    ['primitive', 'foundational', 'derived'].includes(m.metric_type)
  );
  return chartable.map(m =>
    `- id:${m.id} name:"${m.name}" type:${m.metric_type} view:${m.view_name || 'none'}`
  ).join('\n');
}

/**
 * Build column context from cached BQ schemas.
 * schemaMap: { viewName: [{name, type}] }
 */
export function buildSchemaContext(schemaMap) {
  return Object.entries(schemaMap)
    .map(([view, fields]) =>
      `${view}: ${fields.map(f => `${f.name}(${f.type})`).join(', ')}`
    )
    .join('\n');
}

/**
 * Call the AI Edge Function and validate the response.
 */
export async function generateChartSpec(prompt, metrics, schemaMap) {
  const metricContext = buildMetricContext(metrics);
  const schemaContext = buildSchemaContext(schemaMap);

  const result = await invokeAiChart({
    prompt,
    metricContext,
    schemaContext,
  });

  // Validate response
  if (result.error) {
    return { error: result.error, suggestion: result.suggestion };
  }

  const metric = metrics.find(m => m.id === result.metric_id);
  if (!metric) {
    return { error: `Unknown metric ID: ${result.metric_id}`, suggestion: 'Try asking for a specific metric by name.' };
  }

  const viewSchema = schemaMap[metric.view_name];
  if (viewSchema) {
    const colNames = new Set(viewSchema.map(f => f.name));
    for (const field of [result.x_field, result.y_field, result.color_field].filter(Boolean)) {
      if (!colNames.has(field)) {
        return { error: `Column "${field}" not found in ${metric.view_name}`, suggestion: `Available columns: ${[...colNames].join(', ')}` };
      }
    }
  }

  if (result.chart_type && !VALID_CHART_TYPES.has(result.chart_type)) {
    result.chart_type = 'bar'; // safe fallback
  }

  return {
    metric,
    chartType: result.chart_type || 'bar',
    xField: result.x_field,
    yField: result.y_field,
    colorField: result.color_field || null,
    filters: result.filters || {},
    explanation: result.explanation || '',
  };
}
```

- [ ] **Step 2: Create `builder/src/components/AiPrompt.jsx`**

```jsx
import React, { useState } from 'react';

const styles = {
  container: {
    display: 'flex',
    gap: 8,
    padding: '0 0 16px 0',
  },
  input: {
    flex: 1,
    background: '#0c0f12',
    border: '1px solid #1a1e24',
    borderRadius: 8,
    color: '#edf0f3',
    padding: '12px 16px',
    fontSize: 14,
    fontFamily: "'DM Sans', sans-serif",
    outline: 'none',
  },
  button: {
    background: '#0a1f17',
    border: '1px solid #34d399',
    color: '#34d399',
    padding: '12px 20px',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  explanation: {
    color: '#5a6370',
    fontSize: 12,
    padding: '4px 0',
    fontStyle: 'italic',
  },
  error: {
    color: '#f87171',
    fontSize: 12,
    padding: '4px 0',
  },
};

export default function AiPrompt({ onResult, loading, error, explanation }) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (prompt.trim()) onResult(prompt.trim());
  };

  return (
    <div>
      <form onSubmit={handleSubmit} style={styles.container}>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the chart you want... e.g. 'Show me trials by month'"
          style={styles.input}
          disabled={loading}
        />
        <button type="submit" style={{ ...styles.button, opacity: loading ? 0.5 : 1 }} disabled={loading}>
          {loading ? 'Thinking...' : 'Build Chart'}
        </button>
      </form>
      {explanation && <div style={styles.explanation}>{explanation}</div>}
      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Create `supabase/functions/ai-chart/index.ts`**

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const SYSTEM_PROMPT = `You are a chart configuration assistant for Method CRM's metrics dashboard.

You receive a user's natural language request and a catalog of available metrics with their BQ view columns.

You MUST only use metric IDs and column names from the lists provided below.
Do NOT invent metric names, column names, or IDs.

Return ONLY valid JSON (no markdown, no explanation outside JSON) in this format:
{
  "metric_id": <integer>,
  "chart_type": "bar" | "line" | "scatter" | "area" | "point" | "arc",
  "x_field": "<column_name>",
  "y_field": "<column_name>",
  "color_field": "<column_name or null>",
  "filters": {},
  "explanation": "<one sentence describing what the chart shows>"
}

If the user asks for something that doesn't match any available metric, return:
{
  "error": "No matching metric found",
  "suggestion": "<suggest the closest available metric by name>"
}

Guidelines:
- For time-series requests (by month, over time, trend), use a temporal column for x_field and chart_type "line"
- For comparisons (by channel, by country), use the category column for x_field and chart_type "bar"
- For rates/percentages, prefer chart_type "line"
- Pick the most specific metric that matches the request
- y_field should typically be a numeric/quantitative column`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const { prompt, metricContext, schemaContext } = await req.json();

  const userMessage = `Available metrics:\n${metricContext}\n\nAvailable columns per view:\n${schemaContext}\n\nUser request: ${prompt}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return new Response(JSON.stringify({ error: `Claude API error: ${response.status}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  try {
    const parsed = JSON.parse(text);
    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to parse AI response', raw: text }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
```

- [ ] **Step 4: Wire AI into Explorer.jsx**

Replace `builder/src/components/Explorer.jsx` with:

```jsx
import React, { useState, useRef, useCallback } from 'react';
import { GraphicWalker } from '@kanaries/graphic-walker';
import MetricPicker from './MetricPicker';
import AiPrompt from './AiPrompt';
import { useBqData } from '../hooks/useBqData';
import { mapBqSchemaToGwFields } from '../lib/fieldMapper';
import { generateChartSpec } from '../lib/ai';

const styles = {
  layout: {
    display: 'grid',
    gridTemplateColumns: '260px 1fr',
    gap: 20,
    padding: 24,
    minHeight: 'calc(100vh - 52px)',
  },
  main: { display: 'flex', flexDirection: 'column', gap: 16 },
  status: {
    color: '#5a6370',
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    padding: 20,
    textAlign: 'center',
  },
  gwContainer: {
    flex: 1,
    background: '#0c0f12',
    border: '1px solid #1a1e24',
    borderRadius: 8,
    overflow: 'hidden',
    minHeight: 500,
  },
};

// Collect BQ schemas from previously loaded views
const schemaCache = {};

function castRow(row, fields) {
  const out = {};
  for (const f of fields) {
    const val = row[f.fid];
    out[f.fid] = f.semanticType === 'quantitative' && val != null ? Number(val) : val;
  }
  return out;
}

export default function Explorer({ grouped, metrics, bqConnected }) {
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [gwData, setGwData] = useState(null);
  const [gwFields, setGwFields] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiExplanation, setAiExplanation] = useState(null);
  const storeRef = useRef(null);
  const { loading: dataLoading, error: dataError, loadView } = useBqData();

  const loadMetricData = useCallback(async (metric) => {
    if (!metric.view_name) return null;
    const result = await loadView(metric.view_name);
    if (!result) return null;

    // Cache schema for AI context
    schemaCache[metric.view_name] = result.schema;

    const fields = mapBqSchemaToGwFields(result.schema);
    const rows = result.rows.map(row => castRow(row, fields));

    setGwData(rows);
    setGwFields(fields);
    setSelectedMetric(metric);
    return { rows, fields };
  }, [loadView]);

  const handleSelectMetric = useCallback((metric) => {
    setAiError(null);
    setAiExplanation(null);
    loadMetricData(metric);
  }, [loadMetricData]);

  const handleAiPrompt = useCallback(async (prompt) => {
    setAiLoading(true);
    setAiError(null);
    setAiExplanation(null);

    try {
      const result = await generateChartSpec(prompt, metrics, schemaCache);

      if (result.error) {
        setAiError(result.suggestion ? `${result.error}. ${result.suggestion}` : result.error);
        return;
      }

      setAiExplanation(result.explanation);
      await loadMetricData(result.metric);

      // TODO: Apply chart type + field assignments to GW via storeRef
      // For now, GW loads with all fields available for manual arrangement

    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  }, [metrics, loadMetricData]);

  const loading = dataLoading || aiLoading;
  const error = dataError || aiError;

  return (
    <div style={styles.layout}>
      <MetricPicker
        grouped={grouped}
        selectedMetricId={selectedMetric?.id}
        onSelect={handleSelectMetric}
      />
      <div style={styles.main}>
        {bqConnected && (
          <AiPrompt
            onResult={handleAiPrompt}
            loading={aiLoading}
            error={aiError}
            explanation={aiExplanation}
          />
        )}

        {!bqConnected && (
          <div style={styles.status}>Connect BigQuery to start exploring</div>
        )}

        {bqConnected && !selectedMetric && !loading && (
          <div style={styles.status}>Describe a chart above, or select a metric from the sidebar</div>
        )}

        {loading && <div style={styles.status}>Loading...</div>}

        {gwData && gwFields && !loading && (
          <div style={styles.gwContainer}>
            <GraphicWalker
              data={gwData}
              rawFields={gwFields}
              dark="dark"
              storeRef={storeRef}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update App.jsx to pass metrics array**

```jsx
import React from 'react';
import TopBar from './components/TopBar';
import Explorer from './components/Explorer';
import { useMetrics } from './hooks/useMetrics';
import { useBqAuth } from './hooks/useBqAuth';

export default function App() {
  const { metrics, grouped, loading: metricsLoading } = useMetrics();
  const { connected, userEmail, connect } = useBqAuth();

  return (
    <div style={{ background: '#06080a', color: '#c8cdd3', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
      <TopBar connected={connected} userEmail={userEmail} onConnect={connect} />
      {metricsLoading
        ? <p style={{ padding: 32, color: '#5a6370', textAlign: 'center' }}>Loading metrics...</p>
        : <Explorer grouped={grouped} metrics={metrics} bqConnected={connected} />
      }
    </div>
  );
}
```

- [ ] **Step 6: Deploy the Edge Function**

```bash
npx supabase functions deploy ai-chart --project-ref agkubdpgnpwudzpzcvhs
```

Then set the secret:
```bash
npx supabase secrets set ANTHROPIC_API_KEY=<your-key> --project-ref agkubdpgnpwudzpzcvhs
```

- [ ] **Step 7: Test AI flow in browser**

1. Connect BQ
2. Click a few metrics in sidebar first (to populate schemaCache)
3. Type "show me trials by month" → AI returns spec → metric loads → GW renders
4. Type something invalid like "show me pizza sales" → see friendly error

- [ ] **Step 8: Commit**

```bash
git add builder/src/components/AiPrompt.jsx builder/src/lib/ai.js builder/src/components/Explorer.jsx builder/src/App.jsx supabase/
git commit -m "feat: add AI chart generation via Supabase Edge Function"
```

---

## Task 8: Save/Load charts

**Files:**
- Modify: `builder/src/components/Explorer.jsx`

**Prerequisites:** Create `saved_charts` table in Supabase. Run this SQL in the Supabase SQL editor:

```sql
CREATE TABLE saved_charts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  metric_ids INTEGER[] NOT NULL,
  gw_spec JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE saved_charts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read saved charts"
  ON saved_charts FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert saved charts"
  ON saved_charts FOR INSERT
  WITH CHECK (true);
```

- [ ] **Step 1: Add save button + logic to Explorer.jsx**

Add these to Explorer.jsx, inside the component after the existing state declarations:

```jsx
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = useCallback(async () => {
    if (!storeRef.current || !selectedMetric) return;

    const name = window.prompt('Name this chart:');
    if (!name) return;

    setSaving(true);
    setSaveSuccess(false);
    try {
      // Export current GW spec
      const vizStore = storeRef.current;
      const spec = vizStore.exportViewSpec?.() || vizStore.vizStore?.exportViewSpec?.() || {};

      await saveChart({
        name,
        createdBy: userEmail || 'anonymous',
        metricIds: [selectedMetric.id],
        gwSpec: spec,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setAiError(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [selectedMetric, userEmail]);
```

Add the save button below the GW container:

```jsx
{gwData && gwFields && !loading && (
  <>
    <div style={styles.gwContainer}>
      <GraphicWalker data={gwData} rawFields={gwFields} dark="dark" storeRef={storeRef} />
    </div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      {saveSuccess && <span style={{ color: '#34d399', fontSize: 12, alignSelf: 'center' }}>Saved!</span>}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          background: '#0a1f17',
          border: '1px solid #34d399',
          color: '#34d399',
          padding: '8px 20px',
          borderRadius: 6,
          cursor: 'pointer',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          fontWeight: 600,
          opacity: saving ? 0.5 : 1,
        }}
      >
        {saving ? 'Saving...' : 'Save Chart'}
      </button>
    </div>
  </>
)}
```

Add import at top of Explorer.jsx:
```jsx
import { saveChart } from '../lib/supabase';
```

Also add `userEmail` to props — update component signature:
```jsx
export default function Explorer({ grouped, metrics, bqConnected, userEmail }) {
```

And in App.jsx, pass it:
```jsx
<Explorer grouped={grouped} metrics={metrics} bqConnected={connected} userEmail={userEmail} />
```

- [ ] **Step 2: Test save in browser**

1. Select a metric, configure a chart in GW
2. Click "Save Chart" → enter name → see "Saved!" confirmation
3. Check Supabase table in dashboard to verify row was created

- [ ] **Step 3: Commit**

```bash
git add builder/src/components/Explorer.jsx builder/src/App.jsx
git commit -m "feat: add save chart to Supabase"
```

---

## Task 9: GitHub Actions build step

**Files:**
- Modify: `.github/workflows/static.yml`

- [ ] **Step 1: Update `.github/workflows/static.yml`**

Replace the entire file with:

```yaml
name: Deploy static content to Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: builder/package-lock.json

      - name: Build Explorer
        run: |
          cd builder
          npm ci
          npm run build

      - name: Prepare deploy directory
        run: |
          mkdir -p _site
          cp index.html tracker.html charts.html CLAUDE.md README.md _site/ 2>/dev/null || true
          cp -r builder/dist _site/builder

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '_site'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Generate lock file**

```bash
cd builder && npm install
```

This creates `package-lock.json` which the CI needs for `npm ci`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/static.yml builder/package-lock.json
git commit -m "feat: add build step for /builder/ to GitHub Pages deploy"
```

---

## Task 10: End-to-end verification

- [ ] **Step 1: Local dev verification**

```bash
cd builder && npm run dev
```

1. Open `http://localhost:5173/method-metrics/builder/`
2. See TopBar with nav links + "Connect BigQuery" button
3. See MetricPicker sidebar with Primitives/Foundational/Derived sections
4. See AI prompt input at top of main area
5. Click "Connect BigQuery" → OAuth → status shows connected
6. Click "Trials" in sidebar → data loads → Graphic Walker appears with fields
7. Drag `SignupDate` to rows, see chart render
8. Type "show me trials by month" in AI prompt → metric loads → GW renders
9. Click "Save Chart" → enter name → see "Saved!" → verify in Supabase

- [ ] **Step 2: Production build verification**

```bash
cd builder && npm run build && npm run preview
```

Open preview URL, repeat verification steps above.

- [ ] **Step 3: Push to deploy**

```bash
git push origin main
```

Check GitHub Actions — build should succeed. Verify at `https://nickperaltab.github.io/method-metrics/builder/`.

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A && git commit -m "fix: post-verification fixes"
```
