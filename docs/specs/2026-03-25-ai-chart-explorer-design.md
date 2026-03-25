# Method Metrics — AI-Powered Chart Explorer

## Context

Method CRM has 218 metrics defined in Supabase, 47 BigQuery views, and marketing dashboards in Looker that need to be replaced. The primary goal: let non-technical users (directors, C-suite) create charts by describing what they want in plain English, with drag-and-drop refinement available for power users.

## Architecture

```
Supabase (metrics catalog)  +  BigQuery (data)  +  Claude API (AI)
                    ↓                  ↓                  ↓
              ┌─────────────────────────────────────────────────┐
              │           React App (Vite) — /builder/          │
              │                                                 │
              │  1. Load metric catalog from Supabase           │
              │  2. User types natural language prompt          │
              │  3. Claude API picks metric + generates GW spec │
              │  4. Fetch BQ view data (hybrid strategy)        │
              │  5. Render in Graphic Walker                    │
              │  6. User refines via drag-and-drop (optional)   │
              │  7. Save chart spec to Supabase saved_charts    │
              │                                                 │
              │  Explorer (GW editor + AI input)                │
              │  Dashboard (GW PureRenderer + KPI widgets)      │
              └─────────────────────────────────────────────────┘
                              ↓
                    GitHub Pages (/builder/)
```

Existing files (`tracker.html`, `charts.html`, `index.html`) stay untouched.

## Phase 1 Deliverables

### 1. Vite + React project setup

Create `/builder/` directory with:
- `package.json` — dependencies: `react`, `react-dom`, `@kanaries/graphic-walker`, `@anthropic-ai/sdk` (or direct API calls)
- `vite.config.js` — base path `/method-metrics/builder/`, static output for GitHub Pages
- Standard React entry point (`main.jsx`, `App.jsx`)

### 2. Shared services layer

**`src/lib/supabase.js`**
- Supabase URL: `https://agkubdpgnpwudzpzcvhs.supabase.co`
- Anon key: (from existing `charts.html`)
- `fetchMetrics()` — returns all metrics, grouped by type
- `saveChart(spec)` / `loadCharts(userEmail)` — CRUD for saved_charts table

**`src/lib/bigquery.js`**
- Reuse existing OAuth pattern from `charts.html`
- `initBqAuth()` — Google OAuth token client with same client ID
- `queryBq(sql)` — same REST API call pattern
- `fetchViewData(viewName)` — `SELECT * FROM revenue.{view_name} LIMIT 10000`
- `fetchViewSchema(viewName)` — get column names + types from INFORMATION_SCHEMA
- Cache: store fetched view data in memory, skip re-fetch on same view

**`src/lib/fieldMapper.js`**
- Takes BQ schema response (column name + type)
- Maps to GW `IMutField` format:
  - `DATE/TIMESTAMP` → `{ semanticType: 'temporal', analyticType: 'dimension' }`
  - `STRING` → `{ semanticType: 'nominal', analyticType: 'dimension' }`
  - `INTEGER/FLOAT` → `{ semanticType: 'quantitative', analyticType: 'measure' }`
- Uses metric's `agg_expression` to identify the primary measure field

### 3. AI chart generation

**`src/lib/ai.js`**
- Takes user prompt + metric catalog (from Supabase)
- Calls Claude API with system prompt containing:
  - All metric names, types, view names
  - Available columns per view (cached from BQ schema)
  - GW spec format explanation
- Claude returns structured JSON:
  ```json
  {
    "metric_id": 54,
    "chart_type": "bar",
    "x_field": "month",
    "y_field": "value",
    "color_field": "channel",
    "filters": {},
    "explanation": "Showing monthly trial counts broken down by channel"
  }
  ```
- We translate this into a GW spec and trigger data fetch

**Claude API call approach:**
- Frontend calls a Supabase Edge Function (keeps API key server-side)
- Edge Function: receives user prompt + metric catalog context, calls Claude API, returns structured JSON
- Model: `claude-haiku-4-5-20251001` (fast, cheap, sufficient for structured output)
- System prompt is ~5KB (metric catalog) — well within limits

**Supabase Edge Function: `ai-chart`**
- Deployed to Supabase project (`agkubdpgnpwudzpzcvhs`)
- Anthropic API key stored as Supabase secret (never exposed to browser)
- Endpoint: `POST /functions/v1/ai-chart`
- Request body: `{ prompt: string, metrics: MetricCatalog[], schemas: ViewSchemas }`
- Response: `{ metric_id, chart_type, x_field, y_field, color_field, filters, explanation }`
- Frontend calls via `supabase.functions.invoke('ai-chart', { body: ... })`

**Hallucination prevention — closed-set constraint:**

The AI literally cannot make things up because every value it returns is validated against known sets:

1. **`metric_id`** — must match an ID from the Supabase metrics table (passed in the prompt). If the AI returns an ID that doesn't exist, the frontend rejects it.
2. **`x_field`, `y_field`, `color_field`** — must match actual column names from the BQ view's schema (also passed in the prompt). Invalid column → rejected.
3. **`chart_type`** — must be one of GW's supported types: `bar`, `line`, `scatter`, `area`, `point`, `arc`. Invalid type → rejected.
4. **`filters`** — filter values validated against actual data in the fetched view.

The system prompt enforces this explicitly:
```
You MUST only use metric IDs and column names from the lists provided below.
Do NOT invent metric names, column names, or IDs.
If the user asks for something that doesn't match any available metric,
respond with {"error": "No matching metric found", "suggestion": "..."}
and suggest the closest available option.
```

