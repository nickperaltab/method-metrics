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

**Files to investigate:**
- `wren-ai-service/src/pipelines/generation/` — prompt construction
- `wren-ai-service/src/pipelines/retrieval/` — metric selection
- `wren-ai-service/src/pipelines/indexing/` — catalog indexing

---

### 2. nao
**Repo:** https://github.com/getnao/nao  
**Stars:** ~834 | Active | React + TypeScript + BigQuery + Fastify + tRPC

Closest JS stack to ours. Deploys AI analytics agents backed by BigQuery/Snowflake/Postgres.

**What to copy:**
- Built-in eval framework for testing agent responses — directly maps to our `eval.test.js`
- `nao init / nao sync / nao chat / nao test` CLI pattern for managing agent context
- tRPC for type-safe API between frontend and backend
- Shadcn UI components (already similar to our stack)

**Files to investigate:**
- Their eval/test framework — compare to `builder/tests/eval.test.js`
- Agent context management — how they sync schema to the agent

---

### 3. Google Open Data QnA
**Repo:** https://github.com/GoogleCloudPlatform/Open_Data_QnA  
**Stars:** ~225 | Google-built | Python + Angular | BigQuery native

Google's own NL→BigQuery agent. Has a clean agent pipeline worth stealing.

**Pipeline:**
1. `DescriptionAgent` — auto-generates table/column descriptions using LLM
2. Semantic embeddings find relevant tables from user question
3. LLM generates SQL with few-shot examples + column metadata
4. `ValidationAgent` — fixes syntax errors iteratively (passes error back to LLM for retry)
5. `VisualizeAgent` — takes SQL results + original question → returns JavaScript chart code

**What to copy:**
- `VisualizeAgent` pattern: after SQL executes, pass results + question to LLM → returns chart config. Clean separation of SQL generation vs visualization.
- Iterative SQL validation loop: if execution fails, pass the error back to LLM for a fix attempt (we don't do this today)
- Auto-generated column descriptions: use LLM to enrich Supabase metric catalog `description` fields

**Files to investigate:**
- `backend/agents/` — DescriptionAgent, ValidationAgent, VisualizeAgent implementations
- `backend/prompts/` — YAML prompt templates

---

### 4. Vanna (archived but valuable)
**Repo:** https://github.com/vanna-ai/vanna  
**Stars:** ~23,000 | ARCHIVED March 2026 | Python only

High-profile, now archived (commercialized). Still worth reading for the RAG pattern.

**Key RAG concept:**
At "training" time, feed it:
1. DDL statements
2. Business documentation text
3. Known-good question→SQL pairs

At query time, retrieves the 10 most relevant pieces via vector similarity and injects them into the prompt.

**What to copy:**
- Store verified SQL examples in Supabase alongside metrics (our `knowledge/verified-queries/` is already this)
- Retrieve most relevant verified examples per query as few-shot examples
- The `train()` (offline) vs `ask()` (online) separation

---

### 5. Cube (semantic layer reference)
**Repo:** https://github.com/cube-js/cube  
**Stars:** ~19,700 | Very active | TypeScript + Rust

Headless semantic layer. Not NL-native but the metric definition schema is clean.

**Metric definition pattern:**
```javascript
cube('Orders', {
  sql: 'SELECT * FROM orders',
  measures: {
    count: { type: 'count' },
    totalRevenue: { type: 'sum', sql: 'amount' }
  },
  dimensions: {
    status: { sql: 'status', type: 'string' },
    createdAt: { sql: 'created_at', type: 'time' }
  }
})
```

The `measures` / `dimensions` / `segments` separation is cleaner than a flat SQL string in a catalog — worth considering for how we structure Supabase metric definitions.

---

## Key Patterns to Apply

### 1. Prompt section headers (WrenAI)
Our `buildMetricContext()` in `builder/src/lib/ai.js` likely does a flat dump. Adding structured section headers (`### DATABASE SCHEMA ###`, `### METRICS ###`, `### SQL SAMPLES ###`) improves LLM accuracy at scale.

### 2. Few-shot SQL examples (Vanna RAG)
We already have `knowledge/verified-queries/` SQL files. The next step: surface the most relevant ones to Claude at query time. Even 2-3 verified examples per metric family would reduce hallucination.

### 3. Iterative SQL validation (Google Open Data QnA)
Today, if BigQuery returns a SQL error, we show it to the user. Instead: catch the error, pass it back to Claude with the original query, ask for a fix. One retry loop would handle most syntax errors.

### 4. VisualizeAgent separation (Google Open Data QnA)
Currently the AI decides both which metrics to use AND how to visualize them in one call. Splitting into a "metric selection" call and a "visualization" call could improve accuracy on both.

---

## What to Investigate Next

- [ ] WrenAI `pipelines/generation/` — get the actual prompt construction code
- [ ] nao eval framework — test case format and how to adapt to `eval.test.js`
- [ ] Google Open Data QnA `ValidationAgent` — exact retry loop implementation
- [ ] WrenAI `pipelines/retrieval/` — how they select relevant metrics from a large catalog
