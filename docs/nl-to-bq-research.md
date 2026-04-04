# NL-to-BigQuery OSS Research

Research session: 2026-04-03. Goal: find open source projects doing NL → BigQuery → charts that we can copy patterns from.

## Our Stack (for reference)

User types NL prompt → Claude Sonnet (Edge Function) → returns JSON config (metric IDs, chart type, time bucket, filters) → frontend builds SQL → runs against BigQuery via OAuth → renders with ECharts.

Metric catalog lives in Supabase (`metrics` table). AI sees all `live` metrics as context.

---

## Projects Worth Studying

### 1. WrenAI
**Repo:** https://github.com/Canner/WrenAI  
**Stars:** ~14,800 | Active (TypeScript + Python) | Updated daily

Closest architectural match. NL → semantic catalog (MDL) → SQL → charts.

**Prompt structure (from their source):**
```
### DATABASE SCHEMA ###
[MDL documents]

### CALCULATED FIELDS ###
[metric formulas]

### METRICS ###
[available metrics]

### SQL SAMPLES ###
[few-shot question→SQL pairs]

### USER INSTRUCTIONS ###
[numbered rules]

### QUESTION ###
User's Question: [query]

Let's think step by step.
```

**MDL metric definition format:**
```json
{
  "name": "customers",
  "columns": [
    {
      "name": "consumption",
      "type": "integer",
      "isCalculated": true,
      "expression": "sum(orders.totalprice)",
      "properties": { "description": "Total spend by customer" }
    }
  ]
}
```

**What to copy:**
- Section headers in prompt (`### DATABASE SCHEMA ###` etc.) — helps LLM organize context at high metric counts
- Separating "retrieval" (which metrics are relevant?) from "generation" (write the SQL)
- Relationship definitions: `{"models": ["Customer", "Orders"], "joinType": "ONE_TO_MANY", "condition": "..."}`
- Few-shot SQL samples injected into prompt — their `pipelines/generation/` directory

**Still needs investigation (clone repo):**
- `wren-ai-service/src/pipelines/generation/` — actual prompt construction code
- `wren-ai-service/src/pipelines/indexing/` — vector store build process, token pruning threshold
- All Pydantic models enforcing LLM output shapes + validation error handling
- `wren-ai-service/src/pipelines/retrieval/` — how they select relevant metrics from large catalog

---

### 2. nao ✅ Investigated
**Repo:** https://github.com/getnao/nao  
**Stars:** ~834 | Active | React + TypeScript + BigQuery + Fastify + tRPC

Closest JS stack to ours. Key finding: **schema-as-files is 10-100x more efficient than prompt injection.**

#### Agent System Prompt
**File:** `apps/backend/src/components/ai/system-prompt.tsx`

Role: "expert AI data analyst." The system prompt is a React TSX component (~1-2KB of instructions). Schema is NOT in it. Instead, the agent gets context via:
1. `@table-name` mentions → injects just those columns into the user message
2. `read` / `list` / `grep` tools → agent explores the schema folder on demand

#### Tool Definitions
**File:** `apps/backend/src/agents/tools/` + `index.ts`

Full tool set:
- `read` — reads a file by path (schema markdown files, rules, etc.)
- `list` — lists directories (browse `databases/type=.../schema=.../`)
- `grep` — ripgrep with regex, glob, context lines, max_results
- `execute_sql` — runs SQL against connected DB, read-only by default
- `display_chart` — renders chart from SQL results + config
- `search` — semantic search across files
- `suggest_follow_ups`, `story`, `execute_python` — misc

#### Schema Sync + File Format
**File:** `cli/nao_core/commands/sync/providers/databases/provider.py`

CLI command `nao sync` generates markdown files per table:
```
databases/
└── type=bigquery/
    └── database=mydb/
        └── schema=public/
            └── table=users/
                ├── columns.md      # column names + types
                ├── description.md  # LLM-generated table description
                ├── preview.md      # sample rows
                └── profiling.md    # cardinality, nulls, stats
```

Example `columns.md`:
```markdown
# customers
**Dataset:** `main`
## Columns (7)
- customer_id (int32)
- first_name (string)
- created_at (timestamp)
- lifetime_value (float64)
```

Uses Jinja2 templates. 5-minute in-memory cache for table discovery.

#### Schema Consumption (key finding)
**File:** `apps/backend/src/services/agent.ts`

When user types `@customers`, this code fires:
```typescript
private _addDatabaseContext(messages, mentions) {
  const dbMentions = mentions?.filter(m => m.trigger === '@') ?? [];
  for (const mention of dbMentions) {
    const content = getTableColumnsContent(this._toolContext.projectFolder, mention.id);
    if (content) contextParts.push(`[Table: ${mention.id}]\n${content}`);
  }
  // Appended to user message, NOT system prompt
  return this._transformLastUserMessageText(messages, text => `${text}\n\n---\nReferenced tables:\n${dbContext}`);
}
```