The frontend validation layer acts as a safety net:
- Parse AI response as JSON (reject if malformed)
- Check `metric_id` exists in loaded metrics catalog
- Check all field names exist in the BQ view schema for that metric
- Check chart_type is in allowed list
- If any check fails → show user-friendly error: "I couldn't find a metric matching that. Try: [list of similar metric names]"

This is fundamentally different from a general-purpose AI that generates arbitrary SQL or code. The AI is just a natural-language router picking from pre-defined building blocks — like a search engine over your metric catalog, not a code generator.

### 4. Explorer page (`src/components/Explorer.jsx`)

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  [Method] [Home] [Tracker] [Charts] [Explorer]  BQ  │
├──────────┬──────────────────────────────────────────┤
│          │  ┌─────────────────────────────────────┐ │
│ Metrics  │  │ "Show me trials by month..."    [→] │ │
│          │  └─────────────────────────────────────┘ │
│ ▸ Prims  │                                          │
│  Trials  │  ┌─────────────────────────────────────┐ │
│  Syncs   │  │                                     │ │
│  Convs   │  │        Graphic Walker Editor        │ │
│          │  │                                     │ │
│ ▸ Found  │  │   (drag-and-drop chart builder)     │ │
│          │  │                                     │ │
│ ▸ Deriv  │  │                                     │ │
│          │  └─────────────────────────────────────┘ │
│          │                              [Save Chart]│
└──────────┴──────────────────────────────────────────┘
```

- **Top**: AI text input (hero element) — "Describe the chart you want..."
- **Left sidebar**: metric picker grouped by type (secondary input method)
- **Center**: Graphic Walker component with data + fields
- **Save button**: stores GW spec + metadata to Supabase `saved_charts`

**Interaction flows:**
1. AI flow: type prompt → AI picks metric + spec → fetch data → render in GW
2. Manual flow: click metric in sidebar → fetch data → GW shows fields → drag to build
3. Hybrid: AI generates initial chart → user refines via drag-and-drop → save

### 5. Graphic Walker integration

**Component setup:**
```jsx
import { GraphicWalker } from '@kanaries/graphic-walker';

<GraphicWalker
  data={viewData}           // rows from BQ view
  rawFields={gwFields}      // mapped from BQ schema
  spec={currentSpec}        // from AI or saved chart
  dark="dark"               // match existing dark theme
  storeRef={storeRef}       // for programmatic access
/>
```

**Theme:** dark mode to match existing Method dashboard aesthetic (--bg: #06080a, --accent: #34d399).

**Saving:** access `storeRef.current.vizStore` to export current spec as JSON.

**Viewer mode:** use `PureRenderer` component for dashboard read-only rendering (Phase 2).

### 6. Hybrid data strategy

When user selects a metric:
1. Check if view data is cached → use cache
2. Fetch `SELECT * FROM revenue.{view_name} LIMIT 10000`
3. If result has >10k rows, fall back to pre-aggregated query using Supabase SQL templates
4. Map columns to GW fields via `fieldMapper.js`
5. Pass data + fields to GW

**Derived metrics:** fetch each dependency's BQ view, compute formula client-side (same logic as `charts.html` line 263-304), pass computed result to GW.

### 7. Supabase: `saved_charts` table

```sql
CREATE TABLE saved_charts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,         -- email from Google OAuth
  metric_ids INTEGER[] NOT NULL,    -- which metrics are in this chart
  gw_spec JSONB NOT NULL,           -- Graphic Walker chart specification
  view_data_snapshot JSONB,         -- optional: cache data for offline render
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 8. GitHub Actions update

Modify `.github/workflows/static.yml` to:
1. Checkout repo
2. `cd builder && npm install && npm run build`
3. Copy build output to `builder/` in deploy directory
4. Upload entire repo (existing HTML files + builder dist) to Pages

### 9. OAuth origins

Already configured for:
- `https://nickperaltab.github.io` (production)
- `http://localhost:*` (Vite dev server)

No changes needed.

## Phase 2 (designed for, not built yet)

- **Dashboard page**: grid of `PureRenderer` components loading saved chart specs
- **Custom KPI widgets**: scorecard cards, data tables (React components, not GW)
- **Dashboard layouts**: stored in Supabase as JSON grid definitions
- **Shared dashboards**: dashboards visible to team, not just creator
- **BQ attribution views**: create `v_trials_attribution`, `v_syncs_attribution` etc. for channel unpivot

## File structure

```
/builder/
  package.json
  vite.config.js
  index.html
  src/
    main.jsx
    App.jsx
    components/
      Explorer.jsx        — main page: AI input + GW editor + metric picker
      MetricPicker.jsx    — sidebar with grouped metrics
      AiPrompt.jsx        — text input + send to Claude via Edge Function
      BqAuth.jsx          — OAuth connect button + status
      TopBar.jsx          — nav + BQ status
    lib/
      supabase.js         — client + fetch/save + Edge Function calls
      bigquery.js         — OAuth + query + cache
      fieldMapper.js      — BQ schema → GW fields
      ai.js               — calls Supabase Edge Function, translates response → GW spec
    hooks/
      useMetrics.js       — load metrics catalog
      useBqData.js        — fetch + cache view data
      useAiChart.js       — AI prompt → spec

/supabase/
  functions/
    ai-chart/
      index.ts            — Edge Function: receives prompt, calls Claude API, returns chart spec
```

## Verification

1. `cd builder && npm run dev` — Vite dev server starts
2. Open localhost → see Explorer page with AI input + empty GW
3. Connect BQ via OAuth
4. Type "show me trials by month" → AI returns spec → data loads → chart renders
5. Drag a field in GW → chart updates
6. Click Save → chart stored in Supabase
7. Refresh → saved charts load
8. `npm run build` → static output works
9. Push to main → GitHub Pages deploys, accessible at `nickperaltab.github.io/method-metrics/builder/`
