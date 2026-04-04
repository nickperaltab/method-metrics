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

#### Generation Pipeline ✅ Investigated

**File:** `wren-ai-service/src/pipelines/generation/sql_generation.py`

Full prompt template (Jinja2, conditional sections):

```python
sql_generation_user_prompt_template = """
### DATABASE SCHEMA ###
{% for document in documents %}
    {{ document }}
{% endfor %}

{% if calculated_field_instructions %}
{{ calculated_field_instructions }}
{% endif %}

{% if sql_samples %}
### SQL SAMPLES ###
{% for sample in sql_samples %}
Question: {{sample.question}}
SQL: {{sample.sql}}
{% endfor %}
{% endif %}

{% if instructions %}
### USER INSTRUCTIONS ###
{% for instruction in instructions %}
{{ loop.index }}. {{ instruction }}
{% endfor %}
{% endif %}

### QUESTION ###
User's Question: {{ query }}

{% if sql_generation_reasoning %}
### REASONING PLAN ###
{{ sql_generation_reasoning }}
{% endif %}

Let's think step by step.
"""
```

Section order: Schema → Calculated fields → Metric instructions → SQL functions → SQL samples → User instructions → Question → Reasoning plan. All sections are conditional — empty ones are skipped.

#### Pydantic Output Validation ✅ Investigated

**Files:** `intent_classification.py`, `sql.py`

WrenAI uses **JSON schema mode** (not post-hoc parsing):

```python
SQL_GENERATION_MODEL_KWARGS = {
    "response_format": {
        "type": "json_schema",
        "json_schema": {
            "name": "sql_generation_result",
            "schema": SqlGenerationResult.model_json_schema(),
        },
    }
}
```

On failure: silent fallback to defaults (e.g., intent defaults to `TEXT_TO_SQL`). No retry on parse error.

**Recommendation:** Use Claude's `response_format` with a Pydantic model for our JSON config output. Implement explicit error logging instead of silent fallback.

#### Token Counting & Context Pruning ✅ Investigated

**File:** `wren-ai-service/src/pipelines/retrieval/db_schema_retrieval.py`

Uses tiktoken. Default threshold: **100,000 tokens**. Strategy:
1. Encode all table DDLs and sum tokens
2. If over threshold → drop all DDLs and trigger LLM-based column selection
3. LLM re-selects only needed columns → rebuild DDL with pruned columns

Binary pruning (all-or-nothing), not graduated. For 30 metrics this threshold won't be hit, but the pattern of LLM-assisted column selection is useful at scale.

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

#### Orchestration ✅ Investigated

**File:** `opendataqna.py`

5-agent sequential pipeline:
1. `EmbedderAgent` — embeds the user question
2. Vector store exact match check → **early exit if found** (returns cached SQL immediately)
3. `getSimilarMatches` — retrieves similar SQL examples + relevant table/column descriptions
4. `BuildSQLAgent` — generates SQL from question + context + similar examples
5. `DebugSQLAgent` — iterative retry loop (default 2 rounds): runs SQL, passes error back to LLM for fix

#### ValidationAgent — Key Finding ✅ Investigated

**File:** `agents/ValidateSQLAgent.py`

The ValidateSQLAgent itself has **no retry loop** — single LLM call, crashes on malformed JSON. The retry logic lives in `DebugSQLAgent.start_debugger()`:

```python
# DebugSQLAgent retry loop (max DEBUGGING_ROUNDS = 2)
while i < DEBUGGING_ROUNDS:
    error_df_str = str(exec_result_df)  # full error message
    rewritten_sql = rewrite_sql_chat(
        chat_session, sql, question, error_df_str  # passes: original SQL + question + error
    )
    i += 1
```

On each retry, passes back: original SQL + original question + full error message from executor.

#### VisualizeAgent ✅ Investigated

**File:** `agents/VisualizeAgent.py`

Two-stage: (1) LLM picks chart type from question + SQL → returns `{"chart_1": "Bar Chart", "chart_2": "Line Chart"}`. (2) LLM generates raw Google Charts JavaScript (not a config object) for each chart type. Output is raw JS strings for DOM injection.

**Important for us:** Their output is hardcoded to Google Charts JS. Our ECharts JSON config approach is actually cleaner — same two-stage structure but return a config object instead of raw code.

#### Caching ✅ Investigated

**Files:** `dbconnectors/BQConnector.py`, `dbconnectors/PgConnector.py`

Cache key: **exact lowercase string match on user question** — stored in a BigQuery or PostgreSQL table alongside the SQL. No hash, no TTL, no similarity search. Early-exits the entire pipeline on hit.

```python
WHERE lower(example_user_question) = lower('{query}') LIMIT 1
```

Populated from a `known_good_sql.csv` file (manually curated question→SQL pairs).

#### config.ini ✅ Investigated

Key options: `embedding_model`, `description_model`, `vector_store` (bigquery-vector or cloudsql-pgvector), `debugging` (yes/no), `logging` (yes/no), `kgq_examples` (cache on/off), `use_session_history`, `use_column_samples`. No temperature/retry count exposed — those are hardcoded.

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

- [ ] nao eval framework — test case format and how to adapt to `eval.test.js`

---

## Continuation Prompt (for cloud session)

Paste this when continuing in claude.ai/code with the repos cloned:

```
I'm continuing research from a prior session. Read docs/nl-to-bq-research.md — 
it has findings on nao (✅ done), Cube.js (✅ done), WrenAI (✅ done), and 
Open_Data_QnA (✅ done). One item remains: nao's eval framework. The repo is at:
  ~/repos/nao

Research-only — do NOT write or edit any files.

Find the nao eval framework:
- Where is the test runner? (likely apps/backend/src/ or cli/)
- What does a test case look like? Show the full schema/format.
- How does it evaluate agent responses? (exact match? LLM judge? regex?)
- How does it compare to builder/tests/eval.test.js in this repo?
- What would we need to adopt this pattern for our chart builder?

File paths, code snippets, concrete recommendation.
```