Table discovery caches folder structure for 5 min:
```typescript
const DATABASE_OBJECTS_TTL_MS = 5 * 60 * 1000;
export function getDatabaseObjects(projectFolder): DatabaseObject[] {
  const cached = databaseObjectsCache.get(folder);
  if (cached && Date.now() < cached.expiresAt) return cached.objects;
  // ...reads disk
}
```

#### Schema-as-Files vs Prompt Injection: Verdict

| | Files (nao) | Prompt Injection |
|---|---|---|
| Context per request | 2-5KB (only mentioned tables) | 50-200KB (all metrics) |
| Discovery | Agent explores with tools | LLM must scan text |
| Updates | Real-time (file sync) | Requires redeployment |
| Cost / 100 reqs | ~$0.06 | ~$0.60 |

**Verdict for 30-100 metrics: schema-as-files is significantly better.** Even at 30 metrics, lazy loading means you only inject the 2-3 relevant ones per query.

**Still needs investigation:** their eval/test framework — test case format for adapting to `eval.test.js`.

---

### 3. Google Open Data QnA
**Repo:** https://github.com/GoogleCloudPlatform/Open_Data_QnA  
**Stars:** ~225 | Google-built | Python + Angular | BigQuery native

Google's own NL→BigQuery agent. Has a clean agent pipeline worth stealing.

**Pipeline:**
1. `DescriptionAgent` — auto-generates table/column descriptions using LLM
2. Semantic embeddings find relevant tables from user question
3. LLM generates SQL with few-shot examples + column metadata
4. `ValidationAgent` — fixes syntax errors iteratively
5. `VisualizeAgent` — takes SQL results + original question → returns JavaScript chart code

**What to copy:**
- `VisualizeAgent` pattern: after SQL executes, pass results + question to LLM → returns chart config
- Iterative SQL validation: catch error, pass it back to LLM for a retry
- Auto-generated column descriptions to enrich Supabase metric catalog

**Still needs investigation (clone repo):**
- Full `opendataqna.py` orchestration flow
- Caching layer — cache key, storage mechanism, lookup at query time
- `config.ini` — all configurable options (model, temperature, retries, thresholds)
- `ValidationAgent` exact retry loop (how many retries? what gets passed back?)
- `VisualizeAgent` prompt + output format

---

### 4. Vanna (archived but valuable)
**Repo:** https://github.com/vanna-ai/vanna  
**Stars:** ~23,000 | ARCHIVED March 2026 | Python only

**Key RAG concept:** At "training" time, feed it DDL + docs + known-good question→SQL pairs. At query time, retrieves the 10 most relevant via vector similarity and injects as few-shot examples.

**What to copy:**
- Store verified SQL examples in Supabase alongside metrics (`knowledge/verified-queries/` is already the raw material)
- Retrieve most relevant verified examples per query as few-shot examples
- The `train()` (offline) vs `ask()` (online) separation

---

### 5. Cube.js ✅ Investigated
**Repo:** https://github.com/cube-js/cube  
**Stars:** ~19,700 | Very active | TypeScript + Rust

**File:** `packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts`

#### Full Cube Definition Spec

```javascript
cube('Orders', {
  sql: `SELECT * FROM orders`,     // or sqlTable: 'orders'
  title: 'Orders',
  description: 'Order records',
  
  measures: { /* aggregates */ },
  dimensions: { /* attributes */ },
  segments: { /* reusable filters */ },
  joins: { /* relationships */ },
  preAggregations: { /* cached rollups */ },
  
  dataSource: 'default',           // multi-DB support
  accessPolicy: [],                // row/column security
})
```

#### Measures

All valid types: `count`, `sum`, `avg`, `min`, `max`, `countDistinct`, `countDistinctApprox`, `runningTotal`, `number`, `string`, `boolean`, `time`

```javascript
measures: {
  revenue: {
    type: 'sum',
    sql: `amount`,
    format: 'currency',
    filters: [{ sql: `status = 'paid'` }],
    drillMembers: [user_id, created_at],
    rollingWindow: { trailing: '30 days' }
  },
  // Measures can reference other measures:
  profit: {
    type: 'number',
    sql: `${revenue} - ${cost}`
  }
}
```

#### Dimensions

Types: `string`, `number`, `boolean`, `time`, `geo`, `switch`

```javascript
dimensions: {
  createdAt: {
    type: 'time',
    sql: `created_at`,
    granularities: {
      half_year: { interval: '6 months', origin: '2020-01-01' }
    }
  },
  status: {
    type: 'switch',
    values: ['active', 'inactive', 'pending']
  }
}
```

#### Segments (reusable filters)

```javascript
segments: {
  active_users: {
    sql: `${CUBE}.status = 'active'`,
    title: 'Active Users'
  }
}
```

#### Joins

```javascript
joins: {
  orders: {
    sql: `${CUBE}.id = ${orders.user_id}`,
    relationship: 'one_to_many'   // or belongsTo, hasOne, hasMany
  }
}
```

#### Pre-aggregations (materialized caches)

```javascript
preAggregations: {
  main_rollup: {
    type: 'rollup',
    measures: [count, revenue],
    dimensions: [status, country],
    timeDimension: created_at,
    granularity: 'month',
    partitionGranularity: 'month',
    refreshKey: { sql: `SELECT MAX(updated_at) FROM orders` }
  }
}
```

Types: `rollup` (common), `originalSql` (full copy), `autoRollup`, `rollupJoin`

#### Measures/Dimensions vs Flat SQL Table: Verdict

For ~30 metrics:
- **Gains:** Eliminates metric drift (1 definition, multiple reuses), measures reference other measures (`profit = revenue - cost`), access control built-in, pre-aggregations reduce repeat queries 50%+
- **Losses:** SQL analysts lose direct query access, schema compilation overhead, learning curve (~1-2 weeks)

**Verdict: measures/dimensions model is worth it at 30+ metrics** — especially the `measures can reference other measures` pattern, which directly maps to our `depends_on` column in Supabase.

---

## Key Patterns to Apply

### 1. Schema-as-files over prompt injection (nao) ⭐
Don't dump all metrics into the system prompt. Write each metric to a markdown file. Let the agent load only what's needed per query. At 30 metrics this is already more efficient; at 100+ it's essential.

### 2. Prompt section headers (WrenAI)
`buildMetricContext()` in `builder/src/lib/ai.js` likely does a flat dump. Adding `### METRICS ###`, `### SQL SAMPLES ###`, `### USER INSTRUCTIONS ###` headers helps the LLM parse structured context.

### 3. Few-shot SQL examples via RAG (Vanna)
`knowledge/verified-queries/` is already the raw material. Next step: surface the most relevant verified examples per query as few-shot examples in the prompt.

### 4. Iterative SQL validation (Google Open Data QnA)
Today if BigQuery errors, we surface it to the user. Instead: catch the error, pass it + the original query back to Claude, ask for a fix. One retry loop handles most syntax errors.

### 5. Measures reference other measures (Cube.js)
Our `depends_on` int[] in Supabase is underutilized. Cube's `type: 'number', sql: '${revenue} - ${cost}'` pattern is exactly how derived metrics should be expressed — and how Claude should understand them.

---

## What to Investigate Next

- [ ] WrenAI `pipelines/generation/` — actual prompt construction + Pydantic output validation
- [ ] WrenAI `pipelines/indexing/` — vector store build, token pruning threshold
- [ ] nao eval framework — test case format, adapt to `eval.test.js`
- [ ] Google Open Data QnA `ValidationAgent` — exact retry loop
- [ ] Google Open Data QnA `VisualizeAgent` — prompt + output format
- [ ] Google Open Data QnA caching layer — cache key, storage, lookup

---

## Continuation Prompt (for cloud session)

Paste this when continuing in claude.ai/code with the repos cloned:

```
I'm continuing research from a prior session. Read docs/nl-to-bq-research.md — 
it has findings on nao (✅ done) and Cube.js (✅ done). WrenAI and Open_Data_QnA 
still need investigation. The repos are cloned at:
  ~/repos/WrenAI
  ~/repos/Open_Data_QnA

Research-only — do NOT write or edit any files.

1. WrenAI indexing pipeline + structured output validation
   - Find wren-ai-service/src/pipelines/indexing/ — how they build the vector store
   - Find all Pydantic models that enforce LLM output shapes + handle validation errors
   - Find token counting logic — what threshold triggers column pruning?
   - Find the generation pipeline — exact final prompt structure and section order
   - Answer: should we use structured output (response_format) instead of post-hoc JSON parsing?

2. Google Open Data QnA caching + orchestrator
   - Find the full opendataqna.py orchestration function — walk the full agent flow
   - Find the caching layer — cache key, storage mechanism, lookup at query time
   - Find config.ini — list every configurable option
   - Find ValidationAgent — show the full retry loop (how many retries? what gets passed back?)
   - Find VisualizeAgent — show the prompt + output format

For each finding: file path, code snippet (10-30 lines), concrete recommendation 
for applying to our system (30 metrics, JSON config output, not raw SQL generation).
```
